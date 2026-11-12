"use client";

import { useEffect, useState } from "react";
import Header from "../components/Header";
import SalesExecutiveModal from "../components/SalesExecutiveModal";
import { crmApi } from "../lib/api";
import {
  Users,
  Kanban,
  MessageSquare,
  Bot,
  UserCheck,
  TrendingUp,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
  Settings,
  Trash2,
  X,
  RefreshCw,
} from "lucide-react";

export default function OverviewDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExecModalOpen, setIsExecModalOpen] = useState(false);
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);
  const [cleanPhoneInput, setCleanPhoneInput] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState("");

  const handleCleanTestNumber = async (e) => {
    e.preventDefault();
    if (!cleanPhoneInput.trim()) return;
    setCleaning(true);
    setCleanMsg("");
    try {
      const res = await crmApi.cleanTestNumberLeads(cleanPhoneInput.trim());
      setCleanMsg(res.message || "Successfully cleaned test leads!");
      await fetchDashboardData();
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

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await crmApi.getDashboardStats();
      setData(res);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError("Unable to connect to RN CRM backend. Retrying...");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const summary = data?.summary || {
    totalContacts: 0,
    totalLeads: 0,
    newLeadsToday: 0,
    activeConversations: 0,
    aiConversations: 0,
    humanConversations: 0,
    conversionRate: 0,
    followupsPending: 0,
    followupsOverdue: 0,
  };

  const leadsByStage = data?.leadsByStage || {};
  const agentPerformance = data?.agentPerformance || [];

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto">
      <Header
        title="Executive Overview"
        subtitle="Live metrics from WhatsApp conversations, leads pipeline, and AI engine"
        onRefresh={fetchDashboardData}
        loading={loading}
      />

      <main className="p-8 space-y-8 max-w-7xl mx-auto w-full">
        {/* Error Alert if any */}
        {error && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={fetchDashboardData}
              className="px-3 py-1 bg-amber-200 text-amber-900 rounded font-medium text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {/* Quick Management Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 px-6 rounded-2xl border border-slate-200/90 shadow-sm">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Team & Data Control Center</h4>
            <p className="text-xs text-slate-500">Manage sales executive routing territories and purge test phone records</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCleanModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              <Trash2 className="w-4 h-4 text-amber-600" />
              Clean Test Leads
            </button>
            <button
              onClick={() => setIsExecModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-rn-600 hover:bg-rn-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-rn-600/20"
            >
              <Users className="w-4 h-4" />
              Manage Team
            </button>
          </div>
        </div>

        {/* 1. Core Key Performance Metrics (8 KPI cards) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Total Contacts */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Contacts</span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              {loading ? (
                <div className="space-y-2 py-1 animate-pulse">
                  <div className="h-8 w-20 bg-slate-200 rounded-lg"></div>
                  <div className="h-3 w-28 bg-slate-100 rounded"></div>
                </div>
              ) : (
                <>
                  <p className="text-3xl font-extrabold text-slate-900">{summary.totalContacts}</p>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <span className="text-emerald-600 font-semibold flex items-center">
                      <ArrowUpRight className="w-3.5 h-3.5" /> +12%
                    </span>
                    from last month
                  </p>
                </>
              )}
            </div>
          </div>

          {/* New Leads Today */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">New Leads Today</span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <Kanban className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              {loading ? (
                <div className="space-y-2 py-1 animate-pulse">
                  <div className="h-8 w-16 bg-slate-200 rounded-lg"></div>
                  <div className="h-3 w-32 bg-slate-100 rounded"></div>
                </div>
              ) : (
                <>
                  <p className="text-3xl font-extrabold text-slate-900">{summary.newLeadsToday}</p>
                  <p className="text-xs text-slate-500 mt-1">Total Pipeline: {summary.totalLeads} leads</p>
                </>
              )}
            </div>
          </div>

          {/* Dual-Mode Conversations */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Conversations</span>
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <MessageSquare className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              {loading ? (
                <div className="space-y-2 py-1 animate-pulse">
                  <div className="h-8 w-16 bg-slate-200 rounded-lg"></div>
                  <div className="h-3 w-36 bg-slate-100 rounded"></div>
                </div>
              ) : (
                <>
                  <p className="text-3xl font-extrabold text-slate-900">{summary.activeConversations}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    <span className="text-blue-600 font-medium flex items-center gap-1">
                      <Bot className="w-3.5 h-3.5" /> {summary.aiConversations} AI
                    </span>
                    <span className="text-slate-400">|</span>
                    <span className="text-slate-700 font-medium flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" /> {summary.humanConversations} Human
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Conversion Rate */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Lead Conversion Rate</span>
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              {loading ? (
                <div className="space-y-2 py-1 animate-pulse">
                  <div className="h-8 w-16 bg-slate-200 rounded-lg"></div>
                  <div className="h-3 w-36 bg-slate-100 rounded"></div>
                </div>
              ) : (
                <>
                  <p className="text-3xl font-extrabold text-slate-900">{summary.conversionRate}%</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {summary.followupsOverdue > 0 ? (
                      <span className="text-amber-600 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> {summary.followupsOverdue} Overdue Follow-ups
                      </span>
                    ) : (
                      "All follow-ups on schedule"
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 2. Pipeline Distribution & Stage Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Sales Pipeline Stages</h3>
                <p className="text-xs text-slate-500">Active deal volume across the 7 lead stages</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700">
                Live Distribution
              </span>
            </div>

            {loading ? (
              <div className="space-y-5 py-2">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <div key={n} className="space-y-2 animate-pulse">
                    <div className="flex justify-between items-center">
                      <div className="h-3 w-36 bg-slate-200 rounded"></div>
                      <div className="h-3 w-14 bg-slate-100 rounded"></div>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-200 rounded-full w-1/4"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { stage: "NEW", label: "New Inbound Inquiries", color: "bg-blue-500" },
                  { stage: "CONTACTED", label: "Contacted by Sales", color: "bg-sky-500" },
                  { stage: "INTERESTED", label: "Product Interest Qualified", color: "bg-indigo-500" },
                  { stage: "QUOTATION_SENT", label: "Quotation & Pricing Sent", color: "bg-purple-500" },
                  { stage: "NEGOTIATION", label: "Wholesale Negotiation", color: "bg-amber-500" },
                  { stage: "CONVERTED", label: "Orders Won / Converted", color: "bg-emerald-500" },
                  { stage: "LOST", label: "Lost / Disqualified", color: "bg-rose-500" },
                ].map((item) => {
                  const count = leadsByStage[item.stage] || 0;
                  const max = Math.max(...Object.values(leadsByStage), 1);
                  const percent = Math.round((count / max) * 100);

                  return (
                    <div key={item.stage} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-700">{item.label}</span>
                        <span className="font-bold text-slate-900">{count} leads</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-500`}
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Sales Team Performance */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Top Sales Executives</h3>
                  <span className="text-[11px] text-slate-400">Response & Conversion</span>
                </div>
                <button
                  onClick={() => setIsExecModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rn-700 bg-rn-50 hover:bg-rn-100 border border-rn-200 transition-colors shadow-sm"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Manage Team
                </button>
              </div>

              {loading ? (
                <div className="divide-y divide-slate-100">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <div key={n} className="py-3 flex items-center justify-between animate-pulse">
                      <div className="space-y-2">
                        <div className="h-3.5 w-24 bg-slate-200 rounded"></div>
                        <div className="h-2.5 w-36 bg-slate-100 rounded"></div>
                      </div>
                      <div className="space-y-1 text-right">
                        <div className="h-4 w-6 bg-slate-200 rounded ml-auto"></div>
                        <div className="h-2.5 w-8 bg-slate-100 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1">
                  {agentPerformance.map((agent, i) => (
                    <div key={i} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{agent.name}</p>
                        <p className="text-xs text-slate-500">
                          {agent.leadsHandled} leads handled • Avg {agent.responseTimeAvg}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-emerald-600">{agent.converted}</span>
                        <p className="text-[10px] text-slate-400">Won</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 mt-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-rn-600" />
                Verified RN Catalog Guardrails
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                AI replies strictly cite approved prices and specs from MongoDB read-only repository.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Sales Executive & Territory Manager Modal */}
      <SalesExecutiveModal
        isOpen={isExecModalOpen}
        onClose={() => setIsExecModalOpen(false)}
        onUpdated={fetchDashboardData}
      />

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
