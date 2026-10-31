# RN VALVES CRM – PRODUCTION DEPLOYMENT RUNBOOK (PHASE 5)

---

## 1. Pre-Deployment Infrastructure Verification

Before launching containers in Coolify, verify the DigitalOcean VPS capacity:
* **Recommended Resource Allocation**:
  - RAM: Minimum 4 GB available (Chatwoot requires ~1.5 GB, RN Backend + Redis ~500 MB, Next.js Frontend ~300 MB).
  - CPU: Minimum 2 vCPUs recommended.
  - Disk: Minimum 20 GB free space for persistent volumes.
* **Network Isolation Rule**:
  - `chatwoot-postgres`, `chatwoot-redis`, and `rn-crm-redis` must **never** expose ports to the public internet (`0.0.0.0`). All communication occurs within the internal Docker bridge network `rn-crm-network`.

---

## 2. Step-by-Step Deployment Procedure via Coolify

### Step 1: Provision Internal Redis & PostgreSQL Volumes
In Coolify or via `docker-compose.coolify.yml`:
1. Ensure the following persistent volume mounts are preserved:
   - `chatwoot-postgres-data:/var/lib/postgresql/data`
   - `chatwoot-redis-data:/data`
   - `chatwoot-storage:/app/storage`
   - `rn-crm-redis-data:/data`

### Step 2: Configure Production Environment Variables in Coolify
Populate the following secrets in the Coolify Application Environment Settings:
```ini
# Node & Network
NODE_ENV=production
CRM_FRONTEND_URL=https://crm.rnvalves.com
BACKEND_URL=https://crm-api.rnvalves.com
JWT_SECRET=<generate_secure_random_64_char_string>

# Databases
CRM_MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/rn-crm?retryWrites=true&w=majority
ECOMM_MONGODB_URI=mongodb+srv://<readonly_user>:<password>@cluster.mongodb.net/rn-valves?retryWrites=true&w=majority

# Evolution API
EVOLUTION_API_URL=https://wa-api.rnvalves.com
EVOLUTION_API_KEY=<your_evolution_api_key>
EVOLUTION_INSTANCE_NAME=RNchat
EVOLUTION_WEBHOOK_SECRET=<your_chosen_webhook_secret>

# Make.com Fallback Mirror
MAKE_WEBHOOK_URL=<your_existing_make_webhook_url>

# Chatwoot Stack
CHATWOOT_FRONTEND_URL=https://inbox.rnvalves.com
CHATWOOT_SECRET_KEY_BASE=<generate_secure_random_64_char_string>
CHATWOOT_POSTGRES_PASSWORD=<secure_postgres_password>
CHATWOOT_REDIS_PASSWORD=<secure_redis_password>
CHATWOOT_API_ACCESS_TOKEN=<generated_in_chatwoot_after_first_login>
CHATWOOT_WEBHOOK_SECRET=<your_chosen_chatwoot_secret>

# AI Engine
GEMINI_API_KEY=<your_google_gemini_api_key>
```

### Step 3: Deploy the Stack in Coolify
1. In Coolify, import the Docker Compose file: `docker/docker-compose.coolify.yml`.
2. Deploy the stack.
3. Check container logs:
   - `docker logs -f rn-crm-backend` (Verify `✅ [Server] RN CRM Backend running on port 5000`).
   - `docker logs -f chatwoot-web` (Verify Rails initialization).

### Step 4: Configure Chatwoot API Channel
1. Log in to `https://inbox.rnvalves.com` with your initial administrator account.
2. Go to **Settings** → **Inboxes** → **Add Inbox**.
3. Select **API Channel**.
4. Set Channel Name: `RN Valves WhatsApp (RNchat)`.
5. Webhook URL: `https://crm-api.rnvalves.com/api/webhooks/chatwoot`.
6. Copy the generated **Inbox ID** and **Access Token**, and update `CHATWOOT_INBOX_ID` and `CHATWOOT_API_ACCESS_TOKEN` in Coolify.

### Step 5: Safe Evolution API Webhook Cutover
1. In Evolution API manager or via API:
   Set Webhook for instance `RNchat`:
   `POST /webhook/set/RNchat`
   ```json
   {
     "enabled": true,
     "url": "https://crm-api.rnvalves.com/api/webhooks/evolution",
     "byEvents": false,
     "webhookByEvents": false,
     "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE"]
   }
   ```
2. Verify that incoming customer WhatsApp messages trigger the RN CRM Backend, while Make.com continues to receive its transparent mirrored copy.
