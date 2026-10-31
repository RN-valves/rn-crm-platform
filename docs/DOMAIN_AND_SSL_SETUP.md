# RN VALVES – DOMAIN, DNS & SSL CONFIGURATION GUIDE

---

## 1. Required DNS Records (Cloudflare DNS)

To route the new platform services through your Hostinger VPS, add the following `A` records in your Cloudflare DNS dashboard for `rnvalves.com`:

| Type | Subdomain / Name | Target IPv4 Address | Cloudflare Proxy Status | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `crm` | `<YOUR_HOSTINGER_VPS_IP>` | **Proxied (Orange Cloud)** | RN CRM Next.js Dashboard UI |
| **A** | `crm-api` | `<YOUR_HOSTINGER_VPS_IP>` | **Proxied (Orange Cloud)** | Express REST API & Webhooks |
| **A** | `inbox` | `<YOUR_HOSTINGER_VPS_IP>` | **Proxied (Orange Cloud)** | Chatwoot Shared Agent Inbox |

---

## 2. Cloudflare SSL/TLS Settings

* **SSL/TLS Encryption Mode**: Set to **Full** or **Full (Strict)**.
  - Traefik inside Coolify will automatically provision free Let's Encrypt certificates between Traefik and Cloudflare.
  - Cloudflare provides Universal SSL between the user's browser and Cloudflare edge servers.
* **Always Use HTTPS**: Enabled.
* **WebSockets**: Enabled (Required for Chatwoot real-time agent notifications and ActionCable).

---

## 3. Traefik Ingress Rules in Coolify

Coolify generates Traefik labels automatically based on the configured domains. The routing mappings are:

1. **`crm.rnvalves.com`**:
   - Routes to container `rn-crm-frontend` on port `3000`.
   - Headers: `X-Forwarded-For`, `X-Forwarded-Proto: https`.
2. **`crm-api.rnvalves.com`**:
   - Routes to container `rn-crm-backend` on port `5000`.
   - CORS origin: `https://crm.rnvalves.com`.
3. **`inbox.rnvalves.com`**:
   - Routes to container `chatwoot-web` on port `3000`.
   - ActionCable WebSocket path: `/cable` passed through Traefik.
