import { Redis } from "ioredis";
import { config } from "../config/env.js";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
    });

    redisClient.on("connect", () => {
      console.log("✅ [Redis] Connected successfully to Redis server.");
    });

    redisClient.on("error", (err) => {
      console.warn("⚠️ [Redis] Connection warning/error:", err.message);
    });
  }

  return redisClient;
}

export function getRedisOptions() {
  return {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    db: config.REDIS_DB,
    maxRetriesPerRequest: null,
  };
}
