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
              placeholder="Search leads by customer, business, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 rounded-lg border border-transparent focus:bg-white focus:border-rn-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Priority:</span>
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
      </div>

      {/* Kanban Board Horizontal Scroll Container */}
      <div className="flex-1 p-6 overflow-x-auto bg-slate-100/70">
        <div className="flex gap-5 min-w-max h-full">
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = leads.filter(
              (l) =>
                l.status === stage.id &&
                (priorityFilter === "ALL" || l.priority === priorityFilter) &&
                (!search ||
                  l.customerName?.toLowerCase().includes(search.toLowerCase()) ||
                  l.businessName?.toLowerCase().includes(search.toLowerCase()) ||
                  l.city?.toLowerCase().includes(search.toLowerCase()))
            );

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
                        <span className="text-[10px] font-mono font-bold text-slate-400">
                          {lead.leadNumber}
                        </span>
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

                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">{lead.customerName}</h4>
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
                        <span>{lead.assignedEmployeeName || "Unassigned"}</span>
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
    </div>
  );
}
