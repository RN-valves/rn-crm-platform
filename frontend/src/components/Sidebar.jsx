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
  ShieldCheck,
  PhoneCall,
  GitFork,
} from "lucide-react";

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

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0 min-h-screen text-slate-300">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="w-9 h-9 rounded-lg bg-rn-600 flex items-center justify-center font-bold text-white text-lg shadow-md shadow-rn-600/30">
          RN
        </div>
        <div>
          <h1 className="font-bold text-white tracking-wide text-sm">RN VALVES</h1>
          <p className="text-[10px] text-slate-400 font-medium tracking-wider">CRM & AI AUTOMATION</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-rn-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* WhatsApp Engine Info */}
      <div className="p-4 mx-3 mb-4 rounded-xl bg-slate-800/70 border border-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-semibold text-slate-200">RNchat Instance</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">v2.3.7</span>
        </div>
        <p className="text-[11px] text-slate-400">Evolution API connected via Baileys Multi-Device.</p>
      </div>

      {/* User Session Footer */}
      <div className="p-4 border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-rn-600/30 border border-rn-500/50 flex items-center justify-center text-rn-300 font-semibold text-xs">
            AD
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-medium text-white truncate">Admin Executive</p>
            <p className="text-[10px] text-slate-400 truncate">admin@rnvalves.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
