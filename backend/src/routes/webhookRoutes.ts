import { Router } from "express";
import { handleEvolutionWebhook } from "../controllers/webhookController.js";
import { handleChatwootWebhook } from "../controllers/chatwootWebhookController.js";

const router = Router();

// 1. Evolution API v2.3.7 Inbound Webhook
router.post("/evolution", handleEvolutionWebhook);

// 2. Chatwoot Outbound & Event Webhook
router.post("/chatwoot", handleChatwootWebhook);

export default router;
