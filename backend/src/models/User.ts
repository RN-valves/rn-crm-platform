import { Schema, Document, Model } from "mongoose";
import { getCrmConnection } from "../database/connections.js";

export type UserRole = "Admin" | "Manager" | "Sales_Agent" | "Support_Agent";

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
      enum: ["Admin", "Manager", "Sales_Agent", "Support_Agent"],
      default: "Sales_Agent",
      index: true,
    },
    phone: { type: String, default: "" },
    department: {
      type: String,
      enum: ["Sales", "Support", "Operations", "Management"],
      default: "Sales",
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
