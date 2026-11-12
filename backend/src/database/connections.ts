import mongoose, { Connection } from "mongoose";
import { config } from "../config/env.js";

let crmConnection: Connection;
let ecommConnection: Connection;

export let lastCrmError: string | null = null;
export let lastEcommError: string | null = null;

export async function initDatabases(): Promise<{ crmConnection: Connection; ecommConnection: Connection }> {
  try {
    const crmUri = config.CRM_MONGODB_URI;
    const ecommUri = config.ECOMM_MONGODB_URI;

    // 1. Dedicated CRM Database Connection (Writeable)
    crmConnection = mongoose.createConnection(crmUri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });

    crmConnection.on("connected", () => {
      lastCrmError = null;
      console.log("✅ [Database] Connected to RN CRM database (Atlas).");
    });

    crmConnection.on("error", (err) => {
      lastCrmError = err.message;
      console.error("❌ [Database] RN CRM database connection error:", err.message);
    });

    crmConnection.on("disconnected", () => {
      console.warn("⚠️ [Database] RN CRM database connection disconnected.");
    });

    // 2. Existing eCommerce Database Connection (Strict Read-Only)
    ecommConnection = mongoose.createConnection(ecommUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      readPreference: "secondaryPreferred",
    });

    ecommConnection.on("connected", () => {
      lastEcommError = null;
      console.log("✅ [Database] Connected to RN eCommerce database (read-only mode).");
    });

    ecommConnection.on("error", (err) => {
      lastEcommError = err.message;
      console.error("❌ [Database] RN eCommerce database connection error:", err.message);
    });

    ecommConnection.on("disconnected", () => {
      console.warn("⚠️ [Database] RN eCommerce database connection disconnected.");
    });

    // Await initial connection handshake non-fatally
    try {
      await Promise.allSettled([
        crmConnection.asPromise(),
        ecommConnection.asPromise(),
      ]);
      console.log(`✅ [Database] Initial handshake finished. CRM: ${crmConnection.readyState}, ECOMM: ${ecommConnection.readyState}`);
    } catch (connErr: any) {
      console.warn("⚠️ [Database] Initial connection handshake notice:", connErr?.message || connErr);
    }

    return { crmConnection, ecommConnection };
  } catch (error: any) {
    console.error("❌ [Database] Failed to initialize database connections:", error?.message || error);
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
