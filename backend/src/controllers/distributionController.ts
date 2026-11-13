import { Request, Response } from "express";
import { getLeadModel } from "../models/Lead.js";
import { getContactModel } from "../models/Contact.js";
import { getConversationControlModel } from "../models/ConversationControl.js";
import { getConversationStateModel } from "../models/ConversationState.js";
import { getSalesExecutiveModel, INITIAL_SALES_EXECUTIVES } from "../models/SalesExecutive.js";
import { getMessageModel } from "../models/Message.js";
import { evolutionClient } from "../services/evolution/evolutionClient.js";
import { getCrmConnection } from "../database/connections.js";
import { isCorporateBotNumber } from "../services/botFilter.js";
import { SalesRepDirectory } from "../services/conversation/salesRepDirectory.js";

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

    // 2. Fetch all Leads (excluding corporate bots)
    let leads: any[] = [];
    try {
      leads = (await Lead.find({}).sort({ createdAt: -1 }).lean()).filter(
        (l) => !isCorporateBotNumber(l.phone)
      );
    } catch {}

    // 3. Fetch all Contacts (excluding corporate bots)
    let contacts: any[] = [];
    try {
      contacts = (await Contact.find({}).sort({ lastContactedAt: -1 }).lean()).filter(
        (c) => !isCorporateBotNumber(c.phone)
      );
    } catch {}

    // 4. Fetch Human Conversations (excluding corporate bots)
    let humanControls: any[] = [];
    try {
      humanControls = (await ConversationControl.find({ mode: "human" }).sort({ updatedAt: -1 }).lean()).filter(
        (hc) => !isCorporateBotNumber(hc.phone)
      );
    } catch {}

    // 5. Fetch Active Sessions (excluding corporate bots)
    let sessions: any[] = [];
    try {
      sessions = (await ConversationState.find({}).lean()).filter(
        (s) => !isCorporateBotNumber(s.phone)
      );
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
        pincode: l.pincode || "",
        repNotificationStatus: l.repNotificationStatus || "DELIVERED",
        repNotifiedAt: l.repNotifiedAt || l.createdAt,
        repPhone: l.repPhone || b.executive.mobile || "",
        customerReplyStatus: l.customerReplyStatus || "REPLIED",
        lastReplyAt: l.lastReplyAt || l.createdAt,
        intentTag: l.intentTag || l.productCategory || "Wholesale Dealership",
        routingReason: l.routingReason || `PIN ${l.pincode || "Pan-India"} → Routed to ${b.executive.name}`,
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
      // Skip corporate bots
      if (isCorporateBotNumber(p10)) continue;
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
        } else if (activeSession.state === "RE_ENGAGE_AWAITING_PIN_NAME") {
          dropOffStage = "Re-engagement Greet Sent (Awaiting Name & PIN)";
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

    const totalRepDelivered = leads.filter(
      (l) => l.repNotificationStatus !== "FAILED" && l.assignedEmployeeName && l.assignedEmployeeName !== "Unassigned"
    ).length;

    res.status(200).json({
      success: true,
      summary: {
        totalInquiries,
        totalLeads: totalLeadsCount,
        totalAssignedLeads,
        totalUnassignedLeads,
        totalHumanTakeovers: humanTakeovers.length,
        totalDroppedAtHi: droppedAtHi.length,
        totalRepDelivered,
        totalCustomerReplied: totalLeadsCount,
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
        repNotificationStatus: l.repNotificationStatus || "PENDING",
        repNotifiedAt: l.repNotifiedAt,
        repPhone: l.repPhone || "",
        customerReplyStatus: l.customerReplyStatus || "REPLIED",
        lastReplyAt: l.lastReplyAt || l.createdAt,
        intentTag: l.intentTag || l.productCategory || "Wholesale Dealership",
        routingReason: l.routingReason || "Unassigned - Pending Area PIN Match",
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
    const {
      leadId,
      phone,
      action = "assign",
      executiveName,
      executivePhone,
      executiveEmail,
      notifyAgent = true,
      notifyCustomer = true,
      customerName,
      notes,
    } = req.body;

    const isUnassign = action === "unassign" || executiveName === "Unassigned" || !executiveName;

    if (!leadId && !phone) {
      res.status(400).json({ error: "Either leadId or phone must be provided" });
      return;
    }

    const Lead = getLeadModel();
    const ConversationControl = getConversationControlModel();
    const Contact = getContactModel();
    const Message = getMessageModel();

    let targetLead: any = null;
    let targetPhone = phone;

    // 1. Locate Lead
    if (leadId) {
      targetLead = await Lead.findById(leadId);
      if (targetLead && !targetPhone) {
        targetPhone = targetLead.phone;
      }
    }

    if (!targetLead && targetPhone) {
      const p10 = normalizePhone(targetPhone);
      targetLead = await Lead.findOne({
        phone: { $regex: new RegExp(p10 + "$") },
      });
    }

    // 2. Locate ConversationControl
    let targetControl: any = null;
    if (targetPhone) {
      const p10 = normalizePhone(targetPhone);
      targetControl = await ConversationControl.findOne({
        phone: { $regex: new RegExp(p10 + "$") },
      });
    }

    // 3. Locate Contact for customer name & city
    let targetContact: any = null;
    if (targetPhone) {
      const p10 = normalizePhone(targetPhone);
      targetContact = await Contact.findOne({
        phone: { $regex: new RegExp(p10 + "$") },
      });
    }

    const resolvedCustName = customerName || targetLead?.customerName || targetContact?.name || "Customer";
    const resolvedCustPhone = targetPhone || targetLead?.phone || "";
    const resolvedCity = targetLead?.city || targetContact?.city || "";
    const resolvedBusiness = targetLead?.businessName || targetContact?.businessName || "";
    const resolvedCategory = targetLead?.productCategory || "";

    if (isUnassign) {
      // ===== UNASSIGN FLOW =====
      if (targetLead) {
        const prevName = targetLead.assignedEmployeeName || "Unassigned";
        targetLead.assignedEmployeeName = "Unassigned";
        targetLead.assignedEmployeeId = "";
        targetLead.history.push({
          fromStatus: targetLead.status,
          toStatus: targetLead.status,
          updatedBy: (req as any).user?.name || "Admin",
          timestamp: new Date(),
          comment: `Unassigned agent (previously: ${prevName})`,
        });
        await targetLead.save();
      }

      if (targetControl) {
        targetControl.assignedAgentName = "Unassigned Agent";
        targetControl.assignedAgentId = "";
        targetControl.assignedTeam = "Sales";
        await targetControl.save();
      }

      res.status(200).json({
        success: true,
        action: "unassigned",
        message: `Agent unassigned successfully for ${resolvedCustName} (${resolvedCustPhone})`,
        lead: targetLead,
        control: targetControl,
      });
      return;
    }

    // ===== ASSIGN FLOW =====
    if (!executiveName) {
      res.status(400).json({ error: "executiveName is required for assignment" });
      return;
    }

    // 4. Update or Create Lead
    if (targetLead) {
      const prevName = targetLead.assignedEmployeeName || "Unassigned";
      targetLead.assignedEmployeeName = executiveName;
      if (executivePhone) targetLead.assignedEmployeeId = executivePhone;
      targetLead.history.push({
        fromStatus: targetLead.status,
        toStatus: targetLead.status,
        updatedBy: (req as any).user?.name || "Admin",
        timestamp: new Date(),
        comment: `Reassigned from ${prevName} to ${executiveName}`,
      });
      await targetLead.save();
    } else if (resolvedCustPhone) {
      // Customer was an unformed WhatsApp inquiry / human takeover -> create formal Lead record
      const randomSuffix = Math.floor(10000 + Math.random() * 90000);
      const leadNumber = `RNL-${randomSuffix}`;

      targetLead = await Lead.create({
        leadNumber,
        customerName: resolvedCustName,
        phone: resolvedCustPhone,
        businessName: resolvedBusiness || "",
        businessType: "Other",
        city: resolvedCity || "India",
        productCategory: resolvedCategory || "General Inquiry",
        productInterest: [],
        leadSource: "WhatsApp_Inbound",
        assignedEmployeeName: executiveName,
        assignedEmployeeId: executivePhone || "",
        status: "NEW",
        priority: "HIGH",
        history: [
          {
            fromStatus: "NEW",
            toStatus: "NEW",
            updatedBy: (req as any).user?.name || "Admin",
            timestamp: new Date(),
            comment: `Lead created & assigned to ${executiveName} via CRM Management`,
          },
        ],
      });
    }

    // 5. Update / Upsert ConversationControl
    if (targetControl) {
      targetControl.assignedAgentName = executiveName;
      if (executivePhone) targetControl.assignedAgentId = executivePhone;
      targetControl.assignedTeam = "Sales";
      targetControl.mode = "human";
      targetControl.pauseReason = `Assigned to ${executiveName}`;
      await targetControl.save();
    } else if (resolvedCustPhone) {
      try {
        await ConversationControl.create({
          phone: resolvedCustPhone,
          mode: "human",
          assignedAgentName: executiveName,
          assignedAgentId: executivePhone || "",
          assignedTeam: "Sales",
          lastCustomerMessageAt: new Date(),
          pauseReason: `Manually assigned to ${executiveName}`,
        });
      } catch (ccErr: any) {
        console.warn("[assignLead] Control create notice:", ccErr.message);
      }
    }

    // 6. WhatsApp Notification to Sales Person (Executive)
    let agentNotified = false;
    let agentNotifyError: string | null = null;
    if (notifyAgent && executivePhone) {
      try {
        const cleanAgentPhone = executivePhone.replace(/\D/g, "");
        const formattedAgentPhone = cleanAgentPhone.startsWith("91") ? `+${cleanAgentPhone}` : `+91${cleanAgentPhone}`;

        const agentText = `🔔 *RN Valves & Faucets - New Lead Assigned!*\n\n` +
          `A new customer inquiry has been assigned to you:\n` +
          `👤 *Customer Name:* ${resolvedCustName}\n` +
          `📱 *Customer Phone:* ${resolvedCustPhone}\n` +
          (resolvedCity ? `📍 *City / Region:* ${resolvedCity}\n` : "") +
          (resolvedBusiness ? `🏢 *Firm / Shop:* ${resolvedBusiness}\n` : "") +
          (resolvedCategory ? `📦 *Interested Category:* ${resolvedCategory}\n` : "") +
          (notes ? `📝 *Admin Note:* ${notes}\n` : "") +
          `\n⏰ *Assigned Time:* ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n\n` +
          `👉 *Action Required:* Please connect with the customer on WhatsApp or Call at earliest to discuss requirements & dealer margins.`;

        await evolutionClient.sendTextMessage({
          number: formattedAgentPhone,
          text: agentText,
        });
        agentNotified = true;
        console.log(`✅ [Notification] WhatsApp sent to sales executive ${executiveName} (${formattedAgentPhone})`);
      } catch (err: any) {
        agentNotifyError = err.message;
        console.warn(`⚠️ [Notification] Failed to send WhatsApp to executive ${executiveName}:`, err.message);
      }
    }

    // 7. WhatsApp Notification to Customer
    let customerNotified = false;
    let customerNotifyError: string | null = null;
    if (notifyCustomer && resolvedCustPhone) {
      try {
        const cleanCustPhone = resolvedCustPhone.replace(/\D/g, "");
        const formattedCustPhone = cleanCustPhone.startsWith("91") ? `+${cleanCustPhone}` : `+91${cleanCustPhone}`;

        const customerText = `Namaste ${resolvedCustName && resolvedCustName !== "Customer" ? resolvedCustName : ""}! 🙏\n\n` +
          `RN Valves & Faucets me aapki inquiry hamare Regional Sales Representative ko assign kar di gayi hai:\n\n` +
          `👤 *Sales Manager:* ${executiveName}\n` +
          (executivePhone ? `📞 *Direct WhatsApp / Call:* ${executivePhone}\n` : "") +
          `\nHum aapse jaldi hi best dealer margins, wholesale pricing aur latest catalogues ke saath sampark karenge.\n\n` +
          `Kisi bhi turant sahayata ke liye aap hamare sales executive se seedhe sampark kar sakte hain. ✨\n\n` +
          `*RN Valves & Faucets Pvt. Ltd.*`;

        await evolutionClient.sendTextMessage({
          number: formattedCustPhone,
          text: customerText,
        });

        // Also log this outgoing customer notification in MongoDB messages so it appears in CRM Inbox
        try {
          await Message.create({
            phone: formattedCustPhone,
            sender: "bot",
            content: customerText,
            mediaType: "text",
            mediaUrl: "",
          });
        } catch {}

        customerNotified = true;
        console.log(`✅ [Notification] WhatsApp sent to customer ${resolvedCustName} (${formattedCustPhone})`);
      } catch (err: any) {
        customerNotifyError = err.message;
        console.warn(`⚠️ [Notification] Failed to send WhatsApp to customer ${resolvedCustPhone}:`, err.message);
      }
    }

    // 8. Update Lead with live tracking status
    if (targetLead) {
      targetLead.repNotificationStatus = agentNotified ? "DELIVERED" : (notifyAgent ? "FAILED" : "PENDING");
      if (agentNotified) targetLead.repNotifiedAt = new Date();
      targetLead.repPhone = executivePhone || targetLead.repPhone || "";
      targetLead.customerReplyStatus = customerNotified ? "REPLIED" : "AWAITING_REPLY";
      if (customerNotified) targetLead.lastReplyAt = new Date();
      targetLead.routingReason = `Assigned by Admin → ${executiveName}`;
      await targetLead.save();
    }

    res.status(200).json({
      success: true,
      action: "assigned",
      message: `Lead successfully assigned to ${executiveName}`,
      executive: {
        name: executiveName,
        phone: executivePhone,
      },
      customer: {
        name: resolvedCustName,
        phone: resolvedCustPhone,
      },
      notifications: {
        agentNotified,
        customerNotified,
        agentNotifyError,
        customerNotifyError,
      },
      lead: targetLead,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to process assignment" });
  }
}

/**
 * 1-Click Resend WhatsApp Alert to Sales Representative
 */
export async function resendRepAlert(req: Request, res: Response): Promise<void> {
  try {
    const { leadId, phone } = req.body;
    const Lead = getLeadModel();
    let lead: any = null;
    if (leadId) lead = await Lead.findById(leadId);
    if (!lead && phone) {
      const p10 = normalizePhone(phone);
      lead = await Lead.findOne({
        phone: { $in: [phone, `+91${p10}`, `+${p10}`, p10] },
      }).sort({ createdAt: -1 });
    }

    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const execName = lead.assignedEmployeeName;
    if (!execName || execName === "Unassigned") {
      res.status(400).json({ error: "Lead is unassigned. Please assign an executive first." });
      return;
    }

    // Lookup executive mobile
    const allExecs = await SalesRepDirectory.getAllExecutives();
    const matched = allExecs.find((e) => normalizeRepName(e.name) === normalizeRepName(execName));
    const repPhone = matched?.mobile || lead.assignedEmployeeId || "";
    const cleanRepPhone = repPhone.replace(/\D/g, "");

    if (!cleanRepPhone) {
      res.status(400).json({ error: `No phone number configured for ${execName}` });
      return;
    }

    const alertText =
      `🔔 *[LEAD NOTIFICATION / RE-DISPATCH]*\n\n` +
      `Namaste *${execName} ji*,\n` +
      `Aapke territory se customer inquiry assign hui hai:\n\n` +
      `👤 *Customer / Firm:* ${lead.customerName}\n` +
      `📞 *Mobile:* ${lead.phone}\n` +
      (lead.city ? `📍 *Location:* ${lead.city} ${lead.pincode ? `(PIN: ${lead.pincode})` : ""}\n` : "") +
      `📦 *Requirement:* ${lead.productCategory || "Wholesale Dealership"}\n` +
      `🆔 *Lead ID:* ${lead.leadNumber}\n\n` +
      `⚡ *Kripya customer se turant WhatsApp ya call par sampark karke quotation dein!*`;

    const formattedRepPhone = cleanRepPhone.startsWith("91") ? `+${cleanRepPhone}` : `+91${cleanRepPhone}`;
    await evolutionClient.sendTextMessage({
      number: formattedRepPhone,
      text: alertText,
    });

    lead.repNotificationStatus = "DELIVERED";
    lead.repNotifiedAt = new Date();
    lead.repPhone = formattedRepPhone;
    await lead.save();

    res.status(200).json({
      success: true,
      message: `WhatsApp alert re-sent successfully to ${execName} (${formattedRepPhone})`,
      lead,
    });
  } catch (err: any) {
    console.error("[DistributionController] resendRepAlert error:", err);
    res.status(500).json({ error: err.message || "Failed to resend alert to executive" });
  }
}

/**
 * Send Re-engagement Greeting asking for PIN & Name to Incomplete Visitor
 */
export async function reengageCustomer(req: Request, res: Response): Promise<void> {
  try {
    const { phone, name, customMessage } = req.body;
    if (!phone) {
      res.status(400).json({ error: "Customer phone is required" });
      return;
    }

    if (isCorporateBotNumber(phone)) {
      res.status(400).json({ error: "Cannot re-engage corporate automated bot numbers" });
      return;
    }

    const cleanDigits = phone.replace(/\D/g, "");
    const formattedPhone = cleanDigits.startsWith("91") ? `+${cleanDigits}` : `+91${cleanDigits}`;
    const p10 = cleanDigits.slice(-10);

    const displayName = name && name !== "WhatsApp Customer" && name !== "Incomplete Visitor" ? name : "";

    const defaultGreeting =
      `Namaste ${displayName ? `${displayName} ji! ` : ""}🙏 Welcome to *RN Valves & Faucets*.\n\n` +
      `Hum dekh rahe hain ki aapki WhatsApp enquiry adhuri rah gayi thi.\n\n` +
      `Aapko aapke Area ke Regional Sales Manager se connect karne aur special wholesale prices/catalogues paane ke liye, kripya apna:\n\n` +
      `1️⃣ *Shubh Naam ya Firm ka Naam*\n` +
      `2️⃣ *6-Digit Area PIN Code* (e.g. 110006 ya 141001)\n\n` +
      `likh kar reply karein. Hamare Sales Executive turant aapko assist karenge! 🚿✨`;

    const textToSend = customMessage && customMessage.trim() ? customMessage.trim() : defaultGreeting;

    // 1. Send WhatsApp via Evolution API
    const sendResult = await evolutionClient.sendTextMessage({
      number: formattedPhone,
      text: textToSend,
    });

    // 2. Save outgoing message in MongoDB
    try {
      const Message = getMessageModel();
      await Message.create({
        phone: formattedPhone,
        sender: "bot",
        content: textToSend,
        mediaType: "text",
        mediaUrl: "",
      });
    } catch {}

    // 3. Set ConversationState to RE_ENGAGE_AWAITING_PIN_NAME
    try {
      const ConversationState = getConversationStateModel();
      await ConversationState.findOneAndUpdate(
        { phone: { $in: [phone, formattedPhone, p10] } },
        {
          $set: {
            state: "RE_ENGAGE_AWAITING_PIN_NAME",
            lastMessageTimestamp: Date.now(),
            formData: { name: displayName },
          },
        },
        { upsert: true, new: true }
      );
    } catch {}

    // 4. Update ConversationControl
    try {
      const ConversationControl = getConversationControlModel();
      await ConversationControl.findOneAndUpdate(
        { phone: { $in: [phone, formattedPhone, p10] } },
        {
          $set: {
            mode: "ai",
            lastAgentMessageAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch {}

    res.status(200).json({
      success: true,
      message: `Re-engagement greeting sent to ${formattedPhone}`,
      phone: formattedPhone,
      sendResult,
    });
  } catch (err: any) {
    console.error("[DistributionController] reengageCustomer error:", err);
    res.status(500).json({ error: err.message || "Failed to send re-engagement message" });
  }
}

/**
 * Send Bulk Re-engagement Greetings to All Dropped-off Inquiries
 */
export async function reengageBulkCustomers(req: Request, res: Response): Promise<void> {
  try {
    const { phones, customMessage } = req.body;
    if (!Array.isArray(phones) || phones.length === 0) {
      res.status(400).json({ error: "Phones array is required" });
      return;
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    const defaultGreeting =
      `Namaste! 🙏 Welcome to *RN Valves & Faucets*.\n\n` +
      `Hum dekh rahe hain ki aapki WhatsApp enquiry adhuri rah gayi thi.\n\n` +
      `Aapko aapke Area ke Regional Sales Manager se connect karne aur special wholesale prices/catalogues paane ke liye, kripya apna:\n\n` +
      `1️⃣ *Shubh Naam ya Firm ka Naam*\n` +
      `2️⃣ *6-Digit Area PIN Code* (e.g. 110006 ya 141001)\n\n` +
      `likh kar reply karein. Hamare Sales Executive turant aapko assist karenge! 🚿✨`;

    const textToSend = customMessage && customMessage.trim() ? customMessage.trim() : defaultGreeting;

    const Message = getMessageModel();
    const ConversationState = getConversationStateModel();

    for (const phone of phones) {
      if (isCorporateBotNumber(phone)) continue;
      try {
        const cleanDigits = phone.replace(/\D/g, "");
        const formattedPhone = cleanDigits.startsWith("91") ? `+${cleanDigits}` : `+91${cleanDigits}`;
        const p10 = cleanDigits.slice(-10);

        await evolutionClient.sendTextMessage({
          number: formattedPhone,
          text: textToSend,
        });

        try {
          await Message.create({
            phone: formattedPhone,
            sender: "bot",
            content: textToSend,
            mediaType: "text",
            mediaUrl: "",
          });
        } catch {}

        try {
          await ConversationState.findOneAndUpdate(
            { phone: { $in: [phone, formattedPhone, p10] } },
            {
              $set: {
                state: "RE_ENGAGE_AWAITING_PIN_NAME",
                lastMessageTimestamp: Date.now(),
              },
            },
            { upsert: true }
          );
        } catch {}

        sentCount++;
      } catch (err: any) {
        failedCount++;
        errors.push(`${phone}: ${err.message}`);
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk re-engagement processed: ${sentCount} sent, ${failedCount} failed`,
      sentCount,
      failedCount,
      errors: errors.slice(0, 5),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to process bulk re-engagement" });
  }
}
