"use client";

import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import { crmApi } from "../lib/api";
import {
  Send,
  MessageSquare,
  Sparkles,
  Phone,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Users,
} from "lucide-react";

export default function ReengageModal({
  isOpen,
  onClose,
  target, // { phone, name, dropOffStage, totalEnquiriesCount } OR { isBulk: true, count: number, phones: [] }
  onSuccess,
}) {
  const [customMessage, setCustomMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);

  const isBulk = target?.isBulk;

  const defaultSingleMessage = `Namaste ${
    target?.name && target?.name !== "WhatsApp Customer" && target?.name !== "Incomplete Visitor"
      ? `${target.name} ji! `
      : ""
  }🙏 Welcome to *RN Valves & Faucets*.

Hum dekh rahe hain ki aapki WhatsApp enquiry adhuri rah gayi thi.

Aapko aapke Area ke Regional Sales Manager se connect karne aur special wholesale prices/catalogues paane ke liye, kripya apna:

1️⃣ *Shubh Naam ya Firm ka Naam*
2️⃣ *6-Digit Area PIN Code* (e.g. 110006 ya 141001)

likh kar reply karein. Hamare Sales Executive turant aapko assist karenge! 🚿✨`;

  const defaultBulkMessage = `Namaste! 🙏 Welcome to *RN Valves & Faucets*.

Hum dekh rahe hain ki aapki WhatsApp enquiry adhuri rah gayi thi.

Aapko aapke Area ke Regional Sales Manager se connect karne aur special wholesale prices/catalogues paane ke liye, kripya apna:

1️⃣ *Shubh Naam ya Firm ka Naam*
2️⃣ *6-Digit Area PIN Code* (e.g. 110006 ya 141001)

likh kar reply karein. Hamare Sales Executive turant aapko assist karenge! 🚿✨`;

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessInfo(null);
      setCustomMessage(isBulk ? defaultBulkMessage : defaultSingleMessage);
    }
  }, [isOpen, target, isBulk]);

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isBulk) {
        const res = await crmApi.post("/distribution/reengage-bulk", {
          phones: target.phones || [],
          customMessage: customMessage.trim(),
        });
        setSuccessInfo({
          type: "bulk",
          message: res.data?.message || "Bulk re-engagement greetings delivered successfully!",
          sentCount: res.data?.sentCount || 0,
        });
      } else {
        const res = await crmApi.post("/distribution/reengage", {
          phone: target.phone,
          name: target.name,
          customMessage: customMessage.trim(),
        });
        setSuccessInfo({
          type: "single",
          message: res.data?.message || `Greeting delivered to ${target.phone}!`,
          phone: target.phone,
        });
      }

      if (onSuccess) onSuccess();
    } catch (err) {
      console.error("Reengage error:", err);
      setError(err.response?.data?.error || err.message || "Failed to send greeting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isBulk ? "Bulk Re-engage Dropped Inquiries" : "Send Re-engagement Greeting & Ask PIN"}
      size="md"
    >
      <div className="space-y-4 text-xs">
        {/* Recipient summary */}
        {isBulk ? (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-600" />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  Bulk Broadcast to {target?.phones?.length || 0} Incomplete Inquiries
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Sends automated WhatsApp recovery greeting to all visitors dropped at greeting.
                </p>
              </div>
            </div>
            <Badge variant="warning" size="xs">
              {target?.phones?.length || 0} Recipients
            </Badge>
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-rn-600" />
                {target?.phone}
                {target?.name && (
                  <span className="font-normal text-slate-500">({target.name})</span>
                )}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Stage: <span className="font-medium text-amber-600">{target?.dropOffStage || "Dropped at greeting"}</span>
              </p>
            </div>
            <Badge variant="neutral" size="xs">
              {target?.totalEnquiriesCount || 1} interactions
            </Badge>
          </div>
        )}

        {/* Dynamic WhatsApp Preview Box */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
            WhatsApp Message Content (Editable)
          </label>
          <div className="relative">
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={8}
              className="w-full text-xs font-mono p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rn-500"
              placeholder="Enter greeting message to customer..."
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
            When the customer replies with their 6-digit PIN code, the lead is automatically created and routed to the territorial Sales Executive.
          </p>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 rounded-xl flex items-center gap-2 text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Notice */}
        {successInfo && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/50 rounded-xl space-y-1 text-emerald-800 dark:text-emerald-200">
            <p className="font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {successInfo.message}
            </p>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              WhatsApp sent via Evolution API. As soon as the customer replies with their PIN code, our AI routing will automatically assign them to their designated sales manager.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            {successInfo ? "Close" : "Cancel"}
          </Button>

          {!successInfo && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSend}
              loading={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              <span>{isBulk ? `Broadcast to ${target?.phones?.length || 0} Inquiries` : "Send WhatsApp Greeting"}</span>
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
