import { Router } from "express";
import { getContacts, getContactById, updateContact } from "../controllers/contactController.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

// Contacts directory is restricted to ADMIN
router.use(requireAuth, requireRole(["ADMIN"]));

router.get("/", getContacts);
router.get("/:id", getContactById);
router.put("/:id", updateContact);

export default router;
