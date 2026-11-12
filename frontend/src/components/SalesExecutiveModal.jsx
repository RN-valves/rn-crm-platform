"use client";

import { useState, useEffect } from "react";
import { crmApi } from "../lib/api";
import {
  X,
  Plus,
  Edit2,
  Trash2,
  Phone,
  MapPin,
  Check,
  AlertCircle,
  Users,
  Shield,
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
        setSuccessMsg(`Executive ${payload.name} added successfully!`);
      }

      await fetchExecutives();
      setIsEditing(false);
      if (onUpdated) onUpdated();

      setTimeout(() => setSuccessMsg(null), 4000);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rn-50 text-rn-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Sales Executive & Territory Manager
              </h2>
              <p className="text-xs text-slate-500">
                Manage sales team contacts, assigned states, and PIN code routing for WhatsApp leads
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Notices */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {isEditing ? (
            /* Add / Edit Form */
            <form onSubmit={handleSave} className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-bold text-slate-900">
                  {currentId ? "Edit Sales Executive" : "Add New Sales Executive"}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Executive Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Executive Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Arpita or Gaurav"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-rn-500"
                  />
                </div>

                {/* Mobile / WhatsApp Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile / WhatsApp Contact *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. +91 93155 96055"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-rn-500 font-mono"
                  />
                </div>

                {/* Assigned States / Territory */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Assigned States / Territory *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UP / Bihar / Delhi NCR"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-rn-500"
                  />
                </div>

                {/* Area Description */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Area Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Delhi NCR, UP & Bihar Region"
                    value={formData.area}
                    onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-rn-500"
                  />
                </div>
              </div>

              {/* PIN Code Prefixes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Assigned PIN Code 2-digit Prefixes (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 11, 20, 21, 22, 23, 24, 25, 26, 27, 28, 80, 81"
                  value={formData.pinPrefixes}
                  onChange={(e) => setFormData({ ...formData, pinPrefixes: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-rn-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Indian PIN codes starting with these 2 digits will be automatically routed to this executive by the WhatsApp AI bot.
                </p>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded text-rn-600 focus:ring-rn-500 w-4 h-4"
                  />
                  Active (Receives WhatsApp Leads)
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.isDefaultFallback}
                    onChange={(e) => setFormData({ ...formData, isDefaultFallback: e.target.checked })}
                    className="rounded text-rn-600 focus:ring-rn-500 w-4 h-4"
                  />
                  Default Fallback (e.g. Central Support)
                </label>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-bold text-white bg-rn-600 hover:bg-rn-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : currentId ? "Save Changes" : "Create Executive"}
                </button>
              </div>
            </form>
          ) : (
            /* Executives List */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Configured Sales Executives ({executives.length})
                </span>
                <button
                  onClick={handleOpenAdd}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rn-600 hover:bg-rn-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Sales Executive
                </button>
              </div>

              {loading ? (
                <div className="py-12 text-center text-slate-400 text-xs font-medium">
                  Loading sales executives...
                </div>
              ) : executives.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-medium bg-slate-50 rounded-xl border border-slate-200">
                  No sales executives found. Click "Add Sales Executive" to register one.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {executives.map((exec) => (
                    <div
                      key={exec._id}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{exec.name}</h4>
                          {exec.isDefaultFallback && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              Central Fallback
                            </span>
                          )}
                          {!exec.isActive && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                              Inactive
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                          <span className="flex items-center gap-1 font-mono font-medium text-emerald-700">
                            <Phone className="w-3 h-3 text-emerald-600" />
                            {exec.mobile}
                          </span>
                          <span className="flex items-center gap-1 text-slate-700">
                            <MapPin className="w-3 h-3 text-rn-500" />
                            {exec.state}
                          </span>
                        </div>

                        {exec.area && (
                          <p className="text-[11px] text-slate-500">
                            Region: {exec.area}
                          </p>
                        )}

                        {exec.pinPrefixes && exec.pinPrefixes.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap pt-0.5">
                            <span className="text-[10px] text-slate-400 font-medium">PINs:</span>
                            {exec.pinPrefixes.slice(0, 10).map((p) => (
                              <span
                                key={p}
                                className="text-[10px] px-1 py-0.2 bg-slate-100 rounded text-slate-600 font-mono"
                              >
                                {p}*
                              </span>
                            ))}
                            {exec.pinPrefixes.length > 10 && (
                              <span className="text-[10px] text-slate-400">
                                +{exec.pinPrefixes.length - 10} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right Action & Stats */}
                      <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-900">
                            {exec.leadsHandled || 0} leads
                          </p>
                          <p className="text-[10px] font-semibold text-emerald-600">
                            {exec.converted || 0} won
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(exec)}
                            title="Edit Executive"
                            className="p-1.5 text-slate-400 hover:text-rn-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {!exec.isDefaultFallback && (
                            <button
                              onClick={() => handleDelete(exec._id, exec.name)}
                              title="Delete Executive"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-rn-600" />
            Changes take effect immediately across WhatsApp AI lead routing and CRM reports.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
