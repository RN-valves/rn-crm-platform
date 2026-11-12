import { Schema, Document, Model } from "mongoose";
import { getCrmConnection } from "../database/connections.js";

export interface ISalesExecutive extends Document {
  name: string;
  mobile: string;
  area: string;
  state: string;
  pinPrefixes: string[]; // e.g. ["11", "20", "21"]
  isActive: boolean;
  isDefaultFallback: boolean;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

const SalesExecutiveSchema = new Schema<ISalesExecutive>(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    area: { type: String, default: "", trim: true },
    state: { type: String, required: true, trim: true },
    pinPrefixes: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    isDefaultFallback: { type: Boolean, default: false },
    orderIndex: { type: Number, default: 0 },
  },
  { timestamps: true }
);

let SalesExecutiveModel: Model<ISalesExecutive> | null = null;

export function getSalesExecutiveModel(): Model<ISalesExecutive> {
  if (!SalesExecutiveModel) {
    const conn = getCrmConnection();
    SalesExecutiveModel = conn.model<ISalesExecutive>("SalesExecutive", SalesExecutiveSchema);
  }
  return SalesExecutiveModel;
}

export const INITIAL_SALES_EXECUTIVES = [
  {
    name: "Arpita",
    mobile: "+91 93155 96055",
    area: "Delhi NCR, UP & Bihar Region",
    state: "UP / Bihar / Delhi NCR",
    pinPrefixes: ["11", "20", "21", "22", "23", "24", "25", "26", "27", "28", "80", "81", "82", "84", "85"],
    isActive: true,
    isDefaultFallback: false,
    orderIndex: 1,
  },
  {
    name: "Amit Kumar Sir",
    mobile: "+91 93151 60881",
    area: "Haryana, Gujarat, Punjab, Odisha & Head Office",
    state: "Haryana / Gujarat / Punjab / Odisha",
    pinPrefixes: ["12", "13", "14", "15", "16", "17", "18", "19", "36", "37", "38", "39", "75", "76", "77"],
    isActive: true,
    isDefaultFallback: true,
    orderIndex: 2,
  },
  {
    name: "Gaurav",
    mobile: "+91 93155 93842",
    area: "Rajasthan, Madhya Pradesh & Chhattisgarh",
    state: "Rajasthan / MP / Chhattisgarh",
    pinPrefixes: ["30", "31", "32", "33", "34", "45", "46", "47", "48", "49"],
    isActive: true,
    isDefaultFallback: false,
    orderIndex: 3,
  },
  {
    name: "Vinod",
    mobile: "+91 96433 08980",
    area: "Maharashtra, Kerala & Goa",
    state: "Maharashtra / Kerala / Goa",
    pinPrefixes: ["40", "41", "42", "43", "44", "67", "68", "69"],
    isActive: true,
    isDefaultFallback: false,
    orderIndex: 4,
  },
  {
    name: "Danish",
    mobile: "+91 93156 00189",
    area: "West Bengal, Assam, Tamil Nadu & Jharkhand",
    state: "WB / Assam / Tamil Nadu / Jharkhand",
    pinPrefixes: ["60", "61", "62", "63", "64", "70", "71", "72", "73", "74", "78", "79", "83"],
    isActive: true,
    isDefaultFallback: false,
    orderIndex: 5,
  },
  {
    name: "Pradeep",
    mobile: "+91 98702 88812",
    area: "Karnataka Region",
    state: "Karnataka",
    pinPrefixes: ["56", "57", "58", "59"],
    isActive: true,
    isDefaultFallback: false,
    orderIndex: 6,
  },
  {
    name: "Khusi",
    mobile: "+91 80765 55914",
    area: "Andhra Pradesh & Telangana (Hyderabad)",
    state: "Andhra Pradesh / Telangana",
    pinPrefixes: ["50", "51", "52", "53"],
    isActive: true,
    isDefaultFallback: false,
    orderIndex: 7,
  },
];

export async function seedSalesExecutivesIfEmpty(): Promise<void> {
  try {
    const Model = getSalesExecutiveModel();
    const count = await Model.countDocuments();
    if (count === 0) {
      console.log("🌱 [Seed] Seeding 7 RN Valves Sales Executives into database...");
      await Model.insertMany(INITIAL_SALES_EXECUTIVES);
      console.log("✅ [Seed] Successfully seeded Sales Executives.");
    }
  } catch (err: any) {
    console.warn(`[Seed] Sales Executives seed notice: ${err.message}`);
  }
}
