import { Queue } from "bullmq";
import { getRedisOptions } from "./redisConnection.js";

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2000,
  },
  removeOnComplete: {
    age: 3600 * 24, // keep 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 3600 * 24 * 7, // keep 7 days for debugging
  },
};

const connection = getRedisOptions();

export const incomingMessagesQueue = new Queue("incoming-messages", {
  connection,
  defaultJobOptions,
});

export const outgoingMessagesQueue = new Queue("outgoing-messages", {
  connection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 4,
  },
});

export const aiProcessingQueue = new Queue("ai-processing", {
  connection,
  defaultJobOptions,
});

export const leadProcessingQueue = new Queue("lead-processing", {
  connection,
  defaultJobOptions,
});

export const followupsQueue = new Queue("followups", {
  connection,
  defaultJobOptions,
});

export const notificationsQueue = new Queue("notifications", {
  connection,
  defaultJobOptions,
});

export async function closeQueues(): Promise<void> {
  await Promise.all([
    incomingMessagesQueue.close(),
    outgoingMessagesQueue.close(),
    aiProcessingQueue.close(),
    leadProcessingQueue.close(),
    followupsQueue.close(),
    notificationsQueue.close(),
  ]);
  console.log("🔒 [Queues] All BullMQ queues closed gracefully.");
}
