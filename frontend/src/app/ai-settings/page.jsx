"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import { Card, CardContent } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
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
  Sparkles,
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
      <div className="flex-1 flex flex-col h-screen bg-slate-50 dark:bg-slate-950">
        <Header title="AI Chatbot & Automation" />
        <div className="flex-1 flex items-center justify-center text-slate-400 text-xs font-medium space-y-2">
          <div className="animate-spin w-5 h-5 border-2 border-rn-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors">
      <Header
        title="AI Chatbot & Automation"
        subtitle="Prompt engineering, multilingual routing, anti-hallucination guardrails, and verified FAQs"
        onRefresh={fetchData}
        loading={loading}
      />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto w-full">
        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 shadow-sm animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* 1. Core Model & Master Switch */}
          <Card>
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    Master AI Engine Switch
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Enable or pause autonomous WhatsApp responses from Google Gemini
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings?.isEnabled ?? true}
                    onChange={(e) =>
                      setSettings({ ...settings, isEnabled: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rn-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    AI Model Architecture
                  </label>
                  <select
                    value={settings?.selectedModel || "gemini-1.5-flash"}
                    onChange={(e) =>
                      setSettings({ ...settings, selectedModel: e.target.value })
                    }
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rn-500/20"
                  >
                    <option value="gemini-1.5-flash">
                      Google Gemini 1.5 Flash (Recommended - 250ms Response)
                    </option>
                    <option value="gemini-1.5-pro">
                      Google Gemini 1.5 Pro (Deep Technical Reasoning)
                    </option>
                    <option value="gpt-4o-mini">OpenAI GPT-4o Mini (Fallback)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Creativity / Temperature
                    </label>
                    <span className="font-mono text-xs font-bold text-rn-600">
                      {settings?.temperature ?? 0.2}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.8"
                    step="0.1"
                    value={settings?.temperature ?? 0.2}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        temperature: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-rn-600 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Lower value (0.1 - 0.2) strictly prevents hallucinations on wholesale pricing and warranty terms.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 2. System Prompt & Personality */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  System Prompt (Guardrails & Behavioral Guidance)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Define the AI assistant personality, catalog lookup rules, and wholesale verification instructions.
                </p>
              </div>

              <textarea
                rows={6}
                value={settings?.systemPrompt || ""}
                onChange={(e) =>
                  setSettings({ ...settings, systemPrompt: e.target.value })
                }
                className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rn-500/20 leading-relaxed resize-y"
              ></textarea>
            </CardContent>
          </Card>

          {/* 3. Supported Languages */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Multilingual Customer Detection
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  The AI automatically detects language from user's first WhatsApp message
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {[
                  { id: "hi", name: "Hindi (हिंदी)" },
                  { id: "hinglish", name: "Hinglish (Colloquial)" },
                  { id: "mr", name: "Marathi (मराठी)" },
                  { id: "bn", name: "Bengali (বাংলা)" },
                  { id: "en", name: "English" },
                ].map((lang) => (
                  <div
                    key={lang.id}
                    className="p-3 rounded-xl border border-emerald-200/90 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 flex items-center justify-between text-xs"
                  >
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {lang.name}
                    </span>
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 4. Human Takeover Keywords */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Instant Human Handover Triggers
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  When a customer message includes these phrases, AI immediately pauses and transfers to an executive:
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(
                  settings?.handoverKeywords || [
                    "agent",
                    "human",
                    "baat karni",
                    "call karo",
                    "dealer",
                    "bulk",
                    "owner",
                  ]
                ).map((kw, i) => (
                  <Badge key={i} variant="neutral" size="sm">
                    {kw}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={saving}
              icon={Save}
            >
              {saving ? "Saving Changes..." : "Save AI Configuration"}
            </Button>
          </div>
        </form>

        {/* 5. Verified Knowledge Base Items */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Verified Business Knowledge Base
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Official company policies, warranty cards, catalog specs, and dealer criteria
                </p>
              </div>
              <Button variant="secondary" size="xs" icon={Plus}>
                Add Entry
              </Button>
            </div>

            <div className="space-y-3">
              {knowledgeBase.map((item) => (
                <div
                  key={item._id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                      {item.title}
                    </h4>
                    <Badge variant="primary" size="xs">
                      {item.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.content}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
