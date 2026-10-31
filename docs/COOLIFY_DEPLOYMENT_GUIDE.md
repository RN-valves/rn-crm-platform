# RN VALVES – COOLIFY DEPLOYMENT GUIDE (HOSTINGER VPS)

---

## 1. Prerequisites Checklist

* Access to your Coolify dashboard on the Hostinger VPS (e.g., `https://coolify.yourvpsip.sslip.io` or configured Coolify domain).
* Cloudflare DNS access for `rnvalves.com` to configure subdomains.
* Generated production secrets ready for input.

---

## 2. Step-by-Step Deployment Walkthrough

### Step 1: Create New Project in Coolify
1. In your Coolify dashboard, navigate to **Projects**.
2. Click **+ Add Project**, and name it `RN-Valves-CRM`.
3. Select your production environment (Default: `production`).

### Step 2: Add Docker Compose Application
1. In the `RN-Valves-CRM` project, click **+ Add Resource** → **Docker Compose**.
2. Choose **Docker Compose via Raw Configuration / Git Repository**.
3. Paste the contents of [`docker/docker-compose.coolify.yml`](file:///d:/new/production/code/rn/rn-crm-platform/docker/docker-compose.coolify.yml).

### Step 3: Populate Environment Variables in Coolify
In the **Environment Variables** tab of the Docker Compose stack, enter:
```ini
# Domain Bindings
CRM_FRONTEND_URL=https://crm.rnvalves.com
CRM_BACKEND_URL=https://crm-api.rnvalves.com
CHATWOOT_FRONTEND_URL=https://inbox.rnvalves.com

# Core Secrets
JWT_SECRET=<GENERATE_64_CHAR_RANDOM_SECRET>
CHATWOOT_SECRET_KEY_BASE=<GENERATE_64_CHAR_RANDOM_SECRET>
CHATWOOT_POSTGRES_PASSWORD=<SECURE_PASSWORD>
CHATWOOT_REDIS_PASSWORD=<SECURE_PASSWORD>
RN_REDIS_PASSWORD=<SECURE_PASSWORD>

# Database URIs
CRM_MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/rn-crm?retryWrites=true&w=majority
ECOMM_MONGODB_URI=mongodb+srv://<readonly_user>:<password>@cluster.mongodb.net/rn-valves?retryWrites=true&w=majority

# Evolution API (Existing RNchat Instance)
EVOLUTION_API_URL=https://wa-api.rnvalves.com
EVOLUTION_API_KEY=<YOUR_EXISTING_EVOLUTION_GLOBAL_KEY>
EVOLUTION_INSTANCE_NAME=RNchat
EVOLUTION_WEBHOOK_SECRET=<CHOSEN_WEBHOOK_SECRET>

# Make.com Mirroring (Zero Downtime)
MAKE_WEBHOOK_URL=<YOUR_EXISTING_MAKE_WEBHOOK_URL>

# AI Engine
GEMINI_API_KEY=<YOUR_GEMINI_API_KEY>
```

### Step 4: Configure Coolify Domain & Routing Labels
In Coolify, assign domains to the respective services:
* **`rn-crm-frontend`**: `https://crm.rnvalves.com` (Port 3000)
* **`rn-crm-backend`**: `https://crm-api.rnvalves.com` (Port 5000)
* **`chatwoot-web`**: `https://inbox.rnvalves.com` (Port 3000)

### Step 5: Execute Initial Deployment
1. Click **Deploy** in Coolify.
2. Monitor build logs:
   - PostgreSQL initializes with `pgvector`.
   - Redis instances start with health checks passing.
   - Node backend compiles and starts on port 5000.
   - Next.js frontend builds and starts on port 3000.
   - Chatwoot Rails migrations run.

### Step 6: Initial Chatwoot Setup & Token Linkage
1. Open `https://inbox.rnvalves.com` in your browser.
2. Complete the initial admin account setup.
3. Navigate to **Settings** → **Inboxes** → **Add Inbox** → **API Channel**.
4. Set Channel Name: `RNchat WhatsApp`.
5. Webhook URL: `https://crm-api.rnvalves.com/api/webhooks/chatwoot`.
6. Copy the generated **Inbox ID** and **Access Token**.
7. In Coolify, update `CHATWOOT_INBOX_ID` and `CHATWOOT_API_ACCESS_TOKEN`, then trigger a redeploy of `rn-crm-backend`.

### Step 7: Evolution API Webhook Reroute (Final Verification)
1. Point the webhook of the existing `RNchat` instance to:
   `https://crm-api.rnvalves.com/api/webhooks/evolution`.
2. Confirm incoming WhatsApp messages trigger both the RN CRM AI engine and Chatwoot, while Make.com receives its mirrored copy.
