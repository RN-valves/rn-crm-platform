import { Router } from "express";
import { login, getMe } from "../controllers/authController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = Router();

router.post("/login", login);
router.get("/me", requireAuth, getMe);

export default router;
