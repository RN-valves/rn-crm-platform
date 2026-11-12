"use client";

import { useEffect, useState } from "react";
import Header from "../components/Header";
import SalesExecutiveModal from "../components/SalesExecutiveModal";
import CleanTestModal from "../components/CleanTestModal";
import { crmApi } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Link from "next/link";
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
  Trash2,
  GitFork,
  CheckCircle2,
  ChevronRight,
  Phone,
  Sparkles,
  Calendar,
  Filter,
  CalendarDays,
} from "lucide-react";

export default function OverviewDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExecModalOpen, setIsExecModalOpen] = useState(false);
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);

  // Date Filter State
  const [period, setPeriod] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const DATE_PRESETS = [
    { id: "all", label: "All Time" },
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "7d", label: "Last 7 Days" },
    { id: "30d", label: "Last 30 Days" },
    { id: "this_month", label: "This Month" },
    { id: "custom", label: "Custom Range" },
  ];

  const fetchDashboardData = async (overrideParams = null) => {
    setLoading(true);
    setError(null);
    try {
      const activePeriod = overrideParams?.period !== undefined ? overrideParams.period : period;
      const activeStart = overrideParams?.startDate !== undefined ? overrideParams.startDate : startDate;
      const activeEnd = overrideParams?.endDate !== undefined ? overrideParams.endDate : endDate;

      const params = { period: activePeriod };
      if (activePeriod === "custom" && activeStart) {
        params.startDate = activeStart;
        if (activeEnd) params.endDate = activeEnd;
      }

      const res = await crmApi.getDashboardStats(params);
      setData(res);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError("Unable to connect to RN CRM backend. Please verify your connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData({ period: "all" });
  }, []);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod === "custom") {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
      fetchDashboardData({ period: newPeriod });
    }
  };

  const handleApplyCustom = () => {
    if (!startDate) return;
    fetchDashboardData({ period: "custom", startDate, endDate });
  };

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

  const stageColors = {
    NEW: "bg-blue-500",
    CONTACTED: "bg-sky-500",
    INTERESTED: "bg-indigo-500",
    QUOTATION_SENT: "bg-purple-500",
    NEGOTIATION: "bg-amber-500",
    CONVERTED: "bg-emerald-500",
    LOST: "bg-rose-500",
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors">
      <Header
        title="Executive Overview"
        subtitle="Live metrics from WhatsApp conversations, sales leads pipeline, and AI engine"
        onRefresh={fetchDashboardData}
        loading={loading}
      />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{error}</span>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={fetchDashboardData}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Prominent Team & Data Control Center Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Team & Data Control Center
              </h3>
              <Badge variant="primary" size="xs">
                Live Routing
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage sales executive state territories, PIN routing, and purge test phone records
            </p>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <Button
              variant="subtle-warning"
              size="sm"
              onClick={() => setIsCleanModalOpen(true)}
              icon={Trash2}
              className="flex-1 sm:flex-none"
            >
              Clean Test Leads
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsExecModalOpen(true)}
              icon={Users}
              className="flex-1 sm:flex-none"
            >
              Manage Team
            </Button>
          </div>
        </div>

        {/* Date Range Filter Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Date Range Filter
                </span>
                <Badge variant="primary" size="xs">
                  {data?.filter?.periodLabel || (DATE_PRESETS.find(p => p.id === period)?.label || "All Time")}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Filter inquiries, sales stages, and executive distribution by timeline
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/90 dark:bg-slate-800/90 p-1.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            {DATE_PRESETS.map((p) => {
              const isActive = period === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handlePeriodChange(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/80 dark:border-slate-700"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Range Picker Drawer */}
        {showCustomPicker && (
          <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-white dark:from-slate-900 dark:via-slate-850 dark:to-slate-900 p-4 rounded-2xl border border-blue-200/70 dark:border-blue-900/40 shadow-sm flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Select Custom Dates:
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyCustom}
                disabled={!startDate}
                className="text-xs"
              >
                Apply Range
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  handlePeriodChange("all");
                }}
                className="text-xs text-slate-500"
              >
                Reset
              </Button>
            </div>
          </div>
        )}

        {/* Core KPI Metrics Grid (Primary Row) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Contacts */}
          <Card hover>
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Total Contacts
                </span>
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                {loading ? (
                  <div className="space-y-2 py-1 animate-pulse">
                    <div className="h-8 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                    <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                  </div>
                ) : (
                  <>
                    <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      {summary.totalContacts}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
                        <ArrowUpRight className="w-3.5 h-3.5" /> +12%
                      </span>
                      from last month
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* New Leads in Period */}
          <Card hover>
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  {period === "all" ? "New Leads Today" : `Leads (${data?.filter?.periodLabel || "Selected"})`}
                </span>
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <Kanban className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                {loading ? (
                  <div className="space-y-2 py-1 animate-pulse">
                    <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                    <div className="h-3 w-32 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                  </div>
                ) : (
                  <>
                    <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      {period === "all" ? summary.newLeadsToday : summary.totalLeads}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {period === "all" ? (
                        <>
                          Total Pipeline:{" "}
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {summary.totalLeads} leads
                          </span>
                        </>
                      ) : (
                        <>
                          Filtered in{" "}
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {data?.filter?.periodLabel || period}
                          </span>
                        </>
                      )}
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Active Conversations */}
          <Card hover>
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Active Conversations
                </span>
                <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                {loading ? (
                  <div className="space-y-2 py-1 animate-pulse">
                    <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                    <div className="h-3 w-36 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                  </div>
                ) : (
                  <>
                    <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      {summary.activeConversations}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                        <Bot className="w-3.5 h-3.5" />
                        {summary.aiConversations} AI
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <UserCheck className="w-3.5 h-3.5" />
                        {summary.humanConversations} Human
                      </span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Lead Conversion Rate */}
          <Card hover>
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Conversion Rate
                </span>
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4">
                {loading ? (
                  <div className="space-y-2 py-1 animate-pulse">
                    <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                    <div className="h-3 w-32 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                  </div>
                ) : (
                  <>
                    <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      {summary.conversionRate}%
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {summary.followupsOverdue > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {summary.followupsOverdue} overdue tasks
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          All follow-ups on schedule
                        </span>
                      )}
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary KPI Cards (Follow-ups & AI Performance) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Pending Follow-ups
                </p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {summary.followupsPending}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Scheduled dealer check-ins
                </p>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-2xl">
                <Clock className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Overdue Follow-ups
                </p>
                <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                  {summary.followupsOverdue}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Requires immediate action
                </p>
              </div>
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-2xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  AI Auto-Resolution Rate
                </p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {summary.activeConversations > 0
                    ? Math.round((summary.aiConversations / summary.activeConversations) * 100)
                    : 85}
                  %
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Solved without agent intervention
                </p>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Split: Pipeline Progress & Top Sales Executives */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales Pipeline Stages (2 cols on lg) */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Sales Pipeline Stages</CardTitle>
                <CardDescription>
                  Active deal volume across the 7 WhatsApp sales stages
                </CardDescription>
              </div>
              <Link href="/distribution">
                <Button variant="outline" size="xs" icon={GitFork}>
                  Live Distribution
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { stage: "NEW", label: "New Inquiries", defaultCount: 15 },
                { stage: "CONTACTED", label: "Contacted by Sales", defaultCount: 0 },
                { stage: "INTERESTED", label: "Product Interest Qualified", defaultCount: 0 },
                { stage: "QUOTATION_SENT", label: "Quotation & Pricing Sent", defaultCount: 1 },
                { stage: "NEGOTIATION", label: "Wholesale Negotiation", defaultCount: 0 },
                { stage: "CONVERTED", label: "Orders Won / Converted", defaultCount: 1 },
                { stage: "LOST", label: "Lost / Disqualified", defaultCount: 0 },
              ].map((item) => {
                const count = leadsByStage[item.stage] !== undefined ? leadsByStage[item.stage] : item.defaultCount;
                const total = summary.totalLeads || 17;
                const percentage = total > 0 ? Math.min(Math.round((count / total) * 100), 100) : 0;
                const color = stageColors[item.stage] || "bg-rn-600";

                return (
                  <div key={item.stage} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.label}
                      </span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {count} leads{" "}
                        <span className="text-[11px] text-slate-400 font-normal">
                          ({percentage}%)
                        </span>
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${color}`}
                        style={{ width: `${Math.max(percentage, count > 0 ? 5 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Top Sales Executives Performance (1 col on lg) */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Top Sales Executives</CardTitle>
                <CardDescription>Territory response & deals won</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setIsExecModalOpen(true)}
              >
                Manage
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 text-center text-slate-400 text-xs font-medium space-y-2">
                  <div className="animate-spin w-5 h-5 border-2 border-rn-600 border-t-transparent rounded-full mx-auto" />
                  <p>Loading executives data...</p>
                </div>
              ) : agentPerformance.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No executive performance data found.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {agentPerformance.map((rep, idx) => (
                    <div
                      key={rep.name || idx}
                      className="p-3.5 px-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center border border-slate-200 dark:border-slate-700 shrink-0">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {rep.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {rep.leadsHandled} leads handled • Avg {rep.avgResponseTime || "4m"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {rep.convertedLeads || 0}
                        </span>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          Won
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* RN Catalog Guardrails note */}
              <div className="p-4 m-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700/60 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-rn-600" />
                  <span>Verified RN Catalog Guardrails</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  AI replies strictly cite approved prices, PDF catalogs, and specs from the MongoDB read-only repository.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Shared Modals */}
      <SalesExecutiveModal
        isOpen={isExecModalOpen}
        onClose={() => setIsExecModalOpen(false)}
        onUpdated={fetchDashboardData}
      />

      <CleanTestModal
        isOpen={isCleanModalOpen}
        onClose={() => setIsCleanModalOpen(false)}
        onCleaned={fetchDashboardData}
      />
    </div>
  );
}
