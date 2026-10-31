import { Request, Response } from "express";
import { getContactModel } from "../models/Contact.js";

export async function getContacts(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const search = (req.query.search as string) || "";
    const businessType = (req.query.businessType as string) || "";

    const query: any = {};
    if (search) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ name: regex }, { phone: regex }, { city: regex }, { businessName: regex }];
    }
    if (businessType && businessType !== "ALL") {
      query.businessType = businessType;
    }

    try {
      const Contact = getContactModel();
      const total = await Contact.countDocuments(query);
      const contacts = await Contact.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      res.status(200).json({
        contacts,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch {
      // In-memory sample data if DB connection is uninitialized
      res.status(200).json({
        contacts: [
          {
            _id: "cnt_001",
            phone: "+919876543210",
            name: "Ramesh Gupta",
            businessName: "Delhi Sanitary & Tiles",
            businessType: "Dealer",
            city: "Delhi",
            state: "Delhi",
            tags: ["Dealer", "Wholesale", "PTMT"],
            totalEnquiriesCount: 4,
            isVerifiedDealer: true,
            lastContactedAt: new Date(),
          },
          {
            _id: "cnt_002",
            phone: "+919812345678",
            name: "Suresh Patil",
            businessName: "Patil Hardware & Plumbing",
            businessType: "Retailer",
            city: "Pune",
            state: "Maharashtra",
            tags: ["Retailer", "Chrome Faucets"],
            totalEnquiriesCount: 2,
            isVerifiedDealer: false,
            lastContactedAt: new Date(),
          },
        ],
        pagination: { total: 2, page: 1, limit: 20, totalPages: 1 },
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getContactById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const Contact = getContactModel();
    const contact = await Contact.findById(id).lean();
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.status(200).json({ contact });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateContact(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const Contact = getContactModel();
    const updated = await Contact.findByIdAndUpdate(id, req.body, { new: true });
    res.status(200).json({ contact: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
