import { Worker, Job } from "bullmq";
import { getRedisOptions } from "../queues/redisConnection.js";
import { outgoingMessagesQueue, leadProcessingQueue } from "../queues/queueManager.js";
import { getConversationControlModel } from "../models/ConversationControl.js";
import { AiOrchestrator } from "../services/ai/aiOrchestrator.js";

export function setupAiProcessingWorker(): Worker {
  const worker = new Worker(
    "ai-processing",
    async (job: Job) => {
      const { messageId, phone, customerName, messageText, chatwootConversationId } = job.data;

      // 1. Double check conversation control mode before executing AI
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
            `🛑 [AI Worker] Real human agent actively took over ${phone} (${control.pauseReason}). Aborting AI generation.`
          );
          return { status: "aborted_human_takeover" };
        }
      } catch (err: any) {
        // Continue if DB is offline in test
      }

      console.log(`🤖 [AI Worker] Analyzing message from ${phone}: "${messageText}"`);

      // 2. Run AI Orchestrator with verified catalog tools
      const decision = await AiOrchestrator.processMessage({
        messageText,
        phone,
        customerName,
      });

      console.log(`💡 [AI Worker] Decision for ${phone}: intent=${decision.intent}, lang=${decision.language}`);

      // 3. If explicit human handover requested by customer, assign to human team
      if (decision.requiresHumanHandover && decision.intent === "human_handover") {
        try {
          const ConversationControl = getConversationControlModel();
          await ConversationControl.findOneAndUpdate(
            { phone },
            {
              mode: "human",
              assignedTeam: "Sales",
              pauseReason: `Customer requested human representative`,
            },
            { upsert: true }
          );
        } catch (err: any) {
          console.warn(`[AI Worker] Mode update skipped: ${err.message}`);
        }
      }

      // 4. If lead data captured (e.g. dealer inquiry with shop/pincode), trigger lead processing queue
      if (decision.leadData) {
        await leadProcessingQueue.add("process-qualified-lead", {
          phone,
          customerName: decision.leadData.customerName || customerName,
          businessType: decision.leadData.businessType || "Dealer",
          city: decision.leadData.city,
          productInterest: decision.leadData.productInterest || [],
          requirement: messageText,
          source: "WhatsApp_Inbound",
        });
      }

      // 4. Enqueue Outgoing Message to WhatsApp
      await outgoingMessagesQueue.add(
        "send-whatsapp-message",
        {
          phone,
          replyText: decision.replyText,
          mediaUrl: decision.mediaUrl,
          mediaType: decision.mediaType,
          mediaCaption: decision.mediaCaption,
          mediaFileName: decision.mediaFileName,
          chatwootConversationId,
          isAiReply: true,
        },
        {
          jobId: `out_ai_${messageId}_${Date.now()}`,
        }
      );

      return { status: "ai_reply_queued", intent: decision.intent };
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
