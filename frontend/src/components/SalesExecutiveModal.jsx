"use client";

import { useState, useEffect } from "react";
import { crmApi } from "../lib/api";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Input from "./ui/Input";
import Badge from "./ui/Badge";
import {
  Plus,
  Edit2,
  Trash2,
  Phone,
  MapPin,
  Check,
  AlertCircle,
  Users,
  ShieldCheck,
  Hash,
  Sparkles,
} from "lucide-react";

export default function SalesExecutiveModal({ isOpen, onClose, onUpdated }) {
  const [executives, setExecutives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Edit / Add Form State
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    state: "",
    area: "",
    pinPrefixes: "",
    isActive: true,
    isDefaultFallback: false,
  });

  const fetchExecutives = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await crmApi.getSalesExecutives();
      setExecutives(res.executives || []);
    } catch (err) {
      console.error("Failed to fetch executives:", err);
      setError("Failed to load executives. Please check connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchExecutives();
      setIsEditing(false);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  const handleOpenAdd = () => {
    setCurrentId(null);
    setFormData({
      name: "",
      mobile: "+91 ",
      state: "",
      area: "",
      pinPrefixes: "",
      isActive: true,
      isDefaultFallback: false,
    });
    setIsEditing(true);
    setError(null);
  };

  const handleOpenEdit = (exec) => {
    setCurrentId(exec._id);
    setFormData({
      name: exec.name || "",
      mobile: exec.mobile || "",
      state: exec.state || "",
      area: exec.area || "",
      pinPrefixes: Array.isArray(exec.pinPrefixes) ? exec.pinPrefixes.join(", ") : "",
      isActive: exec.isActive !== undefined ? exec.isActive : true,
      isDefaultFallback: Boolean(exec.isDefaultFallback),
    });
    setIsEditing(true);
    setError(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.mobile.trim() || !formData.state.trim()) {
      setError("Please fill in Name, Mobile Number, and State/Territory.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: formData.name.trim(),
        mobile: formData.mobile.trim(),
        state: formData.state.trim(),
        area: formData.area.trim(),
        pinPrefixes: formData.pinPrefixes
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
        isActive: formData.isActive,
        isDefaultFallback: formData.isDefaultFallback,
      };

      if (currentId) {
        await crmApi.updateSalesExecutive(currentId, payload);
        setSuccessMsg(`Executive ${payload.name} updated successfully!`);
      } else {
        await crmApi.createSalesExecutive(payload);
        setSuccessMsg(`Executive ${payload.name} registered successfully!`);
      }

      await fetchExecutives();
      setIsEditing(false);
      if (onUpdated) onUpdated();

      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      console.error("Save error:", err);
      setError(err.message || "Failed to save executive");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove executive "${name}"?`)) return;

    try {
      await crmApi.deleteSalesExecutive(id);
      setSuccessMsg(`Executive "${name}" removed successfully.`);
      await fetchExecutives();
      if (onUpdated) onUpdated();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err.message || "Failed to delete executive");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sales Executive & Territory Manager"
      subtitle="Manage team contacts, territory routing, and PIN code assignment for WhatsApp leads"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Feedback Notices */}
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {isEditing ? (
          /* Add / Edit Form */
          <form
            onSubmit={handleSave}
            className="space-y-4 bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {currentId ? "Edit Sales Executive Profile" : "Register New Sales Executive"}
              </h4>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Executive Full Name *"
                type="text"
                required
                placeholder="e.g. Arpita or Gaurav"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />

              <Input
                label="WhatsApp Mobile Number *"
                type="text"
                required
                placeholder="+91 93155 96055"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                icon={Phone}
              />

              <Input
                label="Assigned State / Primary Region *"
                type="text"
                required
                placeholder="e.g. UP / Bihar / Delhi NCR"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                icon={MapPin}
              />

              <Input
                label="Detailed Territory / Area"
                type="text"
                placeholder="e.g. North Zone & Wholesale Traders"
                value={formData.area}
                onChange={(e) => setFormData({ ...formData, area: e.target.value })}
              />
            </div>

            <div>
              <Input
                label="Assigned 2-digit PIN Code Prefixes (comma separated)"
                type="text"
                placeholder="e.g. 11, 20, 21, 22, 24, 26, 80"
                value={formData.pinPrefixes}
                onChange={(e) => setFormData({ ...formData, pinPrefixes: e.target.value })}
                icon={Hash}
                helperText="Indian PIN codes matching these 2 digits are routed to this executive by the AI assistant."
              />
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded text-rn-600 focus:ring-rn-500 w-4 h-4 cursor-pointer"
                />
                Active (Receives WhatsApp Leads)
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formData.isDefaultFallback}
                  onChange={(e) => setFormData({ ...formData, isDefaultFallback: e.target.checked })}
                  className="rounded text-rn-600 focus:ring-rn-500 w-4 h-4 cursor-pointer"
                />
                Central Fallback (Receives unassigned/unmapped regions)
              </label>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-700">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={saving}
              >
                {saving ? "Saving..." : currentId ? "Update Executive" : "Register Executive"}
              </Button>
            </div>
          </form>
        ) : (
          /* Executives List */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Configured Sales Team ({executives.length})
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenAdd}
                icon={Plus}
              >
                Add Executive
              </Button>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400 text-xs font-medium space-y-2">
                <div className="animate-spin w-5 h-5 border-2 border-rn-600 border-t-transparent rounded-full mx-auto" />
                <p>Loading sales team members...</p>
              </div>
            ) : executives.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs font-medium bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800">
                No sales executives found. Click "Add Executive" to create one.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                {executives.map((exec) => (
                  <div
                    key={exec._id}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {exec.name}
                        </h4>
                        {exec.isDefaultFallback && (
                          <Badge variant="warning" size="xs">
                            Central Fallback
                          </Badge>
                        )}
                        {!exec.isActive ? (
                          <Badge variant="neutral" size="xs">
                            Inactive
                          </Badge>
                        ) : (
                          <Badge variant="success" size="xs" dot>
                            Active
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1 font-mono font-medium text-emerald-700 dark:text-emerald-400">
                          <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                          {exec.mobile}
                        </span>
                        <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                          <MapPin className="w-3 h-3 text-rn-500 shrink-0" />
                          {exec.state}
                        </span>
                        {exec.area && (
                          <span className="text-slate-500 dark:text-slate-400">
                            • {exec.area}
                          </span>
                        )}
                      </div>

                      {exec.pinPrefixes && exec.pinPrefixes.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                          <span className="text-[10px] text-slate-400 font-medium">PINs:</span>
                          {exec.pinPrefixes.map((p) => (
                            <span
                              key={p}
                              className="text-[10px] px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-600 dark:text-slate-300 font-mono"
                            >
                              {p}*
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => handleOpenEdit(exec)}
                        icon={Edit2}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="subtle-danger"
                        size="xs"
                        onClick={() => handleDelete(exec._id, exec.name)}
                        icon={Trash2}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
