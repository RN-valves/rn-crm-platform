"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export default function Pagination({
  totalItems = 0,
  currentPage = 1,
  pageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
  className = "",
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  // Calculate visible page buttons (max 5 around current)
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push("...");

      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);

      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }

      if (safeCurrentPage < totalPages - 2) pages.push("...");
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }
    return pages;
  };

  const handlePage = (page) => {
    if (page >= 1 && page <= totalPages && page !== safeCurrentPage) {
      if (onPageChange) onPageChange(page);
    }
  };

  if (totalItems === 0) return null;

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-200/90 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 select-none ${className}`}
    >
      {/* Left: Summary text & Page Size Selector */}
      <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
        <span className="font-medium">
          Showing <strong className="text-slate-900 dark:text-white font-bold">{startItem}</strong> to{" "}
          <strong className="text-slate-900 dark:text-white font-bold">{endItem}</strong> of{" "}
          <strong className="text-slate-900 dark:text-white font-bold">{totalItems}</strong> entries
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-800">
            <span className="text-[11px] font-bold text-slate-400">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700/70 text-slate-900 dark:text-white rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-rn-500"
            >
              {pageSizeOptions.map((sz) => (
                <option key={sz} value={sz}>
                  {sz} / page
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page Navigation Buttons */}
      <div className="flex items-center gap-1">
        {/* First Page */}
        <button
          type="button"
          onClick={() => handlePage(1)}
          disabled={safeCurrentPage === 1}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="First Page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>

        {/* Prev Page */}
        <button
          type="button"
          onClick={() => handlePage(safeCurrentPage - 1)}
          disabled={safeCurrentPage === 1}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Previous Page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Number Buttons */}
        <div className="flex items-center gap-1 mx-1">
          {getPageNumbers().map((num, idx) => {
            if (num === "...") {
              return (
                <span key={`dots-${idx}`} className="px-1.5 text-slate-400 font-bold">
                  ...
                </span>
              );
            }
            const isActive = num === safeCurrentPage;
            return (
              <button
                key={num}
                type="button"
                onClick={() => handlePage(num)}
                className={`min-w-7 h-7 px-2 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? "bg-rn-600 text-white shadow-sm"
                    : "border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {num}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          type="button"
          onClick={() => handlePage(safeCurrentPage + 1)}
          disabled={safeCurrentPage === totalPages}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Next Page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => handlePage(totalPages)}
          disabled={safeCurrentPage === totalPages}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Last Page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
