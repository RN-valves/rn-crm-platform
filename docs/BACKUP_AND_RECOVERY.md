# RN VALVES CRM – BACKUP & DISASTER RECOVERY PLAN (PHASE 5)

---

## 1. Recovery Objectives

* **Recovery Point Objective (RPO)**: < 1 Hour for CRM leads and message controls.
* **Recovery Time Objective (RTO)**: < 15 Minutes to restore containers on VPS or fallback to direct Make.com routing.

---

## 2. Backup Strategy by Component

### A. MongoDB CRM Database (`rn-crm`)
1. **Automated Cloud Backups (Atlas / VPS)**:
   - Configured via MongoDB Atlas automated daily snapshots with continuous point-in-time recovery (PITR).
2. **Manual CLI Dump Before Updates**:
   ```bash
   mongodump --uri="mongodb+srv://<user>:<password>@cluster.mongodb.net/rn-crm" --out=/backups/rn-crm-$(date +%F)
   ```

### B. Chatwoot PostgreSQL (`chatwoot_production`)
1. **Automated Daily Dump Container Task**:
   ```bash
   docker exec -t $(docker ps -qf "name=chatwoot-postgres") pg_dump -U chatwoot -d chatwoot_production | gzip > /backups/chatwoot_pg_$(date +%F).sql.gz
   ```
2. **Volume Persistence**:
   - The Docker volume `chatwoot-postgres-data` is pinned to VPS persistent storage.

### C. Redis BullMQ (`rn-crm-redis`)
* Configured with **Append-Only File (AOF)** persistence (`--appendonly yes`), writing every transaction to disk to ensure queue jobs survive sudden container or host restarts.

---

## 3. Emergency Rollback Procedure (Instant Zero-Downtime Fallback)

If an unexpected service failure occurs on the VPS:

1. **Immediate Webhook Reversion to Make.com**:
   - Execute single API call to Evolution API to point the webhook directly back to Make.com:
     `POST /webhook/set/RNchat`
     ```json
     {
       "enabled": true,
       "url": "<YOUR_ORIGINAL_MAKE_COM_WEBHOOK_URL>",
       "byEvents": false,
       "webhookByEvents": false,
       "events": ["MESSAGES_UPSERT"]
     }
     ```
   - Customer messaging immediately returns to the pre-migration baseline.
2. **WhatsApp Instance Protection**:
   - Because `RNchat` runs independently, it remains connected throughout any CRM backend maintenance or container restarts.
