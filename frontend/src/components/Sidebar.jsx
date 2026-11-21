"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Kanban,
  Bot,
  CalendarCheck,
  Settings,
  GitFork,
  UserCheck,
  X,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useNav } from "../context/NavContext";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { crmApi } from "../lib/api";

const salesNavigationItems = [
  { name: "My Assigned Leads", href: "/rep-portal", icon: UserCheck, badge: "My Leads" },
];

function SidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { mobileOpen, closeMobile } = useNav();
  const { theme, toggleTheme } = useTheme();
  const { user, role, logout } = useAuth();

  const isOnDistribution = pathname === "/distribution" || pathname.startsWith("/distribution/");
  const activeDistTab = isOnDistribution ? searchParams.get("tab") || "executives" : null;

  const [distOpen, setDistOpen] = useState(true);
  const [distCounts, setDistCounts] = useState({
    executives: null,
    leads: null,
    dropped: null,
    human: null,
  });

  // Auto-open Lead Distribution accordion when navigating to /distribution
  useEffect(() => {
    if (isOnDistribution) {
      setDistOpen(true);
    }
  }, [isOnDistribution]);

  // Fetch live counts for Lead Distribution submenu (Admin only) & listen for live updates
  useEffect(() => {
    if (pathname === "/login" || role !== "ADMIN") return;

    let cancelled = false;
    crmApi
      .getDistributionAnalytics()
      .then((res) => {
        if (cancelled || !res) return;
        const execList = res.executives || [];
        const unassigned = res.unassignedLeads || [];
        const totalLeadsCount =
          unassigned.length +
          execList.reduce((sum, ex) => sum + ((ex.leads || []).length || 0), 0);
        setDistCounts({
          executives: execList.length,
          leads: totalLeadsCount || res.summary?.totalLeads || 0,
          dropped: (res.droppedAtHi || []).length,
          human: (res.humanTakeovers || []).length,
        });
      })
      .catch(() => {});

    const handleCountsEvent = (e) => {
      if (e?.detail) {
        setDistCounts((prev) => ({ ...prev, ...e.detail }));
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("rn-distribution-counts", handleCountsEvent);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("rn-distribution-counts", handleCountsEvent);
      }
    };
  }, [pathname, role]);

  // Do not render sidebar on login page
  if (pathname === "/login") {
    return null;
  }

  const isSales = role === "SALES";
  const homeHref = isSales ? "/rep-portal" : "/dashboard";

  const distributionSubItems = [
    {
      id: "executives",
      name: "Sales Executives",
      href: "/distribution?tab=executives",
      count: distCounts.executives,
    },
    {
      id: "leads",
      name: "All Pipeline Leads",
      href: "/distribution?tab=leads",
      count: distCounts.leads,
    },
    {
      id: "dropped",
      name: 'Dropped at "Hi"',
      href: "/distribution?tab=dropped",
      count: distCounts.dropped,
    },
    {
      id: "human",
      name: "Human Takeovers",
      href: "/distribution?tab=human",
      count: distCounts.human,
    },
    {
      id: "reports",
      name: "Reports & Excel",
      href: "/distribution?tab=reports",
      count: distCounts.leads,
    },
    {
      id: "rep_portal",
      name: "Sales Rep Portal",
      href: "/distribution?tab=rep_portal",
      count: null,
    },
  ];

  const topAdminItemsBeforeDist = [
    { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { name: "WhatsApp Inbox", href: "/inbox", icon: MessageSquare, badge: "Live" },
    { name: "Sales Pipeline", href: "/leads", icon: Kanban },
  ];

  const topAdminItemsAfterDist = [
    { name: "Contacts", href: "/contacts", icon: Users },
    { name: "Follow-ups", href: "/followups", icon: CalendarCheck },
    { name: "AI Automation", href: "/ai-settings", icon: Bot },
    { name: "Integrations & Health", href: "/settings", icon: Settings },
  ];

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "RN";

  const renderNavLink = (item) => {
    const isActive =
      pathname === item.href || (item.href === "/dashboard" && pathname === "/");
    const Icon = item.icon;

    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={closeMobile}
        className={`relative group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] transition-all duration-150 ${
          isActive
            ? "bg-[#DCEBFF] dark:bg-rn-900/50 text-slate-900 dark:text-white font-semibold"
            : "text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100/90 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-[#1091d0]" />
        )}
        <div className="flex items-center gap-3">
          <Icon
            className={`w-[18px] h-[18px] shrink-0 transition-colors ${
              isActive
                ? "text-[#1091d0] dark:text-rn-400"
                : "text-slate-700 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"
            }`}
          />
          <span>{item.name}</span>
        </div>
        {item.badge && (
          <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-full">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200/85 dark:border-slate-800/80 text-slate-700 dark:text-slate-300 transition-colors">
      {/* Brand Header — Official Logo Only */}
      <div className="py-4 px-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-center relative">
        <Link
          href={homeHref}
          className="inline-flex items-center justify-center dark:bg-white dark:rounded-2xl dark:px-5 dark:py-2 hover:opacity-95 transition-opacity"
        >
          <img
            src="/rn-logo.png"
            alt="RN Valves & Faucets"
            className="h-14 w-auto object-contain select-none"
          />
        </Link>
        {/* Mobile close button */}
        <button
          onClick={closeMobile}
          className="lg:hidden absolute right-3 top-3 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {isSales ? (
          salesNavigationItems.map((item) => renderNavLink(item))
        ) : (
          <>
            {topAdminItemsBeforeDist.map((item) => renderNavLink(item))}

            {/* Collapsible Lead Distribution Dropdown Group (ERP Accordion Style) */}
            <div
              className={`rounded-2xl transition-colors ${
                distOpen
                  ? "bg-slate-50/95 dark:bg-slate-800/40 p-1.5 my-1 border border-slate-100 dark:border-slate-800/70"
                  : ""
              }`}
            >
              <button
                type="button"
                onClick={() => setDistOpen((prev) => !prev)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] transition-all ${
                  isOnDistribution && !distOpen
                    ? "bg-[#DCEBFF] dark:bg-rn-900/50 text-slate-900 dark:text-white font-semibold"
                    : "text-slate-800 dark:text-slate-200 font-medium hover:bg-slate-100/80 dark:hover:bg-slate-800/70"
                }`}
              >
                <div className="flex items-center gap-3">
                  <GitFork
                    className={`w-[18px] h-[18px] shrink-0 ${
                      isOnDistribution
                        ? "text-[#1091d0] dark:text-rn-400"
                        : "text-slate-700 dark:text-slate-400"
                    }`}
                  />
                  <span>Lead Distribution</span>
                </div>
                {distOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                )}
              </button>

              {distOpen && (
                <div className="mt-1 space-y-1 pl-1 pr-0.5 pb-0.5">
                  {distributionSubItems.map((sub) => {
                    const isSubActive = isOnDistribution && activeDistTab === sub.id;

                    return (
                      <Link
                        key={sub.id}
                        href={sub.href}
                        onClick={closeMobile}
                        className={`relative flex items-center justify-between pl-3.5 pr-2.5 py-2 rounded-xl text-[13px] transition-all duration-150 ${
                          isSubActive
                            ? "bg-[#DCEBFF] dark:bg-rn-900/60 text-slate-900 dark:text-white font-semibold"
                            : "text-slate-700 dark:text-slate-300 font-medium hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        {isSubActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-[#1091d0]" />
                        )}
                        <span className="truncate pr-2">{sub.name}</span>
                        {sub.count !== null && sub.count !== undefined && (
                          <span
                            className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full shrink-0 ${
                              isSubActive
                                ? "bg-[#C2DBFA] dark:bg-rn-800 text-slate-800 dark:text-rn-100"
                                : "bg-slate-200/85 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {sub.count}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {topAdminItemsAfterDist.map((item) => renderNavLink(item))}
          </>
        )}
      </nav>

      {/* WhatsApp Engine Info */}
      <div className="p-3 mx-3 mb-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              RNchat Active
            </span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 font-mono">
            v2.3.7
          </span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
          Evolution API connected via Baileys.
        </p>
      </div>

      {/* User Session Footer & Actions */}
      <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/90">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-[#DCEBFF] dark:bg-rn-600/25 border border-[#B8D7FA] dark:border-rn-500/40 flex items-center justify-center font-bold text-xs text-[#0c7db5] dark:text-rn-300 shrink-0">
              {initials}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {user?.name || (isSales ? "Sales Executive" : "Admin")}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {user?.email ||
                  user?.phone ||
                  user?.repMobile ||
                  (isSales ? "Sales Team" : "admin@rnvalves.com")}
              </p>
            </div>
          </div>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 ${
              isSales
                ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {role || "USER"}
          </span>
        </div>

        {/* Action Buttons: Theme Toggle & Logout */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/60">
          <button
            onClick={toggleTheme}
            className="flex-1 py-1.5 px-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors text-[11px] font-semibold flex items-center justify-center gap-1.5"
            title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-500" />
                <span>Dark</span>
              </>
            )}
          </button>

          <button
            onClick={logout}
            className="flex-1 py-1.5 px-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200/80 dark:border-red-500/20 transition-colors text-[11px] font-semibold flex items-center justify-center gap-1.5"
            title="Sign out of RN Valves CRM"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (lg and above) */}
      <aside className="hidden lg:flex w-[270px] flex-col flex-shrink-0 min-h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity"
            onClick={closeMobile}
          />
          {/* Drawer */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

export default function Sidebar() {
  return (
    <Suspense fallback={<aside className="hidden lg:flex w-[270px] flex-shrink-0 min-h-screen bg-white dark:bg-slate-900 border-r border-slate-200/85 dark:border-slate-800/80" />}>
      <SidebarInner />
    </Suspense>
  );
}
