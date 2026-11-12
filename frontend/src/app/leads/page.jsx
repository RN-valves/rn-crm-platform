"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import {
  Kanban,
  Plus,
  Filter,
  Search,
  Calendar,
  Building,
  User,
  ArrowRight,
  Phone,
  CheckCircle,
  Trash2,
  RefreshCw,
  X,
  AlertTriangle,
} from "lucide-react";

const PIPELINE_STAGES = [
  { id: "NEW", title: "New Inquiries", color: "border-blue-500", badge: "bg-blue-100 text-blue-800" },
  { id: "CONTACTED", title: "Contacted", color: "border-sky-500", badge: "bg-sky-100 text-sky-800" },
  { id: "INTERESTED", title: "Interested", color: "border-indigo-500", badge: "bg-indigo-100 text-indigo-800" },
  { id: "QUOTATION_SENT", title: "Quotation Sent", color: "border-purple-500", badge: "bg-purple-100 text-purple-800" },
  { id: "NEGOTIATION", title: "Negotiation", color: "border-amber-500", badge: "bg-amber-100 text-amber-800" },
  { id: "CONVERTED", title: "Converted", color: "border-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  { id: "LOST", title: "Lost", color: "border-rose-500", badge: "bg-rose-100 text-rose-800" },
];

export default function LeadsKanban() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [repFilter, setRepFilter] = useState("ALL");
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);
  const [cleanPhoneInput, setCleanPhoneInput] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState("");

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

  const handleCleanTestNumber = async (e) => {
    e.preventDefault();
    if (!cleanPhoneInput.trim()) return;
    setCleaning(true);
    setCleanMsg("");
    try {
      const res = await crmApi.cleanTestNumberLeads(cleanPhoneInput.trim());
      setCleanMsg(res.message || "Successfully cleaned test leads!");
      await fetchLeads();
      setTimeout(() => {
        setIsCleanModalOpen(false);
        setCleanMsg("");
        setCleanPhoneInput("");
      }, 2500);
    } catch (err) {
      setCleanMsg(err.message || "Failed to clean test number");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <Header
        title="Sales Pipeline"
        subtitle="Manage inbound WhatsApp leads across sales stages"
        onRefresh={fetchLeads}
      />

      {/* Filter Bar */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search leads by customer, phone, lead ID, executive..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 rounded-lg border border-transparent focus:bg-white focus:border-rn-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Executive Filter Dropdown */}
          <div className="flex items-center gap-1.5 text-xs">
            <User className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-500 font-medium">Executive:</span>
            <select
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 border border-slate-200 text-slate-700 focus:outline-none focus:border-rn-500"
            >
              {SALES_EXECUTIVES.map((rep) => (
                <option key={rep} value={rep}>
                  {rep === "ALL" ? "All Sales Executives" : rep}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-medium">Priority:</span>
            {["ALL", "URGENT", "HIGH", "MEDIUM", "LOW"].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  priorityFilter === p ? "bg-rn-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Clean Test Number Button */}
          <button
            onClick={() => setIsCleanModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-colors shadow-sm ml-auto md:ml-0"
          >
            <Trash2 className="w-3.5 h-3.5 text-amber-600" />
            Clean Test Leads
          </button>
        </div>
      </div>

      {/* Kanban Board Horizontal Scroll Container */}
      <div className="flex-1 p-6 overflow-x-auto bg-slate-100/70">
        <div className="flex gap-5 min-w-max h-full">
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = leads.filter((l) => {
              const matchesStage = l.status === stage.id;
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

              return matchesStage && matchesPriority && matchesRep && matchesSearch;
            });

            return (
              <div
                key={stage.id}
                className="w-72 bg-slate-50/80 rounded-2xl border border-slate-200 flex flex-col max-h-full"
              >
                {/* Stage Header */}
                <div className="p-4 border-b border-slate-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900">{stage.title}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${stage.badge}`}>
                      {stageLeads.length}
                    </span>
                  </div>
                </div>

                {/* Stage Cards Stream */}
                <div className="flex-1 p-3 overflow-y-auto space-y-3">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead._id}
                      className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-bold text-slate-400">
                            {lead.leadNumber}
                          </span>
                          <button
                            onClick={() => handleDeleteLead(lead._id, lead.leadNumber, lead.customerName)}
                            title="Delete this lead"
                            className="text-slate-300 hover:text-rose-600 p-0.5 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          {(lead.requirementDescription?.includes("Repeat") || lead.isDuplicateResolved) && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                              🔄 Repeat
                            </span>
                          )}
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              lead.priority === "URGENT"
                                ? "bg-rose-100 text-rose-700"
                                : lead.priority === "HIGH"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {lead.priority}
                          </span>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">{lead.customerName}</h4>
                        <p className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5 font-mono font-medium">
                          <Phone className="w-3 h-3 text-emerald-600" />
                          {lead.phone}
                        </p>
                        {lead.businessName && (
                          <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Building className="w-3 h-3 text-slate-400" />
                            {lead.businessName} ({lead.city || "India"})
                          </p>
                        )}
                      </div>

                      {lead.requirementDescription && (
                        <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg line-clamp-2">
                          {lead.requirementDescription}
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                        <span className="font-bold text-slate-800">
                          ₹{lead.estimatedValue ? lead.estimatedValue.toLocaleString("en-IN") : "0"}
                        </span>
                        <span className="font-semibold text-rn-700 bg-rn-50 px-2 py-0.5 rounded">
                          👤 {lead.assignedEmployeeName || "Unassigned"}
                        </span>
                      </div>

                      {/* Quick Advance Button */}
                      {stage.id !== "CONVERTED" && stage.id !== "LOST" && (
                        <button
                          onClick={() => {
                            const currentIndex = PIPELINE_STAGES.findIndex((s) => s.id === stage.id);
                            const nextStage = PIPELINE_STAGES[currentIndex + 1]?.id;
                            if (nextStage) moveStage(lead._id, nextStage);
                          }}
                          className="w-full mt-1 py-1 rounded bg-slate-100 hover:bg-rn-50 hover:text-rn-700 text-[11px] font-semibold text-slate-600 flex items-center justify-center gap-1 transition-colors"
                        >
                          <span>Advance Stage</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}

                  {stageLeads.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-xs font-medium">
                      No leads in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Clean Test Number Modal */}
      {isCleanModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-sm">Purge Test Phone Leads</h3>
              </div>
              <button
                onClick={() => setIsCleanModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCleanTestNumber} className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                If you tested repeatedly with your phone number and generated dummy leads or distorted metrics, enter your phone number below. This will delete all lead records associated with that number and reset the active WhatsApp chat session.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Test Phone Number (10 digits or with +91)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 9811103377 or +919811103377"
                  value={cleanPhoneInput}
                  onChange={(e) => setCleanPhoneInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>

              {cleanMsg && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium ${
                    cleanMsg.includes("Failed") || cleanMsg.includes("error")
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  }`}
                >
                  {cleanMsg}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCleanModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cleaning || !cleanPhoneInput.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {cleaning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Purge Leads & Reset
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
