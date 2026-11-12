import { Router, Request, Response } from "express";
import { getCrmConnection, getEcommConnection } from "../database/connections.js";

const router = Router();

function getConnStatus(conn: any): string {
  if (!conn) return "uninitialized";
  switch (conn.readyState) {
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "disconnected";
  }
}

router.get("/health", (_req: Request, res: Response) => {
  let crmDbStatus = "disconnected";
  let ecommDbStatus = "disconnected";

  try {
    crmDbStatus = getConnStatus(getCrmConnection());
  } catch {
    crmDbStatus = "uninitialized";
  }

  try {
    ecommDbStatus = getConnStatus(getEcommConnection());
  } catch {
    ecommDbStatus = "uninitialized";
  }

  res.status(200).json({
    status: crmDbStatus === "connected" ? "healthy" : "degraded",
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
