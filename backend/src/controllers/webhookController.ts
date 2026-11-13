import { Request, Response } from "express";
import { getConversationControlModel } from "../models/ConversationControl.js";
import { getContactModel } from "../models/Contact.js";
import { getMessageModel } from "../models/Message.js";
import { FlowEngine } from "../services/conversation/flowEngine.js";
import { evolutionClient } from "../services/evolution/evolutionClient.js";
import { chatwootClient } from "../services/chatwoot/chatwootClient.js";
import { config } from "../config/env.js";

// In-memory deduplication cache (prevents duplicate processing if webhook retries)
const processedMessages = new Set<string>();

/**
 * Direct In-Process Message Pipeline:
 * Guaranteed to execute even if Redis or background queues are offline.
 */
async function processMessageDirectly(messageData: any, remoteJid: string, pushName: string): Promise<void> {
  const key = messageData.key || {};
  const message = messageData.message || {};

  // 1. Resolve real customer phone number (handle WhatsApp Privacy LID)
  const altJid = key.remoteJidAlt;
  const effectiveJid =
    altJid && altJid.includes("@s.whatsapp.net")
      ? altJid
      : remoteJid.includes("@s.whatsapp.net")
      ? remoteJid
      : altJid || remoteJid;

  const rawNumber = String(effectiveJid || "").split("@")[0].replace(/\D/g, "");
  const normalizedPhone = rawNumber.startsWith("91") ? `+${rawNumber}` : `+91${rawNumber}`;

  // 2. Extract text and media (with deep unwrapping for ephemeral, viewOnce, interactive, buttons, & media)
  let textContent = "";
  let mediaType: "text" | "image" | "document" | "audio" | "video" = "text";
  let mediaUrl = "";

  let innerMsg = message;
  let depth = 0;
  while (depth < 5 && innerMsg) {
    if (innerMsg.ephemeralMessage?.message) {
      innerMsg = innerMsg.ephemeralMessage.message;
    } else if (innerMsg.viewOnceMessage?.message) {
      innerMsg = innerMsg.viewOnceMessage.message;
    } else if (innerMsg.viewOnceMessageV2?.message) {
      innerMsg = innerMsg.viewOnceMessageV2.message;
    } else if (innerMsg.documentWithCaptionMessage?.message) {
      innerMsg = innerMsg.documentWithCaptionMessage.message;
    } else if (innerMsg.editedMessage?.message?.protocolMessage?.editedMessage) {
      innerMsg = innerMsg.editedMessage.message.protocolMessage.editedMessage;
    } else {
      break;
    }
    depth++;
  }

  if (innerMsg?.conversation) {
    textContent = innerMsg.conversation;
  } else if (innerMsg?.extendedTextMessage?.text) {
    textContent = innerMsg.extendedTextMessage.text;
  } else if (innerMsg?.imageMessage) {
    textContent = innerMsg.imageMessage.caption || "[Photo / Image]";
    mediaType = "image";
    mediaUrl = innerMsg.imageMessage.url || "";
  } else if (innerMsg?.documentMessage) {
    textContent = innerMsg.documentMessage.fileName || innerMsg.documentMessage.caption || "[Document]";
    mediaType = "document";
    mediaUrl = innerMsg.documentMessage.url || "";
  } else if (innerMsg?.audioMessage) {
    textContent = "[Voice Note / Audio]";
    mediaType = "audio";
    mediaUrl = innerMsg.audioMessage.url || "";
  } else if (innerMsg?.videoMessage) {
    textContent = innerMsg.videoMessage.caption || "[Video]";
    mediaType = "video";
    mediaUrl = innerMsg.videoMessage.url || "";
  } else if (innerMsg?.buttonsResponseMessage?.selectedDisplayText) {
    textContent = innerMsg.buttonsResponseMessage.selectedDisplayText;
  } else if (innerMsg?.buttonsResponseMessage?.selectedButtonId) {
    textContent = innerMsg.buttonsResponseMessage.selectedButtonId;
  } else if (innerMsg?.listResponseMessage?.title) {
    textContent = innerMsg.listResponseMessage.title;
  } else if (innerMsg?.listResponseMessage?.singleSelectReply?.selectedRowId) {
    textContent = innerMsg.listResponseMessage.singleSelectReply.selectedRowId;
  } else if (innerMsg?.templateButtonReplyMessage?.selectedId) {
    textContent = innerMsg.templateButtonReplyMessage.selectedId;
  } else if (innerMsg?.interactiveResponseMessage?.body?.text) {
    textContent = innerMsg.interactiveResponseMessage.body.text;
  } else if (innerMsg?.contactMessage?.displayName) {
    textContent = `[Contact: ${innerMsg.contactMessage.displayName}]`;
  } else if (innerMsg?.locationMessage) {
    textContent = innerMsg.locationMessage.name ? `[Location: ${innerMsg.locationMessage.name}]` : "[Location]";
  } else if (innerMsg?.stickerMessage) {
    textContent = "[Sticker]";
  }

  if (!textContent.trim()) {
    textContent = "👋 [Incoming WhatsApp Message]";
  }

  console.log(`📨 [Direct Pipeline] Received from ${normalizedPhone} (${pushName}): "${textContent}"`);

  // 3. Save incoming customer message to CRM DB
  try {
    const Message = getMessageModel();
    await Message.create({
      phone: normalizedPhone,
      sender: "customer",
      content: textContent,
      mediaType,
      mediaUrl,
    });
  } catch (err: any) {
    console.warn(`[Direct Pipeline] Message DB save notice: ${err.message}`);
  }

  // 4. Update / Sync Contact in CRM DB
  try {
    const Contact = getContactModel();
    let contact = await Contact.findOne({ phone: normalizedPhone });
    if (!contact) {
      await Contact.create({
        phone: normalizedPhone,
        name: pushName || "WhatsApp Customer",
        businessType: "Other",
        tags: ["WhatsApp"],
        totalEnquiriesCount: 1,
        lastContactedAt: new Date(),
      });
    } else {
      contact.totalEnquiriesCount += 1;
      contact.lastContactedAt = new Date();
      if (pushName && contact.name === "WhatsApp Customer") {
        contact.name = pushName;
      }
      await contact.save();
    }
  } catch (cErr: any) {
    console.warn(`[Direct Pipeline] Contact DB notice: ${cErr.message}`);
  }

  // 5. Check Conversation Control & Auto-Unmute on Greetings
  const staffPhonePatterns = [
    "9315160881",
    "9315596055",
    "9315593842",
    "9643308980",
    "9315600189",
    "9870288812",
    "8076555914",
    "9315603920",
    "9891201208",
  ];
  const isInternalStaff = staffPhonePatterns.some((p) => normalizedPhone.includes(p));

  const cleanLower = textContent.trim().toLowerCase();
  const isMuteCommand = ["#mute", "#stop", "#aioff", "#ai off", "#staff"].includes(cleanLower);
  const isUnmuteCommand =
    [
      "#unmute",
      "#aion",
      "#ai on",
      "menu",
      "start",
      "#bot",
      "restart",
      "hi",
      "hello",
      "heloo",
      "hii",
      "namaste",
      "reset",
      "#reset",
    ].includes(cleanLower) && !isInternalStaff;

  let isHumanMode = false;
  try {
    const ConversationControl = getConversationControlModel();
    let control = await ConversationControl.findOne({ phone: normalizedPhone });
    if (!control) {
      control = await ConversationControl.create({
        phone: normalizedPhone,
        mode: isInternalStaff ? "human" : "ai",
        pauseReason: isInternalStaff ? "Internal Staff exclusion" : "",
        lastCustomerMessageAt: new Date(),
      });
    } else {
      control.lastCustomerMessageAt = new Date();
      if (isMuteCommand) {
        control.mode = "human";
        control.pauseReason = "Manually muted via #mute command";
      } else if (isUnmuteCommand) {
        control.mode = "ai";
        control.pauseReason = "";
      } else if (isInternalStaff) {
        control.mode = "human";
      }
      await control.save();
    }
    isHumanMode = control.mode === "human" && !isUnmuteCommand;
  } catch (ctrlErr: any) {
    console.warn(`[Direct Pipeline] Control DB notice: ${ctrlErr.message}`);
  }

  if (isHumanMode || isInternalStaff) {
    console.log(`🛑 [Direct Pipeline] Conversation for ${normalizedPhone} is in HUMAN MODE or STAFF. Bot will NOT reply.`);
    return;
  }

  // 6. Execute Flow Engine to determine intelligent reply
  console.log(`🤖 [Direct Pipeline] Generating FlowEngine response for ${normalizedPhone}...`);
  const flowResponse = await FlowEngine.processMessage(normalizedPhone, textContent, pushName);

  if (flowResponse.ignoreMessage || (!flowResponse.replyText && !flowResponse.mediaUrl)) {
    console.log(`🔇 [Direct Pipeline] FlowEngine opted to ignore message for ${normalizedPhone}.`);
    return;
  }

  // 7. Dispatch Response via Evolution API
  if (flowResponse.mediaUrl) {
    await evolutionClient.sendMediaMessage({
      number: normalizedPhone,
      mediaUrl: flowResponse.mediaUrl,
      mediaType: flowResponse.mediaType || "image",
      caption: flowResponse.mediaCaption || "",
      fileName: flowResponse.mediaFileName,
    });
  }

  if (flowResponse.replyText) {
    const sendResult = await evolutionClient.sendTextMessage({
      number: normalizedPhone,
      text: flowResponse.replyText,
    });
    console.log(`📤 [Direct Pipeline] Sent reply to ${normalizedPhone}: Success = ${sendResult.success}`);
  }

  // 8. Save Outgoing Bot Message in CRM DB
  try {
    const Message = getMessageModel();
    await Message.create({
      phone: normalizedPhone,
      sender: "bot",
      content: flowResponse.replyText,
      mediaType: flowResponse.mediaType || "text",
      mediaUrl: flowResponse.mediaUrl || "",
    });
  } catch (outErr: any) {
    console.warn(`[Direct Pipeline] Outgoing DB save notice: ${outErr.message}`);
  }
}

/**
 * Fast ACK Webhook Ingestion for Evolution API v2.3.7
 * Returns 200 OK immediately and processes message with guaranteed in-process resilience.
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

  // 2. Immediately acknowledge webhook (<10ms)
  res.status(200).json({ status: "acknowledged", receivedAt: new Date().toISOString() });

  try {
    const payload = req.body;
    const rawEvent = String(payload.event || "").toLowerCase().replace(/_/g, ".");
    const isUpsert = rawEvent === "messages.upsert" || rawEvent === "messages.update";

    if (!isUpsert || !payload.data) {
      return;
    }

    const messageData = Array.isArray(payload.data) ? payload.data[0] : payload.data;
    const key = messageData?.key;
    if (!key) return;

    const messageId = key.id;
    const rawJid = key.remoteJid || "";
    const remoteJid = (key.remoteJidAlt && key.remoteJidAlt.includes("@s.whatsapp.net"))
      ? key.remoteJidAlt
      : rawJid;

    const fromMe = key.fromMe;

    // Skip status broadcasts and group messages
    if (remoteJid.includes("@g.us") || remoteJid.includes("status@broadcast") || rawJid.includes("@g.us")) {
      return;
    }

    // If sent from our own mobile phone:
    if (fromMe) {
      const rawNumber = remoteJid.split("@")[0].replace(/\D/g, "");
      const normalizedPhone = rawNumber.startsWith("91") ? `+${rawNumber}` : `+91${rawNumber}`;
      console.log(`👤 [Webhook] Staff manually messaged ${normalizedPhone} from phone.`);
      return;
    }

    // In-memory deduplication (5 minute window)
    if (processedMessages.has(messageId)) {
      return;
    }
    processedMessages.add(messageId);
    if (processedMessages.size > 2000) {
      const firstEntry = processedMessages.values().next().value;
      if (firstEntry) processedMessages.delete(firstEntry);
    }

    // Execute direct pipeline immediately
    processMessageDirectly(messageData, remoteJid, messageData.pushName || "").catch((procErr) => {
      console.error("❌ [Direct Pipeline] Error processing message:", procErr.message);
    });
  } catch (error: any) {
    console.error("❌ [Webhook] Error handling webhook payload:", error.message);
  }
}
