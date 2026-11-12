import { Router } from "express";
import {
  getSalesExecutives,
  createSalesExecutive,
  updateSalesExecutive,
  deleteSalesExecutive,
} from "../controllers/salesExecutiveController.js";

const router = Router();

router.get("/", getSalesExecutives);
router.post("/", createSalesExecutive);
router.put("/:id", updateSalesExecutive);
router.delete("/:id", deleteSalesExecutive);

export default router;
