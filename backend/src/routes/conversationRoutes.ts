import { Router } from "express";
import {
  getConversations,
  getConversationMessages,
  sendConversationReply,
  toggleConversationMode,
} from "../controllers/conversationController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", requireAuth, getConversations);
router.get("/:id/messages", requireAuth, getConversationMessages);
router.post("/reply", requireAuth, sendConversationReply);
router.patch("/mode", requireAuth, toggleConversationMode);

export default router;
