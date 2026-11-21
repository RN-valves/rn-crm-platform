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
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

// Public / Rep PIN Login (Authentication Endpoint)
router.post("/rep-login", repLogin);

// Sales Rep Isolated Portal (Requires Authentication - accessible by SALES and ADMIN)
router.get("/my-leads", requireAuth, getMyLeads);
router.post("/update-followup", requireAuth, updateLeadFollowup);

// Company-wide Distribution Analytics & Management (Strictly ADMIN only)
router.get("/analytics", requireAuth, requireRole(["ADMIN"]), getDistributionAnalytics);
router.get("/", requireAuth, requireRole(["ADMIN"]), getDistributionAnalytics);
router.post("/assign-lead", requireAuth, requireRole(["ADMIN"]), assignLead);
router.post("/resend-rep-alert", requireAuth, requireRole(["ADMIN"]), resendRepAlert);
router.post("/reengage", requireAuth, requireRole(["ADMIN"]), reengageCustomer);
router.post("/reengage-bulk", requireAuth, requireRole(["ADMIN"]), reengageBulkCustomers);

export default router;
