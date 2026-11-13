import { Worker, Job } from "bullmq";
import { getRedisOptions } from "../queues/redisConnection.js";
import { aiProcessingQueue } from "../queues/queueManager.js";
import { getContactModel } from "../models/Contact.js";
import { getConversationControlModel } from "../models/ConversationControl.js";
import { getMessageModel } from "../models/Message.js";
import { chatwootClient } from "../services/chatwoot/chatwootClient.js";
import { isCorporateBot } from "../services/botFilter.js";

export function setupIncomingMessageWorker(): Worker {
  const worker = new Worker(
    "incoming-messages",
    async (job: Job) => {
      const { messageId, remoteJid, rawJid, fromMe, pushName, message, rawPayload } = job.data;

      // Extract real phone number: Handle WhatsApp Privacy LID (remoteJidAlt has actual phone number)
      const altJid = rawPayload?.data?.key?.remoteJidAlt;
      const effectiveJid = (altJid && altJid.includes("@s.whatsapp.net"))
        ? altJid
        : (remoteJid && remoteJid.includes("@s.whatsapp.net") ? remoteJid : altJid || remoteJid);

      const rawNumber = String(effectiveJid || "").split("@")[0].replace(/\D/g, "");
      const normalizedPhone = rawNumber.startsWith("91") ? `+${rawNumber}` : `+91${rawNumber}`;

      // Extract text content and media type (with deep unwrapping)
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

      console.log(
        `📨 [Incoming Worker] Job ${job.id}: ${normalizedPhone} (${pushName || "Customer"}) [${mediaType}]: "${textContent}"`
      );

      // Corporate Bot / Automated Service Filter (Jio, SBI, Banks, RBI, OTPs)
      if (isCorporateBot(normalizedPhone, textContent)) {
        console.log(`🤖 [Incoming Worker] Skipped corporate bot message from ${normalizedPhone}`);
        return { status: "ignored_corporate_bot" };
      }

      // 1. Sync or Create Contact in CRM DB (if DB available)
      let contact: any = null;
      try {
        const Contact = getContactModel();
        contact = await Contact.findOne({ phone: normalizedPhone });
        if (!contact) {
          contact = await Contact.create({
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
      } catch (err: any) {
        console.warn(`[Incoming Worker] CRM Contact DB sync skipped: ${err.message}`);
      }

      // 1b. Save Incoming Message into MongoDB
      try {
        const Message = getMessageModel();
        await Message.create({
          phone: normalizedPhone,
          sender: "customer",
          content: textContent,
          mediaType,
          mediaUrl,
        });
      } catch (msgErr: any) {
        console.warn(`[Incoming Worker] Message DB sync notice: ${msgErr.message}`);
      }

      // 2. Sync to Chatwoot (Contact & Conversation)
      let chatwootConvId: number | null = null;
      try {
        const cwContact = await chatwootClient.findOrCreateContact({
          phone: normalizedPhone,
          name: pushName || "WhatsApp Customer",
        });

        const cwConv = await chatwootClient.findOrCreateConversation(cwContact.id);
        chatwootConvId = cwConv.id;

        // Sync incoming customer message to Chatwoot inbox
        await chatwootClient.createMessage({
          conversationId: cwConv.id,
          content: textContent,
          messageType: "incoming",
        });
      } catch (err: any) {
        console.warn(`[Incoming Worker] Chatwoot sync skipped/offline: ${err.message}`);
      }

      // 3. Check Conversation Mode (AI Mode vs Human Mode) & Staff Exclusions
      const staffPhonePatterns = [
        "9315160881", // Amit Kumar Sir
        "9315596055", // Arpita
        "9315593842", // Gaurav
        "9643308980", // Vinod
        "9315600189", // Danish
        "9870288812", // Pradeep
        "8076555914", // Khusi
        "9315603920", // E-Commerce Executive / Website Support
        "9891201208", // Complaint & Service Desk
      ];
      const isInternalStaff = staffPhonePatterns.some((num) => normalizedPhone.includes(num)) ||
        (contact && (contact.tags?.includes("Staff") || contact.tags?.includes("Colleague") || contact.tags?.includes("DoNotReply") || contact.businessType === "Staff"));

      // Check on-the-fly Mute & Resume Commands
      const cleanLower = textContent.trim().toLowerCase();
      const isMuteCommand = ["#mute", "#stop", "#aioff", "#ai off", "#staff"].includes(cleanLower);
      const isUnmuteCommand =
        ["#unmute", "#aion", "#ai on", "menu", "start", "#bot", "restart", "hi", "hello", "heloo", "hii", "namaste", "reset", "#reset"].includes(cleanLower) &&
        !isInternalStaff;

      let mode: "ai" | "human" = isInternalStaff ? "human" : "ai";
      try {
        const ConversationControl = getConversationControlModel();
        let control = await ConversationControl.findOne({ phone: normalizedPhone });
        if (!control) {
          control = await ConversationControl.create({
            phone: normalizedPhone,
            chatwootConversationId: chatwootConvId ? String(chatwootConvId) : "",
            mode: isInternalStaff ? "human" : "ai",
            pauseReason: isInternalStaff ? "Internal Staff / Colleague exclusion" : "",
            lastCustomerMessageAt: new Date(),
          });
          mode = control.mode;
        } else {
          control.lastCustomerMessageAt = new Date();
          if (chatwootConvId && !control.chatwootConversationId) {
            control.chatwootConversationId = String(chatwootConvId);
          }
          if (isMuteCommand) {
            control.mode = "human";
            control.pauseReason = "Manually muted via #mute command";
          } else if (isUnmuteCommand) {
            control.mode = "ai";
            control.pauseReason = "";
          } else if (isInternalStaff && control.mode !== "human") {
            control.mode = "human";
            control.pauseReason = "Internal Staff / Colleague exclusion";
          }
          await control.save();
          mode = control.mode;
        }
      } catch (err: any) {
        console.warn(`[Incoming Worker] ConversationControl DB skipped: ${err.message}`);
      }

      // 4. Mode Enforcement:
      // If Human Mode or Internal Staff, STOP HERE! Do not route to AI.
      if (mode === "human" || isInternalStaff) {
        console.log(`🛑 [Incoming Worker] Conversation for ${normalizedPhone} is in HUMAN MODE or STAFF. Bot will NOT reply.`);
        return { status: "human_mode_active", phone: normalizedPhone };
      }

      // If AI Mode, dispatch to ai-processing queue
      await aiProcessingQueue.add(
        "generate-ai-reply",
        {
          messageId,
          phone: normalizedPhone,
          customerName: pushName || "Customer",
          messageText: textContent,
          mediaType,
          chatwootConversationId: chatwootConvId,
        },
        {
          jobId: `ai_${messageId}`,
        }
      );

      return { status: "queued_for_ai", phone: normalizedPhone };
    },
    {
      connection: getRedisOptions(),
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`❌ [Incoming Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
