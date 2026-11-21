"use client";

import { useState, useEffect, useMemo } from "react";
import Header from "../../components/Header";
import LeadFollowupModal from "../../components/LeadFollowupModal";
import Modal from "../../components/ui/Modal";
import Input from "../../components/ui/Input";
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
  Plus,
  Search,
} from "lucide-react";

export default function FollowupsPage() {
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING"); // "PENDING", "OVERDUE", "TODAY", "COMPLETED", "ALL"
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [newTask, setNewTask] = useState({
    contactName: "",
    contactPhone: "",
    assignedName: "",
    scheduledAt: "",
    type: "PHONE_CALL",
    notes: "",
  });
  const [creating, setCreating] = useState(false);

  const fetchFollowups = async (force = false) => {
    setLoading(true);
    try {
      const apiStatus =
        statusFilter === "COMPLETED"
          ? "COMPLETED"
          : statusFilter === "ALL"
          ? "ALL"
          : "PENDING";
      const res = await crmApi.getFollowups(`?status=${apiStatus}`, force);
      setFollowups(res.followups || []);
    } catch (err) {
      console.error("Failed to fetch follow-ups:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowups(false);
  }, [statusFilter]);

  const markComplete = async (id) => {
    const prev = followups;
    setFollowups((list) => list.filter((f) => f._id !== id));
    try {
      await crmApi.updateFollowupStatus(id, "COMPLETED");
    } catch (err) {
      setFollowups(prev);
      console.error("Failed to complete follow-up:", err);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTask.contactName.trim() || !newTask.contactPhone.trim() || !newTask.scheduledAt) return;
    setCreating(true);
    try {
      await crmApi.createFollowup({
        ...newTask,
        scheduledAt: new Date(newTask.scheduledAt).toISOString(),
      });
      setIsCreateOpen(false);
      setNewTask({
        contactName: "",
        contactPhone: "",
        assignedName: "",
        scheduledAt: "",
        type: "PHONE_CALL",
        notes: "",
      });
      await fetchFollowups(true);
    } catch (err) {
      alert(err.message || "Failed to schedule follow-up");
    } finally {
      setCreating(false);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const nowMs = Date.now();

  const filteredList = useMemo(() => {
    return followups.filter((f) => {
      const schedDateStr = f.scheduledAt
        ? new Date(f.scheduledAt).toISOString().split("T")[0]
        : "";
      const isOverdue =
        f.status === "PENDING" && f.scheduledAt && new Date(f.scheduledAt).getTime() < nowMs;

      if (statusFilter === "OVERDUE" && !isOverdue) return false;
      if (statusFilter === "TODAY" && schedDateStr !== todayStr) return false;

      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (
        f.contactName?.toLowerCase().includes(s) ||
        f.contactPhone?.toLowerCase().includes(s) ||
        f.assignedName?.toLowerCase().includes(s) ||
        f.leadNumber?.toLowerCase().includes(s) ||
        f.notes?.toLowerCase().includes(s)
      );
    });
  }, [followups, statusFilter, search, todayStr, nowMs]);

  const overdueCount = followups.filter(
    (f) => f.status === "PENDING" && f.scheduledAt && new Date(f.scheduledAt).getTime() < nowMs
  ).length;
  const dueTodayCount = followups.filter(
    (f) =>
      f.status === "PENDING" &&
      f.scheduledAt &&
      new Date(f.scheduledAt).toISOString().split("T")[0] === todayStr
  ).length;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-[#F8FAFC] dark:bg-slate-950 transition-colors">
      <Header
        title="Follow-ups & Reminders"
        subtitle="Scheduled dealer calls, WhatsApp check-ins, and quotation reminders"
        onRefresh={() => fetchFollowups(true)}
        loading={loading}
        actions={
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1091d0] hover:bg-[#0c7db5] text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule Follow-up</span>
          </button>
        }
      />

      <main className="p-4 sm:p-6 lg:p-7 space-y-5 max-w-6xl mx-auto w-full">
        {/* Minimalist Counters */}
        <div className="grid grid-cols-3 gap-3.5">
          <Card className="cursor-pointer" hover onClick={() => setStatusFilter("PENDING")}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total Pending
                </span>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {followups.filter((f) => f.status === "PENDING").length}
                </p>
              </div>
              <Clock className="w-5 h-5 text-[#1091d0]" />
            </CardContent>
          </Card>

          <Card className="cursor-pointer" hover onClick={() => setStatusFilter("TODAY")}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  Due Today
                </span>
                <p className="text-2xl font-black text-emerald-600 mt-1">{dueTodayCount}</p>
              </div>
              <Calendar className="w-5 h-5 text-emerald-600" />
            </CardContent>
          </Card>

          <Card className="cursor-pointer" hover onClick={() => setStatusFilter("OVERDUE")}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
                  Overdue
                </span>
                <p className="text-2xl font-black text-rose-600 mt-1">{overdueCount}</p>
              </div>
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </CardContent>
          </Card>
        </div>

        {/* Filter Pills & Search */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/85 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-800 p-1 rounded-xl flex-wrap">
            {[
              { id: "PENDING", label: "Pending" },
              { id: "TODAY", label: "Due Today" },
              { id: "OVERDUE", label: "Overdue" },
              { id: "COMPLETED", label: "Completed" },
              { id: "ALL", label: "All" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === tab.id
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-64">
            <Input
              type="text"
              placeholder="Search customer, phone, rep..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={Search}
            />
          </div>
        </div>

        {/* Follow-up Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading && followups.length === 0 ? (
            [1, 2].map((k) => (
              <Card key={k} className="p-5 animate-pulse space-y-3">
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-10 w-full bg-slate-100 dark:bg-slate-800/60 rounded-xl" />
              </Card>
            ))
          ) : filteredList.length === 0 ? (
            <div className="col-span-1 md:col-span-2 text-center py-14 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/85 dark:border-slate-800 text-slate-400 text-xs font-medium space-y-2">
              <CalendarCheck className="w-8 h-8 mx-auto text-slate-300" />
              <p>No follow-ups in this view. Click "Schedule Follow-up" or set a follow-up date on any lead.</p>
            </div>
          ) : (
            filteredList.map((f) => {
              const isOverdue =
                f.status === "PENDING" &&
                f.scheduledAt &&
                new Date(f.scheduledAt).getTime() < nowMs;

              return (
                <Card
                  key={f._id}
                  hover
                  className={`p-5 flex flex-col justify-between gap-3.5 ${
                    isOverdue ? "border-rose-200 dark:border-rose-900/70" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                          {f.contactName}
                        </h4>
                        {f.leadNumber && (
                          <span className="text-[10px] font-mono text-slate-400">
                            {f.leadNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        👤 {f.assignedName || "Unassigned"}
                        {f.city ? ` • ${f.city}` : ""}
                      </p>
                    </div>

                    {f.status === "COMPLETED" ? (
                      <Badge variant="success" size="xs" icon={CheckCircle2}>
                        Done
                      </Badge>
                    ) : isOverdue ? (
                      <Badge variant="danger" size="xs" icon={AlertTriangle}>
                        Overdue
                      </Badge>
                    ) : (
                      <Badge variant="info" size="xs" icon={Clock}>
                        Scheduled
                      </Badge>
                    )}
                  </div>

                  {f.notes && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl leading-relaxed">
                      {f.notes}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {f.scheduledAt ? new Date(f.scheduledAt).toLocaleString("en-IN") : "—"}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <a
                        href={`https://wa.me/${(f.contactPhone || "").replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold inline-flex items-center gap-1 transition-colors"
                      >
                        <Phone className="w-3 h-3" />
                        <span>WhatsApp</span>
                      </a>

                      {f.leadObj && (
                        <button
                          type="button"
                          onClick={() => setSelectedLead(f.leadObj)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#EEF6FF] hover:bg-[#DCEBFF] text-[#0c7db5] font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Update</span>
                        </button>
                      )}

                      {f.status === "PENDING" && (
                        <Button
                          variant="primary"
                          size="xs"
                          onClick={() => markComplete(f._id)}
                          icon={CheckCircle2}
                        >
                          Done
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

      {/* Lead Follow-up Update Modal */}
      <LeadFollowupModal
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        lead={selectedLead}
        onSuccess={() => fetchFollowups(true)}
      />

      {/* Create New Follow-up Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Schedule New Follow-up"
      >
        <form onSubmit={handleCreateTask} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Customer Name *
              </label>
              <input
                type="text"
                required
                value={newTask.contactName}
                onChange={(e) => setNewTask({ ...newTask, contactName: e.target.value })}
                placeholder="e.g. Ramesh Hardware"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Phone Number *
              </label>
              <input
                type="text"
                required
                value={newTask.contactPhone}
                onChange={(e) => setNewTask({ ...newTask, contactPhone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Follow-up Date & Time *
              </label>
              <input
                type="datetime-local"
                required
                value={newTask.scheduledAt}
                onChange={(e) => setNewTask({ ...newTask, scheduledAt: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Assigned Executive
              </label>
              <input
                type="text"
                value={newTask.assignedName}
                onChange={(e) => setNewTask({ ...newTask, assignedName: e.target.value })}
                placeholder="e.g. Danish / Pradeep"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Follow-up Notes
            </label>
            <textarea
              rows={3}
              value={newTask.notes}
              onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
              placeholder="Quotation check-in, sample dispatch, price confirmation..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={creating}>
              {creating ? "Scheduling..." : "Save Follow-up"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
