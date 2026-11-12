"use client";

import { useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Input from "./ui/Input";
import { crmApi } from "../lib/api";
import { Trash2, Phone, AlertTriangle, CheckCircle } from "lucide-react";

export default function CleanTestModal({ isOpen, onClose, onCleaned }) {
  const [phone, setPhone] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone.trim()) return;

    setCleaning(true);
    setMessage("");
    setIsSuccess(false);

    try {
      const res = await crmApi.cleanTestNumberLeads(phone.trim());
      setIsSuccess(true);
      setMessage(res.message || "Successfully purged all test records for this number!");
      if (onCleaned) await onCleaned();
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      setIsSuccess(false);
      setMessage(err.message || "Failed to purge test number records.");
    } finally {
      setCleaning(false);
    }
  };

  const handleClose = () => {
    setMessage("");
    setPhone("");
    setIsSuccess(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Clean Test Leads"
      subtitle="Safely purge duplicate testing enquiries, chat logs, and mock pipeline deals"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            Enter the exact phone number (e.g. <span className="font-mono font-bold">+91 9811122233</span>) you tested with. This permanently deletes all associated test leads and resets the conversation state.
          </p>
        </div>

        <Input
          label="Test Phone Number"
          type="text"
          placeholder="+91 9811122233 or 9811122233"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          icon={Phone}
          required
          autoFocus
        />

        {message && (
          <div
            className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
              isSuccess
                ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                : "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
            }`}
          >
            {isSuccess ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{message}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={cleaning}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            size="sm"
            loading={cleaning}
            disabled={!phone.trim() || cleaning}
            icon={Trash2}
          >
            {cleaning ? "Purging Records..." : "Purge Test Leads"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
