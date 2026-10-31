import { Request, Response } from "express";
import { outgoingMessagesQueue } from "../queues/queueManager.js";
import { getConversationControlModel } from "../models/ConversationControl.js";
import { getAuditLogModel } from "../models/AuditLog.js";
import { config } from "../config/env.js";

/**
 * Handle Webhooks from Chatwoot (e.g. human agent replies, assignments, status changes)
 */
export async function handleChatwootWebhook(req: Request, res: Response): Promise<void> {
  // 1. Chatwoot Webhook Secret / Signature Validation
  if (config.CHATWOOT_WEBHOOK_SECRET) {
    const providedSecret =
      (req.headers["x-chatwoot-signature"] as string) ||
      (req.headers["x-webhook-secret"] as string) ||
      (req.query.token as string);

    if (providedSecret !== config.CHATWOOT_WEBHOOK_SECRET) {
      console.warn("⚠️ [Webhook Security] Rejected unauthorized Chatwoot webhook delivery.");
      res.status(401).json({ error: "Unauthorized: Invalid webhook secret" });
      return;
    }
  }

  // Always return 200 OK immediately
  res.status(200).json({ status: "acknowledged" });

  try {
    const payload = req.body;
    const event = payload.event; // e.g. "message_created", "conversation_status_changed"

    if (event !== "message_created") {
      return;
    }

    const messageType = payload.message_type; // "incoming" or "outgoing"
    const sender = payload.sender; // { id, name, type: "user" | "contact" }
    const conversation = payload.conversation;

    // We only care about OUTGOING replies typed by a HUMAN AGENT (sender.type === "user")
    if (messageType !== "outgoing" || sender?.type !== "user" || payload.private) {
      return;
    }

    // Skip bot-generated messages mirrored into Chatwoot
    if (payload.content && payload.content.startsWith("🤖 [AI Bot]:")) {
      return;
    }

    const rawPhone = conversation?.meta?.sender?.phone_number || "";
    if (!rawPhone) {
      console.warn("[Chatwoot Webhook] Outgoing message missing customer phone number in conversation meta.");
      return;
    }

    const cleanPhone = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;

    console.log(
      `👨‍💼 [Human Agent Takeover] Agent "${sender.name}" replied to ${cleanPhone}: "${payload.content?.slice(0, 40)}..."`
    );

    // 2. Immediately switch conversation mode to 'human' (AI stopped)
    try {
      const ConversationControl = getConversationControlModel();
      await ConversationControl.findOneAndUpdate(
        { phone: cleanPhone },
        {
          mode: "human",
          assignedAgentId: String(sender.id),
          assignedAgentName: sender.name,
          lastAgentMessageAt: new Date(),
          pauseReason: `Agent Takeover by ${sender.name}`,
        },
        { upsert: true }
      );

      // Audit log entry
      const AuditLog = getAuditLogModel();
      await AuditLog.create({
        actorId: String(sender.id),
        actorName: sender.name,
        action: "HUMAN_AGENT_TAKEOVER",
        entityType: "Conversation",
        entityId: cleanPhone,
        metadata: {
          chatwootConversationId: conversation?.id,
          messagePreview: payload.content?.slice(0, 50),
        },
      });
    } catch (dbErr: any) {
      console.warn(`[Chatwoot Webhook] Mode switch DB skipped: ${dbErr.message}`);
    }

    // 3. Queue outgoing WhatsApp message via Evolution API
    await outgoingMessagesQueue.add(
      "send-whatsapp-message",
      {
        phone: cleanPhone,
        replyText: payload.content,
        chatwootConversationId: conversation?.id,
        isAiReply: false,
      },
      {
        jobId: `cw_msg_${payload.id}`,
      }
    );
  } catch (error: any) {
    console.error("❌ [Chatwoot Webhook] Error processing event:", error.message);
  }
}
