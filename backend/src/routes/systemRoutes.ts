import { Router } from "express";
import { getSystemHealth, getAuditLogs } from "../controllers/systemController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/health", requireAuth, getSystemHealth);
router.get("/audit-logs", requireAuth, getAuditLogs);

export default router;
