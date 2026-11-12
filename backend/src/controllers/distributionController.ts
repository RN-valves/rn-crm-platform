import { Request, Response } from "express";
import { getLeadModel } from "../models/Lead.js";
import { getContactModel } from "../models/Contact.js";
import { getConversationControlModel } from "../models/ConversationControl.js";
import { getConversationStateModel } from "../models/ConversationState.js";
import { getSalesExecutiveModel, INITIAL_SALES_EXECUTIVES } from "../models/SalesExecutive.js";
import { getCrmConnection } from "../database/connections.js";

const STAFF_PHONE_PATTERNS = [
  "9315160881", // Amit Kumar Sir
  "9315596055", // Arpita
  "9315593842", // Gaurav
  "9643308980", // Vinod
  "9315600189", // Danish
  "9870288812", // Pradeep
  "8076555914", // Khusi
  "9811103377", // Official Management
];

function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "").slice(-10);
}

function normalizeRepName(name: string): string {
  const norm = (name || "").trim().toLowerCase();
  if (norm.includes("amit") && !norm.includes("patel")) return "Amit Kumar Sir";
  if (norm.includes("arpita")) return "Arpita";
  if (norm.includes("gaurav")) return "Gaurav";
  if (norm.includes("vinod")) return "Vinod";
  if (norm.includes("danish")) return "Danish";
  if (norm.includes("pradeep")) return "Pradeep";
  if (norm.includes("khusi") || norm.includes("khushi")) return "Khusi";
  return name.trim();
}

export async function getDistributionAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const conn = getCrmConnection();
    if (conn.readyState !== 1) {
      try {
        await conn.asPromise();
      } catch {}
    }

    const Lead = getLeadModel();
    const Contact = getContactModel();
    const ConversationControl = getConversationControlModel();
    const ConversationState = getConversationStateModel();
    const SalesExecutive = getSalesExecutiveModel();

    // 1. Fetch Sales Executives
    let executives: any[] = [];
    try {
      executives = await SalesExecutive.find({ isActive: true }).sort({ orderIndex: 1 }).lean();
    } catch {}
    if (!executives || executives.length === 0) {
      executives = INITIAL_SALES_EXECUTIVES;
    }

    // 2. Fetch all Leads
    let leads: any[] = [];
    try {
      leads = await Lead.find({}).sort({ createdAt: -1 }).lean();
    } catch {}

    // 3. Fetch all Contacts
    let contacts: any[] = [];
    try {
      contacts = await Contact.find({}).sort({ lastContactedAt: -1 }).lean();
    } catch {}

    // 4. Fetch Human Conversations
    let humanControls: any[] = [];
    try {
      humanControls = await ConversationControl.find({ mode: "human" }).sort({ updatedAt: -1 }).lean();
    } catch {}

    // 5. Fetch Active Sessions
    let sessions: any[] = [];
    try {
      sessions = await ConversationState.find({}).lean();
    } catch {}
    const sessionMap = new Map<string, any>();
    for (const s of sessions) {
      const p10 = normalizePhone(s.phone);
      if (p10) sessionMap.set(p10, s);
    }

    // Map contacts by 10-digit phone
    const contactMap = new Map<string, any>();
    for (const c of contacts) {
      const p10 = normalizePhone(c.phone);
      if (p10) contactMap.set(p10, c);
    }

    // Lead phone set
    const leadPhoneSet = new Set<string>();
    for (const l of leads) {
      const p10 = normalizePhone(l.phone);
      if (p10) leadPhoneSet.add(p10);
    }

    // 6. Map leads to executives & unassigned
    const repBuckets: Record<
      string,
      {
        executive: any;
        leads: any[];
        totalCount: number;
        convertedCount: number;
        inProgressCount: number;
        totalEstimatedValue: number;
      }
    > = {};

    for (const exec of executives) {
      const canonicalName = normalizeRepName(exec.name);
      repBuckets[canonicalName] = {
        executive: exec,
        leads: [],
        totalCount: 0,
        convertedCount: 0,
        inProgressCount: 0,
        totalEstimatedValue: 0,
      };
    }

    const unassignedLeads: any[] = [];

    for (const l of leads) {
      const rawName = l.assignedEmployeeName || "";
      const canonicalName = normalizeRepName(rawName);

      if (canonicalName && repBuckets[canonicalName]) {
        repBuckets[canonicalName].leads.push(l);
        repBuckets[canonicalName].totalCount += 1;
        if (l.status === "CONVERTED") {
          repBuckets[canonicalName].convertedCount += 1;
        } else {
          repBuckets[canonicalName].inProgressCount += 1;
        }
        repBuckets[canonicalName].totalEstimatedValue += Number(l.estimatedValue) || 0;
      } else {
        unassignedLeads.push(l);
      }
    }

    const totalLeadsCount = leads.length;
    const repDistribution = Object.values(repBuckets).map((b) => ({
      name: b.executive.name,
      mobile: b.executive.mobile,
      area: b.executive.area,
      state: b.executive.state,
      pinPrefixes: b.executive.pinPrefixes || [],
      leadsCount: b.totalCount,
      convertedCount: b.convertedCount,
      inProgressCount: b.inProgressCount,
      totalEstimatedValue: b.totalEstimatedValue,
      sharePercent: totalLeadsCount > 0 ? Math.round((b.totalCount / totalLeadsCount) * 100) : 0,
      leads: b.leads.map((l) => ({
        _id: l._id,
        leadNumber: l.leadNumber,
        customerName: l.customerName,
        phone: l.phone,
        city: l.city,
        state: l.state,
        businessName: l.businessName,
        status: l.status,
        priority: l.priority,
        estimatedValue: l.estimatedValue,
        productCategory: l.productCategory,
        createdAt: l.createdAt,
      })),
    }));

    // 7. Human Mode / Takeover Conversations
    const humanTakeovers = humanControls.map((hc) => {
      const p10 = normalizePhone(hc.phone);
      const contact = contactMap.get(p10);
      return {
        _id: hc._id,
        phone: hc.phone,
        customerName: contact?.name || "WhatsApp User",
        businessName: contact?.businessName || "",
        city: contact?.city || "",
        mode: hc.mode,
        pauseReason: hc.pauseReason || "Customer requested human takeover",
        assignedAgentName: hc.assignedAgentName || "Unassigned Agent",
        lastCustomerMessageAt: hc.lastCustomerMessageAt || hc.updatedAt,
        chatwootConversationId: hc.chatwootConversationId || "",
        updatedAt: hc.updatedAt,
      };
    });

    const humanPhoneSet = new Set<string>();
    for (const ht of humanTakeovers) {
      humanPhoneSet.add(normalizePhone(ht.phone));
    }

    // 8. Abandoned / Dropped Off Inquiries at "Hi"
    const droppedAtHi: any[] = [];
    for (const c of contacts) {
      const p10 = normalizePhone(c.phone);
      if (!p10) continue;
      // Skip if lead was completed
      if (leadPhoneSet.has(p10)) continue;
      // Skip if converted to human takeover
      if (humanPhoneSet.has(p10)) continue;
      // Skip internal staff numbers
      if (STAFF_PHONE_PATTERNS.includes(p10)) continue;

      const activeSession = sessionMap.get(p10);
      let dropOffStage = "Dropped after initial Greeting (Sent Hi)";
      if (activeSession) {
        if (activeSession.state === "LANGUAGE_SELECTION") {
          dropOffStage = "Dropped at Language Selection Menu (Sent Hi)";
        } else if (activeSession.state === "REQUIREMENT_TYPE") {
          dropOffStage = "Selected Language, dropped at Requirement Type";
        } else if (activeSession.state === "FORM_NAME") {
          dropOffStage = "Dropped while asking Customer / Shop Name";
        } else if (activeSession.state === "FORM_PIN" || activeSession.state === "SALES_PIN_CODE") {
          dropOffStage = "Dropped while asking PIN code";
        } else if (activeSession.state === "FORM_INTEREST" || activeSession.state === "PRODUCT_CATALOGUES") {
          dropOffStage = "Viewed Catalogue, dropped before finalizing";
        } else if (activeSession.state === "HUMAN_TAKEOVER_PROMPT") {
          dropOffStage = "Prompted for Human Takeover, did not respond";
        } else {
          dropOffStage = `Dropped during flow (${activeSession.state})`;
        }
      }

      droppedAtHi.push({
        _id: c._id,
        phone: c.phone,
        name: c.name && c.name !== "WhatsApp User" ? c.name : "Incomplete Visitor",
        businessName: c.businessName || "",
        city: c.city || "",
        totalEnquiriesCount: c.totalEnquiriesCount || 1,
        lastContactedAt: c.lastContactedAt || c.updatedAt || c.createdAt,
        dropOffStage,
        preferredLanguage: activeSession?.language || "hi",
      });
    }

    // Sort dropped by latest
    droppedAtHi.sort(
      (a, b) => new Date(b.lastContactedAt).getTime() - new Date(a.lastContactedAt).getTime()
    );

    // 9. Overall Summary
    const totalInquiries = contacts.length;
    const totalAssignedLeads = repDistribution.reduce((acc, r) => acc + r.leadsCount, 0);
    const totalUnassignedLeads = unassignedLeads.length;

    res.status(200).json({
      success: true,
      summary: {
        totalInquiries,
        totalLeads: totalLeadsCount,
        totalAssignedLeads,
        totalUnassignedLeads,
        totalHumanTakeovers: humanTakeovers.length,
        totalDroppedAtHi: droppedAtHi.length,
        leadCompletionRate:
          totalInquiries > 0 ? Math.round((totalLeadsCount / totalInquiries) * 100) : 0,
      },
      executives: repDistribution,
      unassignedLeads: unassignedLeads.map((l) => ({
        _id: l._id,
        leadNumber: l.leadNumber,
        customerName: l.customerName,
        phone: l.phone,
        city: l.city,
        state: l.state,
        businessName: l.businessName,
        status: l.status,
        priority: l.priority,
        estimatedValue: l.estimatedValue,
        requirementDescription: l.requirementDescription,
        pincode: l.pincode,
        createdAt: l.createdAt,
      })),
      humanTakeovers,
      droppedAtHi,
    });
  } catch (err: any) {
    console.error("[DistributionController] Error:", err);
    res.status(500).json({ error: err.message || "Failed to calculate distribution analytics" });
  }
}

export async function assignLead(req: Request, res: Response): Promise<void> {
  try {
    const { leadId, executiveName, executivePhone, executiveEmail } = req.body;
    if (!leadId || !executiveName) {
      res.status(400).json({ error: "leadId and executiveName are required" });
      return;
    }

    const Lead = getLeadModel();
    const lead = await Lead.findById(leadId);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const prevName = lead.assignedEmployeeName || "Unassigned";
    lead.assignedEmployeeName = executiveName;
    if (executivePhone) lead.assignedEmployeeId = executivePhone;

    lead.history.push({
      fromStatus: lead.status,
      toStatus: lead.status,
      updatedBy: (req as any).user?.name || "Admin",
      timestamp: new Date(),
      comment: `Reassigned from ${prevName} to ${executiveName}`,
    });

    await lead.save();

    res.status(200).json({
      success: true,
      message: `Lead successfully assigned to ${executiveName}`,
      lead,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to assign lead" });
  }
}
