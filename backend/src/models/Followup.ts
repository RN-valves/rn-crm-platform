import { Schema, Document, Model } from "mongoose";
import { getCrmConnection } from "../database/connections.js";

export type FollowupStatus = "PENDING" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
export type FollowupType = "WHATSAPP_MESSAGE" | "PHONE_CALL" | "QUOTATION_REVIEW" | "SITE_VISIT";

export interface IFollowup extends Document {
  leadId: string;
  leadNumber: string;
  contactPhone: string;
  contactName: string;
  assignedTo: string; // User ID
  assignedName: string;
  scheduledAt: Date;
  status: FollowupStatus;
  type: FollowupType;
  notes: string;
  completionRemarks?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FollowupSchema = new Schema<IFollowup>(
  {
    leadId: { type: String, required: true, index: true },
    leadNumber: { type: String, required: true },
    contactPhone: { type: String, required: true, index: true },
    contactName: { type: String, required: true },
    assignedTo: { type: String, required: true, index: true },
    assignedName: { type: String, default: "" },
    scheduledAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "CANCELLED", "RESCHEDULED"],
      default: "PENDING",
      index: true,
    },
    type: {
      type: String,
      enum: ["WHATSAPP_MESSAGE", "PHONE_CALL", "QUOTATION_REVIEW", "SITE_VISIT"],
      default: "PHONE_CALL",
    },
    notes: { type: String, default: "" },
    completionRemarks: { type: String, default: "" },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

FollowupSchema.index({ status: 1, scheduledAt: 1 });

export function getFollowupModel(): Model<IFollowup> {
  const db = getCrmConnection();
  return db.models.Followup || db.model<IFollowup>("Followup", FollowupSchema);
}
