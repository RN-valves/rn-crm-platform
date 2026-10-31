import { Router } from "express";
import {
  getAiSettings,
  updateAiSettings,
  getKnowledgeBase,
  createKnowledgeBaseItem,
} from "../controllers/aiController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/settings", requireAuth, getAiSettings);
router.put("/settings", requireAuth, updateAiSettings);
router.get("/knowledge-base", requireAuth, getKnowledgeBase);
router.post("/knowledge-base", requireAuth, createKnowledgeBaseItem);

export default router;
