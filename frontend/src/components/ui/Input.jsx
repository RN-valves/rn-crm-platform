"use client";

import { forwardRef } from "react";

export const Input = forwardRef(
  (
    {
      label,
      error,
      helperText,
      icon: Icon,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    return (
      <div className="w-full space-y-1">
        {label && (
          <label
            htmlFor={id}
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            {label}
          </label>
        )}
        <div className="relative rounded-xl shadow-sm">
          {Icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Icon className="w-4 h-4" />
            </div>
          )}
          <input
            id={id}
            ref={ref}
            className={`w-full text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl border transition-colors outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-rn-500/20 focus:border-rn-500 disabled:opacity-50 disabled:cursor-not-allowed ${
              Icon ? "pl-9" : "px-3.5"
            } py-2.5 ${
              error
                ? "border-rose-400 dark:border-rose-600 focus:border-rose-500"
                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
            } ${className}`}
            {...props}
          />
        </div>
        {error ? (
          <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-[11px] text-slate-400">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
