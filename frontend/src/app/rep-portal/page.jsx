"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import { Card, CardContent } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Input from "../../components/ui/Input";
import Pagination from "../../components/ui/Pagination";
import LeadFollowupModal from "../../components/LeadFollowupModal";
import { useAuth } from "../../context/AuthContext";
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
  Lock,
  KeyRound,
  Bell,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

function RepPortalContent() {
  const searchParams = useSearchParams();
  const queryRep = searchParams.get("rep");
  const queryPhone = searchParams.get("phone");
  const { role, logout: globalLogout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [repProfile, setRepProfile] = useState(null);
  const [repSummary, setRepSummary] = useState(null);
  const [rawLeads, setRawLeads] = useState([]);
  const [executivesList, setExecutivesList] = useState([]);

  // Login Form State
  const [selectedExecForLogin, setSelectedExecForLogin] = useState(null);
  const [loginPhoneInput, setLoginPhoneInput] = useState("");
  const [loginPinInput, setLoginPinInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [ecommScope, setEcommScope] = useState("team"); // "team" or "mine" for E-Commerce dept
  const [selectedLeadForFollowup, setSelectedLeadForFollowup] = useState(null);
  const [resendingLeadId, setResendingLeadId] = useState(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState("");

  // Pagination & View Mode State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [viewMode, setViewMode] = useState("table"); // "table" or "cards"

  // Fetch executives list (Admin only)
  const fetchExecutivesList = async () => {
    try {
      const res = await crmApi.getSalesExecutives();
      if (res && res.executives) {
        setExecutivesList(res.executives.filter((e) => e.isActive !== false));
      }
    } catch (err) {
      // Expected for SALES role
    }
  };

  // Fetch My Leads using secure Rep Token (with first-party cookie fallback)
  const fetchMyLeads = async (tokenOverride = null, scopeOverride = null) => {
    try {
      setLoading(true);
      let token =
        tokenOverride ||
        (typeof window !== "undefined"
          ? localStorage.getItem("rn_rep_token") || localStorage.getItem("rn_crm_token")
          : null);

      if (!token && typeof window !== "undefined") {
        try {
          const sRes = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData?.token) {
              token = sData.token;
              localStorage.setItem("rn_crm_token", token);
            }
          }
        } catch {}
      }

      if (!token) {
        setRepProfile(null);
        setRawLeads([]);
        setLoading(false);
        return;
      }

      const res = await crmApi.getMyLeads(
        token,
        true,
        scopeOverride || ecommScope,
        role === "ADMIN" && queryRep ? queryRep : ""
      );
      if (res && res.success) {
        setRepProfile(res.rep);
        setRepSummary(res.summary);
        setRawLeads(res.leads || []);
      } else {
        await handleLogout();
      }
    } catch (err) {
      console.warn("My leads fetch error:", err);
      if (err.message && (err.message.includes("401") || err.message.includes("expired") || err.message.includes("Unauthorized"))) {
        await handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyLeads();
  }, []);

  useEffect(() => {
    if (role === "ADMIN") {
      fetchExecutivesList();
    }
  }, [role]);

  // Pre-select executive if query params provided
  useEffect(() => {
    if (!executivesList.length) return;

    if (queryRep) {
      const match = executivesList.find(
        (e) => e.name.toLowerCase().includes(queryRep.toLowerCase())
      );
      if (match) setSelectedExecForLogin(match);
    } else if (queryPhone) {
      const cleanQ = queryPhone.replace(/\D/g, "").slice(-10);
      const match = executivesList.find((e) => {
        const cleanE = (e.mobile || "").replace(/\D/g, "").slice(-10);
        return cleanE === cleanQ;
      });
      if (match) setSelectedExecForLogin(match);
    }
  }, [executivesList, queryRep, queryPhone]);

  // Handle Login Submission with PIN
  const handlePinLogin = async (e) => {
    e?.preventDefault();
    setLoginError("");

    if (!selectedExecForLogin && !loginPhoneInput.trim()) {
      setLoginError("Kripya apna Sales Executive profile select karein ya mobile number enter karein.");
      return;
    }

    if (!loginPinInput || loginPinInput.trim().length < 4) {
      setLoginError("Kripya 4-digit security PIN enter karein (Default PIN: 1234).");
      return;
    }

    setIsLoggingIn(true);
    try {
      const payload = {
        repName: selectedExecForLogin?.name,
        mobile: selectedExecForLogin?.mobile || loginPhoneInput.trim(),
        pin: loginPinInput.trim(),
      };

      const res = await crmApi.repLogin(payload);
      if (res && res.success && res.token) {
        localStorage.setItem("rn_rep_token", res.token);
        localStorage.setItem("rn_crm_token", res.token);
        localStorage.setItem("rn_sales_rep_auth", res.rep.name);
        await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ token: res.token }),
        }).catch(() => {});
        setRepProfile(res.rep);
        setLoginPinInput("");
        setLoginError("");
        await fetchMyLeads(res.token);
      } else {
        setLoginError(res?.error || "Login fail ho gaya. Kripya apna PIN check karein.");
      }
    } catch (err) {
      setLoginError(err?.message || "Galat PIN! Kripya sahi PIN enter karein (Default: 1234).");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout / Lock
  const handleLogout = async () => {
    setRepProfile(null);
    setRepSummary(null);
    setRawLeads([]);
    setSelectedExecForLogin(null);
    setLoginPinInput("");
    setLoginError("");
    await globalLogout();
  };

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return rawLeads.filter((l) => {
      // Status Filter
      if (statusFilter === "NEW" && l.status !== "NEW") return false;
      if (statusFilter === "IN_PROGRESS" && !["CONTACTED", "INTERESTED", "QUOTATION_SENT", "NEGOTIATION"].includes(l.status)) return false;
      if (statusFilter === "WON" && l.status !== "CONVERTED") return false;
      if (statusFilter === "LOST" && l.status !== "LOST") return false;
      if (statusFilter === "DUE_TODAY") {
        if (!l.followupDate) return false;
        const d = new Date(l.followupDate).toISOString().split("T")[0];
        const today = new Date().toISOString().split("T")[0];
        return d === today && l.status !== "CONVERTED" && l.status !== "LOST";
      }
      if (statusFilter === "OVERDUE") {
        if (!l.followupDate) return false;
        const d = new Date(l.followupDate).toISOString().split("T")[0];
        const today = new Date().toISOString().split("T")[0];
        return d < today && l.status !== "CONVERTED" && l.status !== "LOST";
      }

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

  // Reset to page 1 on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery]);

  // Paginated Leads
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLeads.slice(start, start + pageSize);
  }, [filteredLeads, currentPage, pageSize]);

  // Resend Alert to Rep
  const handleResendRepAlert = async (lead) => {
    try {
      setResendingLeadId(lead._id);
      setActionSuccessMsg("");
      await crmApi.resendRepAlert({
        leadId: lead._id,
        repName: repProfile?.name,
        repPhone: repProfile?.mobile,
      });
      setActionSuccessMsg(`WhatsApp alert resent to ${repProfile?.name} for lead ${lead.phone}!`);
      setTimeout(() => setActionSuccessMsg(""), 4000);
      await fetchMyLeads();
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
      `"${l.createdAt ? new Date(l.createdAt).toLocaleDateString("en-IN") : ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `RN_Valves_Leads_${(repProfile?.name || "rep").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading && !repProfile && !executivesList.length) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <RefreshCw className="w-8 h-8 text-rn-600 animate-spin mb-3" />
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
          Loading Secure Sales Portal...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-16">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* VIEW 1: SECURE PIN LOGIN SCREEN */}
        {!repProfile ? (
          <div className="max-w-xl mx-auto space-y-6 pt-6 animate-fadeIn">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center bg-white rounded-2xl px-5 py-3 shadow-md border border-slate-200/80 mb-2">
                <img
                  src="/rn-logo.png"
                  alt="RN Valves & Faucets"
                  className="h-20 w-auto object-contain select-none"
                />
              </div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                RN Valves & Faucets — Sales Executive Portal
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Data Privacy & Security Protected: Kripya apna profile chunein aur apna secure 4-digit PIN enter karein.
              </p>
            </div>

            {/* Login Box */}
            <div className="bg-white dark:bg-slate-900 p-6 sm:p-7 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-md space-y-5">
              <form onSubmit={handlePinLogin} className="space-y-4">
                {/* Step 1: Select Executive */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                    1️⃣ Apna Profile Chunein *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {executivesList.map((exec) => {
                      const isSelected = selectedExecForLogin?.name === exec.name;
                      return (
                        <button
                          key={exec.name}
                          type="button"
                          onClick={() => {
                            setSelectedExecForLogin(exec);
                            setLoginError("");
                          }}
                          className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                            isSelected
                              ? "border-rn-600 bg-rn-50 dark:bg-rn-950/60 ring-2 ring-rn-500 shadow-sm"
                              : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-extrabold text-xs text-slate-900 dark:text-white line-clamp-1">
                              {exec.name}
                            </span>
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-rn-600 shrink-0" />}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {exec.mobile ? exec.mobile.replace(/\s+/g, "") : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: Enter PIN */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-rn-600" />
                      <span>2️⃣ 4-Digit Security PIN *</span>
                    </span>
                    <span className="text-[11px] text-slate-400 normal-case font-normal">
                      Default: <strong>1234</strong>
                    </span>
                  </label>

                  <input
                    type="password"
                    maxLength={6}
                    placeholder="Enter 4-digit PIN (e.g. 1234)"
                    value={loginPinInput}
                    onChange={(e) => setLoginPinInput(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-center tracking-widest text-lg font-black focus:outline-none focus:ring-2 focus:ring-rn-500 transition-all"
                  />
                </div>

                {loginError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{loginError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full py-3 text-sm font-black justify-center gap-2 shadow-lg shadow-rn-600/25"
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying PIN...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Secure Login to My Leads</span>
                    </>
                  )}
                </Button>
              </form>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                <p className="text-[11px] text-slate-400">
                  🔒 Data Isolation: Har Sales Executive ko sirf unki territory ke customers dikhte hain.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* VIEW 2: LOGGED-IN SALES EXECUTIVE DASHBOARD */
          <div className="space-y-5 animate-fadeIn">
            {/* Action Alert Banner */}
            {actionSuccessMsg && (
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-3.5 flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-bold animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{actionSuccessMsg}</span>
              </div>
            )}

            {/* Daily Urgent Follow-up Checklist Alert */}
            {((repSummary?.overdueCount || 0) > 0 || (repSummary?.dueTodayCount || 0) > 0) && (
              <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 border border-amber-300 dark:border-amber-900/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shadow-md shrink-0">
                    <Bell className="w-5 h-5 animate-bounce" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900 dark:text-white">
                      Daily Follow-up Action Required!
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Aapke paas{" "}
                      {repSummary?.overdueCount > 0 && (
                        <strong className="text-rose-600 dark:text-rose-400 font-black">
                          {repSummary.overdueCount} Overdue
                        </strong>
                      )}
                      {repSummary?.overdueCount > 0 && repSummary?.dueTodayCount > 0 && " aur "}
                      {repSummary?.dueTodayCount > 0 && (
                        <strong className="text-amber-600 dark:text-amber-400 font-black">
                          {repSummary.dueTodayCount} Due Today
                        </strong>
                      )}{" "}
                      customer follow-ups pending hain!
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {repSummary?.overdueCount > 0 && (
                    <button
                      onClick={() => setStatusFilter("OVERDUE")}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-sm hover:bg-rose-700 transition-colors"
                    >
                      View Overdue ({repSummary.overdueCount})
                    </button>
                  )}
                  {repSummary?.dueTodayCount > 0 && (
                    <button
                      onClick={() => setStatusFilter("DUE_TODAY")}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold shadow-sm hover:bg-amber-700 transition-colors"
                    >
                      View Due Today ({repSummary.dueTodayCount})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Executive Profile Header Card */}
            <div className="bg-gradient-to-r from-rn-900 via-slate-900 to-rn-950 text-white rounded-3xl p-6 sm:p-7 shadow-lg border border-rn-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-rn-600 text-white flex items-center justify-center font-black text-2xl shadow-md border border-white/20">
                  {repProfile.name?.charAt(0) || "U"}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-black tracking-tight">{repProfile.name}</h1>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold rounded-md border border-emerald-500/30">
                      {repProfile.department === "ECOMMERCE" || /kanika|tammana|e-commerce/i.test(repProfile.name || "")
                        ? "🛍️ E-COMMERCE DEPARTMENT PANEL"
                        : "AUTHENTICATED EXECUTIVE"}
                    </span>
                  </div>
                  <p className="text-xs text-rn-200 font-mono mt-1">
                    📞 {repProfile.mobile || "+91 93156 03920 / +91 96253 14298"}
                  </p>
                  {(repProfile.department === "ECOMMERCE" || /kanika|tammana|e-commerce/i.test(repProfile.name || "")) && (
                    <div className="flex items-center gap-1.5 mt-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEcommScope("team");
                          fetchMyLeads(null, "team");
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                          ecommScope === "team"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "bg-white/10 text-slate-200 hover:bg-white/20"
                        }`}
                      >
                        All E-Commerce Dept
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEcommScope("mine");
                          fetchMyLeads(null, "mine");
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                          ecommScope === "mine"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "bg-white/10 text-slate-200 hover:bg-white/20"
                        }`}
                      >
                        Assigned to Me
                      </button>
                    </div>
                  )}
                  {repProfile.area && (
                    <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rn-400 shrink-0" />
                      <span>
                        Territory: <strong>{repProfile.area}</strong>
                      </span>
                    </p>
                  )}
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
                  onClick={() => fetchMyLeads()}
                  variant="outline"
                  size="sm"
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20 gap-1.5 text-xs font-bold"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </Button>

                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border-rose-500/30 gap-1.5 text-xs font-bold"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Lock / Logout</span>
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
                <p className="text-[10px] text-slate-500">Live Territory Leads</p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm text-center">
                <span className="text-[10px] font-extrabold text-blue-500 uppercase tracking-wider block">
                  New / Pending
                </span>
                <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                  {repSummary?.pendingCount || rawLeads.filter((l) => l.status === "NEW" || l.status === "CONTACTED").length}
                </p>
                <p className="text-[10px] text-slate-500">Follow-up Pending</p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm text-center">
                <span className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider block">
                  In Discussion
                </span>
                <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                  {repSummary?.inProgressCount || rawLeads.filter((l) => ["QUOTATION_SENT", "NEGOTIATION"].includes(l.status)).length}
                </p>
                <p className="text-[10px] text-slate-500">Quotes & Bargains</p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm text-center">
                <span className="text-[10px] font-extrabold text-emerald-500 uppercase tracking-wider block">
                  Won (Converted)
                </span>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {repSummary?.wonCount || rawLeads.filter((l) => l.status === "CONVERTED").length}
                </p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                  {rawLeads.length > 0
                    ? Math.round(((repSummary?.wonCount || rawLeads.filter((l) => l.status === "CONVERTED").length) / rawLeads.length) * 100)
                    : 0}% Win Rate
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm text-center col-span-2 sm:col-span-1">
                <span className="text-[10px] font-extrabold text-rn-500 uppercase tracking-wider block">
                  Pipeline Value
                </span>
                <p className="text-2xl font-black text-rn-700 dark:text-rn-300 mt-1">
                  ₹{(repSummary?.totalValue || rawLeads.reduce((acc, l) => acc + (Number(l.estimatedValue) || 0), 0)).toLocaleString("en-IN")}
                </p>
                <p className="text-[10px] text-slate-500">Estimated Value</p>
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
                  All ({rawLeads.length})
                </button>

                {(repSummary?.dueTodayCount || 0) > 0 && (
                  <button
                    onClick={() => setStatusFilter("DUE_TODAY")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      statusFilter === "DUE_TODAY"
                        ? "bg-amber-600 text-white shadow-sm"
                        : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-200"
                    }`}
                  >
                    ⚠️ Due Today ({repSummary.dueTodayCount})
                  </button>
                )}

                {(repSummary?.overdueCount || 0) > 0 && (
                  <button
                    onClick={() => setStatusFilter("OVERDUE")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      statusFilter === "OVERDUE"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 hover:bg-rose-200"
                    }`}
                  >
                    🚨 Overdue ({repSummary.overdueCount})
                  </button>
                )}

                <button
                  onClick={() => setStatusFilter("NEW")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    statusFilter === "NEW"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  New ({rawLeads.filter((l) => l.status === "NEW").length})
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

              {/* Search Box & View Mode Toggle */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                      viewMode === "table"
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    📊 Table View
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                      viewMode === "cards"
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    📱 Card View
                  </button>
                </div>

                <div className="w-full md:w-64">
                  <Input
                    type="text"
                    placeholder="Search customer, phone, city..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Paginated Leads List */}
            {filteredLeads.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-12 text-center space-y-3">
                <UserCheck className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="font-bold text-slate-700 dark:text-slate-200">
                  Koi leads nahi mili
                </h3>
                <p className="text-xs text-slate-400">
                  {searchQuery || statusFilter !== "ALL"
                    ? "Filter ya search criteria change karke dekhein."
                    : "Filhaal aapko koi lead assign nahi hui hai."}
                </p>
              </div>
            ) : viewMode === "table" ? (
              /* BOOTSTRAP DATA TABLE VIEW */
              <div className="card shadow-sm border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
                <div className="table-responsive">
                  <table className="table table-hover table-striped align-middle mb-0 text-xs">
                    <thead className="table-light border-bottom text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="px-4 py-3">Lead ID & Date</th>
                        <th className="px-4 py-3">Customer / Firm</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3">Territory & PIN</th>
                        <th className="px-4 py-3">Requirement</th>
                        <th className="px-4 py-3">Current Status</th>
                        <th className="px-4 py-3 text-end">Deal Value (₹)</th>
                        <th className="px-4 py-3">Next Follow-up</th>
                        <th className="px-4 py-3">Latest Notes</th>
                        <th className="px-4 py-3 text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedLeads.map((lead) => {
                        const isWon = lead.status === "CONVERTED";
                        const isLost = lead.status === "LOST";
                        const cleanPhone = (lead.phone || "").replace(/\D/g, "");
                        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                          `Namaste ${lead.customerName || ""} ji! 🙏 Main ${repProfile?.name} baat kar raha hoon RN Valves & Faucets se.`
                        )}`;

                        let dueStatus = null;
                        if (lead.followupDate && !isWon && !isLost) {
                          const d = new Date(lead.followupDate).toISOString().split("T")[0];
                          const today = new Date().toISOString().split("T")[0];
                          if (d < today) dueStatus = "OVERDUE";
                          else if (d === today) dueStatus = "TODAY";
                        }

                        return (
                          <tr
                            key={lead._id || lead.phone}
                            className={
                              dueStatus === "OVERDUE"
                                ? "table-danger"
                                : dueStatus === "TODAY"
                                ? "table-warning"
                                : ""
                            }
                          >
                            <td className="px-4 py-3 font-mono font-bold text-slate-600 dark:text-slate-400">
                              <div>#{lead.leadNumber || "—"}</div>
                              <div className="text-[10px] text-slate-400 font-normal">
                                {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString("en-IN") : ""}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {lead.customerName || "Customer"}
                              </div>
                              {lead.businessName && (
                                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Building className="w-3 h-3 text-slate-400" />
                                  {lead.businessName}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                              {lead.phone}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-800 dark:text-slate-200">
                                {lead.city || lead.state || "—"}
                              </div>
                              {lead.pincode && (
                                <span className="badge bg-light text-dark border font-mono mt-0.5">
                                  PIN: {lead.pincode}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              {lead.productCategory || "Wholesale Dealership"}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`badge ${
                                  isWon
                                    ? "bg-success"
                                    : isLost
                                    ? "bg-danger"
                                    : lead.status === "QUOTATION_SENT"
                                    ? "bg-info text-dark"
                                    : lead.status === "NEGOTIATION"
                                    ? "bg-warning text-dark"
                                    : "bg-primary"
                                }`}
                              >
                                {isWon && "🎉 "}
                                {lead.status || "NEW"}
                              </span>
                              {dueStatus === "OVERDUE" && (
                                <span className="badge bg-danger ms-1 animate-pulse">
                                  🚨 OVERDUE
                                </span>
                              )}
                              {dueStatus === "TODAY" && (
                                <span className="badge bg-warning text-dark ms-1">
                                  ⚠️ TODAY
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-end font-bold text-slate-900 dark:text-white">
                              {lead.estimatedValue > 0
                                ? `₹${Number(lead.estimatedValue).toLocaleString("en-IN")}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              {lead.followupDate
                                ? new Date(lead.followupDate).toLocaleDateString("en-IN")
                                : "Not set"}
                            </td>
                            <td
                              className="px-4 py-3 max-w-xs text-slate-500 truncate"
                              title={lead.lossReason || ""}
                            >
                              {lead.lossReason
                                ? `Loss: ${lead.lossReason}`
                                : lead.history && lead.history.length > 0
                                ? lead.history[lead.history.length - 1].comment
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-end">
                              <div className="btn-group btn-group-sm">
                                <button
                                  type="button"
                                  onClick={() => setSelectedLeadForFollowup(lead)}
                                  className="btn btn-sm btn-primary"
                                  title="Update Follow-up Status"
                                >
                                  Update
                                </button>
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-sm btn-success"
                                  title="WhatsApp Customer"
                                >
                                  WhatsApp
                                </a>
                                <a
                                  href={`tel:${lead.phone}`}
                                  className="btn btn-sm btn-outline-secondary"
                                  title="Call Customer"
                                >
                                  Call
                                </a>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  totalItems={filteredLeads.length}
                  currentPage={currentPage}
                  pageSize={pageSize}
                  pageSizeOptions={[10, 25, 50]}
                  onPageChange={(p) => setCurrentPage(p)}
                  onPageSizeChange={(sz) => {
                    setPageSize(sz);
                    setCurrentPage(1);
                  }}
                />
              </div>
            ) : (
              /* MOBILE CARDS VIEW */
              <div className="space-y-3">
                {paginatedLeads.map((lead) => {
                  const isWon = lead.status === "CONVERTED";
                  const isLost = lead.status === "LOST";
                  const isPending = lead.status === "NEW";

                  // Due / Overdue status
                  let dueStatus = null;
                  if (lead.followupDate && !isWon && !isLost) {
                    const d = new Date(lead.followupDate).toISOString().split("T")[0];
                    const today = new Date().toISOString().split("T")[0];
                    if (d < today) dueStatus = "OVERDUE";
                    else if (d === today) dueStatus = "TODAY";
                  }

                  return (
                    <div
                      key={lead._id || lead.phone}
                      className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all p-4 sm:p-5 shadow-sm space-y-3 ${
                        dueStatus === "OVERDUE"
                          ? "border-rose-400 dark:border-rose-800/80 bg-rose-50/15"
                          : dueStatus === "TODAY"
                          ? "border-amber-400 dark:border-amber-800/80 bg-amber-50/15"
                          : isWon
                          ? "border-emerald-300 dark:border-emerald-900/50 bg-emerald-50/10"
                          : isLost
                          ? "border-slate-200 dark:border-slate-800 opacity-75"
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
                            {dueStatus === "OVERDUE" && (
                              <span className="px-2 py-0.2 rounded-md bg-rose-600 text-white text-[10px] font-black animate-pulse">
                                🚨 OVERDUE FOLLOW-UP
                              </span>
                            )}
                            {dueStatus === "TODAY" && (
                              <span className="px-2 py-0.2 rounded-md bg-amber-500 text-white text-[10px] font-black">
                                ⚠️ DUE TODAY
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
                              `Namaste ${lead.customerName || "ji"}! 🙏 Main ${repProfile?.name} baat kar raha hoon RN Valves & Faucets se. Aapki inquiry ke sambhandh me baat karni thi.`
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

                {/* Scalable Enterprise Pagination */}
                <Pagination
                  totalItems={filteredLeads.length}
                  currentPage={currentPage}
                  pageSize={pageSize}
                  pageSizeOptions={[10, 25, 50]}
                  onPageChange={(p) => setCurrentPage(p)}
                  onPageSizeChange={(sz) => {
                    setPageSize(sz);
                    setCurrentPage(1);
                  }}
                  className="rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm mt-4"
                />
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
            fetchMyLeads();
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
