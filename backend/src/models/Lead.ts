import { Schema, Document, Model } from "mongoose";
import { getCrmConnection } from "../database/connections.js";

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "INTERESTED"
  | "QUOTATION_SENT"
  | "NEGOTIATION"
  | "CONVERTED"
  | "LOST";

export type LeadPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface ILeadHistory {
  fromStatus: string;
  toStatus: string;
  updatedBy: string; // User ID, 'AI_BOT', or 'SYSTEM'
  timestamp: Date;
  comment?: string;
}

export interface ILead extends Document {
  leadNumber: string; // e.g. RNL-10024
  customerName: string;
  phone: string; // Normalized E.164
  businessName?: string;
  businessType: "Dealer" | "Distributor" | "Retailer" | "OEM" | "Plumber" | "End User" | "Other";
  city?: string;
  state?: string;
  productCategory?: string;
  productInterest: string[]; // Codes or names of products
  requirementDescription?: string;
  leadSource: "WhatsApp_Inbound" | "Website_Form" | "Direct_Call" | "Referral" | "Exhibition";
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  status: LeadStatus;
  priority: LeadPriority;
  estimatedValue?: number;
  followupDate?: Date;
  internalNotes: string[];
  history: ILeadHistory[];
  chatwootConversationId?: string;
  isDuplicateResolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    leadNumber: { type: String, required: true, unique: true, index: true },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, index: true, trim: true },
    businessName: { type: String, default: "", trim: true },
    businessType: {
      type: String,
      enum: ["Dealer", "Distributor", "Retailer", "OEM", "Plumber", "End User", "Other"],
      default: "Other",
    },
    city: { type: String, default: "", trim: true, index: true },
    state: { type: String, default: "", trim: true },
    productCategory: { type: String, default: "" },
    productInterest: { type: [String], default: [] },
    requirementDescription: { type: String, default: "" },
    leadSource: {
      type: String,
      enum: ["WhatsApp_Inbound", "Website_Form", "Direct_Call", "Referral", "Exhibition"],
      default: "WhatsApp_Inbound",
    },
    assignedEmployeeId: { type: String, default: "", index: true },
    assignedEmployeeName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["NEW", "CONTACTED", "INTERESTED", "QUOTATION_SENT", "NEGOTIATION", "CONVERTED", "LOST"],
      default: "NEW",
      index: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
      index: true,
    },
    estimatedValue: { type: Number, default: 0 },
    followupDate: { type: Date, index: true },
    internalNotes: { type: [String], default: [] },
    history: [
      {
        fromStatus: { type: String, required: true },
        toStatus: { type: String, required: true },
        updatedBy: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        comment: { type: String, default: "" },
      },
    ],
    chatwootConversationId: { type: String, default: "" },
    isDuplicateResolved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound indexes for CRM queries and Kanban views
LeadSchema.index({ status: 1, priority: 1 });
LeadSchema.index({ phone: 1, createdAt: -1 });
LeadSchema.index({ assignedEmployeeId: 1, status: 1 });
LeadSchema.index({ customerName: "text", businessName: "text", requirementDescription: "text" });

export function getLeadModel(): Model<ILead> {
  const db = getCrmConnection();
  return db.models.Lead || db.model<ILead>("Lead", LeadSchema);
}
