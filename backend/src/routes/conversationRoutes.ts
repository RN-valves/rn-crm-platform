import { Router } from "express";
import {
  getConversations,
  getConversationMessages,
  sendConversationReply,
  toggleConversationMode,
} from "../controllers/conversationController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

// Full WhatsApp Inbox & Live Takeover is restricted to ADMIN
router.use(requireAuth, requireRole(["ADMIN"]));

router.get("/", getConversations);
router.get("/:id/messages", getConversationMessages);
router.post("/reply", sendConversationReply);
router.patch("/mode", toggleConversationMode);

export default router;
