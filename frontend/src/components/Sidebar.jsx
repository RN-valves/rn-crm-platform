"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Kanban,
  Bot,
  CalendarCheck,
  Settings,
  GitFork,
  X,
  Sun,
  Moon,
  ShieldCheck,
} from "lucide-react";
import { useNav } from "../context/NavContext";
import { useTheme } from "../context/ThemeContext";

const navigationItems = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "WhatsApp Inbox", href: "/inbox", icon: MessageSquare, badge: "Live" },
  { name: "Sales Pipeline", href: "/leads", icon: Kanban },
  { name: "Lead Distribution", href: "/distribution", icon: GitFork },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Follow-ups", href: "/followups", icon: CalendarCheck },
  { name: "AI Automation", href: "/ai-settings", icon: Bot },
  { name: "Integrations & Health", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { mobileOpen, closeMobile } = useNav();
  const { theme, toggleTheme } = useTheme();

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800/80 text-slate-300">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800/80">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-rn-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-rn-600/30 group-hover:scale-105 transition-transform">
            RN
          </div>
          <div>
            <h1 className="font-extrabold text-white tracking-wider text-sm flex items-center gap-1.5">
              RN VALVES
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-rn-500/20 text-rn-300 border border-rn-400/30">
                PRO
              </span>
            </h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wider">
              CRM & AI AUTOMATION
            </p>
          </div>
        </Link>
        {/* Mobile close button */}
        <button
          onClick={closeMobile}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Core Modules
        </div>
        {navigationItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={closeMobile}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? "bg-rn-600 text-white shadow-md shadow-rn-600/25"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/70"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* WhatsApp Engine Info */}
      <div className="p-3.5 mx-3 mb-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-slate-200">RNchat Active</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-300 font-mono">
            v2.3.7
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-tight">
          Evolution API connected via Baileys Multi-Device.
        </p>
      </div>

      {/* User Session Footer & Theme Switcher */}
      <div className="p-3.5 border-t border-slate-800/80 flex items-center justify-between bg-slate-900/90">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-rn-600/25 border border-rn-500/40 flex items-center justify-center text-rn-300 font-bold text-xs shrink-0">
            AD
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-white truncate">Admin Executive</p>
            <p className="text-[10px] text-slate-400 truncate">admin@rnvalves.com</p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0"
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-300" />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (lg and above) */}
      <aside className="hidden lg:flex w-64 flex-col flex-shrink-0 min-h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
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
