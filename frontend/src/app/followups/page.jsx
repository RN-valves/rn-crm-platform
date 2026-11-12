"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import {
  CalendarCheck,
  Clock,
  AlertTriangle,
  PhoneCall,
  MessageSquare,
  CheckCircle2,
  Calendar,
} from "lucide-react";

export default function FollowupsPage() {
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");

  const fetchFollowups = async () => {
    setLoading(true);
    try {
      const res = await crmApi.getFollowups(`?status=${statusFilter}`);
      setFollowups(res.followups || []);
    } catch (err) {
      console.error("Failed to fetch follow-ups:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowups();
  }, [statusFilter]);

  const markComplete = async (id) => {
    try {
      await crmApi.updateFollowupStatus(id, "COMPLETED");
      setFollowups((prev) => prev.filter((f) => f._id !== id));
    } catch (err) {
      console.error("Failed to complete follow-up:", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto">
      <Header
        title="Follow-up Management"
        subtitle="Scheduled calls, WhatsApp reminders, and quotation check-ins"
        onRefresh={fetchFollowups}
        loading={loading}
      />

      <main className="p-8 space-y-6 max-w-6xl mx-auto w-full">
        {/* Status Filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {["PENDING", "COMPLETED", "ALL"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === s ? "bg-rn-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {s === "PENDING" ? "Scheduled Pending" : s === "COMPLETED" ? "Completed History" : "All Tasks"}
              </button>
            ))}
          </div>
        </div>

        {/* Followups Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
            [1, 2, 3, 4].map((k) => (
              <div
                key={k}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm animate-pulse space-y-3"
              >
                <div className="flex justify-between items-center">
                  <div className="h-3 w-16 bg-slate-200 rounded"></div>
                  <div className="h-3 w-12 bg-slate-100 rounded"></div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-4 w-32 bg-slate-200 rounded"></div>
                  <div className="h-3 w-24 bg-slate-100 rounded"></div>
                </div>
                <div className="h-10 w-full bg-slate-50 rounded-xl border border-slate-100"></div>
                <div className="flex justify-between pt-2 border-t border-slate-100">
                  <div className="h-3 w-28 bg-slate-100 rounded"></div>
                  <div className="h-3 w-20 bg-slate-200 rounded"></div>
                </div>
              </div>
            ))
          ) : followups.length === 0 ? (
            <div className="col-span-2 text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
              No follow-ups found for the selected filter.
            </div>
          ) : (
            followups.map((f) => {
              const isOverdue = new Date(f.scheduledAt) < new Date() && f.status === "PENDING";
              return (
                <div
                  key={f._id}
                  className={`bg-white p-5 rounded-2xl border shadow-sm flex flex-col justify-between gap-3 ${
                    isOverdue ? "border-amber-300 bg-amber-50/20" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      Lead: {f.leadNumber}
                    </span>
                    {isOverdue && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600" /> Overdue
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{f.contactName}</h4>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{f.contactPhone}</p>
                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-2">
                      {f.notes}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{new Date(f.scheduledAt).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">{f.assignedName}</span>
                      {f.status === "PENDING" && (
                        <button
                          onClick={() => markComplete(f._id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Mark Done
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
