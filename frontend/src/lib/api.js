const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname.includes("rnvalves.com")
    ? "https://crm-api.rnvalves.com/api"
    : "http://localhost:5000/api");

export async function apiRequest(endpoint, options = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("rn_crm_token") : null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("API request timed out (10s). The backend server may be reconnecting.");
    }
    throw err;
  }
}

export const crmApi = {
  // Auth
  login: (credentials) => apiRequest("/auth/login", { method: "POST", body: JSON.stringify(credentials) }),
  getMe: () => apiRequest("/auth/me"),

  // Dashboard
  getDashboardStats: () => apiRequest("/dashboard/stats"),

  // Contacts
  getContacts: (params = "") => apiRequest(`/contacts${params}`),
  getContactById: (id) => apiRequest(`/contacts/${id}`),
  updateContact: (id, data) => apiRequest(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // Leads
  getLeads: (params = "") => apiRequest(`/leads${params}`),
  updateLeadStage: (id, status, comment) =>
    apiRequest(`/leads/${id}/stage`, { method: "PATCH", body: JSON.stringify({ status, comment }) }),
  createLead: (data) => apiRequest("/leads", { method: "POST", body: JSON.stringify(data) }),
  deleteLead: (id) => apiRequest(`/leads/${id}`, { method: "DELETE" }),
  cleanTestNumberLeads: (phone) =>
    apiRequest("/leads/clean-test-number", { method: "POST", body: JSON.stringify({ phone }) }),

  // Conversations
  getConversations: (params = "") => apiRequest(`/conversations${params}`),
  getMessages: (id) => apiRequest(`/conversations/${id}/messages`),
  sendReply: (data) => apiRequest("/conversations/reply", { method: "POST", body: JSON.stringify(data) }),
  toggleMode: (data) => apiRequest("/conversations/mode", { method: "PATCH", body: JSON.stringify(data) }),

  // AI & Knowledge Base
  getAiSettings: () => apiRequest("/ai/settings"),
  updateAiSettings: (data) => apiRequest("/ai/settings", { method: "PUT", body: JSON.stringify(data) }),
  getKnowledgeBase: () => apiRequest("/ai/knowledge-base"),
  createKnowledgeBaseItem: (data) => apiRequest("/ai/knowledge-base", { method: "POST", body: JSON.stringify(data) }),

  // Follow-ups
  getFollowups: (params = "") => apiRequest(`/followups${params}`),
  updateFollowupStatus: (id, status) =>
    apiRequest(`/followups/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),

  // System
  getSystemHealth: () => apiRequest("/system/health"),
  getAuditLogs: () => apiRequest("/system/audit-logs"),

  // Sales Executives & Territory Manager
  getSalesExecutives: () => apiRequest("/sales-executives"),
  createSalesExecutive: (data) =>
    apiRequest("/sales-executives", { method: "POST", body: JSON.stringify(data) }),
  updateSalesExecutive: (id, data) =>
    apiRequest(`/sales-executives/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSalesExecutive: (id) =>
    apiRequest(`/sales-executives/${id}`, { method: "DELETE" }),

  // Lead Distribution & Drop-off Intelligence
  getDistributionAnalytics: () => apiRequest("/distribution/analytics"),
  assignLeadToExecutive: (data) =>
    apiRequest("/distribution/assign-lead", { method: "POST", body: JSON.stringify(data) }),
};
