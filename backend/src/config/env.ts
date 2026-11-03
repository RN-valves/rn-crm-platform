import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("5000").transform((val) => parseInt(val, 10)),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  BACKEND_URL: z.string().default("http://localhost:5000"),
  JWT_SECRET: z.string().default("dev_secret_key_rn_valves_crm_min_32_characters_long_12345"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // Databases
  CRM_MONGODB_URI: z.string().default("mongodb://localhost:27017/rn-crm"),
  ECOMM_MONGODB_URI: z.string().default("mongodb://localhost:27017/rn-valves"),

  // Redis
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.string().default("6379").transform((val) => parseInt(val, 10)),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default("0").transform((val) => parseInt(val, 10)),

  // Evolution API
  EVOLUTION_API_URL: z.string().default("https://wa-api.rnvalves.com"),
  EVOLUTION_API_KEY: z.string().default(""),
  EVOLUTION_INSTANCE_NAME: z.string().default("RNchat"),
  EVOLUTION_WEBHOOK_SECRET: z.string().default(""),

  // Make.com Transparent Forwarding (Zero Disruption)
  MAKE_WEBHOOK_URL: z.string().optional(),

  // Chatwoot
  CHATWOOT_BASE_URL: z.string().default("https://inbox.rnvalves.com"),
  CHATWOOT_ACCOUNT_ID: z.string().default("1"),
  CHATWOOT_API_ACCESS_TOKEN: z.string().default(""),
  CHATWOOT_INBOX_ID: z.string().default("1"),
  CHATWOOT_WEBHOOK_SECRET: z.string().default(""),

  // AI Settings (Using latest Gemini 3.8 Flash)
  AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),

  // Media
  MEDIA_CDN_URL: z.string().default("https://rnvalves.media"),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
