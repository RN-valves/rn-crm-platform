import { Request, Response } from "express";
import { getFollowupModel } from "../models/Followup.js";
import { getLeadModel, backfillUntouchedLeadFollowups } from "../models/Lead.js";
import { invalidateDistributionCache } from "./distributionController.js";

export async function getFollowups(req: Request, res: Response): Promise<void> {
  try {
    await backfillUntouchedLeadFollowups();
    const status = (req.query.status as string) || "PENDING";
    const query: any = {};
    if (status !== "ALL") query.status = status;

    const repFilterRegex =
      req.user?.role === "SALES" && (req.user.repName || req.user.name)
        ? new RegExp(req.user.repName || req.user.name, "i")
        : null;

    if (repFilterRegex) {
      query.assignedName = repFilterRegex;
    }

    const Followup = getFollowupModel();
    const Lead = getLeadModel();

    const leadQuery: any = { followupDate: { $ne: null } };
    if (repFilterRegex) {
      leadQuery.assignedEmployeeName = repFilterRegex;
    }
    if (status === "PENDING") {
      leadQuery.status = { $nin: ["CONVERTED", "LOST"] };
    } else if (status === "COMPLETED") {
      leadQuery.status = { $in: ["CONVERTED", "LOST"] };
    }

    const [standaloneFollowups, scheduledLeads] = await Promise.all([
      Followup.find(query).sort({ scheduledAt: 1 }).lean().catch(() => []),
      Lead.find(leadQuery).sort({ followupDate: 1 }).lean().catch(() => []),
    ]);

    const leadFollowups = scheduledLeads.map((l: any) => {
      const isClosed = l.status === "CONVERTED" || l.status === "LOST";
      const latestNote =
        l.internalNotes && l.internalNotes.length > 0
          ? l.internalNotes[l.internalNotes.length - 1]
          : l.requirementDescription || `Follow up on ${l.productCategory || "inquiry"}`;
      return {
        _id: `lead_${l._id}`,
        leadId: String(l._id),
        leadNumber: l.leadNumber,
        contactPhone: l.phone,
        contactName: l.customerName,
        businessName: l.businessName || "",
        city: l.city || "",
        assignedName: l.assignedEmployeeName || "Unassigned",
        scheduledAt: l.followupDate,
        status: isClosed ? "COMPLETED" : "PENDING",
        leadStatus: l.status,
        estimatedValue: l.estimatedValue || 0,
        type: "WHATSAPP_MESSAGE",
        notes: latestNote,
        leadObj: l,
      };
    });

    const merged = [...standaloneFollowups, ...leadFollowups].sort(
      (a: any, b: any) =>
        new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime()
    );

    res.status(200).json({ followups: merged });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function createFollowup(req: Request, res: Response): Promise<void> {
  try {
    const Followup = getFollowupModel();
    const created = await Followup.create({
      ...req.body,
      assignedName: req.body.assignedName || req.user?.name || "Admin",
      status: "PENDING",
    });
    res.status(201).json({ followup: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateFollowupStatus(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id || "");
  const { status, completionRemarks } = req.body;
  try {
    if (id.startsWith("lead_")) {
      const leadId = id.replace(/^lead_/, "");
      const Lead = getLeadModel();
      const lead = await Lead.findById(leadId);
      if (!lead) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }
      if (status === "COMPLETED") {
        const prevStatus = lead.status;
        if (lead.status === "NEW") {
          lead.status = "CONTACTED";
        }
        lead.followupDate = undefined;
        lead.internalNotes.push(
          `[${new Date().toLocaleDateString("en-IN")}] Follow-up completed${
            completionRemarks ? `: ${completionRemarks}` : ""
          }`
        );
        lead.history.push({
          fromStatus: prevStatus,
          toStatus: lead.status,
          updatedBy: req.user?.name || "Admin",
          timestamp: new Date(),
          comment: "Follow-up marked completed",
        });
        await lead.save();
        invalidateDistributionCache();
      }
      res.status(200).json({ success: true, lead });
      return;
    }

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
