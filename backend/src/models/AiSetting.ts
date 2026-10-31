import { Schema, Document, Model } from "mongoose";
import { getCrmConnection } from "../database/connections.js";

export interface IAiSetting extends Document {
  key: string; // e.g. "default"
  isEnabled: boolean;
  selectedModel: string; // e.g. "gemini-1.5-flash"
  systemPrompt: string;
  temperature: number;
  languages: string[]; // ["en", "hi", "mr", "bn"]
  fallbackMessage: string;
  handoverKeywords: string[]; // ["agent", "human", "baat karni hai", "call me", "dealer enquiry"]
  catalogSearchEnabled: boolean;
  leadAutoCreationEnabled: boolean;
  businessHoursOnly: boolean;
  businessHoursStart: string; // "09:00"
  businessHoursEnd: string; // "19:00"
  timezone: string; // "Asia/Kolkata"
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiSettingSchema = new Schema<IAiSetting>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    isEnabled: { type: Boolean, default: true },
    selectedModel: { type: String, default: "gemini-1.5-flash" },
    systemPrompt: {
      type: String,
      default:
        "You are the official RN Valves & Faucets AI assistant. Help customers politely with product queries, dealer inquiries, and catalogue requests in Hindi, Hinglish, Marathi, Bengali, or English. Only use verified prices and specifications from the RN product catalog. Never invent prices or warranty terms.",
    },
    temperature: { type: Number, default: 0.2 },
    languages: { type: [String], default: ["en", "hi", "mr", "bn"] },
    fallbackMessage: {
      type: String,
      default:
        "Thank you for contacting RN Valves! A representative from our sales team will connect with you shortly.",
    },
    handoverKeywords: {
      type: [String],
      default: [
        "agent",
        "human",
        "executive",
        "baat karni",
        "call karo",
        "dealer ban na hai",
        "distributorship",
        "owner",
        "representative",
      ],
    },
    catalogSearchEnabled: { type: Boolean, default: true },
    leadAutoCreationEnabled: { type: Boolean, default: true },
    businessHoursOnly: { type: Boolean, default: false },
    businessHoursStart: { type: String, default: "09:00" },
    businessHoursEnd: { type: String, default: "19:00" },
    timezone: { type: String, default: "Asia/Kolkata" },
    updatedBy: { type: String, default: "SYSTEM" },
  },
  { timestamps: true }
);

export function getAiSettingModel(): Model<IAiSetting> {
  const db = getCrmConnection();
  return db.models.AiSetting || db.model<IAiSetting>("AiSetting", AiSettingSchema);
}
