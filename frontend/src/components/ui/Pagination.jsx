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

      {/* Right: Bootstrap 5 Pagination */}
      <nav aria-label="Table navigation">
        <ul className="pagination pagination-sm mb-0 flex items-center">
          {/* First Page */}
          <li className={`page-item ${safeCurrentPage === 1 ? "disabled" : ""}`}>
            <button
              type="button"
              onClick={() => handlePage(1)}
              disabled={safeCurrentPage === 1}
              className="page-link"
              title="First Page"
              aria-label="First"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
          </li>

          {/* Prev Page */}
          <li className={`page-item ${safeCurrentPage === 1 ? "disabled" : ""}`}>
            <button
              type="button"
              onClick={() => handlePage(safeCurrentPage - 1)}
              disabled={safeCurrentPage === 1}
              className="page-link"
              title="Previous Page"
              aria-label="Previous"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </li>

          {/* Number Buttons */}
          {getPageNumbers().map((num, idx) => {
            if (num === "...") {
              return (
                <li key={`dots-${idx}`} className="page-item disabled">
                  <span className="page-link">...</span>
                </li>
              );
            }
            const isActive = num === safeCurrentPage;
            return (
              <li key={num} className={`page-item ${isActive ? "active" : ""}`}>
                <button
                  type="button"
                  onClick={() => handlePage(num)}
                  className="page-link"
                >
                  {num}
                </button>
              </li>
            );
          })}

          {/* Next Page */}
          <li className={`page-item ${safeCurrentPage === totalPages ? "disabled" : ""}`}>
            <button
              type="button"
              onClick={() => handlePage(safeCurrentPage + 1)}
              disabled={safeCurrentPage === totalPages}
              className="page-link"
              title="Next Page"
              aria-label="Next"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </li>

          {/* Last Page */}
          <li className={`page-item ${safeCurrentPage === totalPages ? "disabled" : ""}`}>
            <button
              type="button"
              onClick={() => handlePage(totalPages)}
              disabled={safeCurrentPage === totalPages}
              className="page-link"
              title="Last Page"
              aria-label="Last"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
