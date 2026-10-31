# RN VALVES – PRODUCTION BACKUP & DISASTER ROLLBACK RUNBOOK

---

## 1. Zero-Disruption Safety Invariants

1. **Evolution API `RNchat` Protection**:
   - The WhatsApp session token is stored in the existing Evolution API container volume.
   - We **never** restart, stop, or recreate the Evolution API container.
2. **eCommerce Next.js & MongoDB Protection**:
   - The existing website container, its database, and its files remain completely isolated from the new `rn-crm-network`.
3. **Emergency Rollback Time**: **< 60 Seconds**.

---

## 2. Pre-Deployment Hostinger VPS Backup Checklist

Execute before deploying new containers:
1. **Take Hostinger VPS Snapshot (Recommended)**:
   - In Hostinger hPanel → VPS Management → **Snapshots**.
   - Create a one-click snapshot of the VPS state.
2. **Backup Named Docker Volumes**:
   ```bash
   # Run on Hostinger VPS via SSH
   mkdir -p /root/rn-backups/$(date +%F)
   docker run --rm -v chatwoot-postgres-data:/data -v /root/rn-backups/$(date +%F):/backup alpine tar -czf /backup/chatwoot-postgres.tar.gz -C /data .
   ```

---

## 3. Emergency Rollback Procedures

### Scenario A: Webhook Delivery Issue After Cutover
If incoming WhatsApp messages fail to process through the CRM backend:
1. Revert Evolution API webhook directly to Make.com:
   ```bash
   curl -X POST "https://wa-api.rnvalves.com/webhook/set/RNchat" \
     -H "Content-Type: application/json" \
     -H "apikey: <YOUR_EVOLUTION_API_KEY>" \
     -d '{
       "enabled": true,
       "url": "<YOUR_ORIGINAL_MAKE_COM_WEBHOOK_URL>",
       "byEvents": false,
       "events": ["MESSAGES_UPSERT"]
     }'
   ```
2. Message flow immediately returns to Make.com with zero customer disruption.

### Scenario B: Container Resource Pressure on Hostinger VPS
If VPS memory exceeds 90% during peak operations:
1. Stop the Chatwoot Sidekiq worker temporarily:
   ```bash
   docker stop chatwoot-worker
   ```
2. The core CRM Backend (`rn-crm-backend`) and Redis will continue handling WhatsApp AI messages and lead qualification using < 500 MB RAM.
