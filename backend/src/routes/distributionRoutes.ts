import { Router } from "express";
import {
  getDistributionAnalytics,
  assignLead,
  reengageCustomer,
  reengageBulkCustomers,
  resendRepAlert,
  updateLeadFollowup,
  repLogin,
  getMyLeads,
} from "../controllers/distributionController.js";

const router = Router();

// GET /api/distribution/analytics
router.get("/analytics", getDistributionAnalytics);
router.get("/", getDistributionAnalytics);

// POST /api/distribution/rep-login (Sales Rep PIN authentication)
router.post("/rep-login", repLogin);

// GET /api/distribution/my-leads (Isolated leads for authenticated Sales Rep)
router.get("/my-leads", getMyLeads);

// POST /api/distribution/assign-lead
router.post("/assign-lead", assignLead);

// POST /api/distribution/resend-rep-alert
router.post("/resend-rep-alert", resendRepAlert);

// POST /api/distribution/reengage
router.post("/reengage", reengageCustomer);

// POST /api/distribution/reengage-bulk
router.post("/reengage-bulk", reengageBulkCustomers);

// POST /api/distribution/update-followup
router.post("/update-followup", updateLeadFollowup);

export default router;
