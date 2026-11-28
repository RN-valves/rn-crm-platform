import { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";
import { getCrmConnection } from "../database/connections.js";

export interface ISalesExecutive extends Document {
  name: string;
  mobile: string;
  area: string;
  state: string;
  pinPrefixes: string[]; // e.g. ["11", "20", "21"]
  pin?: string; // 4-digit security PIN for rep portal access
  pinHash?: string; // Bcrypt hashed PIN
  role: "ADMIN" | "SALES";
  department?: "B2B_SALES" | "ECOMMERCE";
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
    pin: { type: String, default: "1234", trim: true },
    pinHash: { type: String, default: "" },
    role: { type: String, enum: ["ADMIN", "SALES"], default: "SALES" },
    department: { type: String, enum: ["B2B_SALES", "ECOMMERCE"], default: "B2B_SALES" },
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
    area: "Delhi NCR, UP, Bihar & Jharkhand",
    state: "UP / Bihar / Delhi NCR / Jharkhand",
    pinPrefixes: ["11", "20", "21", "22", "23", "24", "25", "26", "27", "28", "80", "81", "82", "83", "84", "85"],
    pin: "1234",
    isActive: true,
    isDefaultFallback: false,
    orderIndex: 1,
  },
  {
    name: "Amit Kumar Sir",
    mobile: "+91 93151 60881",
    area: "Haryana, Gujarat, Punjab, Odisha & Head Office",
    state: "Haryana / Gujarat / Punjab / Odisha",
    pinPrefixes: ["12", "13", "14", "15", "16", "17", "36", "37", "38", "39", "75", "76", "77"],
    pin: "1234",
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
    pin: "1234",
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
    pin: "1234",
    isActive: true,
    isDefaultFallback: false,
    orderIndex: 4,
  },
  {
    name: "Danish",
    mobile: "+91 93156 00189",
    area: "West Bengal, Assam, Tamil Nadu & Jammu & Kashmir",
    state: "WB / Assam / Tamil Nadu / Jammu & Kashmir",
    pinPrefixes: ["18", "19", "60", "61", "62", "63", "64", "70", "71", "72", "73", "74", "78", "79"],
    pin: "1234",
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
    pin: "1234",
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
    pin: "1234",
    department: "B2B_SALES" as const,
    isActive: true,
    isDefaultFallback: false,
    orderIndex: 7,
  },
];

export const ECOMMERCE_EXECUTIVES = [
  {
    name: "Kanika E-commerce",
    mobile: "+91 93156 03920",
    area: "Online Shopping & Website Orders (rnvalves.com)",
    state: "Pan-India E-Commerce",
    pinPrefixes: [] as string[],
    pin: "1234",
    department: "ECOMMERCE" as const,
    isActive: true,
    isDefaultFallback: false,
    orderIndex: 101,
  },
  {
    name: "Tammana E-commerce",
    mobile: "+91 96253 14298",
    area: "Online Shopping & Website Orders (rnvalves.com)",
    state: "Pan-India E-Commerce",
    pinPrefixes: [] as string[],
    pin: "1234",
    department: "ECOMMERCE" as const,
    isActive: true,
    isDefaultFallback: false,
    orderIndex: 102,
  },
];

export async function seedSalesExecutivesIfEmpty(): Promise<void> {
  try {
    const Model = getSalesExecutiveModel();
    const count = await Model.countDocuments();
    const defaultPinHash = await bcrypt.hash("1234", 10);

    if (count === 0) {
      console.log("🌱 [Seed] Seeding RN Valves Sales & E-Commerce Executives into database...");
      const initialWithHash = [...INITIAL_SALES_EXECUTIVES, ...ECOMMERCE_EXECUTIVES].map((exec: any) => ({
        ...exec,
        department: exec.department || "B2B_SALES",
        role: "SALES",
        pin: "1234",
        pinHash: defaultPinHash,
        isActive: true,
      }));
      await Model.insertMany(initialWithHash);
      console.log("✅ [Seed] Successfully seeded Sales & E-Commerce Executives.");
    } else {
      // Ensure E-Commerce Executives (Kanika & Tammana) exist in DB
      for (const ecommExec of ECOMMERCE_EXECUTIVES) {
        const clean10 = ecommExec.mobile.replace(/\D/g, "").slice(-10);
        const existing = await Model.findOne({
          $or: [
            { name: new RegExp(`^${ecommExec.name}$`, "i") },
            { mobile: new RegExp(`${clean10}$`) },
          ],
        });
        if (!existing) {
          await Model.create({
            ...ecommExec,
            role: "SALES",
            pinHash: defaultPinHash,
          });
          console.log(`✅ [Seed] Added E-Commerce Executive: ${ecommExec.name} (${ecommExec.mobile})`);
        } else if (existing.department !== "ECOMMERCE") {
          existing.department = "ECOMMERCE";
          if (!existing.pinHash) {
            existing.pinHash = await bcrypt.hash(existing.pin || "1234", 10);
          }
          await existing.save();
        }
      }

      // Migrate existing records: ensure role is SALES and pinHash exists
      const unhashed = await Model.find({
        $or: [
          { role: { $exists: false } },
          { role: null },
          { pinHash: { $exists: false } },
          { pinHash: "" },
          { pinHash: null },
        ],
      });

      for (const exec of unhashed) {
        const pinToHash = exec.pin || "1234";
        const hash = await bcrypt.hash(pinToHash, 10);
        exec.role = "SALES";
        exec.pin = pinToHash;
        exec.pinHash = hash;
        if (!exec.department) exec.department = "B2B_SALES";
        if (exec.isActive === undefined) exec.isActive = true;
        await exec.save();
      }
      if (unhashed.length > 0) {
        console.log(`✅ [Seed] Migrated ${unhashed.length} Sales Executives with hashed security PINs and SALES role.`);
      }
    }
  } catch (err: any) {
    console.warn(`[Seed] Sales Executives seed notice: ${err.message}`);
  }
}
