import { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";
import { getCrmConnection } from "../database/connections.js";

export type UserRole = "ADMIN" | "SALES" | "Admin" | "Manager" | "Sales_Agent" | "Support_Agent";

export interface ICrmUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  phone?: string;
  department: "Sales" | "Support" | "Operations" | "Management";
  isActive: boolean;
  chatwootAgentId?: string;
  assignedLeadsCount: number;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<ICrmUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["ADMIN", "SALES", "Admin", "Manager", "Sales_Agent", "Support_Agent"],
      default: "SALES",
      index: true,
    },
    phone: { type: String, default: "" },
    department: {
      type: String,
      enum: ["Sales", "Support", "Operations", "Management"],
      default: "Management",
    },
    isActive: { type: Boolean, default: true, index: true },
    chatwootAgentId: { type: String, default: "" },
    assignedLeadsCount: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export function getCrmUserModel(): Model<ICrmUser> {
  const db = getCrmConnection();
  return db.models.CrmUser || db.model<ICrmUser>("CrmUser", UserSchema);
}

/**
 * Seed default Admin user if none exists in CRM database
 */
export async function seedAdminUserIfEmpty(): Promise<void> {
  try {
    const Model = getCrmUserModel();
    const existingAdmin = await Model.findOne({
      $or: [
        { role: { $in: ["ADMIN", "Admin"] } },
        { email: "admin@rnvalves.com" },
      ],
    });

    if (!existingAdmin) {
      console.log("🌱 [Seed] Seeding Default RN Valves Admin account...");
      const passwordHash = await bcrypt.hash("RNadmin@2026", 10);
      await Model.create({
        name: "RN Valves Admin",
        email: "admin@rnvalves.com",
        passwordHash,
        role: "ADMIN",
        phone: "+91 93151 60881",
        department: "Management",
        isActive: true,
        assignedLeadsCount: 0,
      });
      console.log("✅ [Seed] Successfully created master Admin user (admin@rnvalves.com).");
    }
  } catch (err: any) {
    console.warn(`[Seed] Admin user seed notice: ${err.message}`);
  }
}
