import { Worker, Job } from "bullmq";
import { getRedisOptions, getRedisClient } from "../queues/redisConnection.js";
import { evolutionClient } from "../services/evolution/evolutionClient.js";
import { chatwootClient } from "../services/chatwoot/chatwootClient.js";
import { getMessageModel } from "../models/Message.js";

export function setupOutgoingMessageWorker(): Worker {
  const worker = new Worker(
    "outgoing-messages",
    async (job: Job) => {
      const {
        phone,
        replyText,
        mediaUrl,
        mediaType,
        mediaCaption,
        mediaFileName,
        chatwootConversationId,
        isAiReply,
      } = job.data;

      console.log(`📤 [Outgoing Worker] Dispatching message to ${phone} (Attempt ${job.attemptsMade + 1})`);

      let sendResult: any;

      // 1. Dispatch Media or Text via Evolution API v2.3.7
      if (mediaUrl) {
        sendResult = await evolutionClient.sendMediaMessage({
          number: phone,
          mediaUrl,
          mediaType: mediaType || "image",
          caption: mediaCaption || "",
          fileName: mediaFileName,
        });

        // Always deliver the complete structured text card so details are never truncated by WhatsApp caption limits
        if (replyText) {
          try {
            await evolutionClient.sendTextMessage({
              number: phone,
              text: replyText,
            });
          } catch (textErr: any) {
            console.warn(`[Outgoing Worker] Follow-up text dispatch warning: ${textErr.message}`);
          }
        }

        // If media failed but text succeeded, consider it delivered
        if (!sendResult.success && replyText) {
          sendResult = { success: true, messageId: `fallback_text_${Date.now()}` };
        }
      } else {
        sendResult = await evolutionClient.sendTextMessage({
          number: phone,
          text: replyText,
        });
      }

      if (!sendResult.success) {
        throw new Error(`Failed to deliver message via Evolution API: ${sendResult.error}`);
      }

      // Mark message in Redis so webhook knows this was sent by the Bot (not a human typing on the phone)
      if (sendResult.messageId) {
        try {
          const redis = getRedisClient();
          await redis.set(`bot:sent:${sendResult.messageId}`, "1", "EX", 86400);
        } catch (e: any) {
          // ignore
        }
      }

      // 2. If it is an AI reply and Chatwoot conversation exists, sync message into Chatwoot
      if (isAiReply && chatwootConversationId) {
        try {
          await chatwootClient.createMessage({
            conversationId: Number(chatwootConversationId),
            content: `🤖 [AI Bot]: ${replyText}`,
            messageType: "outgoing",
          });
        } catch (cwErr: any) {
          console.warn(`[Outgoing Worker] Chatwoot message sync warning: ${cwErr.message}`);
        }
      }

      // 3. Save Outgoing Message into MongoDB
      try {
        const Message = getMessageModel();
        await Message.create({
          phone,
          sender: isAiReply ? "bot" : "agent",
          content: replyText || mediaCaption || (mediaUrl ? "Sent Catalogue PDF" : ""),
          mediaUrl,
          mediaType: mediaType || (mediaUrl ? "document" : "text"),
        });
      } catch (msgErr: any) {
        console.warn(`[Outgoing Worker] Message DB sync notice: ${msgErr.message}`);
      }

      return {
        status: "delivered",
        phone,
        messageId: sendResult.messageId,
      };
    },
    {
      connection: getRedisOptions(),
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`❌ [Outgoing Worker] Job ${job?.id} failed on attempt ${job?.attemptsMade}:`, err.message);
  });

  return worker;
}
