import mongoose, { Connection } from "mongoose";
import { config } from "../config/env.js";

let crmConnection: Connection;
let ecommConnection: Connection;

export async function initDatabases(): Promise<{ crmConnection: Connection; ecommConnection: Connection }> {
  try {
    // 1. Dedicated CRM Database Connection (Writeable)
    crmConnection = mongoose.createConnection(config.CRM_MONGODB_URI, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
    });

    crmConnection.on("connected", () => {
      console.log("✅ [Database] Connected to RN CRM database.");
    });

    crmConnection.on("error", (err) => {
      console.error("❌ [Database] RN CRM database connection error:", err);
    });

    // 2. Existing eCommerce Database Connection (Strict Read-Only)
    ecommConnection = mongoose.createConnection(config.ECOMM_MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      readPreference: "secondaryPreferred",
    });

    ecommConnection.on("connected", () => {
      console.log("✅ [Database] Connected to RN eCommerce database (read-only mode).");
    });

    ecommConnection.on("error", (err) => {
      console.error("❌ [Database] RN eCommerce database connection error:", err);
    });

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
