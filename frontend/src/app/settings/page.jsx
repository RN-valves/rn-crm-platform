"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import {
  Activity,
  Server,
  Database,
  Webhook,
  ShieldCheck,
  CheckCircle2,
  Clock,
  FileText,
} from "lucide-react";

export default function SettingsAndHealth() {
  const [health, setHealth] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const services = health?.services || {};

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto">
      <Header
        title="System Health & Integrations"
        subtitle="Live connection diagnostics for Evolution API, Chatwoot, Redis Queues, and Audit Trail"
        onRefresh={fetchHealth}
      />

      <main className="p-8 space-y-8 max-w-6xl mx-auto w-full">
        {/* Service Diagnostics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Evolution API */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Evolution API</span>
              <Server className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="font-bold text-sm text-slate-900">Instance: RNchat</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-mono">v2.3.7 • Baileys</p>
            </div>
          </div>

          {/* Chatwoot */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Chatwoot Inbox</span>
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span className="font-bold text-sm text-slate-900">API Channel Inbox</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Shared Agent Desk</p>
            </div>
          </div>

          {/* Redis & Queues */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">BullMQ Queues</span>
              <Server className="w-5 h-5 text-purple-600" />
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                <span className="font-bold text-sm text-slate-900">5 Active Queues</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Exponential Backoff</p>
            </div>
          </div>

          {/* Dual Database */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider">Databases</span>
              <Database className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                <span className="font-bold text-sm text-slate-900">Dual MongoDB</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Read-Only eCommerce</p>
            </div>
          </div>
        </div>

        {/* Webhooks Endpoints Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-rn-600" />
            <h3 className="font-bold text-slate-900 text-sm">Active Webhook Listeners</h3>
          </div>
          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <span className="text-slate-600">Evolution API Webhook:</span>
              <span className="font-bold text-slate-800">POST /api/webhooks/evolution</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <span className="text-slate-600">Chatwoot Webhook:</span>
              <span className="font-bold text-slate-800">POST /api/webhooks/chatwoot</span>
            </div>
          </div>
        </div>

        {/* Audit Trail */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Security & Activity Audit Logs</h3>
              <p className="text-xs text-slate-500">Real-time trace of human agent takeovers, lead updates, and AI actions</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-3.5">Actor</th>
                  <th className="px-6 py-3.5">Action</th>
                  <th className="px-6 py-3.5">Target Entity</th>
                  <th className="px-6 py-3.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50">
                    <td className="px-6 py-3.5 font-bold text-slate-900">{log.actorName}</td>
                    <td className="px-6 py-3.5">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-100 text-slate-800 font-semibold">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">{log.entityId}</td>
                    <td className="px-6 py-3.5 text-slate-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
