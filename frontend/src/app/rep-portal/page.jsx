"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import { Card, CardContent } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Input from "../../components/ui/Input";
import LeadFollowupModal from "../../components/LeadFollowupModal";
import {
  UserCheck,
  Users,
  Phone,
  MessageSquare,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  Download,
  IndianRupee,
  MapPin,
  Calendar,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Send,
  Building,
  User,
  Sparkles,
} from "lucide-react";

function RepPortalContent() {
  const searchParams = useSearchParams();
  const queryRep = searchParams.get("rep");
  const queryPhone = searchParams.get("phone");

  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [activeRepName, setActiveRepName] = useState("");
  const [mobileLoginInput, setMobileLoginInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedLeadForFollowup, setSelectedLeadForFollowup] = useState(null);
  const [resendingLeadId, setResendingLeadId] = useState(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState("");

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await crmApi.getDistributionAnalytics();
      if (res.success && res.data) {
        setAnalyticsData(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch distribution analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Initialize active sales executive from query params or localStorage
  useEffect(() => {
    if (!analyticsData) return;
    const executives = analyticsData.executives || [];

    if (queryRep) {
      const match = executives.find(
        (e) => e.name.toLowerCase().includes(queryRep.toLowerCase())
      );
      if (match) {
        setActiveRepName(match.name);
        try {
          localStorage.setItem("rn_sales_rep_auth", match.name);
        } catch {}
        return;
      }
    }

    if (queryPhone) {
      const cleanQ = queryPhone.replace(/\D/g, "").slice(-10);
      const match = executives.find((e) => {
        const cleanE = (e.mobile || "").replace(/\D/g, "").slice(-10);
        return cleanE === cleanQ;
      });
      if (match) {
        setActiveRepName(match.name);
        try {
          localStorage.setItem("rn_sales_rep_auth", match.name);
        } catch {}
        return;
      }
    }

    // Try reading from localStorage
    try {
      const saved = localStorage.getItem("rn_sales_rep_auth");
      if (saved && executives.some((e) => e.name === saved)) {
        setActiveRepName(saved);
      }
    } catch {}
  }, [analyticsData, queryRep, queryPhone]);

  const executives = analyticsData?.executives || [];
  const repDistribution = analyticsData?.repDistribution || [];

  // Current logged in executive details
  const currentExec = useMemo(() => {
    if (!activeRepName) return null;
    return executives.find((e) => e.name === activeRepName) || null;
  }, [executives, activeRepName]);

  // Current executive's assigned leads
  const currentRepData = useMemo(() => {
    if (!activeRepName) return null;
    return repDistribution.find((rd) => rd.name === activeRepName) || null;
  }, [repDistribution, activeRepName]);

  const rawLeads = currentRepData?.leads || [];

  // Filtered leads
  const filteredLeads = useMemo(() => {
    return rawLeads.filter((l) => {
      // Status Filter
      if (statusFilter === "NEW" && l.status !== "NEW") return false;
      if (statusFilter === "IN_PROGRESS" && !["CONTACTED", "QUOTATION_SENT", "NEGOTIATION"].includes(l.status)) return false;
      if (statusFilter === "WON" && l.status !== "CONVERTED") return false;
      if (statusFilter === "LOST" && l.status !== "LOST") return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const phone = (l.phone || "").toLowerCase();
        const name = (l.customerName || "").toLowerCase();
        const city = (l.city || "").toLowerCase();
        const pin = (l.pincode || "").toLowerCase();
        const business = (l.businessName || "").toLowerCase();
        return phone.includes(q) || name.includes(q) || city.includes(q) || pin.includes(q) || business.includes(q);
      }

      return true;
    });
  }, [rawLeads, statusFilter, searchQuery]);

  // Handle Login by clicking executive card
  const handleSelectExecutive = (execName) => {
    setActiveRepName(execName);
    setLoginError("");
    try {
      localStorage.setItem("rn_sales_rep_auth", execName);
    } catch {}
  };

  // Handle Mobile Login
  const handleMobileLogin = (e) => {
    e.preventDefault();
    setLoginError("");
    const clean = mobileLoginInput.replace(/\D/g, "").slice(-10);
    if (!clean || clean.length < 10) {
      setLoginError("Kripya 10-digit registered mobile number enter karein.");
      return;
    }

    const match = executives.find((exec) => {
      const execMobile = (exec.mobile || "").replace(/\D/g, "").slice(-10);
      return execMobile === clean;
    });

    if (match) {
      setActiveRepName(match.name);
      try {
        localStorage.setItem("rn_sales_rep_auth", match.name);
      } catch {}
    } else {
      setLoginError(`Mobile number +91 ${clean} kisi registered Sales Executive se match nahi hua.`);
    }
  };

  // Handle Logout / Switch
  const handleLogout = () => {
    setActiveRepName("");
    try {
      localStorage.removeItem("rn_sales_rep_auth");
    } catch {}
  };

  // Resend Alert to Rep
  const handleResendRepAlert = async (lead) => {
    try {
      setResendingLeadId(lead._id);
      setActionSuccessMsg("");
      const res = await crmApi.resendRepAlert({
        leadId: lead._id,
        repName: currentExec?.name,
        repPhone: currentExec?.mobile,
      });
      setActionSuccessMsg(`WhatsApp alert resent to ${currentExec?.name} for lead ${lead.phone}!`);
      setTimeout(() => setActionSuccessMsg(""), 4000);
      await fetchAnalytics();
    } catch (err) {
      alert("Failed to resend alert: " + (err.message || "Unknown error"));
    } finally {
      setResendingLeadId(null);
    }
  };

  // Export Leads to CSV
  const exportToExcel = () => {
    if (!rawLeads || rawLeads.length === 0) {
      alert("Koi leads export karne ke liye nahi hain.");
      return;
    }

    const headers = [
      "Lead Number",
      "Customer Name",
      "Phone",
      "City",
      "State",
      "PIN Code",
      "Status",
      "Estimated Deal Value (INR)",
      "Next Followup Date",
      "Loss Reason",
      "Assigned Executive",
      "Inquiry Date",
    ];

    const rows = rawLeads.map((l) => [
      `"${l.leadNumber || ""}"`,
      `"${(l.customerName || "Customer").replace(/"/g, '""')}"`,
      `"${l.phone || ""}"`,
      `"${(l.city || "").replace(/"/g, '""')}"`,
      `"${(l.state || "").replace(/"/g, '""')}"`,
      `"${l.pincode || ""}"`,
      `"${l.status || "NEW"}"`,
      `"${l.estimatedValue || 0}"`,
      `"${l.followupDate ? new Date(l.followupDate).toLocaleDateString("en-IN") : "Not Set"}"`,
      `"${(l.lossReason || "").replace(/"/g, '""')}"`,
      `"${l.assignedEmployeeName || activeRepName}"`,
      `"${l.createdAt ? new Date(l.createdAt).toLocaleDateString("en-IN") : ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `RN_Valves_Leads_${activeRepName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading && !analyticsData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <RefreshCw className="w-8 h-8 text-rn-600 animate-spin mb-3" />
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
          Loading Sales Executive Portal...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-16">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* VIEW 1: LOGIN / SELECT EXECUTIVE SCREEN */}
        {!activeRepName ? (
          <div className="max-w-3xl mx-auto space-y-6 pt-6 animate-fadeIn">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rn-600 text-white shadow-lg shadow-rn-600/30 mb-2">
                <UserCheck className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                RN Valves & Faucets — Sales Executive Portal
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Apna profile select karein ya registered WhatsApp mobile number enter karke apni assigned leads aur follow-up status update karein.
              </p>
            </div>

            {/* Mobile Number Fast Login Card */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <Phone className="w-4 h-4 text-rn-600" />
                <span>Quick Login with Registered Mobile Number</span>
              </h2>
              <form onSubmit={handleMobileLogin} className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                    +91
                  </div>
                  <input
                    type="tel"
                    placeholder="9315600189"
                    value={mobileLoginInput}
                    onChange={(e) => setMobileLoginInput(e.target.value)}
                    className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-rn-500"
                  />
                </div>
                <Button type="submit" variant="primary" className="gap-2">
                  <span>Enter My Portal</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </form>
              {loginError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium mt-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{loginError}</span>
                </p>
              )}
            </div>

            {/* One-Tap Executive Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                  Ya direct apna naam tap karein ({executives.length} Territory Executives):
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {executives.map((exec) => {
                  const repBucket = repDistribution.find((rd) => rd.name === exec.name);
                  const leadsCount = repBucket?.leadsCount || 0;
                  const wonCount = repBucket?.convertedCount || 0;

                  return (
                    <div
                      key={exec.name}
                      onClick={() => handleSelectExecutive(exec.name)}
                      className="bg-white dark:bg-slate-900 hover:border-rn-500 hover:shadow-md transition-all cursor-pointer p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-rn-100 dark:bg-rn-950/60 text-rn-700 dark:text-rn-300 flex items-center justify-center font-black text-sm group-hover:scale-105 transition-transform">
                          {exec.name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-900 dark:text-white group-hover:text-rn-600 transition-colors">
                            {exec.name}
                          </h4>
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            📞 {exec.mobile}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                            📍 {exec.area || exec.state}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rn-50 dark:bg-rn-950 text-rn-700 dark:text-rn-300 border border-rn-200 dark:border-rn-800">
                          {leadsCount} leads
                        </span>
                        {wonCount > 0 && (
                          <span className="block text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                            🎉 {wonCount} won
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* VIEW 2: LOGGED-IN SALES EXECUTIVE DASHBOARD & LEADS */
          <div className="space-y-6 animate-fadeIn">
            {/* Action Alert Banner */}
            {actionSuccessMsg && (
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-3.5 flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-bold animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{actionSuccessMsg}</span>
              </div>
            )}

            {/* Executive Profile Header Card */}
            <div className="bg-gradient-to-r from-rn-900 via-slate-900 to-rn-950 text-white rounded-3xl p-6 sm:p-7 shadow-lg border border-rn-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-rn-600 text-white flex items-center justify-center font-black text-2xl shadow-md border border-white/20">
                  {activeRepName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-black tracking-tight">{activeRepName}</h1>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold rounded-md border border-emerald-500/30">
                      ACTIVE SALES EXECUTIVE
                    </span>
                  </div>
                  <p className="text-xs text-rn-200 font-mono mt-1">
                    📞 {currentExec?.mobile || "Registered Executive"}
                  </p>
                  <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5 flex-wrap">
                    <MapPin className="w-3.5 h-3.5 text-rn-400 shrink-0" />
                    <span>
                      Territory: <strong>{currentExec?.area || currentExec?.state}</strong>
                    </span>
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
                <Button
                  onClick={exportToExcel}
                  variant="outline"
                  size="sm"
                  className="bg-emerald-600/90 hover:bg-emerald-700 text-white border-transparent gap-1.5 text-xs font-bold"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Download Excel</span>
                  <Download className="w-3 h-3" />
                </Button>

                <Button
                  onClick={fetchAnalytics}
                  variant="outline"
                  size="sm"
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20 gap-1.5 text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </Button>

                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border-rose-500/30 gap-1.5 text-xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Switch Rep</span>
                </Button>
              </div>
            </div>

            {/* Performance Metric Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm text-center">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Total Assigned
                </span>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {rawLeads.length}
                </p>
                <p className="text-[10px] text-slate-500">Routing active</p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm text-center">
                <span className="text-[10px] font-extrabold text-blue-500 uppercase tracking-wider block">
                  New / Pending
                </span>
                <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                  {rawLeads.filter((l) => l.status === "NEW" || l.status === "CONTACTED").length}
                </p>
                <p className="text-[10px] text-slate-500">Needs follow-up</p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm text-center">
                <span className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider block">
                  In Discussion
                </span>
                <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                  {rawLeads.filter((l) => ["QUOTATION_SENT", "NEGOTIATION"].includes(l.status)).length}
                </p>
                <p className="text-[10px] text-slate-500">Quotes & Bargains</p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm text-center">
                <span className="text-[10px] font-extrabold text-emerald-500 uppercase tracking-wider block">
                  Won (Converted)
                </span>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {rawLeads.filter((l) => l.status === "CONVERTED").length}
                </p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                  {rawLeads.length > 0 ? Math.round((rawLeads.filter((l) => l.status === "CONVERTED").length / rawLeads.length) * 100) : 0}% Win Rate
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm text-center col-span-2 sm:col-span-1">
                <span className="text-[10px] font-extrabold text-rn-500 uppercase tracking-wider block">
                  Pipeline Value
                </span>
                <p className="text-2xl font-black text-rn-700 dark:text-rn-300 mt-1">
                  ₹{rawLeads.reduce((acc, l) => acc + (Number(l.estimatedValue) || 0), 0).toLocaleString("en-IN")}
                </p>
                <p className="text-[10px] text-slate-500">Estimated sales</p>
              </div>
            </div>

            {/* Filter Bar & Search */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                <button
                  onClick={() => setStatusFilter("ALL")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    statusFilter === "ALL"
                      ? "bg-rn-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  All Leads ({rawLeads.length})
                </button>
                <button
                  onClick={() => setStatusFilter("NEW")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    statusFilter === "NEW"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  New Follow-up ({rawLeads.filter((l) => l.status === "NEW").length})
                </button>
                <button
                  onClick={() => setStatusFilter("IN_PROGRESS")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    statusFilter === "IN_PROGRESS"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  In Progress ({rawLeads.filter((l) => ["CONTACTED", "QUOTATION_SENT", "NEGOTIATION"].includes(l.status)).length})
                </button>
                <button
                  onClick={() => setStatusFilter("WON")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    statusFilter === "WON"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  Won ({rawLeads.filter((l) => l.status === "CONVERTED").length})
                </button>
                <button
                  onClick={() => setStatusFilter("LOST")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    statusFilter === "LOST"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  Lost ({rawLeads.filter((l) => l.status === "LOST").length})
                </button>
              </div>

              {/* Search Box */}
              <div className="w-full md:w-72">
                <Input
                  type="text"
                  placeholder="Search customer, phone, city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Leads List */}
            {filteredLeads.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-12 text-center space-y-3">
                <UserCheck className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="font-bold text-slate-700 dark:text-slate-200">
                  Koi leads nahi mili
                </h3>
                <p className="text-xs text-slate-400">
                  {searchQuery || statusFilter !== "ALL"
                    ? "Filter ya search change karke dekhein."
                    : "Filhaal aapko koi lead assign nahi hui hai."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLeads.map((lead) => {
                  const isWon = lead.status === "CONVERTED";
                  const isLost = lead.status === "LOST";
                  const isPending = lead.status === "NEW";

                  return (
                    <div
                      key={lead._id || lead.phone}
                      className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all p-4 sm:p-5 shadow-sm space-y-3 ${
                        isWon
                          ? "border-emerald-300 dark:border-emerald-900/50 bg-emerald-50/10"
                          : isLost
                          ? "border-slate-200 dark:border-slate-800 opacity-80"
                          : isPending
                          ? "border-blue-200 dark:border-blue-900/50"
                          : "border-slate-200/90 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-slate-900 dark:text-white">
                              {lead.customerName && lead.customerName !== "Customer"
                                ? lead.customerName
                                : "Prospective Client"}
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                              {lead.phone}
                            </span>
                            {lead.leadNumber && (
                              <span className="text-[10px] font-mono text-slate-400">
                                #{lead.leadNumber}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                            {lead.city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-rn-600 shrink-0" />
                                <strong>{lead.city}</strong>
                                {lead.state && `, ${lead.state}`}
                              </span>
                            )}
                            {lead.pincode && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">
                                PIN: {lead.pincode}
                              </span>
                            )}
                            {lead.businessName && (
                              <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                                <Building className="w-3 h-3 text-slate-400 shrink-0" />
                                {lead.businessName}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Badge & Deal Value */}
                        <div className="flex items-center gap-2.5 sm:self-center shrink-0">
                          {lead.estimatedValue > 0 && (
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 font-bold block">Deal Value</span>
                              <span className="font-black text-sm text-emerald-600 dark:text-emerald-400">
                                ₹{Number(lead.estimatedValue).toLocaleString("en-IN")}
                              </span>
                            </div>
                          )}

                          <span
                            className={`px-2.5 py-1 rounded-xl text-xs font-extrabold flex items-center gap-1 ${
                              isWon
                                ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                                : isLost
                                ? "bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                                : lead.status === "QUOTATION_SENT"
                                ? "bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800"
                                : lead.status === "NEGOTIATION"
                                ? "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                                : "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800"
                            }`}
                          >
                            {isWon && "🎉"} {lead.status || "NEW"}
                          </span>
                        </div>
                      </div>

                      {/* Requirement & Follow-up Notes */}
                      <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl text-xs space-y-1.5 border border-slate-100 dark:border-slate-800">
                        {lead.productCategory && (
                          <div className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <span className="font-bold text-slate-500">Requirement:</span>
                            <span>{lead.productCategory}</span>
                          </div>
                        )}

                        {lead.followupDate && (
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                            <Calendar className="w-3.5 h-3.5 text-rn-600" />
                            <span className="font-bold">Next Follow-up:</span>
                            <span className="font-mono text-rn-700 dark:text-rn-300 font-extrabold">
                              {new Date(lead.followupDate).toLocaleDateString("en-IN", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                        )}

                        {lead.lossReason && (
                          <div className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                            <span>Loss Reason:</span>
                            <span>{lead.lossReason}</span>
                          </div>
                        )}

                        {lead.history && lead.history.length > 0 && (
                          <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                            <strong>Latest Note:</strong> {lead.history[lead.history.length - 1].comment || "No comment logged"}
                          </div>
                        )}
                      </div>

                      {/* Rep Action Toolbar */}
                      <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* 1. Update Follow-up Modal Trigger */}
                          <Button
                            onClick={() => setSelectedLeadForFollowup(lead)}
                            variant="primary"
                            size="sm"
                            className="bg-rn-600 hover:bg-rn-700 text-white font-extrabold text-xs gap-1.5 shadow-sm"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>Update Follow-up</span>
                          </Button>

                          {/* 2. Direct WhatsApp Call / Chat to Customer */}
                          <a
                            href={`https://wa.me/${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                              `Namaste ${lead.customerName || "ji"}! 🙏 Main ${activeRepName} baat kar raha hoon RN Valves & Faucets se. Aapki inquiry ke sambhandh me baat karni thi.`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm transition-all"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp Customer</span>
                          </a>

                          {/* 3. Phone Call */}
                          <a
                            href={`tel:${lead.phone}`}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs inline-flex items-center gap-1.5 transition-all"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call</span>
                          </a>
                        </div>

                        {/* 4. Resend Alert to Myself */}
                        <button
                          type="button"
                          onClick={() => handleResendRepAlert(lead)}
                          disabled={resendingLeadId === lead._id}
                          className="text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 transition-colors"
                        >
                          <RefreshCw className={`w-3 h-3 ${resendingLeadId === lead._id ? "animate-spin" : ""}`} />
                          <span>Resend Alert to My WhatsApp</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Follow-up Update Modal */}
      {selectedLeadForFollowup && (
        <LeadFollowupModal
          isOpen={!!selectedLeadForFollowup}
          onClose={() => setSelectedLeadForFollowup(null)}
          lead={selectedLeadForFollowup}
          onSuccess={() => {
            fetchAnalytics();
            setActionSuccessMsg(`Lead ${selectedLeadForFollowup.phone} follow-up updated successfully!`);
            setTimeout(() => setActionSuccessMsg(""), 4000);
          }}
        />
      )}
    </div>
  );
}

export default function RepPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-rn-600 animate-spin" />
        </div>
      }
    >
      <RepPortalContent />
    </Suspense>
  );
}
