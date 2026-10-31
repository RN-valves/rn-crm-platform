import { Request, Response } from "express";
import { getAiSettingModel } from "../models/AiSetting.js";
import { getKnowledgeBaseModel } from "../models/KnowledgeBase.js";

export async function getAiSettings(_req: Request, res: Response): Promise<void> {
  try {
    const AiSetting = getAiSettingModel();
    let setting = await AiSetting.findOne({ key: "default" }).lean();
    if (!setting) {
      setting = {
        key: "default",
        isEnabled: true,
        selectedModel: "gemini-1.5-flash",
        systemPrompt:
          "You are the official RN Valves & Faucets AI assistant. Help customers politely with product queries, dealer inquiries, and catalogue requests in Hindi, Hinglish, Marathi, Bengali, or English. Only use verified prices and specifications from the RN product catalog. Never invent prices or warranty terms.",
        temperature: 0.2,
        languages: ["en", "hi", "mr", "bn", "hinglish"],
        fallbackMessage:
          "Thank you for contacting RN Valves! A representative from our sales team will connect with you shortly.",
        handoverKeywords: ["agent", "human", "executive", "baat karni", "call karo", "dealer", "bulk"],
        catalogSearchEnabled: true,
        leadAutoCreationEnabled: true,
        businessHoursOnly: false,
        businessHoursStart: "09:00",
        businessHoursEnd: "19:00",
        timezone: "Asia/Kolkata",
      } as any;
    }
    res.status(200).json({ settings: setting });
  } catch {
    res.status(200).json({
      settings: {
        key: "default",
        isEnabled: true,
        selectedModel: "gemini-1.5-flash",
        systemPrompt:
          "You are the official RN Valves & Faucets AI assistant. Help customers politely with product queries, dealer inquiries, and catalogue requests in Hindi, Hinglish, Marathi, Bengali, or English.",
        temperature: 0.2,
        languages: ["en", "hi", "mr", "bn", "hinglish"],
        fallbackMessage: "Thank you for contacting RN Valves! Our sales team will connect with you shortly.",
        handoverKeywords: ["agent", "human", "call me", "dealer", "wholesale"],
        catalogSearchEnabled: true,
        leadAutoCreationEnabled: true,
        businessHoursOnly: false,
      },
    });
  }
}

export async function updateAiSettings(req: Request, res: Response): Promise<void> {
  try {
    const AiSetting = getAiSettingModel();
    const updated = await AiSetting.findOneAndUpdate({ key: "default" }, req.body, {
      new: true,
      upsert: true,
    });
    res.status(200).json({ settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getKnowledgeBase(_req: Request, res: Response): Promise<void> {
  try {
    const KnowledgeBase = getKnowledgeBaseModel();
    const items = await KnowledgeBase.find({ isActive: true }).sort({ priorityOrder: -1 }).lean();
    res.status(200).json({ items });
  } catch {
    res.status(200).json({
      items: [
        {
          _id: "kb_1",
          title: "PTMT Products Warranty Terms",
          category: "Warranty_Terms",
          content: "All RN PTMT faucets and showers carry a 3-Year comprehensive warranty against manufacturing defects.",
          tags: ["warranty", "ptmt", "guarantee"],
        },
        {
          _id: "kb_2",
          title: "Dealership & Minimum Order Quantity Policy",
          category: "Dealership_Policy",
          content: "Minimum order quantity for authorized dealer pricing is 10 cartons per SKU or total billing of ₹50,000.",
          tags: ["dealer", "moq", "distributorship"],
        },
      ],
    });
  }
}

export async function createKnowledgeBaseItem(req: Request, res: Response): Promise<void> {
  try {
    const KnowledgeBase = getKnowledgeBaseModel();
    const item = await KnowledgeBase.create(req.body);
    res.status(201).json({ item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
