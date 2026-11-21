"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import { Card, CardContent } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Input from "../../components/ui/Input";
import {
  Users,
  Kanban,
  UserCheck,
  UserX,
  UserCog,
  PhoneMissed,
  Bot,
  ArrowRight,
  Phone,
  Building,
  MapPin,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  MessageSquare,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  FileSpreadsheet,
  Download,
  IndianRupee,
  Sparkles,
  XCircle,
  PhoneCall,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import ManageAssignmentModal from "../../components/ManageAssignmentModal";
import ReengageModal from "../../components/ReengageModal";
import LeadFollowupModal from "../../components/LeadFollowupModal";

export default function LeadDistributionPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("executives"); // "executives", "leads", "dropped", "human", "reports", "rep_portal"
  const [selectedRepFilter, setSelectedRepFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [reassigningId, setReassigningId] = useState(null);
  const [reassignMsg, setReassignMsg] = useState("");

  // Manage Assignment Modal State
  const [manageModalTarget, setManageModalTarget] = useState(null);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);

  // Re-engagement Modal State
  const [reengageModalTarget, setReengageModalTarget] = useState(null);
  const [isReengageModalOpen, setIsReengageModalOpen] = useState(false);

  // Follow-up Update Modal State
  const [followupModalLead, setFollowupModalLead] = useState(null);
  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState(false);

  // Reports Tab Filters
  const [reportRepFilter, setReportRepFilter] = useState("ALL");
  const [reportStatusFilter, setReportStatusFilter] = useState("ALL");
  const [reportDateRange, setReportDateRange] = useState("ALL"); // "ALL", "TODAY", "YESTERDAY", "LAST_7", "LAST_30"

  // Rep Portal Selected Rep
  const [portalRepName, setPortalRepName] = useState("");

  // Live Rep Alert Resend State
  const [resendingLeadId, setResendingLeadId] = useState(null);
  const [resendStatusMsg, setResendStatusMsg] = useState("");

  const openFollowupModal = (lead) => {
    setFollowupModalLead(lead);
    setIsFollowupModalOpen(true);
  };

  const openReengageModal = (target) => {
    setReengageModalTarget(target);
    setIsReengageModalOpen(true);
  };

  const openManageModal = (target) => {
    setManageModalTarget(target);
    setIsManageModalOpen(true);
  };

  const handleResendRepAlert = async (lead) => {
    setResendingLeadId(lead._id);
    try {
      const res = await crmApi.resendRepAlert({ leadId: lead._id, phone: lead.phone });
      setResendStatusMsg(`Alert re-sent to ${lead.assignedEmployeeName}!`);
      fetchData();
      setTimeout(() => setResendStatusMsg(""), 4000);
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || "Failed to resend alert");
    } finally {
      setResendingLeadId(null);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await crmApi.getDistributionAnalytics();
      setData(res);
    } catch (err) {
      console.error("Failed to fetch distribution analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleReassignLead = async (leadId, newRepName, newRepMobile) => {
    setReassigningId(leadId);
    setReassignMsg("");
    try {
      await crmApi.assignLeadToExecutive({
        leadId,
        executiveName: newRepName,
        executivePhone: newRepMobile,
      });
      setReassignMsg(`Lead successfully assigned to ${newRepName}!`);
      await fetchData();
      setTimeout(() => setReassignMsg(""), 3000);
    } catch (err) {
      alert(err.message || "Failed to assign lead");
    } finally {
      setReassigningId(null);
    }
  };

  const summary = data?.summary || {
    totalInquiries: 0,
    totalLeads: 0,
    totalAssignedLeads: 0,
    totalUnassignedLeads: 0,
    totalHumanTakeovers: 0,
    totalDroppedAtHi: 0,
    leadCompletionRate: 0,
  };

  const executives = data?.executives || [];
  const unassignedLeads = data?.unassignedLeads || [];
  const humanTakeovers = data?.humanTakeovers || [];
  const droppedAtHi = data?.droppedAtHi || [];

  // Flatten all leads for the Leads tab
  const allLeads = [
    ...unassignedLeads.map((l) => ({ ...l, assignedEmployeeName: "Unassigned" })),
    ...executives.flatMap((ex) =>
      (ex.leads || []).map((l) => ({ ...l, assignedEmployeeName: ex.name }))
    ),
  ];

  const filteredLeads = allLeads.filter((lead) => {
    const matchesRep =
      selectedRepFilter === "ALL"
        ? true
        : selectedRepFilter === "UNASSIGNED"
        ? lead.assignedEmployeeName === "Unassigned"
        : lead.assignedEmployeeName === selectedRepFilter;

    if (!matchesRep) return false;
    if (!searchQuery.trim()) return true;

    const s = searchQuery.toLowerCase();
    return (
      lead.customerName?.toLowerCase().includes(s) ||
      lead.phone?.toLowerCase().includes(s) ||
      lead.leadNumber?.toLowerCase().includes(s) ||
      lead.businessName?.toLowerCase().includes(s) ||
      lead.city?.toLowerCase().includes(s)
    );
  });

  // Set default portal executive once executives load
  useEffect(() => {
    if (executives.length > 0 && !portalRepName) {
      setPortalRepName(executives[0].name);
    }
  }, [executives, portalRepName]);

  // Excel / CSV Export Utility with UTF-8 BOM
  const exportToExcel = (leadsList, filename = "RN_Valves_Lead_Distribution_Report") => {
    if (!leadsList || leadsList.length === 0) {
      alert("No leads available to export in current filter.");
      return;
    }

    const headers = [
      "Lead ID",
      "Customer Name",
      "Business / Firm Name",
      "Phone Number",
      "City",
      "State",
      "PIN Code",
      "Requirement / Category",
      "Assigned Sales Executive",
      "Executive Mobile",
      "Lead Status",
      "Estimated / Deal Value (INR)",
      "Next Follow-up Date",
      "Rep WhatsApp Notification",
      "Customer Replied",
      "Routing Reason",
      "Loss Reason",
      "Follow-up Remarks",
      "Created Date & Time",
    ];

    const rows = leadsList.map((l) => {
      const cleanNotes = (l.internalNotes || []).join(" | ").replace(/[\r\n",]/g, " ");
      const fDate = l.followupDate ? new Date(l.followupDate).toLocaleDateString("en-IN") : "";
      const cDate = l.createdAt ? new Date(l.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "";
      return [
        l.leadNumber || "",
        `"${(l.customerName || "").replace(/"/g, '""')}"`,
        `"${(l.businessName || "").replace(/"/g, '""')}"`,
        `"${l.phone || ""}"`,
        `"${(l.city || "").replace(/"/g, '""')}"`,
        `"${(l.state || "").replace(/"/g, '""')}"`,
        `"${l.pincode || ""}"`,
        `"${(l.productCategory || "Wholesale Dealership").replace(/"/g, '""')}"`,
        `"${(l.assignedEmployeeName || "Unassigned").replace(/"/g, '""')}"`,
        `"${l.repPhone || l.assignedEmployeePhone || ""}"`,
        `"${l.status || "NEW"}"`,
        Number(l.estimatedValue) || 0,
        `"${fDate}"`,
        `"${l.repNotificationStatus || "DELIVERED"}"`,
        `"${l.customerReplyStatus || "REPLIED"}"`,
        `"${(l.routingReason || "").replace(/"/g, '""')}"`,
        `"${(l.lossReason || "").replace(/"/g, '""')}"`,
        `"${cleanNotes}"`,
        `"${cDate}"`,
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Leads for Reports Tab
  const filteredReportLeads = allLeads.filter((l) => {
    if (reportRepFilter !== "ALL") {
      if (reportRepFilter === "UNASSIGNED" && l.assignedEmployeeName !== "Unassigned") return false;
      if (reportRepFilter !== "UNASSIGNED" && l.assignedEmployeeName !== reportRepFilter) return false;
    }
    if (reportStatusFilter !== "ALL" && l.status !== reportStatusFilter) {
      return false;
    }
    if (reportDateRange !== "ALL" && l.createdAt) {
      const created = new Date(l.createdAt).getTime();
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      if (reportDateRange === "TODAY") {
        const startOfToday = new Date().setHours(0, 0, 0, 0);
        if (created < startOfToday) return false;
      } else if (reportDateRange === "YESTERDAY") {
        const startOfYesterday = new Date(Date.now() - oneDay).setHours(0, 0, 0, 0);
        const endOfYesterday = new Date().setHours(0, 0, 0, 0);
        if (created < startOfYesterday || created >= endOfYesterday) return false;
      } else if (reportDateRange === "LAST_7") {
        if (now - created > 7 * oneDay) return false;
      } else if (reportDateRange === "LAST_30") {
        if (now - created > 30 * oneDay) return false;
      }
    }
    if (searchQuery.trim()) {
      const s = searchQuery.toLowerCase();
      return (
        l.customerName?.toLowerCase().includes(s) ||
        l.phone?.toLowerCase().includes(s) ||
        l.leadNumber?.toLowerCase().includes(s) ||
        l.businessName?.toLowerCase().includes(s) ||
        l.city?.toLowerCase().includes(s) ||
        l.assignedEmployeeName?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  // Selected Sales Executive for Portal
  const selectedPortalExec = executives.find((e) => e.name === portalRepName) || executives[0];
  const portalLeads = allLeads.filter((l) => l.assignedEmployeeName === (selectedPortalExec?.name || portalRepName));

  const filteredDropped = droppedAtHi.filter((d) => {
    if (!searchQuery.trim()) return true;
    const s = searchQuery.toLowerCase();
    return (
      d.phone?.toLowerCase().includes(s) ||
      d.name?.toLowerCase().includes(s) ||
      d.dropOffStage?.toLowerCase().includes(s) ||
      d.city?.toLowerCase().includes(s)
    );
  });

  const filteredHuman = humanTakeovers.filter((h) => {
    if (!searchQuery.trim()) return true;
    const s = searchQuery.toLowerCase();
    return (
      h.phone?.toLowerCase().includes(s) ||
      h.customerName?.toLowerCase().includes(s) ||
      h.pauseReason?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors">
      <Header
        title="Lead Distribution & Drop-off Intelligence"
        subtitle="Rep allocation matrix, unassigned leads, dropped at 'Hi', and human handovers"
        onRefresh={fetchData}
        loading={loading}
      />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {reassignMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center justify-between animate-in fade-in shadow-sm">
            <span>✅ {reassignMsg}</span>
          </div>
        )}

        {/* 1. High-Level Performance Metric Cards (6 KPI tiles) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Total Inquiries */}
          <Card hover>
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Total Inquiries
                </span>
                <MessageSquare className="w-4 h-4 text-blue-500" />
              </div>
              <div className="mt-2.5">
                {loading ? (
                  <div className="h-7 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
                ) : (
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {summary.totalInquiries}
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-0.5">Started chat</p>
              </div>
            </CardContent>
          </Card>

          {/* Fully Qualified Leads */}
          <Card hover>
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Formed Leads
                </span>
                <Kanban className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-2.5">
                {loading ? (
                  <div className="h-7 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
                ) : (
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {summary.totalLeads}
                  </p>
                )}
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                  {summary.leadCompletionRate}% Qualified
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Assigned Leads */}
          <Card hover>
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Assigned Leads
                </span>
                <UserCheck className="w-4 h-4 text-rn-600" />
              </div>
              <div className="mt-2.5">
                {loading ? (
                  <div className="h-7 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
                ) : (
                  <p className="text-2xl font-black text-rn-600 dark:text-rn-400">
                    {summary.totalAssignedLeads}
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-0.5">Routed by PIN</p>
              </div>
            </CardContent>
          </Card>

          {/* Unassigned Leads */}
          <div
            className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between cursor-pointer transition-all ${
              summary.totalUnassignedLeads > 0
                ? "bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900 ring-2 ring-rose-200 dark:ring-rose-900/40"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            }`}
            onClick={() => {
              setActiveTab("leads");
              setSelectedRepFilter("UNASSIGNED");
            }}
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                Unassigned
              </span>
              <UserX className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-2.5">
              {loading ? (
                <div className="h-7 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
              ) : (
                <p className="text-2xl font-black text-rose-600 dark:text-rose-400">
                  {summary.totalUnassignedLeads}
                </p>
              )}
              <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-0.5">
                {summary.totalUnassignedLeads > 0 ? "Needs Routing ⚠️" : "All Routed ✅"}
              </p>
            </div>
          </div>

          {/* Dropped Off at "Hi" */}
          <Card
            hover
            className="cursor-pointer"
            onClick={() => setActiveTab("dropped")}
          >
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Dropped at "Hi"
                </span>
                <PhoneMissed className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2.5">
                {loading ? (
                  <div className="h-7 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
                ) : (
                  <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {summary.totalDroppedAtHi}
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-0.5">Abandoned at greeting</p>
              </div>
            </CardContent>
          </Card>

          {/* Human Handover */}
          <Card
            hover
            className="cursor-pointer"
            onClick={() => setActiveTab("human")}
          >
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                  Human Handover
                </span>
                <Bot className="w-4 h-4 text-purple-600" />
              </div>
              <div className="mt-2.5">
                {loading ? (
                  <div className="h-7 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
                ) : (
                  <p className="text-2xl font-black text-purple-600 dark:text-purple-400">
                    {summary.totalHumanTakeovers}
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-0.5">Human mode active</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 2. Interactive Navigation Dropdown & Search */}
        <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="distribution-view-select" className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
                View:
              </label>
              <div className="relative flex-1 sm:w-72">
                <select
                  id="distribution-view-select"
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value)}
                  className="w-full appearance-none pl-9 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-900 dark:text-white font-bold text-xs rounded-xl border border-slate-300 dark:border-slate-700 shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-rn-500 transition-all"
                >
                  <option value="executives">
                    Sales Executives ({executives.length})
                  </option>
                  <option value="leads">
                    All Pipeline Leads ({allLeads.length}){summary.totalUnassignedLeads > 0 ? ` - ${summary.totalUnassignedLeads} Unassigned` : ""}
                  </option>
                  <option value="dropped">
                    Dropped at "Hi" ({droppedAtHi.length})
                  </option>
                  <option value="human">
                    Human Takeovers ({humanTakeovers.length})
                  </option>
                  <option value="reports">
                    Reports & Excel ({allLeads.length})
                  </option>
                  <option value="rep_portal">
                    Sales Rep Portal
                  </option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-rn-600 dark:text-rn-400">
                  {activeTab === "executives" && <Users className="w-4 h-4" />}
                  {activeTab === "leads" && <Kanban className="w-4 h-4" />}
                  {activeTab === "dropped" && <PhoneMissed className="w-4 h-4 text-amber-600" />}
                  {activeTab === "human" && <Bot className="w-4 h-4 text-purple-600" />}
                  {activeTab === "reports" && <FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
                  {activeTab === "rep_portal" && <UserCheck className="w-4 h-4 text-blue-600" />}
                </div>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Quick-switch chips for desktop convenience */}
            <div className="hidden xl:flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab("executives")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  activeTab === "executives"
                    ? "bg-rn-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Executives ({executives.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("leads")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  activeTab === "leads"
                    ? "bg-rn-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Pipeline ({allLeads.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("dropped")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  activeTab === "dropped"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Dropped ({droppedAtHi.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("human")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  activeTab === "human"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Human ({humanTakeovers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("reports")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  activeTab === "reports"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Reports
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("rep_portal")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  activeTab === "rep_portal"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Rep Portal
              </button>
            </div>

            {/* Direct Link to Standalone Rep Portal */}
            <Link
              href="/rep-portal"
              target="_blank"
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50"
            >
              <span>Full Rep Portal</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          {/* Search Box */}
          <div className="w-full md:w-64">
            <Input
              type="text"
              placeholder="Search phone, rep, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={Search}
            />
          </div>
        </div>

        {/* TAB 1: SALES EXECUTIVE DISTRIBUTION MATRIX */}
        {activeTab === "executives" && (
          <div className="space-y-6">
            <Card>
              <div className="p-4 px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    Executive Territory Allocation & Live Performance
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Lead routing determined dynamically by customer area PIN code match
                  </p>
                </div>
                <Badge variant="primary" size="sm">
                  {summary.totalAssignedLeads} Routed Leads
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Sales Executive</th>
                      <th className="px-6 py-4">Assigned Region</th>
                      <th className="px-6 py-4">WhatsApp Contact</th>
                      <th className="px-6 py-4 text-center">Total Leads</th>
                      <th className="px-6 py-4 text-center">Won</th>
                      <th className="px-6 py-4 text-center">In Progress</th>
                      <th className="px-6 py-4">Share of Leads</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {loading ? (
                      [1, 2, 3, 4].map((k) => (
                        <tr key={k} className="animate-pulse">
                          <td className="px-6 py-4">
                            <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-32 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="h-4 w-6 bg-slate-200 dark:bg-slate-800 rounded mx-auto"></div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="h-4 w-6 bg-slate-100 dark:bg-slate-800/60 rounded mx-auto"></div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="h-4 w-6 bg-slate-100 dark:bg-slate-800/60 rounded mx-auto"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-2 w-28 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded ml-auto"></div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <>
                        {executives.map((ex) => (
                          <tr
                            key={ex.name}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-900 dark:text-white text-sm">
                                {ex.name}
                              </div>
                              <span className="text-[10px] text-slate-400">RN Sales Executive</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {ex.state}
                              </span>
                              <p className="text-[10px] text-slate-400 truncate max-w-xs">{ex.area}</p>
                            </td>
                            <td className="px-6 py-4 font-mono font-medium text-slate-600 dark:text-slate-300">
                              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                                {ex.mobile}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center font-bold text-sm text-slate-900 dark:text-white">
                              <span
                                className={`px-2.5 py-1 rounded-full ${
                                  ex.leadsCount > 0
                                    ? "bg-rn-50 dark:bg-rn-950/60 text-rn-700 dark:text-rn-300 font-extrabold"
                                    : "text-slate-400"
                                }`}
                              >
                                {ex.leadsCount}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center font-bold text-emerald-600 dark:text-emerald-400">
                              {ex.convertedCount}
                            </td>
                            <td className="px-6 py-4 text-center font-semibold text-slate-700 dark:text-slate-300">
                              {ex.inProgressCount}
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span className="font-bold text-slate-700 dark:text-slate-300">
                                    {ex.sharePercent}%
                                  </span>
                                  <span className="text-slate-400">
                                    ₹{ex.totalEstimatedValue ? ex.totalEstimatedValue.toLocaleString("en-IN") : "0"}
                                  </span>
                                </div>
                                <div className="h-1.5 w-32 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-rn-600 rounded-full transition-all"
                                    style={{ width: `${ex.sharePercent}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => {
                                  setActiveTab("leads");
                                  setSelectedRepFilter(ex.name);
                                }}
                              >
                                View Leads →
                              </Button>
                            </td>
                          </tr>
                        ))}

                        {/* Unassigned Leads Row */}
                        <tr
                          className={`border-t-2 ${
                            summary.totalUnassignedLeads > 0
                              ? "bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900"
                              : "bg-slate-50/40 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800"
                          }`}
                        >
                          <td className="px-6 py-4">
                            <div className="font-bold text-rose-700 dark:text-rose-400 text-sm flex items-center gap-1.5">
                              <UserX className="w-4 h-4 text-rose-600 shrink-0" />
                              Unassigned / Unrouted
                            </div>
                            <span className="text-[10px] text-rose-600 dark:text-rose-400">
                              PIN not matched to any territory
                            </span>
                          </td>
                          <td className="px-6 py-4 text-rose-700 dark:text-rose-400 text-xs italic">
                            Unmapped PINs
                          </td>
                          <td className="px-6 py-4 text-slate-400 font-mono text-xs">—</td>
                          <td className="px-6 py-4 text-center font-black text-rose-700 dark:text-rose-400 text-sm">
                            <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950 rounded-full">
                              {summary.totalUnassignedLeads}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center text-slate-400">—</td>
                          <td className="px-6 py-4 text-center font-bold text-rose-700 dark:text-rose-400">
                            {summary.totalUnassignedLeads}
                          </td>
                          <td className="px-6 py-4 text-xs text-rose-700 dark:text-rose-400 font-semibold">
                            {summary.totalUnassignedLeads > 0
                              ? "Requires Manual Assignment"
                              : "None pending"}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {summary.totalUnassignedLeads > 0 && (
                              <Button
                                variant="danger"
                                size="xs"
                                onClick={() => {
                                  setActiveTab("leads");
                                  setSelectedRepFilter("UNASSIGNED");
                                }}
                              >
                                Assign Now →
                              </Button>
                            )}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 2: DETAILED LEADS LIST */}
        {activeTab === "leads" && (
          <div className="space-y-4">
            {/* Live Delivery & Handover Tracking KPI Snapshot */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Rep WhatsApp Delivered
                  </p>
                  <p className="text-xl font-black text-emerald-900 dark:text-emerald-100 mt-0.5">
                    {filteredLeads.filter((l) => l.repNotificationStatus !== "FAILED" && l.assignedEmployeeName && l.assignedEmployeeName !== "Unassigned").length} Leads
                  </p>
                  <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400 mt-0.5">
                    Territory sales reps notified with customer data
                  </p>
                </div>
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                    Customers Replied / Handled
                  </p>
                  <p className="text-xl font-black text-blue-900 dark:text-blue-100 mt-0.5">
                    {filteredLeads.filter((l) => l.customerReplyStatus !== "AWAITING_REPLY").length} Inquiries
                  </p>
                  <p className="text-[11px] text-blue-700/80 dark:text-blue-400 mt-0.5">
                    Catalogues & initial greetings delivered
                  </p>
                </div>
                <MessageSquare className="w-6 h-6 text-blue-600 shrink-0" />
              </div>

              <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                    Territory Routing Accuracy
                  </p>
                  <p className="text-xl font-black text-purple-900 dark:text-purple-100 mt-0.5">
                    {summary.totalLeads > 0 ? Math.round((summary.totalAssignedLeads / summary.totalLeads) * 100) : 100}% Routed
                  </p>
                  <p className="text-[11px] text-purple-700/80 dark:text-purple-400 mt-0.5">
                    Customers mapped to respective state reps
                  </p>
                </div>
                <MapPin className="w-6 h-6 text-purple-600 shrink-0" />
              </div>
            </div>

            {resendStatusMsg && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-bold">{resendStatusMsg}</span>
              </div>
            )}

            {/* Filter Bar */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="font-bold text-slate-600 dark:text-slate-400">Filter by Rep:</span>
                {["ALL", "UNASSIGNED", ...executives.map((e) => e.name)].map((rep) => (
                  <button
                    key={rep}
                    onClick={() => setSelectedRepFilter(rep)}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all text-xs ${
                      selectedRepFilter === rep
                        ? rep === "UNASSIGNED"
                          ? "bg-rose-600 text-white shadow-sm"
                          : "bg-rn-600 text-white shadow-sm"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {rep === "ALL"
                      ? "All Leads"
                      : rep === "UNASSIGNED"
                      ? `⚠️ Unassigned (${summary.totalUnassignedLeads})`
                      : rep}
                  </button>
                ))}
              </div>

              <span className="text-xs text-slate-400 font-medium">
                Showing {filteredLeads.length} leads
              </span>
            </div>

            {/* Leads Table */}
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Lead ID</th>
                      <th className="px-6 py-4">Customer / Firm</th>
                      <th className="px-6 py-4">Phone Number</th>
                      <th className="px-6 py-4">Territory Route & PIN</th>
                      <th className="px-6 py-4">Assigned Sales Executive</th>
                      <th className="px-6 py-4 text-center">Rep WhatsApp Alert</th>
                      <th className="px-6 py-4 text-center">Customer Reply</th>
                      <th className="px-6 py-4">Stage</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {loading ? (
                      [1, 2, 3, 4, 5].map((k) => (
                        <tr key={k} className="animate-pulse">
                          <td className="px-6 py-4">
                            <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="h-4 w-20 bg-slate-100 dark:bg-slate-800/60 rounded mx-auto"></div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="h-4 w-16 bg-slate-100 dark:bg-slate-800/60 rounded mx-auto"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-4 w-16 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded ml-auto"></div>
                          </td>
                        </tr>
                      ))
                    ) : filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-12 text-center text-slate-400 text-xs">
                          No leads matching this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => {
                        const isUnassigned =
                          !lead.assignedEmployeeName || lead.assignedEmployeeName === "Unassigned";

                        const isRepDelivered =
                          !isUnassigned && lead.repNotificationStatus !== "FAILED";

                        return (
                          <tr
                            key={lead._id}
                            className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                              isUnassigned ? "bg-rose-50/30 dark:bg-rose-950/20" : ""
                            }`}
                          >
                            <td className="px-6 py-4 font-mono font-bold text-slate-500">
                              <div>{lead.leadNumber}</div>
                              <div className="text-[10px] text-slate-400 font-normal">
                                {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : ""}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {lead.customerName}
                              </div>
                              {lead.businessName && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                  <Building className="w-3 h-3 text-slate-400" />
                                  {lead.businessName}
                                </p>
                              )}
                            </td>
                            <td className="px-6 py-4 font-mono text-slate-700 dark:text-slate-300">
                              {lead.phone}
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-800 dark:text-slate-200">
                                {lead.city || lead.state || "India"}
                              </div>
                              {lead.pincode && (
                                <p className="text-[10px] text-slate-500 font-mono">
                                  PIN: {lead.pincode}
                                </p>
                              )}
                              {lead.routingReason && (
                                <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1" title={lead.routingReason}>
                                  {lead.routingReason}
                                </p>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {isUnassigned ? (
                                <Badge variant="danger" size="xs">
                                  ⚠️ Not Assigned
                                </Badge>
                              ) : (
                                <div>
                                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rn-50 dark:bg-rn-950/60 text-rn-700 dark:text-rn-300 border border-rn-200 dark:border-rn-800 inline-block">
                                    👤 {lead.assignedEmployeeName}
                                  </span>
                                  {lead.repPhone && (
                                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                      {lead.repPhone}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {isUnassigned ? (
                                <span className="text-[11px] text-slate-400 italic">Unassigned</span>
                              ) : isRepDelivered ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Sent to Rep</span>
                                </span>
                              ) : (
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    Failed
                                  </span>
                                  <button
                                    onClick={() => handleResendRepAlert(lead)}
                                    disabled={resendingLeadId === lead._id}
                                    className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-colors"
                                    title="Resend WhatsApp alert to sales executive"
                                  >
                                    <Send className="w-2.5 h-2.5" />
                                    <span>{resendingLeadId === lead._id ? "..." : "Resend"}</span>
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {lead.customerReplyStatus === "AWAITING_REPLY" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <Clock className="w-2.5 h-2.5 text-amber-600" />
                                  <span>Awaiting Reply</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                  <span>Replied</span>
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <Badge
                                variant={
                                  lead.status === "CONVERTED"
                                    ? "success"
                                    : lead.status === "NEW"
                                    ? "info"
                                    : "neutral"
                                }
                                size="xs"
                              >
                                {lead.status}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => openFollowupModal(lead)}
                                  className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold rounded-xl text-xs inline-flex items-center gap-1 shadow-sm transition-colors"
                                  title="Update Follow-up Progress, Stage & Outcome"
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Update</span>
                                </button>
                                <button
                                  onClick={() =>
                                    openManageModal({
                                      leadId: lead._id,
                                      phone: lead.phone,
                                      customerName: lead.customerName,
                                      currentAgentName: lead.assignedEmployeeName,
                                      city: lead.city,
                                      businessName: lead.businessName,
                                    })
                                  }
                                  className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold rounded-xl text-xs inline-flex items-center gap-1 shadow-sm transition-colors"
                                  title="Reassign or Manage Sales Person"
                                >
                                  <UserCog className="w-3.5 h-3.5" />
                                  <span>Manage</span>
                                </button>
                                <Link
                                  href={`/inbox?phone=${encodeURIComponent(lead.phone || "")}`}
                                  className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors"
                                  title="Open Inbox"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 3: ABANDONED AT "HI" */}
        {activeTab === "dropped" && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-5 text-amber-900 dark:text-amber-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <PhoneMissed className="w-4 h-4 text-amber-600" />
                  Incomplete WhatsApp Inquiries (Dropped at Greeting)
                </h4>
                <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1 leading-relaxed">
                  These visitors sent an initial greeting ("Hi", "Hello") but dropped off. Send a re-engagement greeting asking for their Name & Area PIN Code. Once they reply with their PIN, our AI automatically transfers the lead to the respective territorial Sales Executive!
                </p>
              </div>
              {filteredDropped.length > 0 && (
                <button
                  onClick={() =>
                    openReengageModal({
                      isBulk: true,
                      count: filteredDropped.length,
                      phones: filteredDropped.map((d) => d.phone),
                    })
                  }
                  className="shrink-0 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>⚡ Re-engage All ({filteredDropped.length})</span>
                </button>
              )}
            </div>

            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Phone Number</th>
                      <th className="px-6 py-4">Captured Name</th>
                      <th className="px-6 py-4">Drop-off Stage</th>
                      <th className="px-6 py-4">Interactions</th>
                      <th className="px-6 py-4">Last Active</th>
                      <th className="px-6 py-4 text-right">Re-engage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {loading ? (
                      [1, 2, 3, 4].map((k) => (
                        <tr key={k} className="animate-pulse">
                          <td className="px-6 py-4">
                            <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-48 bg-slate-200 dark:bg-slate-800 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-8 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded ml-auto"></div>
                          </td>
                        </tr>
                      ))
                    ) : filteredDropped.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xs">
                          No dropped off inquiries found.
                        </td>
                      </tr>
                    ) : (
                      filteredDropped.map((d) => (
                        <tr
                          key={d._id || d.phone}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            {d.phone}
                          </td>
                          <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium">
                            {d.name}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="warning" size="xs">
                              {d.dropOffStage}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">
                            {d.totalEnquiriesCount} interactions
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                            {new Date(d.lastContactedAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() =>
                                  openManageModal({
                                    phone: d.phone,
                                    customerName:
                                      d.name && d.name !== "Incomplete Visitor" && d.name !== "WhatsApp Customer"
                                        ? d.name
                                        : "Customer",
                                    currentAgentName: "Unassigned Agent",
                                    city: d.city || "",
                                    businessName: d.businessName || "",
                                    reason: d.dropOffStage || "Dropped at greeting",
                                  })
                                }
                                className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold rounded-xl text-xs inline-flex items-center gap-1 shadow-sm transition-colors"
                                title="Directly assign to Sales Person"
                              >
                                <UserCog className="w-3.5 h-3.5" />
                                <span>Manage</span>
                              </button>
                              <button
                                onClick={() =>
                                  openReengageModal({
                                    phone: d.phone,
                                    name: d.name,
                                    dropOffStage: d.dropOffStage,
                                    totalEnquiriesCount: d.totalEnquiriesCount,
                                  })
                                }
                                className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-bold rounded-xl text-xs inline-flex items-center gap-1 shadow-sm transition-colors"
                                title="Send WhatsApp greeting asking for Name & PIN"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Greet & Ask PIN</span>
                              </button>
                              <Link
                                href={`/inbox?phone=${encodeURIComponent(d.phone || "")}`}
                                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors"
                                title="Open WhatsApp Inbox"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 4: HUMAN TAKEOVER REQUESTS */}
        {activeTab === "human" && (
          <div className="space-y-4">
            <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/50 rounded-2xl p-5 text-purple-900 dark:text-purple-200">
              <h4 className="font-bold text-sm flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-600" />
                Human Takeover Converted Inquiries
              </h4>
              <p className="text-xs text-purple-800/80 dark:text-purple-300/80 mt-1 leading-relaxed">
                These users requested live sales executive support. AI bot auto-replies are paused to let human agents handle quotation negotiations.
              </p>
            </div>

            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Customer Phone</th>
                      <th className="px-6 py-4">Customer Name / Firm</th>
                      <th className="px-6 py-4">Handover Reason</th>
                      <th className="px-6 py-4">Assigned Agent / Team</th>
                      <th className="px-6 py-4">Last Message</th>
                      <th className="px-6 py-4 text-right">Inbox Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {loading ? (
                      [1, 2, 3].map((k) => (
                        <tr key={k} className="animate-pulse">
                          <td className="px-6 py-4">
                            <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-40 bg-slate-200 dark:bg-slate-800 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded ml-auto"></div>
                          </td>
                        </tr>
                      ))
                    ) : filteredHuman.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xs">
                          No human takeover requests currently pending.
                        </td>
                      </tr>
                    ) : (
                      filteredHuman.map((h) => (
                        <tr
                          key={h._id || h.phone}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-white">
                            {h.phone}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {h.customerName}
                            </div>
                            {h.businessName && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {h.businessName}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="purple" size="xs">
                              {h.pauseReason}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            {h.assignedAgentName && h.assignedAgentName !== "Unassigned Agent" ? (
                              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                👤 {h.assignedAgentName}
                              </span>
                            ) : (
                              <Badge variant="danger" size="xs">
                                ⚠️ Unassigned Agent
                              </Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                            {new Date(h.lastCustomerMessageAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() =>
                                  openManageModal({
                                    phone: h.phone,
                                    customerName: h.customerName,
                                    currentAgentName: h.assignedAgentName,
                                    city: h.city,
                                    businessName: h.businessName,
                                    reason: h.pauseReason,
                                  })
                                }
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-sm transition-colors"
                              >
                                <UserCog className="w-3.5 h-3.5" />
                                <span>Manage</span>
                              </button>
                              <Link
                                href={`/inbox?phone=${encodeURIComponent(h.phone || "")}`}
                                className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-purple-950 text-slate-700 dark:text-slate-200 hover:text-purple-600 font-bold rounded-xl text-xs inline-flex items-center gap-1 transition-colors"
                                title="Open WhatsApp Chat"
                              >
                                <span>Chat</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 5: REPORTS & EXCEL EXPORT PANEL */}
        {activeTab === "reports" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Top Action & Header Bar */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <span>Lead Distribution & Performance Reports</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Filter leads across all sales reps, analyze follow-up status, and export clean reports directly to Microsoft Excel.
                </p>
              </div>

              <button
                onClick={() =>
                  exportToExcel(
                    filteredReportLeads,
                    `RN_Valves_Leads_Report_${reportRepFilter}_${reportStatusFilter}`
                  )
                }
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs inline-flex items-center gap-2 shadow-sm transition-all"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Download Excel Report ({filteredReportLeads.length})</span>
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Filter Controls Bar */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                {/* Rep Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-500">Rep:</span>
                  <select
                    value={reportRepFilter}
                    onChange={(e) => setReportRepFilter(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rn-500"
                  >
                    <option value="ALL">All Sales Executives ({executives.length})</option>
                    <option value="UNASSIGNED">Unassigned Only</option>
                    {executives.map((e) => (
                      <option key={e.name} value={e.name}>
                        {e.name} ({e.leadsCount || 0} leads)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-500">Stage:</span>
                  <select
                    value={reportStatusFilter}
                    onChange={(e) => setReportStatusFilter(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rn-500"
                  >
                    <option value="ALL">All Statuses / Outcomes</option>
                    <option value="CONVERTED">🟢 Converted / Won Deals</option>
                    <option value="QUOTATION_SENT">📄 Quotation / Price List Sent</option>
                    <option value="NEGOTIATION">💬 In Negotiation</option>
                    <option value="CONTACTED">📞 Contacted (Follow-up)</option>
                    <option value="NEW">🔵 New Inquiries</option>
                    <option value="LOST">🔴 Lost Deals</option>
                  </select>
                </div>

                {/* Date Range Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-500">Timeline:</span>
                  <select
                    value={reportDateRange}
                    onChange={(e) => setReportDateRange(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rn-500"
                  >
                    <option value="ALL">All Time</option>
                    <option value="TODAY">Today</option>
                    <option value="YESTERDAY">Yesterday</option>
                    <option value="LAST_7">Last 7 Days</option>
                    <option value="LAST_30">Last 30 Days</option>
                  </select>
                </div>
              </div>

              <div className="text-slate-400 font-medium">
                Matching <strong className="text-slate-700 dark:text-slate-200">{filteredReportLeads.length}</strong> leads
              </div>
            </div>

            {/* Performance KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total Leads Filtered
                </span>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {filteredReportLeads.length}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Assigned in selected criteria</p>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-4 shadow-sm">
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider block">
                  Won Deals (Converted)
                </span>
                <p className="text-2xl font-black text-emerald-900 dark:text-emerald-100 mt-1">
                  {filteredReportLeads.filter((l) => l.status === "CONVERTED").length}
                </p>
                <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400 mt-0.5">
                  {filteredReportLeads.length > 0
                    ? Math.round(
                        (filteredReportLeads.filter((l) => l.status === "CONVERTED").length /
                          filteredReportLeads.length) *
                          100
                      )
                    : 0}% Conversion Rate
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-2xl p-4 shadow-sm">
                <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider block">
                  Active in Follow-up
                </span>
                <p className="text-2xl font-black text-blue-900 dark:text-blue-100 mt-1">
                  {filteredReportLeads.filter((l) => l.status !== "CONVERTED" && l.status !== "LOST").length}
                </p>
                <p className="text-[11px] text-blue-700/80 dark:text-blue-400 mt-0.5">
                  Quotes, negotiations & chats
                </p>
              </div>

              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-4 shadow-sm">
                <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider block">
                  Lost Inquiries
                </span>
                <p className="text-2xl font-black text-rose-900 dark:text-rose-100 mt-1">
                  {filteredReportLeads.filter((l) => l.status === "LOST").length}
                </p>
                <p className="text-[11px] text-rose-700/80 dark:text-rose-400 mt-0.5">
                  Dropped / competitor / price
                </p>
              </div>
            </div>

            {/* Reports Leads Table */}
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Lead ID & Date</th>
                      <th className="px-6 py-4">Customer / Firm</th>
                      <th className="px-6 py-4">Phone Number</th>
                      <th className="px-6 py-4">Territory / PIN</th>
                      <th className="px-6 py-4">Assigned Executive</th>
                      <th className="px-6 py-4">Status / Outcome</th>
                      <th className="px-6 py-4 text-right">Deal Value (₹)</th>
                      <th className="px-6 py-4">Follow-up Date</th>
                      <th className="px-6 py-4">Latest Notes</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredReportLeads.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-6 py-12 text-center text-slate-400 text-xs">
                          No leads matched the selected report filters.
                        </td>
                      </tr>
                    ) : (
                      filteredReportLeads.map((lead) => (
                        <tr
                          key={lead._id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="px-6 py-4 font-mono font-bold text-slate-600 dark:text-slate-400">
                            <div>{lead.leadNumber}</div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : ""}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {lead.customerName}
                            </div>
                            {lead.businessName && (
                              <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <Building className="w-3 h-3 text-slate-400" />
                                {lead.businessName}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-700 dark:text-slate-300">
                            {lead.phone}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {lead.city || lead.state || "India"}
                            </div>
                            {lead.pincode && (
                              <p className="text-[10px] text-slate-400 font-mono">
                                PIN: {lead.pincode}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rn-50 dark:bg-rn-950/60 text-rn-700 dark:text-rn-300 border border-rn-200 dark:border-rn-800 inline-block">
                              👤 {lead.assignedEmployeeName}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <Badge
                              variant={
                                lead.status === "CONVERTED"
                                  ? "success"
                                  : lead.status === "LOST"
                                  ? "danger"
                                  : lead.status === "QUOTATION_SENT" || lead.status === "NEGOTIATION"
                                  ? "purple"
                                  : lead.status === "CONTACTED"
                                  ? "warning"
                                  : "info"
                              }
                              size="xs"
                            >
                              {lead.status === "CONVERTED" ? "🎉 WON" : lead.status}
                            </Badge>
                            {lead.lossReason && (
                              <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 font-medium">
                                Reason: {lead.lossReason}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">
                            {lead.estimatedValue ? `₹${Number(lead.estimatedValue).toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="px-6 py-4 text-slate-500">
                            {lead.followupDate ? new Date(lead.followupDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-6 py-4 max-w-xs text-slate-600 dark:text-slate-400 truncate">
                            {lead.internalNotes && lead.internalNotes.length > 0
                              ? lead.internalNotes[lead.internalNotes.length - 1]
                              : "No notes"}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openFollowupModal(lead)}
                                className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold rounded-xl text-xs inline-flex items-center gap-1 shadow-sm transition-colors"
                                title="Update Follow-up Progress & Outcome"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Update</span>
                              </button>
                              <Link
                                href={`/inbox?phone=${encodeURIComponent(lead.phone || "")}`}
                                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl transition-colors"
                                title="Open WhatsApp Chat"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 6: SALES REP FOLLOW-UP PORTAL */}
        {activeTab === "rep_portal" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Sales Rep Selector */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                  Select Sales Executive:
                </span>
                {executives.map((exec) => {
                  const isSelected = portalRepName === exec.name;
                  return (
                    <button
                      key={exec.name}
                      onClick={() => setPortalRepName(exec.name)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all text-xs flex items-center gap-2 ${
                        isSelected
                          ? "bg-rn-600 text-white shadow-sm"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      <span>👤 {exec.name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                          isSelected
                            ? "bg-white/20 text-white"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {exec.leadsCount || 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedPortalExec && (
                <button
                  onClick={() =>
                    exportToExcel(
                      portalLeads,
                      `RN_Valves_Leads_${selectedPortalExec.name.replace(/\s+/g, "_")}`
                    )
                  }
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Download {selectedPortalExec.name}'s Leads</span>
                  <Download className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Selected Rep Performance Dashboard */}
            {selectedPortalExec && (
              <div className="bg-gradient-to-br from-rn-900 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-rn-800/50 space-y-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-rn-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                        {selectedPortalExec.name.charAt(0)}
                      </div>
                      <div>
                        <h2 className="text-lg font-black">{selectedPortalExec.name}</h2>
                        <p className="text-xs text-rn-200 font-mono">
                          📞 {selectedPortalExec.mobile}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 mt-2 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rn-400 shrink-0" />
                      <span>
                        Territory: <strong>{selectedPortalExec.area || selectedPortalExec.state}</strong>
                      </span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/10">
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                        Assigned
                      </span>
                      <p className="text-xl font-black mt-0.5">{portalLeads.length}</p>
                    </div>

                    <div className="bg-emerald-500/20 backdrop-blur-sm rounded-xl p-3 text-center border border-emerald-500/30">
                      <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">
                        Won (Converted)
                      </span>
                      <p className="text-xl font-black text-emerald-300 mt-0.5">
                        {portalLeads.filter((l) => l.status === "CONVERTED").length}
                      </p>
                    </div>

                    <div className="bg-blue-500/20 backdrop-blur-sm rounded-xl p-3 text-center border border-blue-500/30">
                      <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider block">
                        In Follow-up
                      </span>
                      <p className="text-xl font-black text-blue-300 mt-0.5">
                        {portalLeads.filter((l) => l.status !== "CONVERTED" && l.status !== "LOST").length}
                      </p>
                    </div>

                    <div className="bg-rose-500/20 backdrop-blur-sm rounded-xl p-3 text-center border border-rose-500/30">
                      <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider block">
                        Lost
                      </span>
                      <p className="text-xl font-black text-rose-300 mt-0.5">
                        {portalLeads.filter((l) => l.status === "LOST").length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Selected Rep Leads Table with Follow-up update triggers */}
            <Card>
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    {portalRepName}'s Pipeline ({portalLeads.length} Leads)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click "Update Follow-up" on any customer to record discussion notes, deal value, or mark as Won / Lost.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Customer / Firm</th>
                      <th className="px-6 py-4">Phone Number</th>
                      <th className="px-6 py-4">Territory & PIN</th>
                      <th className="px-6 py-4">Requirement</th>
                      <th className="px-6 py-4">Current Stage</th>
                      <th className="px-6 py-4 text-right">Deal Value (₹)</th>
                      <th className="px-6 py-4">Next Follow-up</th>
                      <th className="px-6 py-4">Latest Notes</th>
                      <th className="px-6 py-4 text-right">Follow-up Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {portalLeads.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-12 text-center text-slate-400 text-xs">
                          No leads currently assigned to {portalRepName}.
                        </td>
                      </tr>
                    ) : (
                      portalLeads.map((lead) => {
                        const cleanDigits = (lead.phone || "").replace(/\D/g, "");
                        const waLink = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(
                          `Namaste ${lead.customerName || ""} ji! 🙏 Main ${portalRepName}, RN Valves & Faucets se baat kar raha hoon. Aapki requirement ke baare me baat karni thi.`
                        )}`;

                        return (
                          <tr
                            key={lead._id}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {lead.customerName}
                              </div>
                              {lead.businessName && (
                                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Building className="w-3 h-3 text-slate-400" />
                                  {lead.businessName}
                                </p>
                              )}
                              <span className="text-[10px] text-slate-400 font-mono">
                                {lead.leadNumber}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-slate-700 dark:text-slate-300">
                              {lead.phone}
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-800 dark:text-slate-200">
                                {lead.city || lead.state || "India"}
                              </div>
                              {lead.pincode && (
                                <p className="text-[10px] text-slate-400 font-mono">
                                  PIN: {lead.pincode}
                                </p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-700 dark:text-slate-300">
                              {lead.productCategory || "Wholesale Dealership"}
                            </td>
                            <td className="px-6 py-4">
                              <Badge
                                variant={
                                  lead.status === "CONVERTED"
                                    ? "success"
                                    : lead.status === "LOST"
                                    ? "danger"
                                    : lead.status === "QUOTATION_SENT" || lead.status === "NEGOTIATION"
                                    ? "purple"
                                    : lead.status === "CONTACTED"
                                    ? "warning"
                                    : "info"
                                }
                                size="xs"
                              >
                                {lead.status === "CONVERTED" ? "🎉 WON" : lead.status}
                              </Badge>
                              {lead.lossReason && (
                                <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 font-medium">
                                  Reason: {lead.lossReason}
                                </p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">
                              {lead.estimatedValue ? `₹${Number(lead.estimatedValue).toLocaleString("en-IN")}` : "—"}
                            </td>
                            <td className="px-6 py-4 text-slate-500">
                              {lead.followupDate ? new Date(lead.followupDate).toLocaleDateString() : "—"}
                            </td>
                            <td className="px-6 py-4 max-w-xs text-slate-600 dark:text-slate-400 truncate">
                              {lead.internalNotes && lead.internalNotes.length > 0
                                ? lead.internalNotes[lead.internalNotes.length - 1]
                                : "No notes yet"}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => openFollowupModal(lead)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1 shadow-sm transition-colors"
                                  title="Update Stage, Status & Notes"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Update Follow-up</span>
                                </button>
                                <a
                                  href={waLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold rounded-xl text-xs inline-flex items-center gap-1 transition-colors"
                                  title="Open WhatsApp Chat directly"
                                >
                                  <PhoneCall className="w-3 h-3 text-emerald-600" />
                                  <span>WhatsApp</span>
                                </a>
                                <Link
                                  href={`/inbox?phone=${encodeURIComponent(lead.phone || "")}`}
                                  className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl transition-colors"
                                  title="Open CRM Inbox"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Lead Follow-up & Progress Update Modal */}
        <LeadFollowupModal
          isOpen={isFollowupModalOpen}
          onClose={() => {
            setIsFollowupModalOpen(false);
            setFollowupModalLead(null);
          }}
          lead={followupModalLead}
          onSuccess={fetchData}
        />

        {/* Manage Agent Assignment Modal */}
        <ManageAssignmentModal
          isOpen={isManageModalOpen}
          onClose={() => {
            setIsManageModalOpen(false);
            setManageModalTarget(null);
          }}
          target={manageModalTarget}
          executives={executives}
          onSuccess={fetchData}
        />

        {/* Re-engage Dropped Inquiry Modal */}
        <ReengageModal
          isOpen={isReengageModalOpen}
          onClose={() => {
            setIsReengageModalOpen(false);
            setReengageModalTarget(null);
          }}
          target={reengageModalTarget}
          onSuccess={fetchData}
        />
      </main>
    </div>
  );
}
