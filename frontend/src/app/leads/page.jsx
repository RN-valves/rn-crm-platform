"use client";

import { useState, useEffect, useMemo } from "react";
import Header from "../../components/Header";
import CleanTestModal from "../../components/CleanTestModal";
import LeadFollowupModal from "../../components/LeadFollowupModal";
import ManageAssignmentModal from "../../components/ManageAssignmentModal";
import Pagination from "../../components/ui/Pagination";
import { crmApi } from "../../lib/api";
import { Card, CardContent } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Input from "../../components/ui/Input";
import {
  Kanban,
  Table as TableIcon,
  Search,
  User,
  ArrowRight,
  Phone,
  Building,
  Trash2,
  FileSpreadsheet,
  Download,
  Sparkles,
  UserCog,
  Calendar,
  MapPin,
} from "lucide-react";

const PIPELINE_STAGES = [
  { id: "NEW", title: "New Inquiries", variant: "info", dot: "bg-sky-500" },
  { id: "CONTACTED", title: "Contacted", variant: "primary", dot: "bg-blue-500" },
  { id: "INTERESTED", title: "Interested", variant: "indigo", dot: "bg-indigo-500" },
  { id: "QUOTATION_SENT", title: "Quotation Sent", variant: "purple", dot: "bg-violet-500" },
  { id: "NEGOTIATION", title: "Negotiation", variant: "warning", dot: "bg-amber-500" },
  { id: "CONVERTED", title: "Converted (Won)", variant: "success", dot: "bg-emerald-500" },
  { id: "LOST", title: "Lost", variant: "danger", dot: "bg-rose-500" },
];

export default function LeadsKanban() {
  const [leads, setLeads] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("kanban"); // "kanban" | "table"
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [repFilter, setRepFilter] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("ALL");

  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(25);

  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);
  const [followupModalLead, setFollowupModalLead] = useState(null);
  const [manageModalTarget, setManageModalTarget] = useState(null);

  const fetchLeads = async (force = false) => {
    setLoading(true);
    try {
      const [leadsRes, execRes] = await Promise.all([
        crmApi.getLeads("", force),
        crmApi.getSalesExecutives().catch(() => ({ executives: [] })),
      ]);
      setLeads(leadsRes.leads || []);
      if (execRes?.executives?.length) {
        setExecutives(execRes.executives.filter((e) => e.isActive !== false));
      }
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads(false);
  }, []);

  useEffect(() => {
    setTablePage(1);
  }, [search, priorityFilter, repFilter, stageFilter]);

  const moveStage = async (leadId, nextStage) => {
    const previous = leads;
    setLeads((prev) =>
      prev.map((l) => (l._id === leadId ? { ...l, status: nextStage } : l))
    );
    try {
      await crmApi.updateLeadStage(leadId, nextStage, `Moved to ${nextStage}`);
    } catch (err) {
      setLeads(previous);
      console.error("Failed to move stage:", err);
    }
  };

  const handleDeleteLead = async (leadId, leadNumber, customerName) => {
    if (!window.confirm(`Delete lead ${leadNumber} (${customerName})?`)) return;
    const previous = leads;
    setLeads((prev) => prev.filter((l) => l._id !== leadId));
    try {
      await crmApi.deleteLead(leadId);
    } catch (err) {
      setLeads(previous);
      alert(err.message || "Failed to delete lead");
    }
  };

  const execOptions = useMemo(() => {
    const fromDb = executives.map((e) => e.name);
    const defaults = ["Arpita", "Amit Kumar Sir", "Gaurav", "Vinod", "Danish", "Pradeep", "Khusi"];
    return Array.from(new Set([...fromDb, ...defaults]));
  }, [executives]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (priorityFilter !== "ALL" && l.priority !== priorityFilter) return false;
      if (stageFilter !== "ALL" && l.status !== stageFilter) return false;

      if (repFilter === "UNASSIGNED") {
        if (l.assignedEmployeeName && l.assignedEmployeeName !== "Unassigned") return false;
      } else if (repFilter !== "ALL") {
        if (!l.assignedEmployeeName?.toLowerCase().includes(repFilter.toLowerCase())) {
          return false;
        }
      }

      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (
        l.customerName?.toLowerCase().includes(s) ||
        l.phone?.toLowerCase().includes(s) ||
        l.leadNumber?.toLowerCase().includes(s) ||
        l.businessName?.toLowerCase().includes(s) ||
        l.assignedEmployeeName?.toLowerCase().includes(s) ||
        l.city?.toLowerCase().includes(s) ||
        l.pincode?.toLowerCase().includes(s)
      );
    });
  }, [leads, priorityFilter, stageFilter, repFilter, search]);

  const metrics = useMemo(() => {
    const won = filteredLeads.filter((l) => l.status === "CONVERTED").length;
    const lost = filteredLeads.filter((l) => l.status === "LOST").length;
    const active = filteredLeads.length - won - lost;
    const totalVal = filteredLeads.reduce((acc, l) => acc + (Number(l.estimatedValue) || 0), 0);
    return { total: filteredLeads.length, won, lost, active, totalVal };
  }, [filteredLeads]);

  const exportPipelineCsv = () => {
    if (!filteredLeads.length) {
      alert("No leads match the current filters.");
      return;
    }
    const headers = [
      "Lead ID",
      "Customer Name",
      "Business Name",
      "Phone",
      "City",
      "State",
      "PIN Code",
      "Stage",
      "Priority",
      "Assigned Executive",
      "Deal Value (INR)",
      "Follow-up Date",
      "Loss Reason",
      "Latest Remark",
      "Created At",
    ];
    const rows = filteredLeads.map((l) => [
      l.leadNumber || "",
      l.customerName || "",
      l.businessName || "",
      l.phone || "",
      l.city || "",
      l.state || "",
      l.pincode || "",
      l.status || "",
      l.priority || "",
      l.assignedEmployeeName || "Unassigned",
      l.estimatedValue || 0,
      l.followupDate ? new Date(l.followupDate).toLocaleDateString("en-IN") : "",
      l.lossReason || "",
      l.internalNotes?.length ? l.internalNotes[l.internalNotes.length - 1] : "",
      l.createdAt ? new Date(l.createdAt).toLocaleString("en-IN") : "",
    ]);
    const csv =
      "\uFEFF" +
      [headers, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RN_Valves_Pipeline_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#F8FAFC] dark:bg-slate-950 transition-colors">
      <Header
        title="Sales Pipeline"
        subtitle="Track, update, assign, and export WhatsApp inquiries across 7 conversion stages"
        onRefresh={() => fetchLeads(true)}
        loading={loading}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportPipelineCsv}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel ({filteredLeads.length})</span>
            </button>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700">
              <button
                onClick={() => setViewMode("kanban")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === "kanban"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Kanban className="w-3.5 h-3.5 text-[#1091d0]" />
                <span className="hidden sm:inline">Board</span>
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === "table"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <TableIcon className="w-3.5 h-3.5 text-[#1091d0]" />
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>
          </div>
        }
      />

      {/* Minimalist Summary & Filter Bar */}
      <div className="px-4 sm:px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
        {/* Compact KPI Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold">
              Total: <strong>{metrics.total}</strong>
            </span>
            <span className="px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200/70 dark:border-sky-800/50 font-semibold">
              Active Follow-up: <strong>{metrics.active}</strong>
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/50 font-semibold">
              Won: <strong>{metrics.won}</strong>
            </span>
            <span className="px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/50 font-semibold">
              Lost: <strong>{metrics.lost}</strong>
            </span>
            <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/50 font-semibold">
              Pipeline Value: <strong>₹{metrics.totalVal.toLocaleString("en-IN")}</strong>
            </span>
          </div>

          <Button
            variant="subtle-warning"
            size="xs"
            onClick={() => setIsCleanModalOpen(true)}
            icon={Trash2}
          >
            Clean Test Leads
          </Button>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex-1 min-w-[240px] max-w-md">
            <Input
              type="text"
              placeholder="Search customer, phone, ID, PIN, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={Search}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#1091d0]"
            >
              <option value="ALL">All Executives</option>
              <option value="UNASSIGNED">Unassigned Only</option>
              {execOptions.map((rep) => (
                <option key={rep} value={rep}>
                  {rep}
                </option>
              ))}
            </select>

            {viewMode === "table" && (
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#1091d0]"
              >
                <option value="ALL">All Stages</option>
                {PIPELINE_STAGES.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.title}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700/80">
              {["ALL", "URGENT", "HIGH", "MEDIUM", "LOW"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-all ${
                    priorityFilter === p
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area: Kanban Board or Clean Minimalist Table */}
      {viewMode === "kanban" ? (
        <div className="flex-1 p-4 sm:p-5 overflow-x-auto">
          <div className="flex gap-4 min-w-max h-full">
            {PIPELINE_STAGES.map((stage) => {
              const stageLeads = filteredLeads.filter((l) => l.status === stage.id);

              return (
                <div
                  key={stage.id}
                  className="w-[290px] bg-slate-100/75 dark:bg-slate-900/70 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col max-h-full"
                >
                  {/* Stage Column Header */}
                  <div className="px-4 py-3 border-b border-slate-200/70 dark:border-slate-800 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 rounded-t-2xl">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                      <span className="font-semibold text-xs text-slate-800 dark:text-white">
                        {stage.title}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                      {stageLeads.length}
                    </span>
                  </div>

                  {/* Stage Cards */}
                  <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5">
                    {loading && leads.length === 0 ? (
                      <div className="space-y-2.5">
                        {[1, 2].map((s) => (
                          <div
                            key={s}
                            className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700 animate-pulse space-y-2.5"
                          >
                            <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                            <div className="h-7 w-full bg-slate-100 dark:bg-slate-700/60 rounded" />
                          </div>
                        ))}
                      </div>
                    ) : stageLeads.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-xs font-medium">
                        No leads in {stage.title.toLowerCase()}
                      </div>
                    ) : (
                      stageLeads.map((lead) => (
                        <div
                          key={lead._id}
                          className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/85 dark:border-slate-800 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.05)] hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col gap-2.5 group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono font-semibold text-slate-400">
                                {lead.leadNumber}
                              </span>
                              <button
                                onClick={() =>
                                  handleDeleteLead(lead._id, lead.leadNumber, lead.customerName)
                                }
                                title="Delete lead"
                                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-600 p-0.5 rounded transition-all"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <Badge
                              variant={
                                lead.priority === "URGENT"
                                  ? "danger"
                                  : lead.priority === "HIGH"
                                  ? "warning"
                                  : "neutral"
                              }
                              size="xs"
                            >
                              {lead.priority || "MEDIUM"}
                            </Badge>
                          </div>

                          <div>
                            <h4 className="font-semibold text-slate-900 dark:text-white text-[13px] leading-snug">
                              {lead.customerName}
                            </h4>
                            <a
                              href={`https://wa.me/${lead.phone?.replace(/[^0-9]/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 mt-0.5 font-mono font-medium"
                            >
                              <Phone className="w-3 h-3 shrink-0" />
                              {lead.phone}
                            </a>
                            {(lead.businessName || lead.city) && (
                              <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                                <Building className="w-3 h-3 text-slate-400 shrink-0" />
                                {[lead.businessName, lead.city].filter(Boolean).join(" • ")}
                              </p>
                            )}
                          </div>

                          {lead.requirementDescription && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-2 rounded-lg line-clamp-2 leading-relaxed">
                              {lead.requirementDescription}
                            </p>
                          )}

                          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 dark:border-slate-800">
                            <span className="font-bold text-slate-900 dark:text-white">
                              ₹{lead.estimatedValue ? Number(lead.estimatedValue).toLocaleString("en-IN") : "0"}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setManageModalTarget({
                                  leadId: lead._id,
                                  phone: lead.phone,
                                  customerName: lead.customerName,
                                  currentRep: lead.assignedEmployeeName || "Unassigned",
                                })
                              }
                              className="font-semibold text-[#0c7db5] dark:text-rn-300 bg-[#EEF6FF] dark:bg-rn-950/60 hover:bg-[#DCEBFF] px-2 py-0.5 rounded-md transition-colors"
                              title="Click to assign or reassign Sales Executive"
                            >
                              👤 {lead.assignedEmployeeName || "Assign Rep"}
                            </button>
                          </div>

                          {/* Card Actions: Update Follow-up + Advance */}
                          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                            <button
                              type="button"
                              onClick={() => setFollowupModalLead(lead)}
                              className="py-1.5 px-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Update</span>
                            </button>

                            {stage.id !== "CONVERTED" && stage.id !== "LOST" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const currentIndex = PIPELINE_STAGES.findIndex(
                                    (s) => s.id === stage.id
                                  );
                                  const nextStage = PIPELINE_STAGES[currentIndex + 1]?.id;
                                  if (nextStage) moveStage(lead._id, nextStage);
                                }}
                                className="py-1.5 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#DCEBFF] hover:text-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1 transition-colors"
                              >
                                <span>Next</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setManageModalTarget({
                                    leadId: lead._id,
                                    phone: lead.phone,
                                    customerName: lead.customerName,
                                    currentRep: lead.assignedEmployeeName || "Unassigned",
                                  })
                                }
                                className="py-1.5 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1 transition-colors"
                              >
                                <UserCog className="w-3 h-3" />
                                <span>Reassign</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Clean White Minimalist Table View */
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <Card>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 text-xs">
                <thead>
                  <tr>
                    <th className="px-4 py-3">Lead & Customer</th>
                    <th className="px-4 py-3">WhatsApp / Phone</th>
                    <th className="px-4 py-3">Location / PIN</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Sales Executive</th>
                    <th className="px-4 py-3 text-end">Deal Value</th>
                    <th className="px-4 py-3">Next Follow-up</th>
                    <th className="px-4 py-3 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No leads match your current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLeads
                      .slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize)
                      .map((lead) => {
                        const currentStageObj =
                          PIPELINE_STAGES.find((s) => s.id === lead.status) || PIPELINE_STAGES[0];

                        return (
                          <tr key={lead._id}>
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-slate-900 dark:text-white text-[13px]">
                                {lead.customerName}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                {lead.leadNumber}
                                {lead.businessName ? ` • ${lead.businessName}` : ""}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 font-mono">
                              <a
                                href={`https://wa.me/${lead.phone?.replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 font-medium"
                              >
                                <Phone className="w-3 h-3" />
                                {lead.phone}
                              </a>
                            </td>
                            <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                              <div>{lead.city || lead.state || "India"}</div>
                              {lead.pincode && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  PIN: {lead.pincode}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <Badge variant={currentStageObj.variant} size="xs">
                                {currentStageObj.title}
                              </Badge>
                            </td>
                            <td className="px-4 py-3.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setManageModalTarget({
                                    leadId: lead._id,
                                    phone: lead.phone,
                                    customerName: lead.customerName,
                                    currentRep: lead.assignedEmployeeName || "Unassigned",
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-[#EEF6FF] dark:bg-rn-950/60 hover:bg-[#DCEBFF] text-[#0c7db5] dark:text-rn-300 font-semibold transition-colors"
                              >
                                👤 {lead.assignedEmployeeName || "Unassigned"}
                              </button>
                            </td>
                            <td className="px-4 py-3.5 text-end font-bold text-slate-900 dark:text-white">
                              ₹{lead.estimatedValue ? Number(lead.estimatedValue).toLocaleString("en-IN") : "0"}
                            </td>
                            <td className="px-4 py-3.5 text-slate-500">
                              {lead.followupDate
                                ? new Date(lead.followupDate).toLocaleDateString("en-IN")
                                : "—"}
                            </td>
                            <td className="px-4 py-3.5 text-end">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setFollowupModalLead(lead)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 font-semibold inline-flex items-center gap-1 transition-colors"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  <span>Update</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteLead(lead._id, lead.leadNumber, lead.customerName)
                                  }
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="Delete lead"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              totalItems={filteredLeads.length}
              currentPage={tablePage}
              pageSize={tablePageSize}
              onPageChange={setTablePage}
              onPageSizeChange={(s) => {
                setTablePageSize(s);
                setTablePage(1);
              }}
              itemName="pipeline leads"
            />
          </Card>
        </div>
      )}

      {/* Update Follow-up, Outcome & Deal Value Modal */}
      <LeadFollowupModal
        isOpen={!!followupModalLead}
        onClose={() => setFollowupModalLead(null)}
        lead={followupModalLead}
        onSuccess={() => fetchLeads(true)}
      />

      {/* Assign / Reassign Sales Executive Modal */}
      <ManageAssignmentModal
        isOpen={!!manageModalTarget}
        onClose={() => setManageModalTarget(null)}
        target={manageModalTarget}
        executives={executives}
        onSuccess={() => fetchLeads(true)}
      />

      {/* Clean Test Number Modal */}
      <CleanTestModal
        isOpen={isCleanModalOpen}
        onClose={() => setIsCleanModalOpen(false)}
        onCleaned={() => fetchLeads(true)}
      />
    </div>
  );
}
