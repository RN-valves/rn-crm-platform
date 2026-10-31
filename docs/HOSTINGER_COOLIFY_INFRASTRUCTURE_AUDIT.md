# RN VALVES – HOSTINGER VPS & COOLIFY INFRASTRUCTURE AUDIT

---

## 1. Hosting Environment Overview

* **Host Provider**: Hostinger VPS (KVM Architecture)
* **Deployment Orchestrator**: Coolify (Self-hosted PaaS)
* **Reverse Proxy & SSL**: Traefik (Managed natively by Coolify)
* **DNS & Edge CDN**: Cloudflare Proxy (Universal SSL / Full Strict)
* **Media Assets CDN**: Cloudflare R2 (`https://rnvalves.media`)

---

## 2. Hostinger VPS Resource Requirements & Capacity Planning

To guarantee zero impact on existing running applications (RN eCommerce website, Admin panel, and Evolution API `RNchat`), the resource capacity must satisfy:

| Resource Metric | Existing Running Workloads | New RN CRM + Chatwoot Stack | Total Required Capacity | Recommended Hostinger Plan |
| :--- | :--- | :--- | :--- | :--- |
| **CPU Cores** | 1.5 - 2 Cores | 1.5 - 2 Cores (Burst) | **4 vCPUs** | Hostinger KVM 4 / KVM 8 |
| **RAM (Memory)** | ~2.5 - 3.5 GB | ~3.5 - 4.2 GB | **8 GB RAM** | Hostinger KVM 8 (or KVM 4 with Swap) |
| **Disk Space** | ~15 - 25 GB | ~15 GB (Persistent DBs) | **50+ GB NVMe** | Standard (100 - 200 GB NVMe included) |
| **Swap Space** | Recommended 2 GB | Recommended 4 GB | **4 - 8 GB Swap** | Standard Linux swapfile |

---

## 3. Existing Production Containers & Resource Isolation

The existing production workloads running on the Hostinger VPS include:
1. **RN eCommerce Frontend & Admin (Next.js)**:
   - Port: 3000 (Internal) mapped via Traefik.
   - Database: MongoDB Atlas / VPS Mongo.
   - Status: **TOUCH-PROHIBITED**. No modifications, restarts, or config edits.
2. **Evolution API v2.3.7 (`RNchat`)**:
   - Connection Type: Baileys Multi-Device (WhatsApp Web).
   - Webhook Destination: Make.com.
   - Status: **ACTIVE & CRITICAL**. Session must remain open and connected without restart.
3. **Coolify Core Infrastructure**:
   - Traefik Reverse Proxy (`coolify-proxy`).
   - Coolify Backend & PostgreSQL (`coolify-db`).
   - Redis for Coolify tasks.

---

## 4. Docker Network Topology & Isolation

```
                                [ Cloudflare Edge DNS / Proxy ]
                                              │
                                              ▼ (Port 443 HTTPS)
                             [ Hostinger VPS Traefik Proxy ]
                               (Coolify Ingress Controller)
                                              │
                    ┌─────────────────────────┴────────────────────────┐
                    │                                                  │
                    ▼ (Existing Network)                               ▼ (New Isolated Network)
           [ existing-network ]                                 [ rn-crm-network ]
                    │                                                  │
     ┌──────────────┴──────────────┐                    ┌──────────────┴──────────────┐
     ▼                             ▼                    ▼              ▼              ▼
[RN eCommerce]             [Evolution API v2]    [RN CRM Backend] [RN Frontend] [Chatwoot Stack]
 (rnvalves.com)               (wa-api)          (crm-api)      (crm)       (inbox)
                                                        │              │              │
                                                        └──────────────┴──────────────┘
                                                                       │ Internal Only
                                                                       ▼
                                                          [chatwoot-pg] [rn-crm-redis]
                                                          (NO PUBLIC PORTS EXPOSED)
```

---

## 5. Security & Isolation Safeguards

1. **Port Exposure Ban**:
   - `chatwoot-postgres`, `chatwoot-redis`, and `rn-crm-redis` must **never** publish ports on the host interface (`0.0.0.0`). All communication occurs exclusively over the internal Docker network `rn-crm-network`.
2. **Separate Persistent Volumes**:
   - Named Docker volumes (`chatwoot-postgres-data`, `chatwoot-redis-data`, `chatwoot-storage`, `rn-crm-redis-data`) are completely decoupled from existing container storage.
3. **MongoDB Dual Connection Isolation**:
   - CRM models write to `rn-crm`.
   - eCommerce models connect with strict `secondaryPreferred` read-only privileges.
