"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import {
  Users,
  Kanban,
  UserCheck,
  UserX,
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
} from "lucide-react";
import Link from "next/link";

export default function LeadDistributionPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("executives"); // "executives", "leads", "dropped", "human"
  const [selectedRepFilter, setSelectedRepFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [reassigningId, setReassigningId] = useState(null);
  const [reassignMsg, setReassignMsg] = useState("");

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
      setReassignMsg(`Lead assigned to ${newRepName}!`);
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
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-50">
      <Header
        title="Lead Distribution & Funnel Drop-offs"
        subtitle="Full transparency: which rep got leads, unassigned leads, dropped at 'Hi', and human handovers"
        onRefresh={fetchData}
        loading={loading}
      />

      <main className="p-8 space-y-8 max-w-7xl mx-auto w-full">
        {reassignMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-between animate-in fade-in">
            <span>✅ {reassignMsg}</span>
          </div>
        )}

        {/* 1. High-Level Performance Metric Cards (6 KPI tiles) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Total Inquiries */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Inquiries</span>
              <MessageSquare className="w-4 h-4 text-blue-500" />
            </div>
            <div className="mt-3">
              {loading ? (
                <div className="h-7 w-12 bg-slate-200 rounded animate-pulse"></div>
              ) : (
                <p className="text-2xl font-black text-slate-900">{summary.totalInquiries}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-0.5">Started WhatsApp chat</p>
            </div>
          </div>

          {/* Fully Qualified Leads */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Formed Leads</span>
              <Kanban className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-3">
              {loading ? (
                <div className="h-7 w-12 bg-slate-200 rounded animate-pulse"></div>
              ) : (
                <p className="text-2xl font-black text-emerald-700">{summary.totalLeads}</p>
              )}
              <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                {summary.leadCompletionRate}% Qualified
              </p>
            </div>
          </div>

          {/* Assigned Leads */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Assigned to Reps</span>
              <UserCheck className="w-4 h-4 text-rn-600" />
            </div>
            <div className="mt-3">
              {loading ? (
                <div className="h-7 w-12 bg-slate-200 rounded animate-pulse"></div>
              ) : (
                <p className="text-2xl font-black text-rn-700">{summary.totalAssignedLeads}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-0.5">Routed by Area PIN</p>
            </div>
          </div>

          {/* Unassigned Leads (Nahi gaye) */}
          <div
            className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between cursor-pointer transition-all ${
              summary.totalUnassignedLeads > 0
                ? "bg-rose-50/60 border-rose-300 ring-2 ring-rose-200"
                : "bg-white border-slate-200"
            }`}
            onClick={() => {
              setActiveTab("leads");
              setSelectedRepFilter("UNASSIGNED");
            }}
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                Unassigned (Nahi Gaye)
              </span>
              <UserX className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-3">
              {loading ? (
                <div className="h-7 w-12 bg-slate-200 rounded animate-pulse"></div>
              ) : (
                <p className="text-2xl font-black text-rose-700">{summary.totalUnassignedLeads}</p>
              )}
              <p className="text-[10px] text-rose-600 font-bold mt-0.5 flex items-center gap-1">
                {summary.totalUnassignedLeads > 0 ? "Needs Routing ⚠️" : "All Leads Routed ✅"}
              </p>
            </div>
          </div>

          {/* Dropped Off at "Hi" */}
          <div
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between cursor-pointer hover:border-amber-400 transition-colors"
            onClick={() => setActiveTab("dropped")}
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Dropped at "Hi"
              </span>
              <PhoneMissed className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-3">
              {loading ? (
                <div className="h-7 w-12 bg-slate-200 rounded animate-pulse"></div>
              ) : (
                <p className="text-2xl font-black text-amber-700">{summary.totalDroppedAtHi}</p>
              )}
              <p className="text-[10px] text-slate-500 mt-0.5">Hi karke chhod diya</p>
            </div>
          </div>

          {/* Human Handover */}
          <div
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between cursor-pointer hover:border-purple-400 transition-colors"
            onClick={() => setActiveTab("human")}
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800">
                Human Takeover
              </span>
              <Bot className="w-4 h-4 text-purple-600" />
            </div>
            <div className="mt-3">
              {loading ? (
                <div className="h-7 w-12 bg-slate-200 rounded animate-pulse"></div>
              ) : (
                <p className="text-2xl font-black text-purple-700">{summary.totalHumanTakeovers}</p>
              )}
              <p className="text-[10px] text-slate-500 mt-0.5">Human mode active</p>
            </div>
          </div>
        </div>

        {/* 2. Interactive Navigation Tabs */}
        <div className="border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("executives")}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "executives"
                  ? "border-rn-600 text-rn-700 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Sales Rep Distribution Matrix ({executives.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("leads")}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "leads"
                  ? "border-rn-600 text-rn-700 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <Kanban className="w-4 h-4" />
              <span>All Leads Breakdown ({allLeads.length})</span>
              {summary.totalUnassignedLeads > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 text-[10px] rounded-full font-bold">
                  {summary.totalUnassignedLeads} unassigned
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("dropped")}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "dropped"
                  ? "border-amber-600 text-amber-800 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <PhoneMissed className="w-4 h-4 text-amber-600" />
              <span>Dropped Off at "Hi" ({droppedAtHi.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("human")}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "human"
                  ? "border-purple-600 text-purple-800 bg-white shadow-sm"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <Bot className="w-4 h-4 text-purple-600" />
              <span>Human Takeovers ({humanTakeovers.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative pb-2">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search phone, rep, city, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rn-500 shadow-sm w-64"
            />
          </div>
        </div>

        {/* TAB 1: SALES EXECUTIVE DISTRIBUTION MATRIX */}
        {activeTab === "executives" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Executive Territory Allocation & Live Performance
                  </h3>
                  <p className="text-xs text-slate-500">
                    Routing determined dynamically by Customer Area PIN code match
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">
                  {summary.totalAssignedLeads} Routed Leads
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Sales Executive</th>
                      <th className="px-6 py-4">Assigned State / Region</th>
                      <th className="px-6 py-4">Contact Mobile</th>
                      <th className="px-6 py-4 text-center">Total Leads</th>
                      <th className="px-6 py-4 text-center">Won / Converted</th>
                      <th className="px-6 py-4 text-center">In Progress</th>
                      <th className="px-6 py-4">Share of Leads</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      [1, 2, 3, 4, 5, 6, 7].map((k) => (
                        <tr key={k} className="animate-pulse">
                          <td className="px-6 py-4">
                            <div className="h-3.5 w-24 bg-slate-200 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-32 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-24 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="h-4 w-6 bg-slate-200 rounded mx-auto"></div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="h-4 w-6 bg-slate-100 rounded mx-auto"></div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="h-4 w-6 bg-slate-100 rounded mx-auto"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-2 w-28 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="h-6 w-16 bg-slate-200 rounded ml-auto"></div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <>
                        {executives.map((ex) => (
                          <tr key={ex.name} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-900 text-sm">{ex.name}</div>
                              <span className="text-[10px] text-slate-400">RN Sales Executive</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-medium text-slate-700">{ex.state}</span>
                              <p className="text-[10px] text-slate-400 truncate max-w-xs">{ex.area}</p>
                            </td>
                            <td className="px-6 py-4 font-mono text-slate-600 font-medium">
                              <span className="flex items-center gap-1.5">
                                <Phone className="w-3 h-3 text-emerald-600" />
                                {ex.mobile}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center font-bold text-sm text-slate-900">
                              <span
                                className={`px-2.5 py-1 rounded-full ${
                                  ex.leadsCount > 0 ? "bg-rn-50 text-rn-700 font-extrabold" : "text-slate-400"
                                }`}
                              >
                                {ex.leadsCount}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center font-bold text-emerald-600">
                              {ex.convertedCount}
                            </td>
                            <td className="px-6 py-4 text-center font-semibold text-slate-700">
                              {ex.inProgressCount}
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span className="font-bold text-slate-700">{ex.sharePercent}%</span>
                                  <span className="text-slate-400">
                                    ₹{ex.totalEstimatedValue ? ex.totalEstimatedValue.toLocaleString("en-IN") : "0"}
                                  </span>
                                </div>
                                <div className="h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-rn-600 rounded-full transition-all"
                                    style={{ width: `${ex.sharePercent}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => {
                                  setActiveTab("leads");
                                  setSelectedRepFilter(ex.name);
                                }}
                                className="px-3 py-1 bg-slate-100 hover:bg-rn-50 hover:text-rn-700 text-slate-600 font-bold rounded-lg transition-colors text-[11px]"
                              >
                                View Leads →
                              </button>
                            </td>
                          </tr>
                        ))}

                        {/* Unassigned Leads Row */}
                        <tr
                          className={`border-t-2 ${
                            summary.totalUnassignedLeads > 0
                              ? "bg-rose-50/70 border-rose-200"
                              : "bg-slate-50/40 border-slate-200"
                          }`}
                        >
                          <td className="px-6 py-4">
                            <div className="font-bold text-rose-800 text-sm flex items-center gap-1.5">
                              <UserX className="w-4 h-4 text-rose-600" />
                              Unassigned / Unrouted
                            </div>
                            <span className="text-[10px] text-rose-600">
                              PIN not matched to any territory
                            </span>
                          </td>
                          <td className="px-6 py-4 text-rose-700 text-xs italic">
                            Unmapped Pin Codes
                          </td>
                          <td className="px-6 py-4 text-slate-400 font-mono text-xs">—</td>
                          <td className="px-6 py-4 text-center font-black text-rose-700 text-sm">
                            <span className="px-2.5 py-1 bg-rose-100 rounded-full">
                              {summary.totalUnassignedLeads}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center text-slate-400">—</td>
                          <td className="px-6 py-4 text-center font-bold text-rose-700">
                            {summary.totalUnassignedLeads}
                          </td>
                          <td className="px-6 py-4 text-xs text-rose-700 font-semibold">
                            {summary.totalUnassignedLeads > 0 ? "Requires Manual Assignment" : "None pending"}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {summary.totalUnassignedLeads > 0 && (
                              <button
                                onClick={() => {
                                  setActiveTab("leads");
                                  setSelectedRepFilter("UNASSIGNED");
                                }}
                                className="px-3 py-1 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 text-[11px] shadow-sm"
                              >
                                Assign Now →
                              </button>
                            )}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DETAILED LEADS LIST (Assigned vs Unassigned) */}
        {activeTab === "leads" && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="font-bold text-slate-600">Filter by Rep:</span>
                {["ALL", "UNASSIGNED", ...executives.map((e) => e.name)].map((rep) => (
                  <button
                    key={rep}
                    onClick={() => setSelectedRepFilter(rep)}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all text-xs ${
                      selectedRepFilter === rep
                        ? rep === "UNASSIGNED"
                          ? "bg-rose-600 text-white shadow-sm"
                          : "bg-rn-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Lead ID</th>
                      <th className="px-6 py-4">Customer / Firm</th>
                      <th className="px-6 py-4">Phone Number</th>
                      <th className="px-6 py-4">Location & PIN</th>
                      <th className="px-6 py-4">Assigned Sales Executive</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Reassign Rep</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      [1, 2, 3, 4, 5].map((k) => (
                        <tr key={k} className="animate-pulse">
                          <td className="px-6 py-4">
                            <div className="h-3 w-16 bg-slate-200 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3.5 w-28 bg-slate-200 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-24 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-20 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-4 w-24 bg-slate-200 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-4 w-16 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="h-6 w-24 bg-slate-200 rounded ml-auto"></div>
                          </td>
                        </tr>
                      ))
                    ) : filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-xs">
                          No leads matching this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => {
                        const isUnassigned =
                          !lead.assignedEmployeeName || lead.assignedEmployeeName === "Unassigned";

                        return (
                          <tr
                            key={lead._id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              isUnassigned ? "bg-rose-50/30" : ""
                            }`}
                          >
                            <td className="px-6 py-4 font-mono font-bold text-slate-500">
                              {lead.leadNumber}
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-900">{lead.customerName}</div>
                              {lead.businessName && (
                                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Building className="w-3 h-3 text-slate-400" />
                                  {lead.businessName}
                                </p>
                              )}
                            </td>
                            <td className="px-6 py-4 font-mono text-slate-700">{lead.phone}</td>
                            <td className="px-6 py-4">
                              <span className="font-medium text-slate-700">
                                {lead.city || lead.state || "India"}
                              </span>
                              {lead.pincode && (
                                <p className="text-[10px] text-slate-400 font-mono">PIN: {lead.pincode}</p>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {isUnassigned ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                                  ⚠️ Not Assigned
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rn-50 text-rn-700 border border-rn-200">
                                  👤 {lead.assignedEmployeeName}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  lead.status === "CONVERTED"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : lead.status === "NEW"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {lead.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <select
                                disabled={reassigningId === lead._id}
                                defaultValue=""
                                onChange={(e) => {
                                  const selectedName = e.target.value;
                                  if (!selectedName) return;
                                  const exec = executives.find((x) => x.name === selectedName);
                                  handleReassignLead(lead._id, selectedName, exec?.mobile || "");
                                }}
                                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-rn-500 bg-white"
                              >
                                <option value="" disabled>
                                  {reassigningId === lead._id ? "Updating..." : "Change Rep..."}
                                </option>
                                {executives.map((ex) => (
                                  <option key={ex.name} value={ex.name}>
                                    Assign to {ex.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ABANDONED AT "HI" (Hi karke chhod diya) */}
        {activeTab === "dropped" && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-900">
              <h4 className="font-bold text-sm flex items-center gap-2">
                <PhoneMissed className="w-4 h-4 text-amber-600" />
                Incomplete Inquiries (Hi karke chhod diya)
              </h4>
              <p className="text-xs text-amber-800/80 mt-1 leading-relaxed">
                Ye wo WhatsApp visitors hain jinhone bot par message bheja ("Hi", "Hello", ya Language select ki) lekin qualification form poora kiye bina conversation chhod di. Aap inhe direct re-engage kar sakte hain.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Phone Number</th>
                      <th className="px-6 py-4">Captured Name</th>
                      <th className="px-6 py-4">Where Did They Drop Off?</th>
                      <th className="px-6 py-4">Total Messages Sent</th>
                      <th className="px-6 py-4">Last Active</th>
                      <th className="px-6 py-4 text-right">Re-engage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      [1, 2, 3, 4, 5].map((k) => (
                        <tr key={k} className="animate-pulse">
                          <td className="px-6 py-4">
                            <div className="h-3.5 w-28 bg-slate-200 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-20 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-48 bg-slate-200 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-8 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-24 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="h-6 w-20 bg-slate-200 rounded ml-auto"></div>
                          </td>
                        </tr>
                      ))
                    ) : filteredDropped.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xs">
                          No dropped off inquiries found!
                        </td>
                      </tr>
                    ) : (
                      filteredDropped.map((d) => (
                        <tr key={d._id || d.phone} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-slate-900 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-amber-600" />
                            {d.phone}
                          </td>
                          <td className="px-6 py-4 text-slate-700 font-medium">{d.name}</td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              {d.dropOffStage}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-800">
                            {d.totalEnquiriesCount} interactions
                          </td>
                          <td className="px-6 py-4 text-slate-500">
                            {new Date(d.lastContactedAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <a
                                href={`https://wa.me/${d.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                                  "Namaste! RN Valves & Faucets me aapka swagat hai. Kya aapko kisi product catalogue ya dealership ki jankari chahiye?"
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold rounded-lg text-[11px] flex items-center gap-1 shadow-sm"
                              >
                                <Send className="w-3 h-3" />
                                <span>WhatsApp</span>
                              </a>
                              <Link
                                href={`/inbox?phone=${d.phone}`}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] flex items-center gap-1"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>Chat</span>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: HUMAN TAKEOVER REQUESTS (Human me convert hue) */}
        {activeTab === "human" && (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 text-purple-900">
              <h4 className="font-bold text-sm flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-600" />
                Human Takeover Converted Inquiries
              </h4>
              <p className="text-xs text-purple-800/80 mt-1 leading-relaxed">
                Ye wo users hain jinhone bot flow se hatkar human executive se baat karne ki request ki. Inke chats par bot reply pause ho chuka hai aur ye live executive ke intervention ke liye pending hain.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Customer Phone</th>
                      <th className="px-6 py-4">Customer Name / Firm</th>
                      <th className="px-6 py-4">Handover Reason</th>
                      <th className="px-6 py-4">Assigned Agent / Team</th>
                      <th className="px-6 py-4">Last Message</th>
                      <th className="px-6 py-4 text-right">Inbox Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      [1, 2, 3, 4].map((k) => (
                        <tr key={k} className="animate-pulse">
                          <td className="px-6 py-4">
                            <div className="h-3.5 w-28 bg-slate-200 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-24 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-40 bg-slate-200 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-20 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="h-3 w-24 bg-slate-100 rounded"></div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="h-6 w-20 bg-slate-200 rounded ml-auto"></div>
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
                        <tr key={h._id || h.phone} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-slate-900">
                            {h.phone}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900">{h.customerName}</div>
                            {h.businessName && (
                              <p className="text-[11px] text-slate-500">{h.businessName}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                              {h.pauseReason}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-700 font-semibold">
                            👤 {h.assignedAgentName}
                          </td>
                          <td className="px-6 py-4 text-slate-500">
                            {new Date(h.lastCustomerMessageAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link
                              href={`/inbox?phone=${h.phone}`}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1 shadow-sm"
                            >
                              <span>Open Chat</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
