"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import { Card, CardContent } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import {
  CalendarCheck,
  Clock,
  AlertTriangle,
  PhoneCall,
  MessageSquare,
  CheckCircle2,
  Calendar,
  Phone,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

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

  const overdueCount = followups.filter(
    (f) => new Date(f.scheduledAt) < new Date() && f.status === "PENDING"
  ).length;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors">
      <Header
        title="Follow-up Management"
        subtitle="Scheduled calls, WhatsApp reminders, and quotation check-ins"
        onRefresh={fetchFollowups}
        loading={loading}
      />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto w-full">
        {/* Status Filters & Counters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 p-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
            {["PENDING", "COMPLETED", "ALL"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === s
                    ? "bg-rn-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {s === "PENDING"
                  ? "Scheduled Pending"
                  : s === "COMPLETED"
                  ? "Completed History"
                  : "All Tasks"}
              </button>
            ))}
          </div>

          {overdueCount > 0 && (
            <Badge variant="danger" size="md" icon={AlertTriangle}>
              {overdueCount} Overdue Follow-up{overdueCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Followups Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
            [1, 2, 3, 4].map((k) => (
              <Card key={k} className="p-5 animate-pulse space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  <div className="h-3 w-12 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                </div>
                <div className="h-10 w-full bg-slate-50 dark:bg-slate-800/40 rounded-xl"></div>
              </Card>
            ))
          ) : followups.length === 0 ? (
            <div className="col-span-1 md:col-span-2 text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 text-xs font-medium space-y-2">
              <CalendarCheck className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p>No follow-ups found for the selected filter.</p>
            </div>
          ) : (
            followups.map((f) => {
              const isOverdue =
                new Date(f.scheduledAt) < new Date() && f.status === "PENDING";

              return (
                <Card
                  key={f._id}
                  hover
                  className={`p-5 flex flex-col justify-between gap-3.5 ${
                    isOverdue
                      ? "border-rose-300 dark:border-rose-900 bg-rose-50/20 dark:bg-rose-950/20"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      Lead: {f.leadNumber}
                    </span>
                    {isOverdue ? (
                      <Badge variant="danger" size="xs" icon={AlertTriangle}>
                        Overdue
                      </Badge>
                    ) : (
                      <Badge variant="neutral" size="xs" icon={Clock}>
                        Scheduled
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                      {f.contactName}
                    </h4>
                    <a
                      href={`https://wa.me/${f.contactPhone?.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-mono mt-0.5 inline-flex items-center gap-1"
                    >
                      <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                      {f.contactPhone}
                    </a>
                    {f.notes && (
                      <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 mt-2.5 leading-relaxed">
                        {f.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-medium">
                        {new Date(f.scheduledAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        👤 {f.assignedName}
                      </span>
                      {f.status === "PENDING" && (
                        <Button
                          variant="success"
                          size="xs"
                          onClick={() => markComplete(f._id)}
                          icon={CheckCircle2}
                        >
                          Mark Done
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
