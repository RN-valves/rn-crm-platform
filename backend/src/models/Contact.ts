import { Schema, Document, Model } from "mongoose";
import { getCrmConnection } from "../database/connections.js";

export interface IContact extends Document {
  phone: string; // Normalized E.164 (e.g., +919876543210)
  name: string;
  businessName?: string;
  businessType: "Dealer" | "Distributor" | "Retailer" | "OEM" | "Plumber" | "End User" | "Other";
  email?: string;
  city?: string;
  state?: string;
  pincode?: string;
  chatwootContactId?: string;
  tags: string[];
  notes?: string;
  isVerifiedDealer: boolean;
  totalOrdersCount: number;
  totalEnquiriesCount: number;
  lastContactedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<IContact>(
  {
    phone: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, required: true, trim: true },
    businessName: { type: String, default: "", trim: true },
    businessType: {
      type: String,
      enum: ["Dealer", "Distributor", "Retailer", "OEM", "Plumber", "End User", "Other"],
      default: "Other",
      index: true,
    },
    email: { type: String, default: "", trim: true, lowercase: true },
    city: { type: String, default: "", trim: true, index: true },
    state: { type: String, default: "", trim: true },
    pincode: { type: String, default: "", trim: true },
    chatwootContactId: { type: String, default: "", index: true },
    tags: { type: [String], default: [] },
    notes: { type: String, default: "" },
    isVerifiedDealer: { type: Boolean, default: false },
    totalOrdersCount: { type: Number, default: 0 },
    totalEnquiriesCount: { type: Number, default: 0 },
    lastContactedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ContactSchema.index({ name: "text", businessName: "text", city: "text" });

export function getContactModel(): Model<IContact> {
  const db = getCrmConnection();
  return db.models.Contact || db.model<IContact>("Contact", ContactSchema);
}
