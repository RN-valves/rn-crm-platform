"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import CleanTestModal from "../../components/CleanTestModal";
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
  RefreshCw,
  Clock,
  Sparkles,
  ExternalLink,
} from "lucide-react";

const PIPELINE_STAGES = [
  { id: "NEW", title: "New Inquiries", variant: "info" },
  { id: "CONTACTED", title: "Contacted", variant: "primary" },
  { id: "INTERESTED", title: "Interested", variant: "indigo" },
  { id: "QUOTATION_SENT", title: "Quotation Sent", variant: "purple" },
  { id: "NEGOTIATION", title: "Negotiation", variant: "warning" },
  { id: "CONVERTED", title: "Converted", variant: "success" },
  { id: "LOST", title: "Lost", variant: "danger" },
];

export default function LeadsKanban() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("kanban"); // "kanban" | "table"
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [repFilter, setRepFilter] = useState("ALL");
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);

  const SALES_EXECUTIVES = [
    "ALL",
    "Arpita",
    "Amit Kumar Sir",
    "Gaurav",
    "Vinod",
    "Danish",
    "Pradeep",
    "Khusi",
  ];

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await crmApi.getLeads();
      setLeads(res.leads || []);
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const moveStage = async (leadId, nextStage) => {
    try {
      await crmApi.updateLeadStage(leadId, nextStage, `Moved to ${nextStage}`);
      setLeads((prev) =>
        prev.map((l) => (l._id === leadId ? { ...l, status: nextStage } : l))
      );
    } catch (err) {
      console.error("Failed to move stage:", err);
    }
  };

  const handleDeleteLead = async (leadId, leadNumber, customerName) => {
    if (!window.confirm(`Are you sure you want to delete lead ${leadNumber} (${customerName})?`)) return;
    try {
      await crmApi.deleteLead(leadId);
      setLeads((prev) => prev.filter((l) => l._id !== leadId));
    } catch (err) {
      alert(err.message || "Failed to delete lead");
    }
  };

  const filteredLeads = leads.filter((l) => {
    const matchesPriority = priorityFilter === "ALL" || l.priority === priorityFilter;
    const matchesRep =
      repFilter === "ALL" ||
      l.assignedEmployeeName?.toLowerCase().includes(repFilter.toLowerCase());

    const s = search.toLowerCase();
    const matchesSearch =
      !search ||
      l.customerName?.toLowerCase().includes(s) ||
      l.phone?.toLowerCase().includes(s) ||
      l.leadNumber?.toLowerCase().includes(s) ||
      l.businessName?.toLowerCase().includes(s) ||
      l.assignedEmployeeName?.toLowerCase().includes(s) ||
      l.city?.toLowerCase().includes(s);

    return matchesPriority && matchesRep && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors">
      <Header
        title="Sales Pipeline"
        subtitle="Manage inbound WhatsApp leads across 7 conversion stages"
        onRefresh={fetchLeads}
        loading={loading}
        actions={
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                viewMode === "kanban"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              title="Kanban Board View"
            >
              <Kanban className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kanban</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                viewMode === "table"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
              title="Table List View"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>
        }
      />

      {/* Filter and Action Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[260px] max-w-md">
          <Input
            type="text"
            placeholder="Search leads by customer, phone, ID, territory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={Search}
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Executive Filter Dropdown */}
          <div className="flex items-center gap-1.5 text-xs">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
              Executive:
            </span>
            <select
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value)}
              className="px-2.5 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rn-500/20"
            >
              {SALES_EXECUTIVES.map((rep) => (
                <option key={rep} value={rep}>
                  {rep === "ALL" ? "All Sales Executives" : rep}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filters */}
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
            {["ALL", "URGENT", "HIGH", "MEDIUM", "LOW"].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                  priorityFilter === p
                    ? "bg-rn-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Clean Test Leads Button */}
          <Button
            variant="subtle-warning"
            size="sm"
            onClick={() => setIsCleanModalOpen(true)}
            icon={Trash2}
          >
            Clean Test Leads
          </Button>
        </div>
      </div>

      {/* Main Content Area: Kanban or Table */}
      {viewMode === "kanban" ? (
        /* Kanban Board Horizontal Scroll */
        <div className="flex-1 p-4 sm:p-6 overflow-x-auto bg-slate-100/60 dark:bg-slate-950">
          <div className="flex gap-4 min-w-max h-full">
            {PIPELINE_STAGES.map((stage) => {
              const stageLeads = filteredLeads.filter((l) => l.status === stage.id);

              return (
                <div
                  key={stage.id}
                  className="w-72 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm rounded-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col max-h-full shadow-sm"
                >
                  {/* Stage Header */}
                  <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {stage.title}
                      </span>
                      <Badge variant={stage.variant} size="xs">
                        {stageLeads.length}
                      </Badge>
                    </div>
                  </div>

                  {/* Stage Cards Stream */}
                  <div className="flex-1 p-3 overflow-y-auto space-y-3">
                    {loading ? (
                      <div className="space-y-3">
                        {[1, 2].map((s) => (
                          <div
                            key={s}
                            className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 animate-pulse space-y-3"
                          >
                            <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded"></div>
                            <div className="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded"></div>
                            <div className="h-8 w-full bg-slate-100 dark:bg-slate-700/60 rounded"></div>
                          </div>
                        ))}
                      </div>
                    ) : stageLeads.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-xs font-medium">
                        No leads in this stage
                      </div>
                    ) : (
                      stageLeads.map((lead) => (
                        <div
                          key={lead._id}
                          className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col gap-2.5 group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500">
                                {lead.leadNumber}
                              </span>
                              <button
                                onClick={() =>
                                  handleDeleteLead(
                                    lead._id,
                                    lead.leadNumber,
                                    lead.customerName
                                  )
                                }
                                title="Delete this lead"
                                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 p-0.5 rounded transition-all"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              {(lead.requirementDescription?.includes("Repeat") ||
                                lead.isDuplicateResolved) && (
                                <Badge variant="info" size="xs">
                                  🔄 Repeat
                                </Badge>
                              )}
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
                                {lead.priority}
                              </Badge>
                            </div>
                          </div>

                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                              {lead.customerName}
                            </h4>
                            <a
                              href={`https://wa.me/${lead.phone?.replace(/[^0-9]/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 mt-0.5 font-mono font-medium"
                            >
                              <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                              {lead.phone}
                            </a>
                            {lead.businessName && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                                <Building className="w-3 h-3 text-slate-400 shrink-0" />
                                {lead.businessName} ({lead.city || "India"})
                              </p>
                            )}
                          </div>

                          {lead.requirementDescription && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg line-clamp-2 leading-relaxed">
                              {lead.requirementDescription}
                            </p>
                          )}

                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <span className="font-extrabold text-slate-900 dark:text-white">
                              ₹{lead.estimatedValue ? lead.estimatedValue.toLocaleString("en-IN") : "0"}
                            </span>
                            <span className="font-semibold text-rn-700 dark:text-rn-300 bg-rn-50 dark:bg-rn-950/60 px-2 py-0.5 rounded-md border border-rn-100 dark:border-rn-900/40">
                              👤 {lead.assignedEmployeeName || "Unassigned"}
                            </span>
                          </div>

                          {/* Quick Advance Button */}
                          {stage.id !== "CONVERTED" && stage.id !== "LOST" && (
                            <button
                              onClick={() => {
                                const currentIndex = PIPELINE_STAGES.findIndex(
                                  (s) => s.id === stage.id
                                );
                                const nextStage = PIPELINE_STAGES[currentIndex + 1]?.id;
                                if (nextStage) moveStage(lead._id, nextStage);
                              }}
                              className="w-full mt-1 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rn-50 dark:hover:bg-rn-950/60 hover:text-rn-700 dark:hover:text-rn-300 text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <span>Advance Stage</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
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
        /* Table List View */
        <div className="flex-1 p-6 overflow-y-auto">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="p-4 px-5">Lead ID & Customer</th>
                    <th className="p-4">Contact</th>
                    <th className="p-4">Current Stage</th>
                    <th className="p-4">Priority</th>
                    <th className="p-4">Assigned Executive</th>
                    <th className="p-4">Est. Value</th>
                    <th className="p-4 text-right px-5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredLeads.map((lead) => {
                    const currentStageObj =
                      PIPELINE_STAGES.find((s) => s.id === lead.status) || PIPELINE_STAGES[0];

                    return (
                      <tr
                        key={lead._id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="p-4 px-5">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {lead.customerName}
                          </p>
                          <span className="text-[10px] font-mono text-slate-400">
                            {lead.leadNumber} • {lead.businessName || lead.city || "Direct Inquiry"}
                          </span>
                        </td>
                        <td className="p-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                          <a
                            href={`https://wa.me/${lead.phone?.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-emerald-600 flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3 text-emerald-600" />
                            {lead.phone}
                          </a>
                        </td>
                        <td className="p-4">
                          <Badge variant={currentStageObj.variant} size="xs">
                            {currentStageObj.title}
                          </Badge>
                        </td>
                        <td className="p-4">
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
                            {lead.priority}
                          </Badge>
                        </td>
                        <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">
                          👤 {lead.assignedEmployeeName || "Unassigned"}
                        </td>
                        <td className="p-4 font-extrabold text-slate-900 dark:text-white">
                          ₹{lead.estimatedValue ? lead.estimatedValue.toLocaleString("en-IN") : "0"}
                        </td>
                        <td className="p-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {lead.status !== "CONVERTED" && lead.status !== "LOST" && (
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => {
                                  const idx = PIPELINE_STAGES.findIndex((s) => s.id === lead.status);
                                  const next = PIPELINE_STAGES[idx + 1]?.id;
                                  if (next) moveStage(lead._id, next);
                                }}
                                icon={ArrowRight}
                              >
                                Advance
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() =>
                                handleDeleteLead(lead._id, lead.leadNumber, lead.customerName)
                              }
                              className="text-rose-500 hover:text-rose-700"
                              title="Delete lead"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Shared Clean Test Number Modal */}
      <CleanTestModal
        isOpen={isCleanModalOpen}
        onClose={() => setIsCleanModalOpen(false)}
        onCleaned={fetchLeads}
      />
    </div>
  );
}
