import { Router } from "express";
import { getLeads, updateLeadStage, createLead } from "../controllers/leadController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", requireAuth, getLeads);
router.post("/", requireAuth, createLead);
router.patch("/:id/stage", requireAuth, updateLeadStage);

export default router;
