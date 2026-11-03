import { Worker, Job } from "bullmq";
import { getRedisOptions } from "../queues/redisConnection.js";
import { evolutionClient } from "../services/evolution/evolutionClient.js";
import { chatwootClient } from "../services/chatwoot/chatwootClient.js";

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
          caption: mediaCaption || replyText,
          fileName: mediaFileName,
        });

        // Fallback to text message if media sending encounters an issue
        if (!sendResult.success) {
          console.warn(
            `⚠️ [Outgoing Worker] Media delivery failed (${sendResult.error}), falling back to text delivery.`
          );
          sendResult = await evolutionClient.sendTextMessage({
            number: phone,
            text: replyText,
          });
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
