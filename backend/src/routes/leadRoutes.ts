import { Router } from "express";
import {
  getLeads,
  updateLeadStage,
  createLead,
  deleteLead,
  cleanTestNumberLeads,
} from "../controllers/leadController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", requireAuth, getLeads);
router.post("/", requireAuth, createLead);
router.patch("/:id/stage", requireAuth, updateLeadStage);

// Deletions and database cleaning restricted to ADMIN
router.delete("/:id", requireAuth, requireRole(["ADMIN"]), deleteLead);
router.post("/clean-test-number", requireAuth, requireRole(["ADMIN"]), cleanTestNumberLeads);

export default router;
