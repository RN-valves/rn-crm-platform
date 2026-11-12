import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const DIRECT_CRM_URI =
  "mongodb://web_db_user:EoK0ZBimp3zGV9ZY@ac-k85qtjy-shard-00-00.jbtr81i.mongodb.net:27017,ac-k85qtjy-shard-00-01.jbtr81i.mongodb.net:27017,ac-k85qtjy-shard-00-02.jbtr81i.mongodb.net:27017/rn-crm?ssl=true&replicaSet=atlas-p9l75x-shard-0&authSource=admin&retryWrites=true&w=majority";

const DIRECT_ECOMM_URI =
  "mongodb://web_db_user:EoK0ZBimp3zGV9ZY@ac-k85qtjy-shard-00-00.jbtr81i.mongodb.net:27017,ac-k85qtjy-shard-00-01.jbtr81i.mongodb.net:27017,ac-k85qtjy-shard-00-02.jbtr81i.mongodb.net:27017/rn-valves?ssl=true&replicaSet=atlas-p9l75x-shard-0&authSource=admin&retryWrites=true&w=majority";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("5000").transform((val) => parseInt(val, 10)),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  BACKEND_URL: z.string().default("http://localhost:5000"),
  JWT_SECRET: z.string().default("rn_valves_production_jwt_secret_secure_key_2026_super_strong"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // Direct Replica Set Atlas URIs (Guaranteed to bypass Docker SRV DNS issues)
  CRM_MONGODB_URI: z
    .string()
    .default(DIRECT_CRM_URI)
    .transform((val) =>
      !val ||
      val.includes("localhost") ||
      val.includes("<username>") ||
      val.includes("+srv") ||
      !val.includes("jbtr81i.mongodb.net")
        ? DIRECT_CRM_URI
        : val
    ),
  ECOMM_MONGODB_URI: z
    .string()
    .default(DIRECT_ECOMM_URI)
    .transform((val) =>
      !val ||
      val.includes("localhost") ||
      val.includes("<username>") ||
      val.includes("+srv") ||
      !val.includes("jbtr81i.mongodb.net")
        ? DIRECT_ECOMM_URI
        : val
    ),

  // Redis
  REDIS_HOST: z.string().default("rn-crm-redis"),
  REDIS_PORT: z.string().default("6379").transform((val) => parseInt(val, 10)),
  REDIS_PASSWORD: z.string().default("rn_crm_redis_secret_2026"),
  REDIS_DB: z.string().default("0").transform((val) => parseInt(val, 10)),

  // Evolution API v2.3.7
  EVOLUTION_API_URL: z.string().default("https://wa-api.rnvalves.com"),
  EVOLUTION_API_KEY: z
    .string()
    .default("rn_valves_evolution_api_key_2026")
    .transform((val) => val || "rn_valves_evolution_api_key_2026"),
  EVOLUTION_INSTANCE_NAME: z.string().default("RNchat"),
  EVOLUTION_WEBHOOK_SECRET: z.string().default(""),

  // Make.com Transparent Forwarding (Zero Disruption)
  MAKE_WEBHOOK_URL: z.string().optional(),

  // Chatwoot
  CHATWOOT_BASE_URL: z.string().default("https://inbox.rnvalves.com"),
  CHATWOOT_ACCOUNT_ID: z.string().default("2").transform((val) => val || "2"),
  CHATWOOT_API_ACCESS_TOKEN: z
    .string()
    .default("VWWNVSM1L5P5P9LW6W2uppmz")
    .transform((val) => val || "VWWNVSM1L5P5P9LW6W2uppmz"),
  CHATWOOT_INBOX_ID: z.string().default("1"),
  CHATWOOT_WEBHOOK_SECRET: z.string().default(""),

  // AI Settings
  AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-1.5-flash"),

  // Media
  MEDIA_CDN_URL: z.string().default("https://rnvalves.media"),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
