import { Schema, Document, Model } from "mongoose";
import { getCrmConnection } from "../database/connections.js";

export type KnowledgeCategory =
  | "General"
  | "Dealership_Policy"
  | "Warranty_Terms"
  | "Product_Maintenance"
  | "Branches_Locations"
  | "Payment_Billing"
  | "Shipping_Logistics";

export interface IKnowledgeBase extends Document {
  title: string;
  category: KnowledgeCategory;
  content: string;
  tags: string[];
  isActive: boolean;
  viewCount: number;
  priorityOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeBaseSchema = new Schema<IKnowledgeBase>(
  {
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: [
        "General",
        "Dealership_Policy",
        "Warranty_Terms",
        "Product_Maintenance",
        "Branches_Locations",
        "Payment_Billing",
        "Shipping_Logistics",
      ],
      default: "General",
      index: true,
    },
    content: { type: String, required: true },
    tags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    viewCount: { type: Number, default: 0 },
    priorityOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

KnowledgeBaseSchema.index({ title: "text", content: "text", tags: "text" });

export function getKnowledgeBaseModel(): Model<IKnowledgeBase> {
  const db = getCrmConnection();
  return db.models.KnowledgeBase || db.model<IKnowledgeBase>("KnowledgeBase", KnowledgeBaseSchema);
}
