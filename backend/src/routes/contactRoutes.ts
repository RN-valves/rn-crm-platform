import { Router } from "express";
import { getContacts, getContactById, updateContact } from "../controllers/contactController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", requireAuth, getContacts);
router.get("/:id", requireAuth, getContactById);
router.put("/:id", requireAuth, updateContact);

export default router;
