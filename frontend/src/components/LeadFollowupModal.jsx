"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import Input from "./ui/Input";
import { crmApi } from "../lib/api";
import {
  CheckCircle2,
  AlertTriangle,
  Calendar,
  IndianRupee,
  MessageSquare,
  XCircle,
  Clock,
  Phone,
  Building,
  User,
  ArrowRight,
} from "lucide-react";

export default function LeadFollowupModal({ isOpen, onClose, lead, onSuccess }) {
  const [status, setStatus] = useState("NEW");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [comment, setComment] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (isOpen && lead) {
      setError(null);
      setSuccessMsg("");
      setStatus(lead.status || "NEW");
      setEstimatedValue(lead.estimatedValue ? String(lead.estimatedValue) : "");
      if (lead.followupDate) {
        try {
          const d = new Date(lead.followupDate).toISOString().split("T")[0];
          setFollowupDate(d);
        } catch {
          setFollowupDate("");
        }
      } else {
        setFollowupDate("");
      }
      setComment("");
      setLossReason(lead.lossReason || "");
    }
  }, [isOpen, lead]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!lead) return;

    setLoading(true);
    setError(null);
    try {
      await crmApi.updateLeadFollowup({
        leadId: lead._id,
        phone: lead.phone,
        status,
        estimatedValue: estimatedValue ? Number(estimatedValue) : 0,
        followupDate: followupDate || undefined,
        comment: comment.trim(),
        lossReason: status === "LOST" ? lossReason : "",
      });

      setSuccessMsg(`Lead ${lead.leadNumber || lead.phone} status updated to ${status}!`);
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Failed to update follow-up");
    } finally {
      setLoading(false);
    }
  };

  const statusOptions = [
    {
      value: "CONVERTED",
      label: "Converted (Deal Won)",
      desc: "Order confirmed / Deal closed successfully",
      badge: "success",
      icon: "🎉",
      color: "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200",
    },
    {
      value: "QUOTATION_SENT",
      label: "Quotation / Price List Sent",
      desc: "Wholesale prices, catalogue & margins delivered",
      badge: "purple",
      icon: "📄",
      color: "border-purple-500 bg-purple-50/50 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200",
    },
    {
      value: "NEGOTIATION",
      label: "In Negotiation / Price Discussion",
      desc: "Discussing margins, discount, and batch sizes",
      badge: "blue",
      icon: "💬",
      color: "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200",
    },
    {
      value: "INTERESTED",
      label: "Interested (Product Qualified)",
      desc: "Dealer confirmed interest in specific product line",
      badge: "indigo",
      icon: "✨",
      color: "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200",
    },
    {
      value: "CONTACTED",
      label: "Contacted (Follow-up In Progress)",
      desc: "Spoke on call / WhatsApp, awaiting response",
      badge: "warning",
      icon: "📞",
      color: "border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200",
    },
    {
      value: "LOST",
      label: "Deal Lost / Closed",
      desc: "Customer not interested / Price barrier / Competitor",
      badge: "danger",
      icon: "❌",
      color: "border-rose-500 bg-rose-50/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200",
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Update Follow-up: ${lead?.leadNumber || "Lead"}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Lead Summary Header */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                {lead?.customerName || "Customer"}
              </span>
              {lead?.businessName && (
                <span className="text-[11px] text-slate-500 font-medium">
                  • {lead.businessName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-slate-500 text-[11px]">
              <span className="flex items-center gap-1 font-mono">
                <Phone className="w-3 h-3 text-slate-400" />
                {lead?.phone}
              </span>
              {lead?.city && (
                <span>
                  📍 {lead.city} {lead?.pincode ? `(${lead.pincode})` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Assigned Rep
            </span>
            <span className="font-bold text-rn-600 dark:text-rn-400 text-xs">
              👤 {lead?.assignedEmployeeName || "Unassigned"}
            </span>
          </div>
        </div>

        {/* Status Selection Cards */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Follow-up Outcome / Stage
          </label>
          <div className="grid grid-cols-1 gap-2">
            {statusOptions.map((opt) => {
              const isSelected = status === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                    isSelected
                      ? `${opt.color} ring-2 ring-rn-500/30 font-bold shadow-sm`
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{opt.icon}</span>
                    <div>
                      <p className="text-xs font-bold leading-tight">{opt.label}</p>
                      <p className="text-[10px] opacity-75">{opt.desc}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="w-2.5 h-2.5 rounded-full bg-rn-600 dark:bg-rn-400"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* If Lost: Reason selector */}
        {status === "LOST" && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl space-y-1.5 animate-fadeIn">
            <label className="block text-[11px] font-bold text-rose-900 dark:text-rose-200 uppercase tracking-wider">
              Reason for Loss / Drop
            </label>
            <select
              value={lossReason}
              onChange={(e) => setLossReason(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="">-- Select Loss Reason --</option>
              <option value="Price Higher than Local Market">Price Higher than Local Market / Margin Issue</option>
              <option value="Competitor Brand Preferred">Competitor Brand Preferred (Jaquar, Prayag, etc.)</option>
              <option value="Out of Delivery Territory">Out of Delivery Territory / Logistics Cost</option>
              <option value="Customer Not Responding">Customer Not Responding (3+ Calls/Messages)</option>
              <option value="Requirement Cancelled">Requirement Cancelled / Retailer Backed Out</option>
              <option value="Other">Other Reason</option>
            </select>
          </div>
        )}

        {/* Order / Deal Value & Next Follow-up Date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              {status === "CONVERTED" ? "Won Deal Value (₹)" : "Estimated Value (₹)"}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-bold">₹</span>
              <input
                type="number"
                placeholder="e.g. 50000"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                className="w-full pl-7 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rn-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
              Next Follow-up Date
            </label>
            <input
              type="date"
              value={followupDate}
              onChange={(e) => setFollowupDate(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rn-500"
            />
          </div>
        </div>

        {/* Follow-up Remarks / Progress Notes */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
            Follow-up Remarks / Notes
          </label>
          <textarea
            rows={3}
            placeholder="e.g. Customer approved CP bath fittings quote. Sample dispatched via courier. Recheck order status on Monday."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rn-500"
          ></textarea>
        </div>

        {/* Error / Success Messages */}
        {error && (
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Follow-up Update"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
