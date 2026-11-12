import { Router } from "express";
import { getDistributionAnalytics, assignLead } from "../controllers/distributionController.js";

const router = Router();

// GET /api/distribution/analytics
router.get("/analytics", getDistributionAnalytics);
router.get("/", getDistributionAnalytics);

// POST /api/distribution/assign-lead
router.post("/assign-lead", assignLead);

export default router;
