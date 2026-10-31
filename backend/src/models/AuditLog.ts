import { Schema, Document, Model } from "mongoose";
import { getCrmConnection } from "../database/connections.js";

export interface IAuditLog extends Document {
  actorId: string; // User ID, 'AI_BOT', 'WEBHOOK', 'SYSTEM'
  actorName: string;
  action: string; // e.g. "LEAD_STATUS_UPDATE", "MODE_SWITCH", "ASSIGNMENT_CHANGED"
  entityType: "Lead" | "Contact" | "Conversation" | "AiSetting" | "User" | "System";
  entityId: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: String, required: true, index: true },
    actorName: { type: String, required: true },
    action: { type: String, required: true, index: true },
    entityType: {
      type: String,
      enum: ["Lead", "Contact", "Conversation", "AiSetting", "User", "System"],
      required: true,
      index: true,
    },
    entityId: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });

export function getAuditLogModel(): Model<IAuditLog> {
  const db = getCrmConnection();
  return db.models.AuditLog || db.model<IAuditLog>("AuditLog", AuditLogSchema);
}
