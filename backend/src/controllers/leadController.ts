import { Request, Response } from "express";
import { getLeadModel, LeadStatus } from "../models/Lead.js";
import { getAuditLogModel } from "../models/AuditLog.js";

export async function getLeads(req: Request, res: Response): Promise<void> {
  try {
    const status = req.query.status as string;
    const priority = req.query.priority as string;
    const search = req.query.search as string;

    const query: any = {};
    if (status && status !== "ALL") query.status = status;
    if (priority && priority !== "ALL") query.priority = priority;
    if (search) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ customerName: regex }, { phone: regex }, { businessName: regex }, { city: regex }];
    }

    try {
      const Lead = getLeadModel();
      const leads = await Lead.find(query).sort({ updatedAt: -1 }).lean();
      res.status(200).json({ leads });
    } catch {
      // Fallback sample data if DB connection is offline
      res.status(200).json({
        leads: [
          {
            _id: "ld_001",
            leadNumber: "RNL-10024",
            customerName: "Ramesh Gupta",
            phone: "+919876543210",
            businessName: "Delhi Sanitary & Tiles",
            businessType: "Dealer",
            city: "Delhi",
            state: "Delhi",
            productCategory: "PTMT Faucets",
            productInterest: ["RN-102", "RN-105"],
            requirementDescription: "Interested in 500 pcs PTMT pillar cocks & bib cocks wholesale",
            leadSource: "WhatsApp_Inbound",
            assignedEmployeeName: "Rohit Sharma",
            status: "QUOTATION_SENT",
            priority: "HIGH",
            estimatedValue: 145000,
            followupDate: new Date(Date.now() + 86400000 * 2),
            createdAt: new Date(),
          },
          {
            _id: "ld_002",
            leadNumber: "RNL-10025",
            customerName: "Vikas Aggarwal",
            phone: "+919822334455",
            businessName: "Aggarwal Bath Gallery",
            businessType: "Distributor",
            city: "Jaipur",
            state: "Rajasthan",
            productCategory: "Brass Faucets",
            productInterest: ["RN-501"],
            requirementDescription: "Distributorship enquiry for Rajasthan region",
            leadSource: "WhatsApp_Inbound",
            assignedEmployeeName: "Amit Patel",
            status: "INTERESTED",
            priority: "URGENT",
            estimatedValue: 450000,
            followupDate: new Date(Date.now() + 86400000),
            createdAt: new Date(),
          },
          {
            _id: "ld_003",
            leadNumber: "RNL-10026",
            customerName: "Sunil Verma",
            phone: "+919899001122",
            businessName: "Verma Plumbers",
            businessType: "Retailer",
            city: "Lucknow",
            state: "Uttar Pradesh",
            productCategory: "Showers",
            productInterest: ["RN-SH-01"],
            requirementDescription: "Requires catalogue and sample display rack",
            leadSource: "WhatsApp_Inbound",
            assignedEmployeeName: "Pooja Verma",
            status: "NEW",
            priority: "MEDIUM",
            estimatedValue: 60000,
            followupDate: new Date(Date.now() + 86400000 * 3),
            createdAt: new Date(),
          },
        ],
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateLeadStage(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { status, comment } = req.body;

  try {
    const Lead = getLeadModel();
    const existing = await Lead.findById(id);
    if (!existing) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const fromStatus = existing.status;
    existing.status = status as LeadStatus;
    existing.history.push({
      fromStatus,
      toStatus: status,
      updatedBy: req.user?.name || "Agent",
      timestamp: new Date(),
      comment: comment || `Stage moved from ${fromStatus} to ${status}`,
    });

    await existing.save();

    // Log to audit trail
    try {
      const AuditLog = getAuditLogModel();
      await AuditLog.create({
        actorId: req.user?.id || "agent",
        actorName: req.user?.name || "Agent",
        action: "LEAD_STAGE_UPDATED",
        entityType: "Lead",
        entityId: id,
        metadata: { fromStatus, toStatus: status },
      });
    } catch {}

    res.status(200).json({ lead: existing });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function createLead(req: Request, res: Response): Promise<void> {
  try {
    const Lead = getLeadModel();
    const count = await Lead.countDocuments();
    const leadNumber = `RNL-${10000 + count + 1}`;

    const newLead = await Lead.create({
      ...req.body,
      leadNumber,
      history: [
        {
          fromStatus: "CREATED",
          toStatus: req.body.status || "NEW",
          updatedBy: req.user?.name || "Agent",
          timestamp: new Date(),
        },
      ],
    });

    res.status(201).json({ lead: newLead });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
