import { Router } from "express";
import {
  getDistributionAnalytics,
  assignLead,
  reengageCustomer,
  reengageBulkCustomers,
  resendRepAlert,
} from "../controllers/distributionController.js";

const router = Router();

// GET /api/distribution/analytics
router.get("/analytics", getDistributionAnalytics);
router.get("/", getDistributionAnalytics);

// POST /api/distribution/assign-lead
router.post("/assign-lead", assignLead);

// POST /api/distribution/resend-rep-alert
router.post("/resend-rep-alert", resendRepAlert);

// POST /api/distribution/reengage
router.post("/reengage", reengageCustomer);

// POST /api/distribution/reengage-bulk
router.post("/reengage-bulk", reengageBulkCustomers);

export default router;
