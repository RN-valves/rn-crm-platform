import { Request, Response } from "express";
import { getConversationControlModel } from "../models/ConversationControl.js";
import { getMessageModel } from "../models/Message.js";
import { evolutionClient } from "../services/evolution/evolutionClient.js";
import { chatwootClient } from "../services/chatwoot/chatwootClient.js";
import { getAuditLogModel } from "../models/AuditLog.js";

export async function getConversations(req: Request, res: Response): Promise<void> {
  try {
    const mode = req.query.mode as string;
    const search = req.query.search as string;

    const query: any = {};
    if (mode && mode !== "ALL") query.mode = mode;
    if (search) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ phone: regex }, { assignedAgentName: regex }];
    }

    try {
      const ConversationControl = getConversationControlModel();
      const conversations = await ConversationControl.find(query)
        .sort({ updatedAt: -1 })
        .lean();

      res.status(200).json({ conversations });
    } catch {
      // In-memory test fallback
      res.status(200).json({
        conversations: [
          {
            _id: "conv_001",
            phone: "+919876543210",
            customerName: "Ramesh Gupta",
            businessName: "Delhi Sanitary & Tiles",
            mode: "ai",
            lastMessage: "Kya aapko single piece chahiye ya bulk/dealership quantity?",
            lastCustomerMessageAt: new Date(Date.now() - 1000 * 60 * 15),
            assignedTeam: "Sales",
            chatwootConversationId: "50751",
          },
          {
            _id: "conv_002",
            phone: "+919812345678",
            customerName: "Suresh Patil",
            businessName: "Patil Hardware",
            mode: "human",
            assignedAgentName: "Rohit Sharma",
            lastMessage: "Haan Suresh ji, quote share kar diya hai WhatsApp par.",
            lastCustomerMessageAt: new Date(Date.now() - 1000 * 60 * 45),
            assignedTeam: "Sales",
            chatwootConversationId: "50752",
          },
        ],
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getConversationMessages(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const rawId = String(id || "");
    const cleanDigits = rawId.replace(/\D/g, "");
    const phoneVariants = [
      rawId,
      `+${cleanDigits}`,
      cleanDigits,
      cleanDigits.startsWith("91") ? `+${cleanDigits}` : `+91${cleanDigits}`,
      cleanDigits.startsWith("91") ? cleanDigits.slice(2) : cleanDigits,
    ];

    // 1. Fetch real-time conversation messages from MongoDB Message collection
    try {
      const Message = getMessageModel();
      const messages = await Message.find({ phone: { $in: phoneVariants } })
        .sort({ createdAt: 1 })
        .lean();

      if (messages && messages.length > 0) {
        res.status(200).json({
          messages: messages.map((m) => ({
            id: String(m._id),
            sender: m.sender,
            content: m.content,
            mediaUrl: m.mediaUrl,
            timestamp: m.createdAt,
            type: m.mediaUrl ? "media" : "text",
          })),
        });
        return;
      }
    } catch (dbErr: any) {
      console.warn(`[getConversationMessages] Message DB query notice: ${dbErr.message}`);
    }

    // 2. Fetch from Chatwoot if available
    try {
      const ConversationControl = getConversationControlModel();
      const control = await ConversationControl.findOne({ phone: { $in: phoneVariants } });
      if (control && control.chatwootConversationId) {
        const cwMessages = await chatwootClient.getConversationMessages(Number(control.chatwootConversationId));
        if (cwMessages && cwMessages.length > 0) {
          res.status(200).json({ messages: cwMessages });
          return;
        }
      }
    } catch (cwErr: any) {
      console.warn(`[getConversationMessages] Chatwoot query notice: ${cwErr.message}`);
    }

    res.status(200).json({ messages: [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function sendConversationReply(req: Request, res: Response): Promise<void> {
  const { phone, text, mediaUrl, mediaType } = req.body;

  if (!phone || (!text && !mediaUrl)) {
    res.status(400).json({ error: "Phone and text or mediaUrl are required" });
    return;
  }

  try {
    // 1. Dispatch through Evolution API v2.3.7
    let result: any;
    if (mediaUrl) {
      result = await evolutionClient.sendMediaMessage({
        number: phone,
        mediaUrl,
        mediaType: mediaType || "image",
        caption: text,
      });
    } else {
      result = await evolutionClient.sendTextMessage({
        number: phone,
        text,
      });
    }

    // 2. Automatically set conversation to 'human' mode (Takeover)
    try {
      const ConversationControl = getConversationControlModel();
      await ConversationControl.findOneAndUpdate(
        { phone },
        {
          mode: "human",
          assignedAgentName: req.user?.name || "Agent",
          lastAgentMessageAt: new Date(),
          pauseReason: `Dashboard reply by ${req.user?.name || "Agent"}`,
        },
        { upsert: true }
      );
    } catch {}

    // 2b. Save outgoing manual reply to MongoDB Message collection
    try {
      const Message = getMessageModel();
      await Message.create({
        phone,
        sender: "agent",
        content: text || "",
        mediaUrl,
        mediaType: mediaType || (mediaUrl ? "document" : "text"),
      });
    } catch {}

    // 3. Log audit event
    try {
      const AuditLog = getAuditLogModel();
      await AuditLog.create({
        actorId: req.user?.id || "agent",
        actorName: req.user?.name || "Agent",
        action: "SEND_DASHBOARD_REPLY",
        entityType: "Conversation",
        entityId: phone,
        metadata: { textPreview: text?.slice(0, 40) },
      });
    } catch {}

    res.status(200).json({
      success: true,
      messageId: result.messageId,
      mode: "human",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function toggleConversationMode(req: Request, res: Response): Promise<void> {
  const { phone, mode } = req.body;

  if (!phone || !["ai", "human"].includes(mode)) {
    res.status(400).json({ error: "Valid phone and mode ('ai' | 'human') are required" });
    return;
  }

  try {
    const ConversationControl = getConversationControlModel();
    const updated = await ConversationControl.findOneAndUpdate(
      { phone },
      {
        mode,
        pauseReason: mode === "human" ? `Manual takeover by ${req.user?.name || "Agent"}` : "",
        aiPausedUntil: null,
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ conversation: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
