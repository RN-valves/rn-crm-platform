import { Request, Response } from "express";
import { getRedisClient } from "../queues/redisConnection.js";
import { incomingMessagesQueue } from "../queues/queueManager.js";
import { config } from "../config/env.js";

/**
 * Fast ACK Webhook Ingestion for Evolution API v2.3.7
 * Must return 200 OK immediately (<50ms) and push event to BullMQ.
 * Includes Make.com transparent forwarding and secret verification.
 */
export async function handleEvolutionWebhook(req: Request, res: Response): Promise<void> {
  // 1. Webhook Secret / Signature Validation
  if (config.EVOLUTION_WEBHOOK_SECRET) {
    const providedSecret =
      (req.headers["x-webhook-secret"] as string) ||
      (req.headers["apikey"] as string) ||
      (req.query.token as string);

    if (providedSecret !== config.EVOLUTION_WEBHOOK_SECRET) {
      console.warn("⚠️ [Webhook Security] Rejected unauthorized Evolution API webhook delivery.");
      res.status(401).json({ error: "Unauthorized: Invalid webhook secret" });
      return;
    }
  }

  // 2. Immediately acknowledge webhook to prevent timeouts from Evolution API
  res.status(200).json({ status: "acknowledged", receivedAt: new Date().toISOString() });

  try {
    const payload = req.body;
    const eventType = payload.event; // e.g. "messages.upsert", "messages.update", "connection.update"
    const instance = payload.instance;

    // 3. Make.com Transparent Forwarding (Zero Disruption to Existing Automations)
    if (config.MAKE_WEBHOOK_URL) {
      fetch(config.MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((forwardErr: any) => {
        console.warn(`[Webhook Mirror] Make.com mirror notice: ${forwardErr.message}`);
      });
    }

    // We only process incoming message events for the RNchat instance
    if (eventType !== "messages.upsert" || !payload.data) {
      return;
    }

    const messageData = payload.data;
    const key = messageData.key;
    if (!key) return;

    const messageId = key.id;
    const remoteJid = key.remoteJid; // e.g., "919876543210@s.whatsapp.net"
    const fromMe = key.fromMe; // true if sent by our own bot or agent

    // Skip status broadcasts, groups, or self-sent messages
    if (fromMe || remoteJid.includes("@g.us") || remoteJid.includes("status@broadcast")) {
      return;
    }

    // 4. Deduplication check via Redis atomic lock (24h TTL)
    const redis = getRedisClient();
    const dedupKey = `msg:dedup:${messageId}`;
    const isNew = await redis.set(dedupKey, "1", "EX", 86400, "NX");

    if (!isNew) {
      // Message has already been ingested or is duplicate webhook
      return;
    }

    // 5. Dispatch to incoming-messages BullMQ queue for asynchronous worker processing
    await incomingMessagesQueue.add(
      "process-incoming-message",
      {
        messageId,
        remoteJid,
        fromMe,
        pushName: messageData.pushName || "",
        message: messageData.message,
        messageTimestamp: messageData.messageTimestamp,
        instance,
        rawPayload: payload,
      },
      {
        jobId: `msg_${messageId}`,
      }
    );
  } catch (error: any) {
    console.error("❌ [Webhook] Error queuing incoming message:", error.message);
  }
}
