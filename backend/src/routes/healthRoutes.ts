import { Router, Request, Response } from "express";
import net from "net";
import https from "https";
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

function testTcp(host: string, port: number, timeoutMs = 2000): Promise<{ ok: boolean; error?: string; durationMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeoutMs);

    socket.connect(port, host, () => {
      const durationMs = Date.now() - start;
      cleanup();
      resolve({ ok: true, durationMs });
    });

    socket.on("error", (err) => {
      const durationMs = Date.now() - start;
      cleanup();
      resolve({ ok: false, error: err.message, durationMs });
    });

    socket.on("timeout", () => {
      const durationMs = Date.now() - start;
      cleanup();
      resolve({ ok: false, error: "TCP Timeout", durationMs });
    });
  });
}

router.get("/health", async (req: Request, res: Response) => {
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

  let diagnostics: any = null;
  if (req.query.diag === "true" || crmDbStatus !== "connected") {
    const [tcpIp1111, tcpAtlasIp27017, tcpGoogle] = await Promise.all([
      testTcp("1.1.1.1", 80, 2000),
      testTcp("159.41.242.133", 27017, 2000),
      testTcp("google.com", 443, 2000),
    ]);
    diagnostics = {
      directIpInternet: tcpIp1111,
      directAtlasPort27017: tcpAtlasIp27017,
      dnsGoogle443: tcpGoogle,
    };
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
    diagnostics,
  });
});

export default router;
