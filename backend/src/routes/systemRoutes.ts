import { Router } from "express";
import { getSystemHealth, getAuditLogs } from "../controllers/systemController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

// System Health & Audit Logs are strictly ADMIN only
router.use(requireAuth, requireRole(["ADMIN"]));

router.get("/health", getSystemHealth);
router.get("/audit-logs", getAuditLogs);

export default router;
