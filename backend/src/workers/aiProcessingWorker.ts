import { Worker, Job } from "bullmq";
import { getRedisOptions } from "../queues/redisConnection.js";
import { outgoingMessagesQueue } from "../queues/queueManager.js";
import { getConversationControlModel } from "../models/ConversationControl.js";
import { FlowEngine } from "../services/conversation/flowEngine.js";

export function setupAiProcessingWorker(): Worker {
  const worker = new Worker(
    "ai-processing",
    async (job: Job) => {
      const { messageId, phone, customerName, messageText, chatwootConversationId } = job.data;

      // 1. Double check conversation control mode before executing
      try {
        const ConversationControl = getConversationControlModel();
        const control = await ConversationControl.findOne({ phone });
        // Only abort if a real human agent manually took over in Chatwoot (not AI auto-pause)
        if (
          control &&
          control.mode === "human" &&
          control.pauseReason &&
          !control.pauseReason.startsWith("AI Handover")
        ) {
          console.log(
            `🛑 [AI Worker] Real human agent actively took over ${phone} (${control.pauseReason}). Aborting flow generation.`
          );
          return { status: "aborted_human_takeover" };
        }
      } catch (err: any) {
        // Continue if DB is offline in test
      }

      console.log(`🤖 [AI Worker] Processing flow message from ${phone}: "${messageText}"`);

      // 2. Execute Deterministic Conversational Flow Engine
      const flowResponse = await FlowEngine.processMessage(phone, messageText, customerName);

      if (flowResponse.ignoreMessage || (!flowResponse.replyText && !flowResponse.mediaUrl)) {
        console.log(`🔇 [AI Worker] Message from ${phone} ignored/filtered.`);
        return { status: "ignored" };
      }

      // 3. Enqueue Outgoing Message to WhatsApp
      await outgoingMessagesQueue.add(
        "send-whatsapp-message",
        {
          phone,
          replyText: flowResponse.replyText,
          mediaUrl: flowResponse.mediaUrl,
          mediaType: flowResponse.mediaType,
          mediaCaption: flowResponse.mediaCaption,
          mediaFileName: flowResponse.mediaFileName,
          chatwootConversationId,
          isAiReply: true,
        },
        {
          jobId: `out_flow_${messageId}_${Date.now()}`,
        }
      );

      return { status: "flow_reply_queued" };
    },
    {
      connection: getRedisOptions(),
      concurrency: 3,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`❌ [AI Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
