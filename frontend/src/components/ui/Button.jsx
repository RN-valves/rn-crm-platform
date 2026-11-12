"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

const variants = {
  primary:
    "bg-rn-600 hover:bg-rn-700 active:bg-rn-800 text-white shadow-sm shadow-rn-600/25 border border-rn-600 focus-visible:ring-rn-500",
  secondary:
    "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 dark:active:bg-slate-600 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 focus-visible:ring-slate-400",
  outline:
    "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 focus-visible:ring-slate-400",
  ghost:
    "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent focus-visible:ring-slate-400",
  danger:
    "bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-sm shadow-rose-600/25 border border-rose-600 focus-visible:ring-rose-500",
  warning:
    "bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-sm shadow-amber-500/25 border border-amber-500 focus-visible:ring-amber-500",
  success:
    "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm shadow-emerald-600/25 border border-emerald-600 focus-visible:ring-emerald-500",
  "subtle-danger":
    "bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 focus-visible:ring-rose-500",
  "subtle-warning":
    "bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 focus-visible:ring-amber-500",
  "subtle-primary":
    "bg-rn-50 hover:bg-rn-100 text-rn-700 dark:bg-rn-950/40 dark:hover:bg-rn-900/50 dark:text-rn-300 border border-rn-200 dark:border-rn-900/50 focus-visible:ring-rn-500",
};

const sizes = {
  xs: "px-2 py-1 text-xs rounded-lg gap-1",
  sm: "px-3 py-1.5 text-xs font-semibold rounded-xl gap-1.5",
  md: "px-4 py-2 text-sm font-semibold rounded-xl gap-2",
  lg: "px-5 py-2.5 text-base font-semibold rounded-2xl gap-2.5",
};

export const Button = forwardRef(
  (
    {
      children,
      variant = "primary",
      size = "md",
      className = "",
      disabled = false,
      loading = false,
      icon: Icon,
      type = "button",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-medium transition-all duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98] ${
          variants[variant] || variants.primary
        } ${sizes[size] || sizes.md} ${className}`}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : Icon ? (
          <Icon className="w-4 h-4 shrink-0" />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
