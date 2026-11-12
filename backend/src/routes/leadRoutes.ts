import { Router } from "express";
import {
  getLeads,
  updateLeadStage,
  createLead,
  deleteLead,
  cleanTestNumberLeads,
} from "../controllers/leadController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", requireAuth, getLeads);
router.post("/", requireAuth, createLead);
router.patch("/:id/stage", requireAuth, updateLeadStage);
router.delete("/:id", requireAuth, deleteLead);
router.post("/clean-test-number", requireAuth, cleanTestNumberLeads);

export default router;
