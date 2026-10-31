import { Router, Request, Response } from "express";
import { getCrmConnection, getEcommConnection } from "../database/connections.js";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  let crmDbStatus = "disconnected";
  let ecommDbStatus = "disconnected";

  try {
    const crm = getCrmConnection();
    crmDbStatus = crm.readyState === 1 ? "connected" : "connecting";
  } catch {
    crmDbStatus = "uninitialized";
  }

  try {
    const ecomm = getEcommConnection();
    ecommDbStatus = ecomm.readyState === 1 ? "connected" : "connecting";
  } catch {
    ecommDbStatus = "uninitialized";
  }

  res.status(200).json({
    status: "healthy",
    service: "rn-crm-backend",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    databases: {
      crmDb: crmDbStatus,
      ecommDb: ecommDbStatus,
    },
  });
});

export default router;
