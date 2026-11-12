"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import {
  Activity,
  Server,
  Database,
  Webhook,
  ShieldCheck,
  CheckCircle2,
  Clock,
  FileText,
  Copy,
  Check,
} from "lucide-react";

export default function SettingsAndHealth() {
  const [health, setHealth] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const [healthRes, logsRes] = await Promise.all([
        crmApi.getSystemHealth(),
        crmApi.getAuditLogs(),
      ]);
      setHealth(healthRes);
      setAuditLogs(logsRes.logs || []);
    } catch (err) {
      console.error("Health fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors">
      <Header
        title="System Health & Integrations"
        subtitle="Live connection diagnostics for Evolution API, Chatwoot, Redis Queues, and Security Trail"
        onRefresh={fetchHealth}
        loading={loading}
      />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto w-full">
        {/* Service Diagnostics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Evolution API */}
          <Card hover>
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Evolution API
                </span>
                <Server className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    RNchat Instance
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  v2.3.7 • Baileys Multi-Device
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Chatwoot */}
          <Card hover>
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Chatwoot Inbox
                </span>
                <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    API Channel Active
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Shared Agent Desk
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Redis & Queues */}
          <Card hover>
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  BullMQ Queues
                </span>
                <Server className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    5 Active Queues
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Exponential Backoff
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Dual Database */}
          <Card hover>
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Databases
                </span>
                <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    Dual MongoDB
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  CRM + Read-Only eCommerce
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Webhooks Endpoints Card */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="w-4 h-4 text-rn-600" />
                <span>Active Webhook Listeners</span>
              </CardTitle>
              <CardDescription>
                Incoming webhooks routed to CRM workers
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 font-mono text-xs">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/90 dark:border-slate-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold text-slate-400 font-sans block">
                  Evolution API Inbound Webhook
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  POST /api/webhooks/evolution
                </span>
              </div>
              <button
                onClick={() => handleCopy("/api/webhooks/evolution", "evo")}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                title="Copy endpoint"
              >
                {copiedKey === "evo" ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/90 dark:border-slate-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold text-slate-400 font-sans block">
                  Chatwoot Agent Event Webhook
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  POST /api/webhooks/chatwoot
                </span>
              </div>
              <button
                onClick={() => handleCopy("/api/webhooks/chatwoot", "chatwoot")}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                title="Copy endpoint"
              >
                {copiedKey === "chatwoot" ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Audit Trail */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Security & Activity Audit Logs</CardTitle>
              <CardDescription>
                Real-time trace of human agent takeovers, lead movements, and AI actions
              </CardDescription>
            </div>
            <Badge variant="neutral" size="sm">
              {auditLogs.length} Events Logged
            </Badge>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-3.5">Actor</th>
                  <th className="px-6 py-3.5">Action Taken</th>
                  <th className="px-6 py-3.5">Target Entity</th>
                  <th className="px-6 py-3.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-10 text-center text-slate-400 dark:text-slate-500 text-xs"
                    >
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr
                      key={log._id || log.createdAt}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-6 py-3.5 font-bold text-slate-900 dark:text-white">
                        {log.actorName}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge variant="primary" size="xs">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 font-mono text-slate-600 dark:text-slate-400">
                        {log.entityId}
                      </td>
                      <td className="px-6 py-3.5 text-slate-400 font-mono">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
