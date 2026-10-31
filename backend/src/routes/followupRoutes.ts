import { Router } from "express";
import { getFollowups, createFollowup, updateFollowupStatus } from "../controllers/followupController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", requireAuth, getFollowups);
router.post("/", requireAuth, createFollowup);
router.patch("/:id/status", requireAuth, updateFollowupStatus);

export default router;
