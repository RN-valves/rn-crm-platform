import { Schema, Document, Model } from "mongoose";
import { getCrmConnection } from "../database/connections.js";

export type ConversationMode = "ai" | "human";

export interface IConversationControl extends Document {
  phone: string; // Normalized phone number
  chatwootConversationId?: string;
  mode: ConversationMode;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedTeam?: "Sales" | "Support" | "Dealers" | "Management";
  aiPausedUntil?: Date;
  pauseReason?: string;
  lastCustomerMessageAt?: Date;
  lastAgentMessageAt?: Date;
  lastAiMessageAt?: Date;
  activeLeadId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationControlSchema = new Schema<IConversationControl>(
  {
    phone: { type: String, required: true, unique: true, index: true, trim: true },
    chatwootConversationId: { type: String, default: "", index: true },
    mode: {
      type: String,
      enum: ["ai", "human"],
      default: "ai",
      index: true,
    },
    assignedAgentId: { type: String, default: "", index: true },
    assignedAgentName: { type: String, default: "" },
    assignedTeam: {
      type: String,
      enum: ["Sales", "Support", "Dealers", "Management"],
      default: "Sales",
    },
    aiPausedUntil: { type: Date, default: null },
    pauseReason: { type: String, default: "" },
    lastCustomerMessageAt: { type: Date, default: null },
    lastAgentMessageAt: { type: Date, default: null },
    lastAiMessageAt: { type: Date, default: null },
    activeLeadId: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

ConversationControlSchema.index({ mode: 1, updatedAt: -1 });

export function getConversationControlModel(): Model<IConversationControl> {
  const db = getCrmConnection();
  return (
    db.models.ConversationControl ||
    db.model<IConversationControl>("ConversationControl", ConversationControlSchema)
  );
}
