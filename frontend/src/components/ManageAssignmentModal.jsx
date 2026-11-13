"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import Input from "./ui/Input";
import { crmApi } from "../lib/api";
import {
  UserCheck,
  UserX,
  Search,
  Phone,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Send,
  MessageSquare,
  Sparkles,
  Building,
} from "lucide-react";

export default function ManageAssignmentModal({
  isOpen,
  onClose,
  target, // { leadId, phone, customerName, currentAgentName, currentAgentPhone, city, businessName, reason }
  executives = [],
  onSuccess,
}) {
  const [tab, setTab] = useState("assign"); // "assign" | "unassign"
  const [search, setSearch] = useState("");
  const [selectedExecName, setSelectedExecName] = useState("");
  const [notifyAgent, setNotifyAgent] = useState(true);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [adminNote, setAdminNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessInfo(null);
      setSearch("");
      setAdminNote("");
      setNotifyAgent(true);
      setNotifyCustomer(true);
      // If current agent matches one of the executives, pre-select or keep empty
      const current = executives.find(
        (e) => e.name === target?.currentAgentName && target?.currentAgentName !== "Unassigned Agent"
      );
      setSelectedExecName(current ? current.name : "");
      setTab(target?.currentAgentName && target.currentAgentName !== "Unassigned Agent" ? "assign" : "assign");
    }
  }, [isOpen, target, executives]);

  const filteredExecutives = (executives || []).filter((exec) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      exec.name?.toLowerCase().includes(q) ||
      exec.state?.toLowerCase().includes(q) ||
      exec.area?.toLowerCase().includes(q) ||
      exec.mobile?.replace(/\D/g, "").includes(q.replace(/\D/g, ""))
    );
  });

  const selectedExec = executives.find((e) => e.name === selectedExecName);

  const handleConfirmAssignment = async () => {
    if (!selectedExec) {
      setError("Please select an executive to assign.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        action: "assign",
        leadId: target?.leadId,
        phone: target?.phone,
        customerName: target?.customerName,
        executiveName: selectedExec.name,
        executivePhone: selectedExec.mobile,
        notifyAgent,
        notifyCustomer,
        notes: adminNote.trim(),
      };

      const res = await crmApi.assignLeadToExecutive(payload);

      let feedback = `Assigned to ${selectedExec.name}!`;
      if (res?.notifications?.agentNotified && res?.notifications?.customerNotified) {
        feedback += " WhatsApp sent to both Executive & Customer.";
      } else if (res?.notifications?.agentNotified) {
        feedback += ` WhatsApp sent to ${selectedExec.name}.`;
      } else if (res?.notifications?.customerNotified) {
        feedback += " WhatsApp sent to Customer.";
      }

      setSuccessInfo(feedback);
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err) {
      console.error("Assignment error:", err);
      setError(err.message || "Failed to assign executive");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmUnassign = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        action: "unassign",
        leadId: target?.leadId,
        phone: target?.phone,
        customerName: target?.customerName,
      };

      await crmApi.assignLeadToExecutive(payload);

      setSuccessInfo("Agent unassigned successfully.");
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error("Unassign error:", err);
      setError(err.message || "Failed to unassign agent");
    } finally {
      setLoading(false);
    }
  };

  const isCurrentAssigned =
    target?.currentAgentName &&
    target.currentAgentName !== "Unassigned Agent" &&
    target.currentAgentName !== "Unassigned";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Agent Assignment"
      subtitle={`Customer: ${target?.customerName || "Inquiry"} • ${target?.phone || ""}`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* Customer Context Card */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between text-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                {target?.customerName || "Customer"}
              </span>
              <span className="font-mono text-slate-500 dark:text-slate-400">
                {target?.phone}
              </span>
            </div>
            {target?.city && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 text-rn-500" />
                {target.city}
              </p>
            )}
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Current Agent
            </span>
            <span
              className={`text-xs font-bold ${
                isCurrentAssigned
                  ? "text-rn-600 dark:text-rn-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {target?.currentAgentName || "Unassigned"}
            </span>
          </div>
        </div>

        {/* Tab Selector: Assign vs Unassign */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
          <button
            onClick={() => setTab("assign")}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              tab === "assign"
                ? "bg-white dark:bg-slate-900 text-rn-600 dark:text-rn-400 shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Assign / Change Agent</span>
          </button>
          <button
            onClick={() => setTab("unassign")}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              tab === "unassign"
                ? "bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <UserX className="w-4 h-4" />
            <span>Unassign Agent</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Banner */}
        {successInfo && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successInfo}</span>
          </div>
        )}

        {/* TAB 1: ASSIGN / CHANGE AGENT */}
        {tab === "assign" && (
          <div className="space-y-3">
            {/* Search Box */}
            <Input
              type="text"
              placeholder="Search team member by name, state, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={Search}
            />

            {/* List of Team Members from DB */}
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 dark:divide-slate-800">
              {filteredExecutives.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No sales executives found.
                </div>
              ) : (
                filteredExecutives.map((exec) => {
                  const isSelected = selectedExecName === exec.name;
                  const isCurrent = target?.currentAgentName === exec.name;

                  return (
                    <div
                      key={exec._id || exec.name}
                      onClick={() => setSelectedExecName(exec.name)}
                      className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between border ${
                        isSelected
                          ? "bg-rn-50/90 dark:bg-rn-950/60 border-rn-400 dark:border-rn-600 shadow-sm"
                          : "bg-white dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "bg-rn-600 text-white"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {exec.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-white">
                              {exec.name}
                            </span>
                            {isCurrent && (
                              <Badge variant="neutral" size="xs">
                                Current
                              </Badge>
                            )}
                            {exec.isDefaultFallback && (
                              <Badge variant="info" size="xs">
                                Head Office
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            {exec.state || exec.area || "All India"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {exec.mobile}
                        </span>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? "border-rn-600 bg-rn-600 text-white"
                              : "border-slate-300 dark:border-slate-600"
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Notification Checkboxes */}
            <div className="p-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Instant WhatsApp Notifications
              </span>

              <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={notifyAgent}
                  onChange={(e) => setNotifyAgent(e.target.checked)}
                  className="mt-0.5 rounded text-rn-600 focus:ring-rn-500"
                />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <Send className="w-3 h-3 text-emerald-600" />
                    Send WhatsApp alert to Sales Executive
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Sends lead name, mobile, and region directly to{" "}
                    {selectedExec ? selectedExec.name : "selected representative"}.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={notifyCustomer}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                  className="mt-0.5 rounded text-rn-600 focus:ring-rn-500"
                />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3 text-rn-600" />
                    Send WhatsApp confirmation to Customer
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Informs customer that {selectedExec ? selectedExec.name : "our executive"} has
                    been designated for their support.
                  </p>
                </div>
              </label>
            </div>

            {/* Optional Note */}
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                Optional Admin Note / Quotation Requirement:
              </label>
              <input
                type="text"
                placeholder="e.g. Urgent wholesale dealer quote required for 500 faucets"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rn-500"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmAssignment}
                disabled={loading || !selectedExecName}
                icon={UserCheck}
              >
                {loading ? "Assigning & Sending Alerts..." : `Assign to ${selectedExecName || "Agent"}`}
              </Button>
            </div>
          </div>
        )}

        {/* TAB 2: UNASSIGN AGENT */}
        {tab === "unassign" && (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Confirm Agent Unassignment</span>
              </div>
              <p className="leading-relaxed">
                Are you sure you want to remove the assigned executive (
                <strong>{target?.currentAgentName || "Current Agent"}</strong>) from this inquiry?
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-amber-700 dark:text-amber-400">
                <li>Status will be set back to <strong>Unassigned Agent</strong>.</li>
                <li>The lead will appear in the unassigned queue for redistribution.</li>
                <li>No cancellation WhatsApp message will be sent to the customer.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmUnassign}
                disabled={loading}
                icon={UserX}
              >
                {loading ? "Unassigning..." : "Confirm Unassign Agent"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
