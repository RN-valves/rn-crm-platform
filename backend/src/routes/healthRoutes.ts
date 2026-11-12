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

function testTcp(host: string, port: number, timeoutMs = 3000): Promise<{ ok: boolean; error?: string; durationMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.connect(port, host, () => {
      const durationMs = Date.now() - start;
      socket.destroy();
      resolve({ ok: true, durationMs });
    });

    socket.on("error", (err) => {
      resolve({ ok: false, error: err.message, durationMs: Date.now() - start });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "TCP Timeout", durationMs: Date.now() - start });
    });
  });
}

function getOutboundIp(): Promise<string> {
  return new Promise((resolve) => {
    https.get("https://api.ipify.org?format=json", { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data).ip);
        } catch {
          resolve("parse_error");
        }
      });
    }).on("error", (err) => resolve(`error: ${err.message}`));
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

  // Diagnostic info
  const runDiagnostics = req.query.diag === "true" || crmDbStatus !== "connected";
  let diagnostics: any = null;

  if (runDiagnostics) {
    const [outboundIp, tcpGoogle, tcpAtlasShard] = await Promise.all([
      getOutboundIp(),
      testTcp("google.com", 443),
      testTcp("ac-k85qtjy-shard-00-00.jbtr81i.mongodb.net", 27017, 4000),
    ]);
    diagnostics = {
      containerOutboundIp: outboundIp,
      tcpGoogle443: tcpGoogle,
      tcpAtlasShard27017: tcpAtlasShard,
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
