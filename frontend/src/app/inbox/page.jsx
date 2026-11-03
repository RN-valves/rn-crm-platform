"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import {
  Search,
  Bot,
  UserCheck,
  Send,
  Paperclip,
  CheckCheck,
  Clock,
  Phone,
  Building,
  MapPin,
  Tag,
  Shield,
  FileText,
  Image as ImageIcon,
} from "lucide-react";

export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [filterMode, setFilterMode] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const query = filterMode !== "ALL" ? `?mode=${filterMode}` : "";
      const res = await crmApi.getConversations(query);
      const list = res.conversations || [];
      setConversations(list);
      if (list.length > 0 && !selectedConv) {
        setSelectedConv(list[0]);
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conv) => {
    if (!conv) return;
    try {
      const res = await crmApi.getMessages(conv.phone || conv._id);
      setMessages(res.messages || []);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [filterMode]);

  useEffect(() => {
    if (selectedConv) {
      fetchMessages(selectedConv);
    }
  }, [selectedConv]);

  // Send reply
  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedConv || sending) return;

    setSending(true);
    const newMsg = {
      id: `m_${Date.now()}`,
      sender: "agent",
      content: inputText,
      timestamp: new Date().toISOString(),
      type: "text",
    };

    setMessages((prev) => [...prev, newMsg]);
    const sentText = inputText;
    setInputText("");

    try {
      await crmApi.sendReply({
        phone: selectedConv.phone,
        text: sentText,
      });
      // Mode automatically changes to 'human' on agent reply
      setSelectedConv((prev) => ({ ...prev, mode: "human" }));
    } catch (err) {
      console.error("Failed to send reply:", err);
    } finally {
      setSending(false);
    }
  };

  // Toggle Mode (AI vs Human)
  const handleToggleMode = async (newMode) => {
    if (!selectedConv) return;
    try {
      await crmApi.toggleMode({
        phone: selectedConv.phone,
        mode: newMode,
      });
      setSelectedConv((prev) => ({ ...prev, mode: newMode }));
      setConversations((prev) =>
        prev.map((c) => (c.phone === selectedConv.phone ? { ...c, mode: newMode } : c))
      );
    } catch (err) {
      console.error("Failed to toggle mode:", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <Header
        title="WhatsApp Inbox"
        subtitle="Connected to Evolution API (RNchat) & Chatwoot Shared Inbox"
        onRefresh={fetchConversations}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Conversation Directory */}
        <div className="w-80 lg:w-96 border-r border-slate-200 bg-white flex flex-col">
          {/* Search & Mode Filters */}
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search phone or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 rounded-lg border border-transparent focus:bg-white focus:border-rn-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
              {["ALL", "ai", "human"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`flex-1 py-1 rounded-md transition-colors ${
                    filterMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {mode === "ALL" ? "All" : mode === "ai" ? "🤖 AI Mode" : "👨‍💼 Human Mode"}
                </button>
              ))}
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {conversations
              .filter(
                (c) =>
                  !search ||
                  c.phone.toLowerCase().includes(search.toLowerCase()) ||
                  (c.customerName && c.customerName.toLowerCase().includes(search.toLowerCase()))
              )
              .map((conv) => {
                const isSelected = selectedConv?.phone === conv.phone;
                return (
                  <button
                    key={conv._id || conv.phone}
                    onClick={() => setSelectedConv(conv)}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex flex-col gap-1.5 ${
                      isSelected ? "bg-rn-50/70 border-l-4 border-rn-600" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {conv.customerName || conv.phone}
                        </span>
                        {conv.businessName && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                            {conv.businessName}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {conv.lastMessageAt || conv.updatedAt || conv.lastCustomerMessageAt
                          ? new Date(conv.lastMessageAt || conv.updatedAt || conv.lastCustomerMessageAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-1">{conv.lastMessage || "Active chat"}</p>

                    <div className="flex items-center justify-between mt-1 text-[11px]">
                      <span className="text-slate-400 font-mono text-[10px]">{conv.phone}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                          conv.mode === "ai"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {conv.mode === "ai" ? <Bot className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                        {conv.mode === "ai" ? "AI Replying" : "Human Agent"}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Middle Column: Chat Window */}
        {selectedConv ? (
          <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
            {/* Chat Header with Mode Switcher */}
            <div className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rn-600 text-white flex items-center justify-center font-bold text-sm">
                  {selectedConv.customerName ? selectedConv.customerName.charAt(0) : "W"}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {selectedConv.customerName || selectedConv.phone}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{selectedConv.phone}</span>
                    <span>•</span>
                    <span>Chatwoot Conv #{selectedConv.chatwootConversationId || "Live"}</span>
                  </div>
                </div>
              </div>

              {/* AI vs Human Mode Toggle Buttons */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium mr-1">Active Mode:</span>
                <div className="p-1 bg-slate-100 rounded-lg flex items-center gap-1">
                  <button
                    onClick={() => handleToggleMode("ai")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      selectedConv.mode === "ai"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5" /> AI Mode
                  </button>
                  <button
                    onClick={() => handleToggleMode("human")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      selectedConv.mode === "human"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" /> Human Takeover
                  </button>
                </div>
              </div>
            </div>

            {/* Chat Message Stream */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {messages.map((msg, index) => {
                const isCustomer = msg.sender === "customer";
                const isBot = msg.sender === "bot";

                return (
                  <div
                    key={index}
                    className={`flex flex-col ${isCustomer ? "items-start" : "items-end"}`}
                  >
                    <div
                      className={`max-w-lg rounded-2xl p-4 text-xs shadow-sm ${
                        isCustomer
                          ? "bg-white text-slate-800 border border-slate-200"
                          : isBot
                          ? "bg-blue-50 text-blue-950 border border-blue-200"
                          : "bg-rn-600 text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold mb-1 text-[11px] opacity-80">
                        {isCustomer ? (
                          <span>Customer</span>
                        ) : isBot ? (
                          <span className="flex items-center gap-1 text-blue-700">
                            <Bot className="w-3.5 h-3.5" /> RN AI Assistant
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" /> Human Agent
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
                      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {!isCustomer && <CheckCheck className="w-3 h-3" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply Composer */}
            <form onSubmit={handleSendReply} className="p-4 bg-white border-t border-slate-200 flex items-center gap-3">
              <button
                type="button"
                className="p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Attach Catalogue or Image"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <input
                type="text"
                placeholder={
                  selectedConv.mode === "ai"
                    ? "Type a reply (sending switches conversation to Human Takeover mode)..."
                    : "Type a WhatsApp reply..."
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 px-4 py-2.5 text-xs bg-slate-100 rounded-xl border border-transparent focus:bg-white focus:border-rn-500 focus:outline-none"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                className="px-4 py-2.5 rounded-xl bg-rn-600 text-white font-semibold text-xs flex items-center gap-2 hover:bg-rn-700 disabled:opacity-50 transition-all shadow-sm"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
            Select a conversation to view message history
          </div>
        )}

        {/* Right Column: Customer 360 & Lead Details */}
        {selectedConv && (
          <div className="w-80 border-l border-slate-200 bg-white p-6 overflow-y-auto space-y-6">
            <div>
              <h4 className="font-bold text-slate-900 text-sm mb-1">Customer Profile</h4>
              <p className="text-xs text-slate-500">Contact & business classification</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Building className="w-4 h-4 text-slate-400" />
                <span className="font-semibold">{selectedConv.businessName || "Individual Customer"}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>{selectedConv.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>Delhi, India</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Business Type</span>
                <span className="font-bold text-slate-800">Dealer</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Assigned Team</span>
                <span className="font-bold text-rn-600">{selectedConv.assignedTeam || "Sales"}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-slate-900 text-xs">Internal Notes</h5>
              <textarea
                placeholder="Add notes for your sales team..."
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-rn-500 resize-none h-24"
              ></textarea>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
