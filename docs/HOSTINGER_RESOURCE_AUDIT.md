# RN VALVES – HOSTINGER VPS RESOURCE & CONTAINER AUDIT (VERIFIED LIVE)

**Audit Date**: 2026-10-31  
**Target Server**: Hostinger VPS (`srv1999729.hstgr.cloud` / `201.18.208.63`)  
**Operating System**: Ubuntu 24.04.5 LTS (Kernel 6.8.0-139-generic)  
**Inspection Type**: 100% Read-Only CLI Audit

---

## 1. Measured System Capacity & Headroom

| Resource Metric | Measured Value on Hostinger VPS | Capacity Assessment | Operational Status |
| :--- | :--- | :--- | :--- |
| **CPU Architecture** | 4 Cores (x86_64) | 4 vCPUs | Load average: `0.97, 0.68, 0.54` (< 25% utilization). **Ample headroom**. |
| **Total Physical RAM**| **15.0 GiB** | 16 GB Tier | Standard Hostinger KVM 4 allocation. |
| **Used RAM** | **1.6 GiB** | 10.6% Used | OS + Coolify + Next.js e-commerce application. |
| **Available RAM** | **14.0 GiB Free** | **89.4% Free** | **Huge RAM surplus**. Ready for Chatwoot + Redis + CRM. |
| **Root Disk Storage** | **193 GiB NVMe** | 200 GB NVMe Tier | `/dev/sda1` |
| **Used Disk Space** | **9.0 GiB** | 4.6% Used | All OS files and Docker container layers. |
| **Available Disk** | **184 GiB Free** | **95.4% Free** | Enormous NVMe space for PostgreSQL and message storage. |
| **System Uptime** | **13 Days, 19 Hours** | High Stability | Continuous uninterrupted operation. |

---

## 2. Live Docker Container Inventory (`docker ps -a`)

| Container ID | Image / Container Name | Status | Ports / Exposure | Role |
| :--- | :--- | :--- | :--- | :--- |
| `5537b016b983` | `x9iwrhpseg00flg80or2hx7i-20261030T104440` | Up 21 Hours | `3000/tcp` (Internal) | **LIVE E-COMMERCE (rnvalves.com)** |
| `fd4c2dcb6bfe` | `coolify` (v4.5.3) | Up 2 Days (Healthy) | `8000, 6001-6002` | Coolify Orchestration Dashboard |
| `db7b3420a226` | `coolify-db` (postgres:15-alpine) | Up 2 Days (Healthy) | `5432/tcp` (Internal) | Coolify Internal Database |
| `8f294b4ef825` | `coolify-redis` (redis:7-alpine) | Up 2 Days (Healthy) | `6379/tcp` (Internal) | Coolify Internal Task Broker |
| `5458692e5b56` | `coolify-sentinel` (v1.1.3) | Up 2 Days (Healthy) | Internal | Server Monitor Heartbeat |
| `4b94869524f4` | `coolify-proxy` (traefik:v3.6) | Up 13 Days (Healthy)| `80, 443, 8080` | Reverse Proxy & Auto-SSL Router |

---

## 3. Docker Networks & Volumes

### Docker Networks (`docker network ls`):
* `coolify` (Driver: `bridge`): Primary Coolify network where Traefik routes inbound web traffic.
* `source_default` (Driver: `bridge`): Internal build network.
* `bridge`, `host`, `none`: Default Docker system networks.

### Persistent Volumes (`docker volume ls`):
* `coolify-db`: Internal database volume for Coolify.
* `coolify-redis`: Internal cache volume for Coolify.
* `buildx_buildkit_coolify-railpack0_state`: Docker build cache.

---

## 4. Key Discovery Findings

1. **MongoDB Location**:
   * MongoDB is **not running as a local Docker container** on this Hostinger VPS.
   * As confirmed by `.env.example`, the eCommerce database connects to **MongoDB Atlas Cloud** (`mongodb+srv://...`).
   * **Benefit**: Zero risk of port collisions, memory contention, or disk competition with local MongoDB on the VPS.
2. **Evolution API Location**:
   * Evolution API runs as an external microservice / dedicated endpoint (`https://wa-api.rnvalves.com`).
   * **Benefit**: The `RNchat` session is completely decoupled from local Docker restarts on this VPS.
3. **VPS Health & Capacity**:
   * With **14 GB of RAM free** and **184 GB of disk free**, your server is currently running at only ~10% capacity.
   * Chatwoot and the RN CRM platform will use ~3.5 GB of RAM, leaving over **10 GB of RAM free** for eCommerce website traffic spikes.
