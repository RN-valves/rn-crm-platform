"use client";

import { Bell, RefreshCw, Menu, Sun, Moon, Sparkles } from "lucide-react";
import { useNav } from "../context/NavContext";
import { useTheme } from "../context/ThemeContext";

export default function Header({
  title,
  subtitle,
  onRefresh,
  loading = false,
  actions,
}) {
  const { toggleMobile } = useNav();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800/90 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-20 transition-colors">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Menu Button */}
        <button
          onClick={toggleMobile}
          className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          aria-label="Open sidebar menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 hidden xs:block truncate max-w-xs sm:max-w-md">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Custom Actions Slot if provided */}
        {actions}

        {/* Loading Indicator */}
        {loading && (
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-rn-50 dark:bg-rn-950/60 border border-rn-200 dark:border-rn-800 text-rn-700 dark:text-rn-300 text-xs font-semibold animate-pulse shadow-sm">
            <RefreshCw className="w-3 h-3 animate-spin text-rn-600" />
            <span>Syncing live data...</span>
          </div>
        )}

        {/* Refresh Action */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin text-rn-600" : ""}`}
            />
          </button>
        )}

        {/* Dual Mode Engine Status Pill */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/90 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="hidden md:inline">Dual Mode Engine</span>
          <span className="md:hidden">Active</span>
        </div>

        {/* Quick Theme Toggle in Header */}
        <button
          onClick={toggleTheme}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Notifications */}
        <button
          className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rn-600 ring-2 ring-white dark:ring-slate-900"></span>
        </button>
      </div>
    </header>
  );
}
