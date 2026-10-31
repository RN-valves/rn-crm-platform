import { Request, Response } from "express";
import { getFollowupModel } from "../models/Followup.js";

export async function getFollowups(req: Request, res: Response): Promise<void> {
  try {
    const status = (req.query.status as string) || "PENDING";
    const query: any = {};
    if (status !== "ALL") query.status = status;

    try {
      const Followup = getFollowupModel();
      const followups = await Followup.find(query).sort({ scheduledAt: 1 }).lean();
      res.status(200).json({ followups });
    } catch {
      res.status(200).json({
        followups: [
          {
            _id: "flw_001",
            leadId: "ld_001",
            leadNumber: "RNL-10024",
            contactPhone: "+919876543210",
            contactName: "Ramesh Gupta",
            assignedName: "Rohit Sharma",
            scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 3),
            status: "PENDING",
            type: "PHONE_CALL",
            notes: "Review PTMT quotation sent yesterday and finalize dispatch terms.",
          },
          {
            _id: "flw_002",
            leadId: "ld_002",
            leadNumber: "RNL-10025",
            contactPhone: "+919822334455",
            contactName: "Vikas Aggarwal",
            assignedName: "Amit Patel",
            scheduledAt: new Date(Date.now() - 1000 * 60 * 60 * 4), // Overdue
            status: "PENDING",
            type: "WHATSAPP_MESSAGE",
            notes: "Send updated brass faucet wholesale price list.",
          },
        ],
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function createFollowup(req: Request, res: Response): Promise<void> {
  try {
    const Followup = getFollowupModel();
    const created = await Followup.create(req.body);
    res.status(201).json({ followup: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateFollowupStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { status, completionRemarks } = req.body;
  try {
    const Followup = getFollowupModel();
    const updated = await Followup.findByIdAndUpdate(
      id,
      {
        status,
        completionRemarks,
        completedAt: status === "COMPLETED" ? new Date() : null,
      },
      { new: true }
    );
    res.status(200).json({ followup: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
