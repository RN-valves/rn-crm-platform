import { Router } from "express";
import {
  getAiSettings,
  updateAiSettings,
  getKnowledgeBase,
  createKnowledgeBaseItem,
} from "../controllers/aiController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

// AI Settings & Knowledge Base configuration is strictly ADMIN only
router.use(requireAuth, requireRole(["ADMIN"]));

router.get("/settings", getAiSettings);
router.put("/settings", updateAiSettings);
router.get("/knowledge-base", getKnowledgeBase);
router.post("/knowledge-base", createKnowledgeBaseItem);

export default router;
