import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { config } from "./config/env.js";
import { initDatabases } from "./database/connections.js";
import { closeQueues } from "./queues/queueManager.js";
import healthRoutes from "./routes/healthRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import leadRoutes from "./routes/leadRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import followupRoutes from "./routes/followupRoutes.js";
import systemRoutes from "./routes/systemRoutes.js";
import salesExecutiveRoutes from "./routes/salesExecutiveRoutes.js";
import { seedSalesExecutivesIfEmpty } from "./models/SalesExecutive.js";
import { setupIncomingMessageWorker } from "./workers/incomingMessageWorker.js";
import { setupAiProcessingWorker } from "./workers/aiProcessingWorker.js";
import { setupOutgoingMessageWorker } from "./workers/outgoingMessageWorker.js";

const app = express();

// Trust reverse proxy (Traefik / Coolify / Cloudflare)
app.set("trust proxy", 1);

// Security and utility middleware
app.use(helmet());
app.use(
  cors({
    origin: [config.FRONTEND_URL, "https://crm.rnvalves.com", "http://localhost:3000", "http://localhost:3001"],
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev"));

// 1. Global Rate Limiter: 120 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: "Too many requests from this IP, please try again later." },
});
app.use("/api/", globalLimiter);

// 2. Strict Auth Rate Limiter: 10 login attempts per 15 minutes to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: "Too many login attempts, please try again after 15 minutes." },
});
app.use("/api/auth/login", authLimiter);
app.use("/auth/login", authLimiter);

// Base Health & Webhook Routes
app.use("/api", healthRoutes);
app.use("/", healthRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/webhooks", webhookRoutes);

// CRM REST API Modules (Supported with and without /api prefix)
app.use("/api/auth", authRoutes);
app.use("/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/contacts", contactRoutes);
app.use("/api/leads", leadRoutes);
app.use("/leads", leadRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/conversations", conversationRoutes);
app.use("/api/ai", aiRoutes);
app.use("/ai", aiRoutes);
app.use("/api/followups", followupRoutes);
app.use("/followups", followupRoutes);
app.use("/api/system", systemRoutes);
app.use("/system", systemRoutes);
app.use("/api/sales-executives", salesExecutiveRoutes);
app.use("/sales-executives", salesExecutiveRoutes);

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled Application Error:", err);
  res.status(err.status || 500).json({
    error: {
      message: config.NODE_ENV === "production" ? "Internal Server Error" : err.message,
    },
  });
});

async function bootstrap() {
  try {
    console.log("🚀 Starting RN Valves CRM & AI Automation Backend...");

    // Connect to databases
    await initDatabases();
    await seedSalesExecutivesIfEmpty();

    // Start BullMQ Background Workers
    console.log("⚙️ Starting BullMQ Workers (Incoming, AI, Outgoing)...");
    setupIncomingMessageWorker();
    setupAiProcessingWorker();
    setupOutgoingMessageWorker();
    console.log("✅ [Workers] All BullMQ workers listening for WhatsApp messages.");

    // Start Express server
    const server = app.listen(config.PORT, () => {
      console.log(`✅ [Server] RN CRM Backend running on port ${config.PORT} (${config.NODE_ENV})`);
    });

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);
      server.close(async () => {
        await closeQueues();
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Fatal Error during bootstrap:", error);
    if (config.NODE_ENV === "development") {
      console.warn("⚠️ Continuing in offline/development mode without database connection.");
      app.listen(config.PORT, () => {
        console.log(`✅ [Server] RN CRM Backend running on port ${config.PORT} (offline fallback mode)`);
      });
    } else {
      process.exit(1);
    }
  }
}

bootstrap();
