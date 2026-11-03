import { Router } from "express";
import { handleEvolutionWebhook } from "../controllers/webhookController.js";
import { handleChatwootWebhook } from "../controllers/chatwootWebhookController.js";

const router = Router();

// 1. Evolution API v2.3.7 Inbound Webhook
// Supports both base URL and event sub-paths (/evolution and /evolution/messages-upsert)
router.post("/evolution", handleEvolutionWebhook);
router.post("/evolution/*", handleEvolutionWebhook);

// 2. Chatwoot Outbound & Event Webhook
router.post("/chatwoot", handleChatwootWebhook);
router.post("/chatwoot/*", handleChatwootWebhook);

export default router;
