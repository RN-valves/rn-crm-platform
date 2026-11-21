import { Router } from "express";
import {
  getSalesExecutives,
  createSalesExecutive,
  updateSalesExecutive,
  deleteSalesExecutive,
} from "../controllers/salesExecutiveController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

// Sales Executive Management is strictly restricted to ADMIN
router.use(requireAuth, requireRole(["ADMIN"]));

router.get("/", getSalesExecutives);
router.post("/", createSalesExecutive);
router.put("/:id", updateSalesExecutive);
router.delete("/:id", deleteSalesExecutive);

export default router;
