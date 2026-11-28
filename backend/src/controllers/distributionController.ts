import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "../config/env.js";
import { getLeadModel } from "../models/Lead.js";
import { getContactModel } from "../models/Contact.js";
import { getConversationControlModel } from "../models/ConversationControl.js";
import { getConversationStateModel } from "../models/ConversationState.js";
import {
  getSalesExecutiveModel,
  INITIAL_SALES_EXECUTIVES,
  ECOMMERCE_EXECUTIVES,
  seedSalesExecutivesIfEmpty,
} from "../models/SalesExecutive.js";
import { getMessageModel } from "../models/Message.js";
import { evolutionClient } from "../services/evolution/evolutionClient.js";
import { getCrmConnection } from "../database/connections.js";
import { isCorporateBotNumber } from "../services/botFilter.js";
import { SalesRepDirectory } from "../services/conversation/salesRepDirectory.js";
import { invalidateDashboardCache } from "./dashboardController.js";

const STAFF_PHONE_PATTERNS = [
  "9315160881", // Amit Kumar Sir
  "9315596055", // Arpita
  "9315593842", // Gaurav
  "9643308980", // Vinod
  "9315600189", // Danish
  "9870288812", // Pradeep
  "8076555914", // Khusi
  "9315603920", // Kanika E-Commerce
  "9625314298", // Tammana E-Commerce
  "8882710190", // HR Department
  "9891201208", // Complaint & Service Desk
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
  if (norm.includes("kanika")) return "Kanika E-commerce";
  if (norm.includes("tammana") || norm.includes("tamanna")) return "Tammana E-commerce";
  return name.trim();
}

function isEcommerceLeadDoc(l: any): boolean {
  if (!l) return false;
  if (l.department === "ECOMMERCE") return true;
  if (l.businessType === "Personal Use" || l.businessType === "Website Order") return true;
  if (l.leadSource === "WhatsApp_Ecommerce") return true;
  if (/kanika|tammana|tamanna|e-commerce|ecommerce/i.test(l.assignedEmployeeName || "")) return true;
  return false;
}

function isEcommerceExecDoc(exec: any): boolean {
  if (!exec) return false;
  if (exec.department === "ECOMMERCE") return true;
  return /kanika|tammana|tamanna|e-commerce|ecommerce/i.test(exec.name || "");
}

let ecommerceBackfilledOnce = false;

async function syncHistoricalEcommerceLeadsOnce(): Promise<void> {
  if (ecommerceBackfilledOnce) return;
  ecommerceBackfilledOnce = true;

  try {
    await seedSalesExecutivesIfEmpty();
    const Lead = getLeadModel();
    const Contact = getContactModel();
    const ConversationState = getConversationStateModel();
    const Message = getMessageModel();

    const [ecommStates, ecommMessages, existingLeads, contacts] = await Promise.all([
      ConversationState.find({
        $or: [
          { state: { $in: ["PERSONAL_USE_END", "WEBSITE_ORDER_ENQUIRY"] } },
          { customerType: { $in: ["Personal Use", "Website Order"] } },
        ],
      })
        .lean()
        .catch(() => []),
      Message.find({
        content: {
          $regex:
            /looking for products for personal use|व्यक्तिगत \/ घर के उपयोग|Personal Use & Online Shopping|Website & Online Order Support|वेबसाइट और ऑनलाइन ऑर्डर सहायता|E-Commerce Executive|ई-कॉमर्स विभाग|Kanika E-commerce/i,
        },
      })
        .select("phone content createdAt")
        .sort({ createdAt: -1 })
        .lean()
        .catch(() => []),
      Lead.find({}).select("phone department businessType").lean().catch(() => []),
      Contact.find({}).select("phone name city state").lean().catch(() => []),
    ]);

    const existingLeadPhones = new Set<string>();
    for (const l of existingLeads) {
      const p10 = normalizePhone(l.phone);
      if (p10) existingLeadPhones.add(p10);
    }

    const contactByPhone = new Map<string, any>();
    for (const c of contacts) {
      const p10 = normalizePhone(c.phone);
      if (p10) contactByPhone.set(p10, c);
    }

    const candidateMap = new Map<
      string,
      { p10: string; inquiryType: "Personal Use" | "Website Order"; at: Date }
    >();

    for (const m of ecommMessages) {
      const p10 = normalizePhone(m.phone);
      if (!p10 || p10.length !== 10) continue;
      if (STAFF_PHONE_PATTERNS.includes(p10) || isCorporateBotNumber(p10)) continue;
      const isWebOrder = /Website & Online Order|वेबसाइट और ऑनलाइन ऑर्डर|Order ID/i.test(m.content || "");
      const existing = candidateMap.get(p10);
      const msgDate = m.createdAt ? new Date(m.createdAt) : new Date();
      if (!existing) {
        candidateMap.set(p10, {
          p10,
          inquiryType: isWebOrder ? "Website Order" : "Personal Use",
          at: msgDate,
        });
      } else if (isWebOrder) {
        existing.inquiryType = "Website Order";
      }
    }

    for (const s of ecommStates) {
      const p10 = normalizePhone(s.phone);
      if (!p10 || p10.length !== 10) continue;
      if (STAFF_PHONE_PATTERNS.includes(p10) || isCorporateBotNumber(p10)) continue;
      const isWebOrder = s.state === "WEBSITE_ORDER_ENQUIRY" || s.customerType === "Website Order";
      const sDate = (s as any).updatedAt ? new Date((s as any).updatedAt) : new Date();
      if (!candidateMap.has(p10)) {
        candidateMap.set(p10, {
          p10,
          inquiryType: isWebOrder ? "Website Order" : "Personal Use",
          at: sDate,
        });
      } else if (isWebOrder) {
        candidateMap.get(p10)!.inquiryType = "Website Order";
      }
    }

    const ecommReps = [
      { name: "Kanika E-commerce", mobile: "+91 93156 03920" },
      { name: "Tammana E-commerce", mobile: "+91 96253 14298" },
    ];
    let rrIdx = 0;

    for (const [p10, item] of candidateMap.entries()) {
      if (existingLeadPhones.has(p10)) continue;

      const rep = ecommReps[rrIdx % ecommReps.length];
      rrIdx += 1;
      const contact = contactByPhone.get(p10);
      const resolvedName =
        contact?.name && contact.name !== "WhatsApp User"
          ? contact.name
          : `Online Shopper (${p10.slice(-4)})`;
      const leadNumber = `RNE-${Math.floor(10000 + Math.random() * 90000)}`;

      await Lead.create({
        leadNumber,
        customerName: resolvedName,
        phone: `+91${p10}`,
        businessType: item.inquiryType,
        department: "ECOMMERCE",
        city: contact?.city || "Online Store",
        state: contact?.state || "Pan-India E-Commerce",
        productCategory:
          item.inquiryType === "Website Order"
            ? "Website Order Support"
            : "Online Shopping (Personal Use)",
        productInterest: [item.inquiryType],
        requirementDescription: `${item.inquiryType} Enquiry — Shared E-Commerce Department contact numbers & https://rnvalves.com`,
        leadSource: "WhatsApp_Ecommerce",
        assignedEmployeeName: rep.name,
        repPhone: rep.mobile,
        repNotificationStatus: "DELIVERED",
        repNotifiedAt: item.at,
        customerReplyStatus: "REPLIED",
        lastReplyAt: item.at,
        intentTag:
          item.inquiryType === "Website Order"
            ? "Website Order Enquiry"
            : "Personal Use (Shared E-Comm Numbers)",
        routingReason: `WhatsApp ${item.inquiryType} → Shared E-Commerce Dept Contacts (${rep.name})`,
        status: "NEW",
        priority: item.inquiryType === "Website Order" ? "HIGH" : "MEDIUM",
        followupDate: new Date(item.at.getTime() + 24 * 60 * 60 * 1000),
        internalNotes: [
          `Shared E-Commerce Department contact numbers via WhatsApp Bot (${item.inquiryType}). Assigned to ${rep.name}.`,
        ],
        createdAt: item.at,
        updatedAt: item.at,
      }).catch(() => {});
    }
  } catch (err: any) {
    console.warn("[DistributionController] E-Commerce historical sync notice:", err.message);
  }
}

let distributionCache: { expiresAt: number; payload: any } | null = null;

export function invalidateDistributionCache(): void {
  distributionCache = null;
  invalidateDashboardCache();
}

export async function getDistributionAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const countsOnly = req.query.countsOnly === "1";
    const forceRefresh = req.query.refresh === "1";

    if (!forceRefresh && distributionCache && distributionCache.expiresAt > Date.now()) {
      const cached = distributionCache.payload;
      if (countsOnly) {
        res.status(200).json({
          success: true,
          counts: {
            executives: cached.executives.length,
            leads: cached.summary.totalLeads,
            ecommerce: cached.summary.totalEcommerceLeads || 0,
            queries: cached.summary.totalResolvedQueries || 0,
            dropped: cached.summary.totalDroppedAtHi,
            human: cached.summary.totalHumanTakeovers,
          },
        });
        return;
      }
      res.status(200).json(cached);
      return;
    }

    const conn = getCrmConnection();
    if (conn.readyState !== 1) {
      try {
        await conn.asPromise();
      } catch {}
    }

    await syncHistoricalEcommerceLeadsOnce();

    const Lead = getLeadModel();
    const Contact = getContactModel();
    const ConversationControl = getConversationControlModel();
    const ConversationState = getConversationStateModel();
    const SalesExecutive = getSalesExecutiveModel();
    const Message = getMessageModel();

    // Run all 6 collection fetches concurrently (~75ms)
    const [execRaw, leadsRaw, contactsRaw, humanRaw, sessionsRaw, autoQueryMsgsRaw] = await Promise.all([
      SalesExecutive.find({ isActive: true }).sort({ orderIndex: 1 }).lean().catch(() => []),
      Lead.find({}).sort({ createdAt: -1 }).lean().catch(() => []),
      Contact.find({}).sort({ lastContactedAt: -1 }).lean().catch(() => []),
      ConversationControl.find({ mode: "human" }).sort({ updatedAt: -1 }).lean().catch(() => []),
      ConversationState.find({}).lean().catch(() => []),
      Message.find({
        content: {
          $regex:
            /Official Customer Care|आधिकारिक कस्टमर केयर|Here are the verified details|verified details|Catalogue PDF|कैटलॉग पीडीएफ/i,
        },
      })
        .select("phone content createdAt")
        .sort({ createdAt: -1 })
        .lean()
        .catch(() => []),
    ]);

    const allActiveExecs: any[] =
      execRaw && execRaw.length > 0 ? execRaw : [...INITIAL_SALES_EXECUTIVES, ...ECOMMERCE_EXECUTIVES];
    const executives: any[] = allActiveExecs.filter((e) => !isEcommerceExecDoc(e));
    const ecommExecsList: any[] =
      allActiveExecs.filter((e) => isEcommerceExecDoc(e)).length > 0
        ? allActiveExecs.filter((e) => isEcommerceExecDoc(e))
        : ECOMMERCE_EXECUTIVES;

    const allCleanLeads: any[] = leadsRaw.filter((l: any) => !isCorporateBotNumber(l.phone));
    const leads: any[] = allCleanLeads.filter((l: any) => !isEcommerceLeadDoc(l));
    const ecommerceLeadsRaw: any[] = allCleanLeads.filter((l: any) => isEcommerceLeadDoc(l));

    const contacts: any[] = contactsRaw.filter((c: any) => !isCorporateBotNumber(c.phone));
    const humanControls: any[] = humanRaw.filter((hc: any) => !isCorporateBotNumber(hc.phone));
    const sessions: any[] = sessionsRaw.filter((s: any) => !isCorporateBotNumber(s.phone));
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

    // Lead phone set (both B2B AND E-Commerce leads — neither should ever appear in Dropped at "Hi")
    const leadPhoneSet = new Set<string>();
    for (const l of allCleanLeads) {
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
        lostCount: number;
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
        lostCount: 0,
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
        } else if (l.status === "LOST") {
          repBuckets[canonicalName].lostCount += 1;
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
      lostCount: b.lostCount,
      conversionRate: b.totalCount > 0 ? Math.round((b.convertedCount / b.totalCount) * 100) : 0,
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
        estimatedValue: l.estimatedValue || 0,
        productCategory: l.productCategory,
        pincode: l.pincode || "",
        repNotificationStatus: l.repNotificationStatus || "DELIVERED",
        repNotifiedAt: l.repNotifiedAt || l.createdAt,
        repPhone: l.repPhone || b.executive.mobile || "",
        customerReplyStatus: l.customerReplyStatus || "REPLIED",
        lastReplyAt: l.lastReplyAt || l.createdAt,
        intentTag: l.intentTag || l.productCategory || "Wholesale Dealership",
        routingReason: l.routingReason || `PIN ${l.pincode || "Pan-India"} → Routed to ${b.executive.name}`,
        followupDate: l.followupDate,
        internalNotes: l.internalNotes || [],
        history: l.history || [],
        lossReason: l.lossReason || "",
        assignedEmployeeName: b.executive.name,
        assignedEmployeePhone: b.executive.mobile,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
    }));

    // 7. Human Mode / Takeover Conversations
    // Exclude conversations that have already been assigned to a sales executive or are in leads
    const assignedPhoneSet = new Set<string>();
    for (const l of leads) {
      if (l.assignedEmployeeName && l.assignedEmployeeName !== "Unassigned") {
        const p10 = normalizePhone(l.phone);
        if (p10) assignedPhoneSet.add(p10);
      }
    }

    const humanTakeovers = humanControls
      .filter((hc) => {
        const p10 = normalizePhone(hc.phone);
        // If already assigned to an executive as a lead, remove from human takeover queue!
        if (p10 && assignedPhoneSet.has(p10)) return false;
        // If manually marked as Query Resolved / Normal Query Chat, exclude from active takeover queue
        const cDoc = p10 ? contactMap.get(p10) : null;
        if (
          cDoc &&
          Array.isArray(cDoc.tags) &&
          (cDoc.tags.includes("QUERY_RESOLVED") || cDoc.tags.includes("NORMAL_QUERY"))
        ) {
          return false;
        }
        // If assignedAgentName is already an executive, remove from pending takeover queue!
        if (
          hc.assignedAgentName &&
          hc.assignedAgentName !== "Unassigned Agent" &&
          hc.assignedAgentName !== "Unassigned"
        ) {
          return false;
        }
        return true;
      })
      .map((hc) => {
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

    // Map auto-answered normal queries (Customer Care / HR / Catalogue / SKU details)
    const autoQueryMap = new Map<string, { category: string; summary: string; at: Date }>();
    for (const m of autoQueryMsgsRaw) {
      const p10 = normalizePhone(m.phone);
      if (!p10 || autoQueryMap.has(p10)) continue;
      const isSupport = /Official Customer Care|आधिकारिक कस्टमर केयर/i.test(m.content || "");
      autoQueryMap.set(p10, {
        category: isSupport ? "CUSTOMER_CARE" : "CATALOGUE_PRICE",
        summary: isSupport
          ? "Shared Customer Care / Service / HR Helpline Card"
          : "Viewed Product Catalogue PDF / Verified Item Price",
        at: m.createdAt ? new Date(m.createdAt) : new Date(),
      });
    }

    // 8. Abandoned / Dropped Off Inquiries at "Hi" vs Customer Queries Resolved / Normal Chats
    const droppedAtHi: any[] = [];
    const resolvedQueries: any[] = [];

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
      // Exclude visitors who received E-Commerce / Personal Use / Website Order contacts — they belong in E-Commerce Panel, not Dropped at "Hi"!
      if (
        activeSession &&
        (activeSession.state === "PERSONAL_USE_END" ||
          activeSession.state === "WEBSITE_ORDER_ENQUIRY" ||
          activeSession.customerType === "Personal Use" ||
          activeSession.customerType === "Website Order")
      ) {
        continue;
      }

      const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
      const isManuallyReopened = tags.includes("REOPENED_DROPPED");
      const isManuallyResolved = tags.includes("QUERY_RESOLVED");
      const isManuallyNormal = tags.includes("NORMAL_QUERY");
      const autoQuery = autoQueryMap.get(p10);
      const isSelfServedFlow =
        activeSession &&
        (activeSession.state === "SALES_REP_SHOWN" || activeSession.state === "POST_CATALOGUE");

      if (
        isManuallyResolved ||
        isManuallyNormal ||
        (!isManuallyReopened && (autoQuery || isSelfServedFlow))
      ) {
        let queryCategory = "NORMAL_QUERY";
        let queryLabel = "Normal Query Chat";
        let resolutionNote = c.notes || "General inquiry / normal WhatsApp chat";

        if (isManuallyResolved) {
          queryCategory = "QUERY_RESOLVED";
          queryLabel = "Customer Query Resolved";
          resolutionNote = c.notes || "Marked as resolved by CRM team";
        } else if (isManuallyNormal) {
          queryCategory = "NORMAL_QUERY";
          queryLabel = "Normal Query Chat";
          resolutionNote = c.notes || "Marked as normal query chat";
        } else if (autoQuery) {
          queryCategory = autoQuery.category;
          queryLabel =
            autoQuery.category === "CUSTOMER_CARE"
              ? "Support / HR Info Shared"
              : "Catalogue / Price Checked";
          resolutionNote = c.notes || autoQuery.summary;
        } else if (activeSession?.state === "SALES_REP_SHOWN") {
          queryCategory = "REP_INFO_VIEWED";
          queryLabel = "Regional Rep Number Shared";
          resolutionNote = c.notes || "Checked Regional Sales Manager contact via PIN code";
        } else if (activeSession?.state === "POST_CATALOGUE") {
          queryCategory = "CATALOGUE_PRICE";
          queryLabel = "Catalogue / Price Checked";
          resolutionNote = c.notes || "Downloaded Product Catalogue PDF via WhatsApp Bot";
        }

        resolvedQueries.push({
          _id: c._id,
          phone: c.phone,
          name: c.name && c.name !== "WhatsApp User" ? c.name : "WhatsApp Visitor",
          businessName: c.businessName || "",
          city: c.city || "",
          queryCategory,
          queryLabel,
          resolutionNote,
          isManual: isManuallyResolved || isManuallyNormal,
          totalEnquiriesCount: c.totalEnquiriesCount || 1,
          lastContactedAt: c.lastContactedAt || c.updatedAt || c.createdAt,
          preferredLanguage: activeSession?.language || "hi",
        });
        continue;
      }

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

    // Sort dropped & resolved queries by latest
    droppedAtHi.sort(
      (a, b) => new Date(b.lastContactedAt).getTime() - new Date(a.lastContactedAt).getTime()
    );
    resolvedQueries.sort(
      (a, b) => new Date(b.lastContactedAt).getTime() - new Date(a.lastContactedAt).getTime()
    );

    // 8b. E-Commerce Department Distribution (Kanika & Tammana)
    const ecommBuckets: Record<
      string,
      {
        executive: any;
        leads: any[];
        totalCount: number;
        newCount: number;
        contactedCount: number;
        inProgressCount: number;
        convertedCount: number;
        lostCount: number;
        totalEstimatedValue: number;
      }
    > = {};

    for (const exec of ecommExecsList) {
      const canonicalName = normalizeRepName(exec.name);
      ecommBuckets[canonicalName] = {
        executive: exec,
        leads: [],
        totalCount: 0,
        newCount: 0,
        contactedCount: 0,
        inProgressCount: 0,
        convertedCount: 0,
        lostCount: 0,
        totalEstimatedValue: 0,
      };
    }

    const fallbackEcommKey = Object.keys(ecommBuckets)[0] || "Kanika E-commerce";
    for (const l of ecommerceLeadsRaw) {
      const canonicalName = normalizeRepName(l.assignedEmployeeName || "");
      const targetKey = ecommBuckets[canonicalName] ? canonicalName : fallbackEcommKey;
      const bucket = ecommBuckets[targetKey];
      if (bucket) {
        bucket.leads.push(l);
        bucket.totalCount += 1;
        if (l.status === "CONVERTED") bucket.convertedCount += 1;
        else if (l.status === "LOST") bucket.lostCount += 1;
        else if (l.status === "NEW") bucket.newCount += 1;
        else if (l.status === "CONTACTED") bucket.contactedCount += 1;
        else bucket.inProgressCount += 1;
        bucket.totalEstimatedValue += Number(l.estimatedValue) || 0;
      }
    }

    const ecommerceExecutives = Object.values(ecommBuckets).map((b) => ({
      _id: b.executive._id,
      name: b.executive.name,
      mobile: b.executive.mobile,
      area: b.executive.area || "Online Shopping & Website Orders",
      state: b.executive.state || "Pan-India E-Commerce",
      department: "ECOMMERCE",
      leadsCount: b.totalCount,
      newCount: b.newCount,
      contactedCount: b.contactedCount,
      inProgressCount: b.inProgressCount,
      convertedCount: b.convertedCount,
      lostCount: b.lostCount,
      conversionRate: b.totalCount > 0 ? Math.round((b.convertedCount / b.totalCount) * 100) : 0,
      totalEstimatedValue: b.totalEstimatedValue,
    }));

    const ecommerceLeads = ecommerceLeadsRaw.map((l) => {
      const canonicalName = normalizeRepName(l.assignedEmployeeName || fallbackEcommKey);
      const bucket = ecommBuckets[canonicalName];
      return {
        _id: l._id,
        leadNumber: l.leadNumber,
        customerName: l.customerName,
        phone: l.phone,
        city: l.city || "Online Store",
        state: l.state || "Pan-India E-Commerce",
        businessName: l.businessName || "",
        businessType: l.businessType || "Personal Use",
        department: "ECOMMERCE",
        status: l.status || "NEW",
        priority: l.priority || "MEDIUM",
        estimatedValue: l.estimatedValue || 0,
        productCategory: l.productCategory || "Online Shopping (Personal Use)",
        requirementDescription: l.requirementDescription || "",
        pincode: l.pincode || "",
        repNotificationStatus: l.repNotificationStatus || "DELIVERED",
        repNotifiedAt: l.repNotifiedAt || l.createdAt,
        repPhone: l.repPhone || bucket?.executive?.mobile || "+91 93156 03920",
        customerReplyStatus: l.customerReplyStatus || "REPLIED",
        lastReplyAt: l.lastReplyAt || l.createdAt,
        intentTag: l.intentTag || l.businessType || "Personal Use",
        routingReason:
          l.routingReason || "Shared E-Commerce Dept Contacts (Kanika & Tammana) via WhatsApp",
        followupDate: l.followupDate,
        internalNotes: l.internalNotes || [],
        history: l.history || [],
        lossReason: l.lossReason || "",
        assignedEmployeeName: canonicalName,
        assignedEmployeePhone: bucket?.executive?.mobile || l.repPhone || "+91 93156 03920",
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      };
    });

    const ecommerceSummary = {
      totalLeads: ecommerceLeads.length,
      newCount: ecommerceLeads.filter((l) => l.status === "NEW").length,
      contactedCount: ecommerceLeads.filter((l) => l.status === "CONTACTED").length,
      inProgressCount: ecommerceLeads.filter((l) =>
        ["INTERESTED", "QUOTATION_SENT", "NEGOTIATION"].includes(l.status)
      ).length,
      convertedCount: ecommerceLeads.filter((l) => l.status === "CONVERTED").length,
      lostCount: ecommerceLeads.filter((l) => l.status === "LOST").length,
      personalUseCount: ecommerceLeads.filter((l) => l.businessType !== "Website Order").length,
      websiteOrderCount: ecommerceLeads.filter((l) => l.businessType === "Website Order").length,
      totalValue: ecommerceLeads.reduce((acc, l) => acc + (Number(l.estimatedValue) || 0), 0),
    };

    // 9. Overall Summary
    const totalInquiries = contacts.length;
    const totalAssignedLeads = repDistribution.reduce((acc, r) => acc + r.leadsCount, 0);
    const totalUnassignedLeads = unassignedLeads.length;

    const totalConvertedLeads = leads.filter((l) => l.status === "CONVERTED").length;
    const totalLostLeads = leads.filter((l) => l.status === "LOST").length;
    const totalInProgressLeads = leads.filter(
      (l) => l.status !== "CONVERTED" && l.status !== "LOST"
    ).length;
    const totalPipelineValue = leads.reduce((acc, l) => acc + (Number(l.estimatedValue) || 0), 0);

    const totalRepDelivered = leads.filter(
      (l) => l.repNotificationStatus !== "FAILED" && l.assignedEmployeeName && l.assignedEmployeeName !== "Unassigned"
    ).length;

    const payload = {
      success: true,
      summary: {
        totalInquiries,
        totalLeads: totalLeadsCount,
        totalEcommerceLeads: ecommerceLeads.length,
        totalAssignedLeads,
        totalUnassignedLeads,
        totalConvertedLeads,
        totalLostLeads,
        totalInProgressLeads,
        totalPipelineValue,
        totalHumanTakeovers: humanTakeovers.length,
        totalDroppedAtHi: droppedAtHi.length,
        totalResolvedQueries: resolvedQueries.length,
        totalRepDelivered,
        totalCustomerReplied: totalLeadsCount,
        leadCompletionRate:
          totalInquiries > 0 ? Math.round(((totalLeadsCount + ecommerceLeads.length) / totalInquiries) * 100) : 0,
        conversionRate:
          totalLeadsCount > 0 ? Math.round((totalConvertedLeads / totalLeadsCount) * 100) : 0,
      },
      executives: repDistribution,
      ecommerceExecutives,
      ecommerceLeads,
      ecommerceSummary,
      unassignedLeads: unassignedLeads.map((l) => ({
        _id: l._id,
        leadNumber: l._id ? l.leadNumber : "",
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
      resolvedQueries,
    };

    distributionCache = { expiresAt: Date.now() + 5000, payload };

    if (countsOnly) {
      res.status(200).json({
        success: true,
        counts: {
          executives: repDistribution.length,
          leads: totalLeadsCount,
          ecommerce: ecommerceLeads.length,
          queries: resolvedQueries.length,
          dropped: droppedAtHi.length,
          human: humanTakeovers.length,
        },
      });
      return;
    }

    res.status(200).json(payload);
  } catch (err: any) {
    console.error("[DistributionController] Error:", err);
    res.status(500).json({ error: err.message || "Failed to calculate distribution analytics" });
  }
}

export async function assignLead(req: Request, res: Response): Promise<void> {
  try {
    invalidateDistributionCache();
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
    invalidateDistributionCache();
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
    invalidateDistributionCache();
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
    invalidateDistributionCache();
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

/**
 * Update Lead Follow-up Progress, Status, Remarks, Next Date & Value
 * Allows sales reps / admin to mark leads as CONVERTED (Won), LOST, or in follow-up.
 */
export async function updateLeadFollowup(req: Request, res: Response): Promise<void> {
  try {
    const { leadId, phone, status, comment, followupDate, estimatedValue, lossReason } = req.body;
    const Lead = getLeadModel();

    let targetLead: any = null;
    if (leadId) {
      targetLead = await Lead.findById(leadId);
    }
    if (!targetLead && phone) {
      const cleanDigits = phone.replace(/\D/g, "");
      targetLead = await Lead.findOne({
        phone: { $in: [phone, cleanDigits, `+${cleanDigits}`, `+91${cleanDigits.slice(-10)}`] },
      }).sort({ updatedAt: -1 });
    }

    if (!targetLead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    // Security check: SALES role can ONLY update their own assigned leads (or team ECOMMERCE leads for E-Commerce reps)
    if (req.user && req.user.role === "SALES") {
      const userRep = normalizeRepName(req.user.repName || req.user.name || "");
      const leadRep = normalizeRepName(targetLead.assignedEmployeeName || "");
      const userMobile = normalizePhone(req.user.repMobile || req.user.phone || "");
      const leadMobile = normalizePhone(targetLead.assignedEmployeeId || targetLead.repPhone || "");

      const isUserEcommerce =
        (req.user as any).department === "ECOMMERCE" ||
        /kanika|tammana|tamanna|e-commerce|ecommerce/i.test(userRep);
      const isTargetEcommerce = isEcommerceLeadDoc(targetLead);

      const isOwner =
        (isUserEcommerce && isTargetEcommerce) ||
        (userRep && leadRep && (
          userRep.toLowerCase() === leadRep.toLowerCase() ||
          leadRep.toLowerCase().includes(userRep.toLowerCase()) ||
          userRep.toLowerCase().includes(leadRep.toLowerCase())
        )) ||
        (userMobile && leadMobile && userMobile === leadMobile);

      if (!isOwner) {
        res.status(403).json({
          success: false,
          error: "Forbidden: You are not authorized to update another sales executive's lead.",
        });
        return;
      }

      // If E-Commerce colleague handles the lead, tag them as active handler
      if (isUserEcommerce && isTargetEcommerce && userRep) {
        targetLead.assignedEmployeeName = userRep;
        if (userMobile) targetLead.repPhone = `+91 ${userMobile.slice(0, 5)} ${userMobile.slice(5)}`;
      }
    }

    const fromStatus = targetLead.status;
    if (status) {
      targetLead.status = status;
    }
    if (estimatedValue !== undefined && estimatedValue !== null && estimatedValue !== "") {
      targetLead.estimatedValue = Number(estimatedValue) || 0;
    }
    if (followupDate) {
      targetLead.followupDate = new Date(followupDate);
    }
    if (lossReason) {
      targetLead.lossReason = lossReason;
    }
    if (comment && comment.trim()) {
      targetLead.internalNotes.push(`[${new Date().toLocaleDateString("en-IN")}] ${comment.trim()}`);
    }

    targetLead.history.push({
      fromStatus,
      toStatus: status || fromStatus,
      updatedBy: (req as any).user?.name || targetLead.assignedEmployeeName || "Sales Executive",
      timestamp: new Date(),
      comment: comment ? comment.trim() : `Follow-up updated to ${status || fromStatus}`,
    });

    await targetLead.save();
    invalidateDistributionCache();

    res.status(200).json({
      success: true,
      message: `Lead ${targetLead.leadNumber} follow-up updated to ${targetLead.status}`,
      lead: targetLead,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update lead follow-up" });
  }
}

/**
 * Sales Executive Authentication using 4-digit PIN
 * POST /api/distribution/rep-login
 */
export async function repLogin(req: Request, res: Response): Promise<void> {
  try {
    const { repName, mobile, pin } = req.body;

    if (!pin || String(pin).trim() === "") {
      res.status(400).json({ error: "Kripya 4-digit security PIN enter karein." });
      return;
    }

    await seedSalesExecutivesIfEmpty();
    const SalesExecutive = getSalesExecutiveModel();
    let executives: any[] = [];
    try {
      executives = await SalesExecutive.find({ isActive: true }).lean();
    } catch {}
    if (!executives || executives.length === 0) {
      executives = [...INITIAL_SALES_EXECUTIVES, ...ECOMMERCE_EXECUTIVES];
    }

    let matchedExec: any = null;
    if (repName) {
      const canonicalTarget = normalizeRepName(repName);
      matchedExec = executives.find(
        (e) => normalizeRepName(e.name).toLowerCase() === canonicalTarget.toLowerCase()
      );
    }

    if (!matchedExec && mobile) {
      const cleanInput = normalizePhone(mobile);
      matchedExec = executives.find((e) => normalizePhone(e.mobile) === cleanInput);
    }

    if (!matchedExec) {
      res.status(404).json({ error: "Sales Executive profile nahi mila. Naam ya number check karein." });
      return;
    }

    const providedPin = String(pin).trim();
    let pinMatch = false;
    if (matchedExec.pinHash) {
      pinMatch = await bcrypt.compare(providedPin, matchedExec.pinHash);
    }
    if (!pinMatch && matchedExec.pin && String(matchedExec.pin).trim() === providedPin) {
      pinMatch = true;
      matchedExec.pinHash = await bcrypt.hash(providedPin, 10);
      await matchedExec.save?.().catch?.(() => {});
    }

    if (!pinMatch) {
      res.status(401).json({ error: "Galat 4-digit PIN! Kripya sahi PIN enter karein (Default: 1234)." });
      return;
    }

    // Generate authenticated rep token
    const isEcomm = isEcommerceExecDoc(matchedExec);
    const repPayload = {
      id: String(matchedExec._id || matchedExec.name),
      name: matchedExec.name,
      repName: matchedExec.name,
      repMobile: matchedExec.mobile,
      phone: matchedExec.mobile,
      role: "SALES" as const,
      department: isEcomm ? "ECOMMERCE" : "Sales",
      state: matchedExec.state,
    };

    const token = jwt.sign(repPayload, config.JWT_SECRET, { expiresIn: "30d" });

    // Set cookie with SameSite=Lax across .rnvalves.com
    const isProduction = config.NODE_ENV === "production";
    const cookieOptions: any = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax" as any,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    };
    if (isProduction) {
      cookieOptions.domain = ".rnvalves.com";
    }
    res.cookie("rn_crm_token", token, cookieOptions);

    res.status(200).json({
      success: true,
      message: `Welcome ${matchedExec.name}! Authentication successful.`,
      token,
      redirectTo: "/rep-portal",
      user: repPayload,
      rep: {
        id: matchedExec._id,
        name: matchedExec.name,
        mobile: matchedExec.mobile,
        area: matchedExec.area,
        state: matchedExec.state,
        department: isEcomm ? "ECOMMERCE" : "B2B_SALES",
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to authenticate sales executive" });
  }
}

/**
 * Isolated Leads Fetch for Authenticated Sales Executive
 * GET /api/distribution/my-leads
 */
export async function getMyLeads(req: Request, res: Response): Promise<void> {
  try {
    // Session identity derived strictly from authenticated user
    const currentUser = req.user;
    if (!currentUser) {
      res.status(401).json({ error: "Unauthorized: Missing authentication session" });
      return;
    }

    let repName = "";
    let repMobile = "";

    if (currentUser.role === "SALES") {
      // SALES users can ONLY ever see their own leads - ignore any query overrides
      repName = currentUser.repName || currentUser.name || "";
      repMobile = currentUser.repMobile || currentUser.phone || "";
    } else if (currentUser.role === "ADMIN") {
      // ADMIN users can view any rep's portal via query param, or default to all
      repName = (req.query.repName as string) || currentUser.repName || currentUser.name || "";
      repMobile = (req.query.mobile as string) || currentUser.repMobile || currentUser.phone || "";
    }

    if (!repName && !repMobile) {
      res.status(403).json({ error: "Invalid sales executive session" });
      return;
    }

    await syncHistoricalEcommerceLeadsOnce();

    const canonicalName = normalizeRepName(repName || "");
    const cleanPhone = normalizePhone(repMobile || "");
    const isEcommRep =
      (currentUser as any).department === "ECOMMERCE" ||
      /kanika|tammana|tamanna|e-commerce|ecommerce/i.test(canonicalName) ||
      cleanPhone === "9315603920" ||
      cleanPhone === "9625314298";

    const scopeParam = String(req.query.scope || "team").toLowerCase();

    const Lead = getLeadModel();
    const queryFilter = isEcommRep
      ? scopeParam === "mine"
        ? {
            $and: [
              {
                $or: [
                  { department: "ECOMMERCE" },
                  { businessType: { $in: ["Personal Use", "Website Order"] } },
                  { leadSource: "WhatsApp_Ecommerce" },
                ],
              },
              {
                $or: [
                  { assignedEmployeeName: new RegExp(canonicalName, "i") },
                  ...(cleanPhone ? [{ repPhone: new RegExp(cleanPhone) }] : []),
                ],
              },
            ],
          }
        : {
            $or: [
              { department: "ECOMMERCE" },
              { businessType: { $in: ["Personal Use", "Website Order"] } },
              { leadSource: "WhatsApp_Ecommerce" },
              { assignedEmployeeName: /kanika|tammana|tamanna|e-commerce/i },
            ],
          }
      : {
          $or: [
            { assignedEmployeeName: new RegExp(canonicalName, "i") },
            ...(cleanPhone ? [{ repPhone: new RegExp(cleanPhone) }] : []),
          ],
        };

    const leads = (
      await Lead.find(queryFilter).sort({ updatedAt: -1 }).lean()
    ).filter((l) => !isCorporateBotNumber(l.phone));

    // Calculate metrics
    const totalLeads = leads.length;
    const wonLeads = leads.filter((l) => l.status === "CONVERTED");
    const pendingLeads = leads.filter((l) => l.status === "NEW" || l.status === "CONTACTED");
    const inProgressLeads = leads.filter((l) =>
      ["INTERESTED", "QUOTATION_SENT", "NEGOTIATION"].includes(l.status)
    );
    const lostLeads = leads.filter((l) => l.status === "LOST");
    const totalValue = leads.reduce((acc, l) => acc + (Number(l.estimatedValue) || 0), 0);

    const todayStr = new Date().toISOString().split("T")[0];
    const dueTodayCount = leads.filter((l) => {
      if (!l.followupDate) return false;
      const d = new Date(l.followupDate).toISOString().split("T")[0];
      return d === todayStr && l.status !== "CONVERTED" && l.status !== "LOST";
    }).length;

    const overdueCount = leads.filter((l) => {
      if (!l.followupDate) return false;
      const d = new Date(l.followupDate).toISOString().split("T")[0];
      return d < todayStr && l.status !== "CONVERTED" && l.status !== "LOST";
    }).length;

    res.status(200).json({
      success: true,
      rep: {
        name: canonicalName,
        mobile: repMobile,
        department: isEcommRep ? "ECOMMERCE" : "B2B_SALES",
      },
      summary: {
        totalLeads,
        wonCount: wonLeads.length,
        pendingCount: pendingLeads.length,
        inProgressCount: inProgressLeads.length,
        lostCount: lostLeads.length,
        totalValue,
        dueTodayCount,
        overdueCount,
      },
      leads: leads.map((l) => ({
        _id: l._id,
        leadNumber: l.leadNumber,
        customerName: l.customerName,
        phone: l.phone,
        city: l.city,
        state: l.state,
        businessName: l.businessName,
        businessType: l.businessType || (isEcommRep ? "Personal Use" : "Dealer"),
        department: isEcommerceLeadDoc(l) ? "ECOMMERCE" : "B2B_SALES",
        requirementDescription: l.requirementDescription || "",
        status: l.status,
        priority: l.priority,
        estimatedValue: l.estimatedValue || 0,
        productCategory: l.productCategory,
        pincode: l.pincode || "",
        repNotificationStatus: l.repNotificationStatus || "DELIVERED",
        customerReplyStatus: l.customerReplyStatus || "REPLIED",
        intentTag: l.intentTag || l.productCategory || "Wholesale Dealership",
        routingReason: l.routingReason || "",
        followupDate: l.followupDate,
        internalNotes: l.internalNotes || [],
        history: l.history || [],
        lossReason: l.lossReason || "",
        assignedEmployeeName: l.assignedEmployeeName,
        assignedEmployeePhone: (l as any).assignedEmployeePhone || l.repPhone || "",
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch sales rep leads" });
  }
}

/**
 * Mark an inquiry / visitor chat as "Customer Query Resolved" or "Normal Query Chat" (or reopen)
 * POST /api/distribution/resolve-query
 */
export async function resolveCustomerQuery(req: Request, res: Response): Promise<void> {
  try {
    invalidateDistributionCache();
    const { phone, name, action = "resolve", queryType = "QUERY_RESOLVED", note = "" } = req.body;
    if (!phone) {
      res.status(400).json({ error: "Customer phone number is required" });
      return;
    }

    const p10 = normalizePhone(phone);
    if (!p10 || p10.length !== 10) {
      res.status(400).json({ error: "Valid 10-digit phone number is required" });
      return;
    }

    const formattedPhone = `+91${p10}`;
    const Contact = getContactModel();
    const ConversationControl = getConversationControlModel();

    if (action === "reopen") {
      await Contact.updateMany(
        { phone: { $in: [phone, formattedPhone, p10, `91${p10}`] } },
        {
          $pull: { tags: { $in: ["QUERY_RESOLVED", "NORMAL_QUERY"] } },
          $addToSet: { tags: "REOPENED_DROPPED" },
        }
      );
      res.status(200).json({
        success: true,
        message: `Moved ${formattedPhone} back to Dropped at "Hi" queue.`,
      });
      return;
    }

    const tagToAdd = queryType === "NORMAL_QUERY" ? "NORMAL_QUERY" : "QUERY_RESOLVED";
    const defaultNote =
      tagToAdd === "NORMAL_QUERY"
        ? "Normal Query Chat — General customer chat (not a B2B dealer drop-off)"
        : "Customer Query Resolved — Assisted & closed cleanly";

    let contactDoc = await Contact.findOne({
      phone: { $in: [phone, formattedPhone, p10, `91${p10}`] },
    });

    if (!contactDoc) {
      contactDoc = await Contact.create({
        phone: formattedPhone,
        name: name || `WhatsApp Visitor (${p10.slice(-4)})`,
        tags: [tagToAdd],
        notes: note.trim() || defaultNote,
        lastContactedAt: new Date(),
      });
    } else {
      const nextTags = (contactDoc.tags || []).filter(
        (t) => t !== "QUERY_RESOLVED" && t !== "NORMAL_QUERY" && t !== "REOPENED_DROPPED"
      );
      nextTags.push(tagToAdd);
      contactDoc.tags = nextTags;
      contactDoc.notes = note.trim() || defaultNote;
      await contactDoc.save();
    }

    // Also release from pending Human Takeover queue if it was paused there
    await ConversationControl.updateMany(
      { phone: { $in: [phone, formattedPhone, p10, `91${p10}`] } },
      { $set: { mode: "ai", pauseReason: "" } }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message:
        tagToAdd === "NORMAL_QUERY"
          ? `Moved ${formattedPhone} to Normal Query Chats.`
          : `Marked ${formattedPhone} as Customer Query Resolved.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update query resolution status" });
  }
}
