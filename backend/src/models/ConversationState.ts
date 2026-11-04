import { Schema, Document, Model } from "mongoose";
import { getCrmConnection } from "../database/connections.js";

export type BotFlowState =
  | "START"
  | "LANGUAGE_SELECTION"
  | "REQUIREMENT_TYPE"
  | "PERSONAL_USE_END"
  | "WEBSITE_ORDER_ENQUIRY"
  | "BUSINESS_MENU"
  | "PRODUCT_CATALOGUES"
  | "POST_CATALOGUE"
  | "SALES_PIN_CODE"
  | "SALES_REP_SHOWN"
  | "FORM_NAME"
  | "FORM_MOBILE"
  | "FORM_PIN"
  | "FORM_INTEREST"
  | "COMPLETED";

export interface IConversationState extends Document {
  phone: string;
  state: BotFlowState;
  language: "en" | "hi" | "te" | "ta" | "pa" | "ur";
  customerType?: "Distributor" | "Dealer" | "Retailer" | "Personal Use" | "Website Order";
  formData: {
    name?: string;
    mobile?: string;
    pincode?: string;
    interestedCategory?: string;
    assignedAgent?: {
      name: string;
      mobile: string;
      area: string;
      state: string;
    };
  };
  lastMessageTimestamp: number;
  messageCountWindow: number;
  windowStartTimestamp: number;
  blockedUntil?: Date;
  updatedAt: Date;
  createdAt: Date;
}

const ConversationStateSchema = new Schema<IConversationState>(
  {
    phone: { type: String, required: true, unique: true, index: true },
    state: { type: String, required: true, default: "LANGUAGE_SELECTION" },
    language: { type: String, default: "en" },
    customerType: { type: String },
    formData: {
      name: { type: String, default: "" },
      mobile: { type: String, default: "" },
      pincode: { type: String, default: "" },
      interestedCategory: { type: String, default: "" },
      assignedAgent: {
        name: { type: String, default: "" },
        mobile: { type: String, default: "" },
        area: { type: String, default: "" },
        state: { type: String, default: "" },
      },
    },
    lastMessageTimestamp: { type: Number, default: Date.now },
    messageCountWindow: { type: Number, default: 0 },
    windowStartTimestamp: { type: Number, default: Date.now },
    blockedUntil: { type: Date },
  },
  {
    timestamps: true,
    collection: "conversationstates",
  }
);

// TTL index to automatically expire inactive sessions after 24 hours
ConversationStateSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });

export function getConversationStateModel(): Model<IConversationState> {
  const db = getCrmConnection();
  return db.models.ConversationState || db.model<IConversationState>("ConversationState", ConversationStateSchema);
}
