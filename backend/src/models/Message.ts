import { Schema, Document, Model } from "mongoose";
import { getCrmConnection } from "../database/connections.js";

export interface IMessage extends Document {
  phone: string;
  sender: "customer" | "bot" | "agent";
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  chatwootMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    phone: { type: String, required: true, index: true },
    sender: {
      type: String,
      enum: ["customer", "bot", "agent"],
      required: true,
    },
    content: { type: String, default: "" },
    mediaUrl: { type: String },
    mediaType: { type: String },
    chatwootMessageId: { type: String },
  },
  { timestamps: true }
);

MessageSchema.index({ phone: 1, createdAt: 1 });

export function getMessageModel(): Model<IMessage> {
  const db = getCrmConnection();
  return db.models.Message || db.model<IMessage>("Message", MessageSchema);
}
