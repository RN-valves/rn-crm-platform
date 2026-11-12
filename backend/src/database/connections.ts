import mongoose, { Connection } from "mongoose";
import { config } from "../config/env.js";

let crmConnection: Connection;
let ecommConnection: Connection;

export async function initDatabases(): Promise<{ crmConnection: Connection; ecommConnection: Connection }> {
  try {
    const crmUri = config.CRM_MONGODB_URI;
    const ecommUri = config.ECOMM_MONGODB_URI;

    // 1. Dedicated CRM Database Connection (Writeable)
    crmConnection = mongoose.createConnection(crmUri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10000,
    });

    crmConnection.on("connected", () => {
      console.log("✅ [Database] Connected to RN CRM database (Atlas).");
    });

    crmConnection.on("error", (err) => {
      console.error("❌ [Database] RN CRM database connection error:", err);
    });

    // 2. Existing eCommerce Database Connection (Strict Read-Only)
    ecommConnection = mongoose.createConnection(ecommUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      readPreference: "secondaryPreferred",
    });

    ecommConnection.on("connected", () => {
      console.log("✅ [Database] Connected to RN eCommerce database (read-only mode).");
    });

    ecommConnection.on("error", (err) => {
      console.error("❌ [Database] RN eCommerce database connection error:", err);
    });

    // Await initial connection handshake before starting HTTP listeners
    try {
      await Promise.allSettled([
        crmConnection.asPromise(),
        ecommConnection.asPromise(),
      ]);
      console.log("✅ [Database] Initial connection handshake completed.");
    } catch (connErr) {
      console.warn("⚠️ [Database] Initial connection handshake notice:", connErr);
    }

    return { crmConnection, ecommConnection };
  } catch (error) {
    console.error("❌ [Database] Failed to initialize database connections:", error);
    throw error;
  }
}

export function getCrmConnection(): Connection {
  if (!crmConnection) {
    throw new Error("CRM Database connection has not been initialized yet.");
  }
  return crmConnection;
}

export function getEcommConnection(): Connection {
  if (!ecommConnection) {
    throw new Error("eCommerce Database connection has not been initialized yet.");
  }
  return ecommConnection;
}
