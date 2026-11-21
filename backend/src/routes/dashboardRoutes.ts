import { Router } from "express";
import { getDashboardStats } from "../controllers/dashboardController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/stats", requireAuth, requireRole(["ADMIN"]), getDashboardStats);

export default router;
