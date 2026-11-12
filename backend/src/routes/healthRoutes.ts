import { Router, Request, Response } from "express";
import { getCrmConnection, getEcommConnection, lastCrmError, lastEcommError } from "../database/connections.js";

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

router.get("/health", async (_req: Request, res: Response) => {
  let crmDbStatus = "disconnected";
  let ecommDbStatus = "disconnected";
  let counts: any = null;

  try {
    const conn = getCrmConnection();
    crmDbStatus = getConnStatus(conn);
    if (conn.readyState === 1 && conn.db) {
      const [messagesCount, contactsCount, leadsCount] = await Promise.all([
        conn.db.collection("messages").countDocuments().catch(() => null),
        conn.db.collection("contacts").countDocuments().catch(() => null),
        conn.db.collection("leads").countDocuments().catch(() => null),
      ]);
      counts = { messagesCount, contactsCount, leadsCount };
    }
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
      lastCrmError,
      lastEcommError,
      counts,
    },
  });
});

export default router;
