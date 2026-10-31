"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import {
  Bot,
  Globe,
  Sliders,
  Save,
  BookOpen,
  Plus,
  ShieldCheck,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";

export default function AiChatbotSettings() {
  const [settings, setSettings] = useState(null);
  const [knowledgeBase, setKnowledgeBase] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [settingsRes, kbRes] = await Promise.all([
        crmApi.getAiSettings(),
        crmApi.getKnowledgeBase(),
      ]);
      setSettings(settingsRes.settings || {});
      setKnowledgeBase(kbRes.items || []);
    } catch (err) {
      console.error("Failed to load AI settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage("");
    try {
      await crmApi.updateAiSettings(settings);
      setSuccessMessage("AI configuration updated successfully!");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  if (!settings && loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
        Loading AI settings...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto">
      <Header
        title="AI Chatbot & Automation"
        subtitle="Prompt engineering, multilingual routing, anti-hallucination tools, and verified FAQs"
        onRefresh={fetchData}
      />

      <main className="p-8 space-y-8 max-w-5xl mx-auto w-full">
        {successMessage && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* 1. Core Model & Master Switch */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Master AI Engine Switch</h3>
                <p className="text-xs text-slate-500">Enable or pause autonomous WhatsApp responses</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings?.isEnabled ?? true}
                  onChange={(e) => setSettings({ ...settings, isEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rn-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  AI Model Architecture
                </label>
                <select
                  value={settings?.selectedModel || "gemini-1.5-flash"}
                  onChange={(e) => setSettings({ ...settings, selectedModel: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-rn-500"
                >
                  <option value="gemini-1.5-flash">Google Gemini 1.5 Flash (Recommended - Fast & Cost-Effective)</option>
                  <option value="gemini-1.5-pro">Google Gemini 1.5 Pro (Deep Reasoning)</option>
                  <option value="gpt-4o-mini">OpenAI GPT-4o Mini (Compatible)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Creativity / Temperature ({settings?.temperature ?? 0.2})
                </label>
                <input
                  type="range"
                  min="0"
                  max="0.8"
                  step="0.1"
                  value={settings?.temperature ?? 0.2}
                  onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
                  className="w-full mt-2"
                />
                <span className="text-[10px] text-slate-400">
                  Lower value (0.1 - 0.2) strictly prevents hallucinations on prices and warranty.
                </span>
              </div>
            </div>
          </div>

          {/* 2. System Prompt & Personality */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">System Prompt (Guiding Instructions)</h3>
              <p className="text-xs text-slate-500">
                Define the AI bot persona, verified knowledge rules, and company standards.
              </p>
            </div>

            <textarea
              rows={5}
              value={settings?.systemPrompt || ""}
              onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-rn-500 leading-relaxed"
            ></textarea>
          </div>

          {/* 3. Supported Languages */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Multilingual Support</h3>
              <p className="text-xs text-slate-500">The engine automatically detects and replies in customer language</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { id: "hi", name: "Hindi (हिंदी)" },
                { id: "hinglish", name: "Hinglish (Colloquial)" },
                { id: "mr", name: "Marathi (मराठी)" },
                { id: "bn", name: "Bengali (বাংলা)" },
                { id: "en", name: "English" },
              ].map((lang) => (
                <div
                  key={lang.id}
                  className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-center justify-between text-xs"
                >
                  <span className="font-bold text-slate-800">{lang.name}</span>
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </div>
              ))}
            </div>
          </div>

          {/* 4. Human Takeover Keywords */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Instant Human Handover Triggers</h3>
              <p className="text-xs text-slate-500">
                When a customer message contains any of these phrases, AI immediately pauses and alerts human agents:
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(settings?.handoverKeywords || ["agent", "human", "baat karni", "call karo", "dealer", "bulk"]).map(
                (kw, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium"
                  >
                    {kw}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-rn-600 text-white font-bold text-xs flex items-center gap-2 hover:bg-rn-700 transition-colors shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Saving Changes..." : "Save AI Configuration"}</span>
            </button>
          </div>
        </form>

        {/* 5. Verified Knowledge Base Items */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Verified Business Knowledge Base</h3>
              <p className="text-xs text-slate-500">Official company policies, warranty cards, and dealership criteria</p>
            </div>
            <button className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Knowledge Entry</span>
            </button>
          </div>

          <div className="space-y-3">
            {knowledgeBase.map((item) => (
              <div key={item._id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-xs">{item.title}</h4>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">
                    {item.category}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{item.content}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
