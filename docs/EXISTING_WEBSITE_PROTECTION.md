# RN VALVES – EXISTING WEBSITE PROTECTION & DEPENDENCY MAP (PHASE 2)

**Audit Date**: 2026-10-31  
**Target Live Site**: https://rnvalves.com/  
**Container**: `x9iwrhpseg00flg80or2hx7i-20261030T104440`  
**Network**: `coolify` (Bridge Driver)  
**Measured HTTP Status**: `HTTP 200 OK` (0.61s latency)  
**Measured Memory Usage**: `318.9 MiB` (1.99% of total RAM)  
**Measured CPU Load**: `0.19%`

---

## 1. Existing Production Dependency Map

```
[ User Browser / Customer ]
            │
            ▼ (Port 443 HTTPS)
  [ Cloudflare Edge CDN ]
            │
            ▼ (Proxy Pass to Hostinger VPS: 201.18.208.63)
[ coolify-proxy (Traefik v3.6) ]
            │
            ├─ [ Network: coolify ]
            │         │
            │         ▼ (Port 3000 Internal)
            │  [ x9iwrhpseg00flg80or2hx7i ] (Next.js E-Commerce)
            │         │
            │         ├─ Database: MongoDB Atlas Cloud (cluster.mongodb.net/rn-valves)
            │         ├─ Media CDN: Cloudflare R2 (https://rnvalves.media)
            │         ├─ Payment: Razorpay
            │         └─ Logistics: Shipway / Shiprocket
            │
            └─ [ External Microservice ]
                      │
                      ▼
               [ Evolution API v2.3.7 ] (https://wa-api.rnvalves.com)
                      │
                      ├─ WhatsApp Instance: RNchat (Baileys Web)
                      └─ Current Webhook: Make.com
```

---

## 2. Invariants for Protecting rnvalves.com

To guarantee that the live e-commerce website experiences **zero disruption, zero downtime, and zero latency impact**:

1. **Process & Network Isolation**:
   - The new CRM services will run under an independent Coolify project named `RN-Valves-CRM`.
   - Internal databases (`chatwoot-postgres`, `chatwoot-redis`, `rn-crm-redis`) will be bound exclusively to the private `rn-crm-network`. They will have **no public ports mapped**.
2. **Memory Ceiling Guarantee**:
   - `rnvalves.com` currently uses only `318.9 MiB` of RAM.
   - The new CRM stack is strictly capped at `~4.7 GB` maximum ceiling (typically `~2.8 GB`).
   - Even under heavy load, **over 10.0 GiB of RAM remains completely free** for eCommerce website traffic spikes and seasonal promotions.
3. **Database Read-Only Safeguard**:
   - The CRM backend queries the eCommerce product database (`rn-valves`) through a strict read-only repository.
   - All CRM leads, customer conversation controls, and audit trails write to the separate logical database `rn-crm`.
4. **Evolution API & WhatsApp Webhook Continuity**:
   - `RNchat` remains untouched.
   - When webhooks are routed to the CRM backend, the backend will asynchronously mirror each webhook to Make.com, ensuring current Make.com automations never experience a dropped event.
