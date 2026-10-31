# RN VALVES – HOSTINGER VPS ISOLATED DEPLOYMENT ARCHITECTURE (PHASE 3)

**Audit & Plan Date**: 2026-10-31  
**Target Server**: Hostinger VPS (`201.18.208.63`)  
**Existing Production Workloads**: 
- `rnvalves.com` (Uses **318.9 MiB RAM**, **0.19% CPU**)
- `coolify-proxy` (Uses **59.2 MiB RAM**)
- Total existing server usage: **1.6 GiB RAM** (14.0 GiB completely free)

---

## 1. Verified Resource Allocation & Capacity Budget

With 14.0 GiB of free RAM measured live on your server, here is the exact memory budget allocated to each container:

| Service Name | Technology / Container Image | Role | Hard Memory Limit | Typical Active Memory |
| :--- | :--- | :--- | :--- | :--- |
| **`rn-crm-frontend`** | Next.js 15 (`frontend.Dockerfile`) | React CRM Dashboard & Kanban | **384 MB** | ~180 MB |
| **`rn-crm-backend`** | Node.js 22 (`backend.Dockerfile`) | Ingestion Gateway, AI Engine, REST API | **512 MB** | ~220 MB |
| **`rn-crm-redis`** | `redis:7-alpine` | BullMQ Queues, Deduplication Locks | **256 MB** | ~35 MB |
| **`chatwoot-web`** | `chatwoot/chatwoot:v3.13.0` | Shared WhatsApp Agent Desk (Rails) | **1536 MB** | ~850 MB |
| **`chatwoot-worker`**| `chatwoot/chatwoot:v3.13.0` | Chatwoot Async Sidekiq Worker | **768 MB** | ~400 MB |
| **`chatwoot-postgres`**| `pgvector/pgvector:pg16` | Dedicated Chatwoot Relational DB | **1024 MB** | ~250 MB |
| **`chatwoot-redis`** | `redis:7-alpine` | Dedicated Chatwoot ActionCable / Caching | **256 MB** | ~30 MB |
| **TOTAL NEW CRM STACK** | **7 Isolated Containers** | **Complete CRM & Automation** | **4.73 GB (Hard Limit)** | **~1.96 GB (Active)** |

### Server Balance After Deployment:
* **Server Total RAM**: **15.6 GiB**
* **Existing eCommerce + OS**: **~1.6 GiB**
* **New CRM Stack (Typical)**: **~2.0 GiB**
* **Guaranteed Free RAM for Traffic Spikes**: **~12.0 GiB Free (77% Free)**

---

## 2. Docker Network Architecture

The architecture uses dual-network isolation:
1. **`coolify` Network (Public Ingress)**:
   - Only web-facing endpoints connect to this network: `rn-crm-frontend` (Port 3000), `rn-crm-backend` (Port 5000), and `chatwoot-web` (Port 3000).
   - Coolify's Traefik proxy maps incoming HTTPS requests from Cloudflare to these services.
2. **`rn-crm-network` (Strict Internal Isolation)**:
   - Dedicated bridge network for internal communication between backend, redis, and postgres.
   - `chatwoot-postgres`, `chatwoot-redis`, and `rn-crm-redis` have **no ports exposed to the host or internet**.

```
[ Inbound HTTPS Requests via Cloudflare ]
                   │
                   ▼
       [ coolify-proxy (Traefik) ]
                   │
       ┌───────────┴───────────────────────────────┐ (Network: coolify)
       │                                           │
       ▼                                           ▼
[ crm.rnvalves.com ]                      [ crm-api.rnvalves.com ]
  (rn-crm-frontend)                         (rn-crm-backend)
       │                                           │
       │                                           ├─ (Network: rn-crm-network)
       │                                           │    │
       │                                           │    ├─► [ rn-crm-redis ] (BullMQ)
       │                                           │    │
       │                                           │    └─► [ chatwoot-web ]
       │                                           │             │
       │                                           │             ├─► [ chatwoot-worker ]
       │                                           │             ├─► [ chatwoot-postgres ]
       │                                           │             └─► [ chatwoot-redis ]
       │                                           │
       ▼                                           ▼
[ Pure Read-Only Catalog Tools ]            [ Cloud MongoDB: rn-crm ]
(MongoDB Atlas: rn-valves)                  (Writes Leads, Contacts, Audits)
```

---

## 3. Production Deployment Plan (Coolify Execution)

1. Create a dedicated project in Coolify: **`RN-Valves-CRM`**.
2. Deploy the isolated stack via Docker Compose.
3. Configure domains in Cloudflare and Coolify:
   - `crm.rnvalves.com`
   - `crm-api.rnvalves.com`
   - `inbox.rnvalves.com`
4. Setup Chatwoot API Channel and connect token to backend.
5. Reroute Evolution API webhook with zero disruption to Make.com.
