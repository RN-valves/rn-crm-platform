"use client";

const variantStyles = {
  default:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  primary:
    "bg-rn-50 text-rn-700 dark:bg-rn-950/60 dark:text-rn-300 border-rn-200 dark:border-rn-800/60",
  success:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
  warning:
    "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
  danger:
    "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800/60",
  info:
    "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800/60",
  purple:
    "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/60",
  indigo:
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60",
  neutral:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

export default function Badge({
  children,
  variant = "default",
  size = "sm",
  dot = false,
  dotColor,
  icon: Icon,
  className = "",
}) {
  const sizeClass =
    size === "xs"
      ? "text-[10px] px-1.5 py-0.5"
      : size === "md"
      ? "text-xs px-2.5 py-1 font-semibold"
      : "text-[11px] px-2 py-0.5 font-medium";

  const resolvedVariant = variantStyles[variant] || variantStyles.default;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border tracking-wide select-none ${resolvedVariant} ${sizeClass} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            dotColor ||
            (variant === "success"
              ? "bg-emerald-500"
              : variant === "danger"
              ? "bg-rose-500"
              : variant === "warning"
              ? "bg-amber-500"
              : variant === "primary"
              ? "bg-rn-600"
              : "bg-slate-400")
          }`}
        />
      )}
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      {children}
    </span>
  );
}
