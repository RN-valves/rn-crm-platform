"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Input from "../../components/ui/Input";
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
  ChevronLeft,
  Info,
  Sparkles,
  MessageCircle,
} from "lucide-react";

const QUICK_REPLIES = [
  "Namaste! Sharing our latest RN Valves & Faucets product catalog.",
  "Our wholesale team offers dealer margin tiers for your region.",
  "Connecting you with our regional sales executive for your state.",
  "Could you please share your business name and city?",
];

function InboxContent() {
  const searchParams = useSearchParams();
  const phoneParam = searchParams.get("phone");

  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [filterMode, setFilterMode] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(true);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const query = filterMode !== "ALL" ? `?mode=${filterMode}` : "";
      const res = await crmApi.getConversations(query);
      const list = res.conversations || [];

      // Check for target phone from URL query param
      const cleanTarget = (phoneParam || "").replace(/\D/g, "").slice(-10);
      let targetConv = null;
      if (cleanTarget) {
        targetConv = list.find(
          (c) => (c.phone || "").replace(/\D/g, "").slice(-10) === cleanTarget
        );
      }

      if (cleanTarget && !targetConv) {
        // Synthesize conversation item for requested phone
        const rawDigits = (phoneParam || "").replace(/\D/g, "");
        const formattedPhone = rawDigits.startsWith("91") ? `+${rawDigits}` : `+91${rawDigits}`;

        const newPlaceholder = {
          _id: `temp_${Date.now()}`,
          phone: formattedPhone,
          customerName: formattedPhone,
          businessName: "",
          businessType: "Customer",
          mode: "ai",
          lastMessage: "Opening conversation...",
          updatedAt: new Date().toISOString(),
        };

        try {
          const contactRes = await crmApi.getContacts(`?search=${cleanTarget}`);
          const matched = (contactRes.contacts || []).find(
            (c) => (c.phone || "").replace(/\D/g, "").slice(-10) === cleanTarget
          );
          if (matched) {
            newPlaceholder.customerName = matched.name || newPlaceholder.customerName;
            newPlaceholder.businessName = matched.businessName || "";
            newPlaceholder.businessType = matched.businessType || "Customer";
            newPlaceholder.city = matched.city || "";
          }
        } catch (e) {
          console.warn("Contact lookup notice:", e);
        }

        setConversations([newPlaceholder, ...list]);
        setSelectedConv(newPlaceholder);
      } else {
        setConversations(list);
        if (targetConv) {
          setSelectedConv(targetConv);
        } else if (list.length > 0 && !selectedConv) {
          setSelectedConv(list[0]);
        }
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
  }, [filterMode, phoneParam]);

  useEffect(() => {
    if (selectedConv) {
      fetchMessages(selectedConv);
    }
  }, [selectedConv]);

  const handleSelectConv = (conv) => {
    setSelectedConv(conv);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("phone", conv.phone);
      window.history.replaceState(null, "", url.toString());
    }
  };

  // Send reply
  const handleSendReply = async (e) => {
    if (e) e.preventDefault();
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

  const filteredConversations = conversations.filter(
    (c) =>
      !search ||
      c.phone?.toLowerCase().includes(search.toLowerCase()) ||
      c.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors">
      <Header
        title="WhatsApp Inbox"
        subtitle="Connected to Evolution API (RNchat) & Chatwoot Shared Channel"
        onRefresh={fetchConversations}
        loading={loading}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Conversation Directory */}
        <div
          className={`w-full md:w-80 lg:w-96 border-r border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 ${
            selectedConv ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Search & Mode Filters */}
          <div className="p-3.5 border-b border-slate-200/90 dark:border-slate-800 space-y-2.5">
            <Input
              type="text"
              placeholder="Search phone or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={Search}
            />

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-semibold">
              {["ALL", "ai", "human"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    filterMode === mode
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {mode === "ALL" ? "All" : mode === "ai" ? "🤖 AI Mode" : "👨‍💼 Human"}
                </button>
              ))}
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
            {loading ? (
              [1, 2, 3, 4, 5].map((k) => (
                <div key={k} className="p-4 space-y-2.5 animate-pulse">
                  <div className="flex justify-between items-center">
                    <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded"></div>
                    <div className="h-3 w-10 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                  </div>
                  <div className="h-3 w-44 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                </div>
              ))
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-xs font-medium space-y-1">
                <MessageCircle className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600" />
                <p>No conversations found</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = selectedConv?.phone === conv.phone;
                return (
                  <button
                    key={conv._id || conv.phone}
                    onClick={() => handleSelectConv(conv)}
                    className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-rn-50/80 dark:bg-rn-950/40 border-l-4 border-rn-600"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {conv.customerName || conv.phone}
                        </span>
                        {conv.businessName && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium shrink-0">
                            {conv.businessName}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {conv.lastMessageAt || conv.updatedAt || conv.lastCustomerMessageAt
                          ? new Date(
                              conv.lastMessageAt || conv.updatedAt || conv.lastCustomerMessageAt
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1">
                      {conv.lastMessage || "Active chat thread"}
                    </p>

                    <div className="flex items-center justify-between mt-1 text-[11px]">
                      <span className="text-slate-400 font-mono text-[10px]">
                        {conv.phone}
                      </span>
                      <Badge
                        variant={conv.mode === "ai" ? "primary" : "success"}
                        size="xs"
                        icon={conv.mode === "ai" ? Bot : UserCheck}
                      >
                        {conv.mode === "ai" ? "AI Bot" : "Human Agent"}
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Middle Column: Chat Window */}
        {selectedConv ? (
          <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
            {/* Chat Top Header */}
            <div className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {/* Back button for mobile */}
                <button
                  onClick={() => setSelectedConv(null)}
                  className="md:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="w-10 h-10 rounded-2xl bg-rn-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-rn-600/30">
                  {selectedConv.customerName ? selectedConv.customerName.charAt(0) : "W"}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                    {selectedConv.customerName || selectedConv.phone}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{selectedConv.phone}</span>
                    <span>•</span>
                    <span className="text-[11px]">
                      Chatwoot #{selectedConv.chatwootConversationId || "Live"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <div className="p-1 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center gap-1">
                  <button
                    onClick={() => handleToggleMode("ai")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      selectedConv.mode === "ai"
                        ? "bg-rn-600 text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">AI Mode</span>
                  </button>
                  <button
                    onClick={() => handleToggleMode("human")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      selectedConv.mode === "human"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Human Takeover</span>
                  </button>
                </div>

                <button
                  onClick={() => setShowProfileDrawer(!showProfileDrawer)}
                  className={`p-2 rounded-xl border transition-colors hidden xl:flex ${
                    showProfileDrawer
                      ? "bg-rn-50 dark:bg-rn-950/60 border-rn-200 dark:border-rn-800 text-rn-600 dark:text-rn-300"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700"
                  }`}
                  title="Toggle Contact Profile"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Message Stream */}
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
              {messages.map((msg, index) => {
                const isCustomer = msg.sender === "customer";
                const isBot = msg.sender === "bot";

                return (
                  <div
                    key={index}
                    className={`flex flex-col ${isCustomer ? "items-start" : "items-end"}`}
                  >
                    <div
                      className={`max-w-md sm:max-w-lg rounded-2xl p-4 text-xs shadow-sm transition-all ${
                        isCustomer
                          ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200/90 dark:border-slate-800 rounded-tl-sm"
                          : isBot
                          ? "bg-rn-50 dark:bg-rn-950/60 text-slate-900 dark:text-slate-100 border border-rn-200 dark:border-rn-800/80 rounded-tr-sm"
                          : "bg-rn-600 text-white rounded-tr-sm"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold mb-1 text-[11px] opacity-80">
                        {isCustomer ? (
                          <span className="text-slate-700 dark:text-slate-300">Customer</span>
                        ) : isBot ? (
                          <span className="flex items-center gap-1 text-rn-700 dark:text-rn-300">
                            <Bot className="w-3.5 h-3.5" /> RN AI Engine
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-white">
                            <UserCheck className="w-3.5 h-3.5" /> Human Sales Agent
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
                      <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] opacity-70">
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {!isCustomer && <CheckCheck className="w-3 h-3 text-emerald-400" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Replies Bar */}
            <div className="px-4 py-2 bg-slate-100/80 dark:bg-slate-900/80 border-t border-slate-200/80 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                Quick Replies:
              </span>
              {QUICK_REPLIES.map((reply, i) => (
                <button
                  key={i}
                  onClick={() => setInputText(reply)}
                  className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-rn-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-slate-700 shrink-0 transition-colors"
                >
                  {reply.length > 35 ? reply.slice(0, 35) + "..." : reply}
                </button>
              ))}
            </div>

            {/* Reply Composer */}
            <form
              onSubmit={handleSendReply}
              className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200/90 dark:border-slate-800 flex items-center gap-3 shrink-0"
            >
              <input
                type="text"
                placeholder={
                  selectedConv.mode === "ai"
                    ? "Type WhatsApp message (sending switches conversation to Human Takeover)..."
                    : "Type WhatsApp reply..."
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 px-4 py-2.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-rn-500 focus:outline-none transition-colors"
              />

              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={sending}
                disabled={!inputText.trim() || sending}
                icon={Send}
              >
                Send
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex-1 hidden md:flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs font-medium space-y-2">
            <MessageCircle className="w-10 h-10 text-slate-300 dark:text-slate-700" />
            <p>Select a WhatsApp conversation to view customer messages</p>
          </div>
        )}

        {/* Right Column: Customer 360 & Lead Details */}
        {selectedConv && showProfileDrawer && (
          <div className="w-80 border-l border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 overflow-y-auto space-y-5 hidden xl:block shrink-0">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                Customer Profile
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Contact & wholesale details
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                <Building className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-semibold">
                  {selectedConv.businessName || "Individual Customer"}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                <a
                  href={`https://wa.me/${selectedConv.phone?.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-emerald-600 hover:underline"
                >
                  {selectedConv.phone}
                </a>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                <MapPin className="w-4 h-4 text-rn-500 shrink-0" />
                <span>Delhi NCR / India</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Classification</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">Wholesale Dealer</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Assigned Team</span>
                <span className="font-bold text-rn-600 dark:text-rn-400">
                  {selectedConv.assignedTeam || "Sales Team"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                CRM Executive Notes
              </h5>
              <textarea
                placeholder="Log internal customer preferences, quotations, or follow-up instructions..."
                className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-rn-500 text-slate-800 dark:text-slate-200 resize-none h-28"
              ></textarea>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WhatsAppInbox() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-950 text-slate-400 text-xs">
          Loading WhatsApp Inbox...
        </div>
      }
    >
      <InboxContent />
    </Suspense>
  );
}
