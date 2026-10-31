# Evolution API v2.3.7 & Chatwoot Integration Specification

---

## 1. Executive Overview

This document specifies the exact integration protocol between **Evolution API v2.3.7 (`RNchat` instance)**, **Chatwoot Community Edition**, and the **RN CRM Backend Engine**.

### Core Constraints & Invariants:
1. **Existing WhatsApp Session Protection**: The existing `RNchat` instance running on Baileys must **never** be restarted, re-scanned, logged out, or deleted.
2. **Single Orchestration Authority**: The RN CRM Backend acts as the single source of truth for message routing, AI generation, and state management.
3. **No Direct Evolution-to-Chatwoot Bypass**: Although Evolution API v2 has a native Chatwoot module, configuring it directly bypasses the RN CRM AI engine and business logic (lead qualification, catalog database searches, anti-hallucination tools). Therefore, **RN CRM Backend routes messages bi-directionally**, ensuring complete control over AI mode, human takeover, and deduplication.

---

## 2. Evolution API v2.3.7 Integration Details

### Instance Details:
- **Instance Name**: `RNchat`
- **Library**: Baileys (WhatsApp Web Multi-Device)
- **API Authentication**: Global API Key (`apikey` header)

### Webhook Events Handled:
| Event Name | Purpose | Action in RN CRM Backend |
| :--- | :--- | :--- |
| `MESSAGES_UPSERT` | Incoming or outgoing WhatsApp messages | Ingested into BullMQ `incoming-messages` queue with fast ACK (<50ms). |
| `MESSAGES_UPDATE` | Delivery & read receipt updates | Track message delivery status (`SENT`, `DELIVERED`, `READ`). |
| `CONNECTION_UPDATE` | WhatsApp instance connection status | Log and alert administrators if connection state changes. |

### API Endpoints Used by RN CRM Backend:
1. **Send Text Message**:
   `POST /message/sendText/:instance`
   ```json
   {
     "number": "+91XXXXXXXXXX",
     "text": "Hello! Welcome to RN Valves...",
     "options": {
       "delay": 1200,
       "presence": "composing"
     }
   }
   ```
2. **Send Media Message (Catalogues & Product Images)**:
   `POST /message/sendMedia/:instance`
   ```json
   {
     "number": "+91XXXXXXXXXX",
     "mediaMessage": {
       "mediatype": "image" | "document",
       "media": "https://rnvalves.media/...",
       "caption": "RN PTMT Pillar Cock (Article: RN-102)",
       "fileName": "RN_Catalogue_2026.pdf"
     }
   }
   ```
3. **Presence & Typing Indicator**:
   `POST /chat/sendPresence/:instance`
   ```json
   {
     "number": "+91XXXXXXXXXX",
     "presence": "composing"
   }
   ```

---

## 3. Chatwoot Integration Details

### Architecture:
- Chatwoot Community Edition deployed via Docker Compose on DigitalOcean VPS.
- Channel Type: **API Channel** (custom inbox linked to `RNchat`).

### Endpoints Used:
1. **Contact Management**:
   - `POST /api/v1/accounts/{accountId}/contacts` (create/update contact with phone, name, email).
2. **Conversation Management**:
   - `POST /api/v1/accounts/{accountId}/conversations` (create conversation linked to contact).
   - `POST /api/v1/accounts/{accountId}/conversations/{id}/assignments` (assign agent/team).
3. **Message Synchronization**:
   - `POST /api/v1/accounts/{accountId}/conversations/{id}/messages`
     - Inbound customer message: `message_type: "incoming"`
     - Outgoing bot message: `message_type: "outgoing"`, with bot signature.
4. **Chatwoot Outbound Webhook**:
   - Event: `message_created`
   - When an agent types a response in Chatwoot, Chatwoot fires a webhook to `https://crm-api.rnvalves.com/api/webhooks/chatwoot`.
   - RN CRM Backend intercepts this, triggers **instant human takeover** (pauses AI mode), and dispatches the agent's text/media to Evolution API.

---

## 4. Message Ownership & Anti-Loop Safeguards

```
[ Customer WhatsApp ]
        │
        ▼ (Inbound)
[ Evolution API ]
        │
        ▼ Webhook
[ RN CRM Ingestion Gateway ]
        │
        ├─ 1. Check Redis: SET msg:dedup:<messageId> EX 86400 NX
        │     └─ If already exists ➔ RETURN immediately (No duplicate)
        │
        ├─ 2. If key.fromMe == true ➔ Ignore (Sent by our bot/agent)
        │
        ├─ 3. Ingest into BullMQ [ incoming-messages ]
        │
        ├─ 4. Mirror to Make.com (if enabled, preserving existing workflows)
        │
        └─ 5. Sync copy to Chatwoot (Customer Message)
```

```
[ Chatwoot Agent Reply ]
        │
        ▼ Webhook (message_created)
[ RN CRM Chatwoot Webhook ]
        │
        ├─ 1. Verify message_type == 'outgoing' & sender_type == 'User'
        │
        ├─ 2. Set conversation_controls: mode = 'human', lastAgentMessageAt = NOW
        │     └─ AI REPLIES IMMEDIATELY BLOCKED
        │
        ├─ 3. Dispatch to BullMQ [ outgoing-messages ]
        │
        └─ 4. Outgoing Worker calls Evolution API /message/sendText
              └─ Customer receives WhatsApp reply from the agent
```

---

## 5. Verification Checklist Before Production Changes
1. Test webhook ingestion with simulated Evolution API v2.3.7 payload.
2. Test media handling (PDF catalogues and product photos).
3. Verify Redis deduplication idempotency.
4. Test human takeover mechanics (AI silence when agent speaks).
5. Verify zero disruption to Make.com and existing `RNchat` session.
