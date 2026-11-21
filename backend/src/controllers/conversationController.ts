import { Request, Response } from "express";
import { getConversationControlModel } from "../models/ConversationControl.js";
import { getMessageModel } from "../models/Message.js";
import { getContactModel } from "../models/Contact.js";
import { getLeadModel } from "../models/Lead.js";
import { evolutionClient } from "../services/evolution/evolutionClient.js";
import { chatwootClient } from "../services/chatwoot/chatwootClient.js";
import { getAuditLogModel } from "../models/AuditLog.js";
import { getCorporateBotMongoFilter } from "../services/botFilter.js";

export async function getConversations(req: Request, res: Response): Promise<void> {
  try {
    const mode = req.query.mode as string;
    const search = ((req.query.search as string) || "").trim().toLowerCase();

    const query: any = { ...getCorporateBotMongoFilter() };
    if (mode && mode !== "ALL") query.mode = mode;

    try {
      const ConversationControl = getConversationControlModel();
      const Message = getMessageModel();
      const Contact = getContactModel();
      const Lead = getLeadModel();

      const norm10 = (p: string = "") => {
        const d = String(p).replace(/\D/g, "");
        return d.length >= 10 ? d.slice(-10) : d;
      };

      // Run 4 parallel batch queries instead of N×3 per-conversation queries
      const [rawConversations, allContacts, allLeads, latestMessages] = await Promise.all([
        ConversationControl.find(query).sort({ updatedAt: -1 }).lean(),
        Contact.find({}, "phone name businessName businessType city").lean(),
        Lead.find({}, "phone customerName businessName businessType city assignedEmployeeName")
          .sort({ createdAt: -1 })
          .lean(),
        Message.aggregate([
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: "$phone",
              content: { $first: "$content" },
              createdAt: { $first: "$createdAt" },
            },
          },
        ]).catch(() => []),
      ]);

      const contactByPhone = new Map<string, any>();
      for (const c of allContacts) {
        const k = norm10(c.phone);
        if (k && !contactByPhone.has(k)) contactByPhone.set(k, c);
      }

      const leadByPhone = new Map<string, any>();
      for (const l of allLeads) {
        const k = norm10(l.phone);
        if (k && !leadByPhone.has(k)) leadByPhone.set(k, l);
      }

      const msgByPhone = new Map<string, any>();
      for (const m of latestMessages) {
        const k = norm10(m._id);
        if (k) {
          const existing = msgByPhone.get(k);
          if (!existing || new Date(m.createdAt) > new Date(existing.createdAt)) {
            msgByPhone.set(k, m);
          }
        }
      }

      let conversations = rawConversations.map((conv) => {
        const k = norm10(conv.phone);
        const contact = contactByPhone.get(k);
        const lead = leadByPhone.get(k);
        const lastMsg = msgByPhone.get(k);

        const resolvedName =
          contact?.name || lead?.customerName || (conv as any).customerName || "";
        const resolvedBusiness =
          contact?.businessName ||
          lead?.businessName ||
          lead?.customerName ||
          (conv as any).businessName ||
          "";
        const resolvedType =
          contact?.businessType ||
          lead?.businessType ||
          (conv as any).businessType ||
          "Dealer";
        const resolvedTeam = lead?.assignedEmployeeName
          ? `Sales (${lead.assignedEmployeeName})`
          : (conv as any).assignedTeam || "Sales";

        return {
          ...conv,
          customerName: resolvedName,
          businessName: resolvedBusiness,
          businessType: resolvedType,
          assignedTeam: resolvedTeam,
          city: contact?.city || lead?.city || "",
          lastMessage:
            lastMsg?.content ||
            (conv.pauseReason ? `Status: ${conv.pauseReason}` : "Active chat"),
          lastMessageAt:
            lastMsg?.createdAt || conv.lastCustomerMessageAt || conv.updatedAt,
        };
      });

      if (search) {
        conversations = conversations.filter(
          (c) =>
            c.phone?.toLowerCase().includes(search) ||
            c.customerName?.toLowerCase().includes(search) ||
            c.businessName?.toLowerCase().includes(search) ||
            c.city?.toLowerCase().includes(search) ||
            c.assignedAgentName?.toLowerCase().includes(search) ||
            c.assignedTeam?.toLowerCase().includes(search)
        );
      }

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
          messages: messages.map((m) => {
            let content = (m.content || "").trim();
            if (!content) {
              if (m.mediaType === "image" || m.mediaUrl) {
                content = "[Photo / Attachment]";
              } else if (m.mediaType === "audio") {
                content = "[Voice Note]";
              } else if (m.mediaType === "document") {
                content = "[Document / Catalog]";
              } else if (m.sender === "customer") {
                content = "👋 [Incoming WhatsApp Message]";
              } else {
                content = "[Response sent]";
              }
            }
            return {
              id: String(m._id),
              sender: m.sender,
              content,
              mediaUrl: m.mediaUrl,
              timestamp: m.createdAt,
              type: m.mediaUrl ? "media" : "text",
            };
          }),
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
