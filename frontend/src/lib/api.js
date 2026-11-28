const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
const API_BASE_URL = rawApiUrl
  ? rawApiUrl.endsWith("/api")
    ? rawApiUrl
    : `${rawApiUrl}/api`
  : typeof window !== "undefined" && window.location.hostname.includes("rnvalves.com")
  ? "https://crm-api.rnvalves.com/api"
  : "http://localhost:5000/api";

// Fast in-memory SWR cache & request deduplication for instant page transitions
const getCache = new Map();
const inFlightGet = new Map();
const CACHE_TTL_MS = 12000; // 12s instant revisit cache

export function clearApiCache() {
  getCache.clear();
}

export async function apiRequest(endpoint, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isGet = method === "GET" && !options.noCache;

  // Serve fresh cached GET response immediately (0ms page switch)
  if (isGet && !options.forceRefresh) {
    const cached = getCache.get(endpoint);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    if (inFlightGet.has(endpoint)) {
      return inFlightGet.get(endpoint);
    }
  }

  const executeFetch = async () => {
    let token =
      options?.token ||
      (typeof window !== "undefined"
        ? endpoint.includes("/my-leads")
          ? localStorage.getItem("rn_rep_token") || localStorage.getItem("rn_crm_token")
          : localStorage.getItem("rn_crm_token") || localStorage.getItem("rn_rep_token")
        : null);

    // If browser storage has no token yet (e.g. fresh tab with HttpOnly cookie), pull from first-party session
    if (!token && typeof window !== "undefined" && !endpoint.startsWith("/auth/login")) {
      try {
        const sRes = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData?.token) {
            token = sData.token;
            localStorage.setItem("rn_crm_token", token);
          }
        }
      } catch {}
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: options.credentials || "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        clearApiCache();
        if (
          typeof window !== "undefined" &&
          !window.location.pathname.startsWith("/login") &&
          !endpoint.startsWith("/auth/login") &&
          !endpoint.startsWith("/distribution/rep-login")
        ) {
          localStorage.removeItem("rn_crm_token");
          localStorage.removeItem("rn_rep_token");
          localStorage.removeItem("rn_user");
          await fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
          window.location.replace(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        }
        throw new Error(data?.error || "Unauthorized session. Please login.");
      }

      if (response.status === 403) {
        if (typeof window !== "undefined") {
          const userStr = localStorage.getItem("rn_user");
          if (userStr) {
            try {
              const user = JSON.parse(userStr);
              if (user.role === "SALES" && window.location.pathname !== "/rep-portal") {
                window.location.href = "/rep-portal";
              }
            } catch {}
          }
        }
        throw new Error(data?.error || "Forbidden: You do not have permission to perform this action.");
      }

      if (!response.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
      }

      if (isGet) {
        getCache.set(endpoint, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      } else {
        // Any write/mutation automatically invalidates stale GET caches across the app
        clearApiCache();
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error("API request timed out (12s). The backend server may be reconnecting.");
      }
      throw err;
    } finally {
      if (isGet) {
        inFlightGet.delete(endpoint);
      }
    }
  };

  if (isGet) {
    const promise = executeFetch();
    inFlightGet.set(endpoint, promise);
    return promise;
  }

  return executeFetch();
}

export const crmApi = {
  clearCache: clearApiCache,

  // Auth
  login: (credentials) =>
    apiRequest("/auth/login", { method: "POST", body: JSON.stringify(credentials) }),
  logout: () => apiRequest("/auth/logout", { method: "POST" }),
  getMe: () => apiRequest("/auth/me", { noCache: true }),

  // Dashboard
  getDashboardStats: (params = {}, forceRefresh = false) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/dashboard/stats${query ? `?${query}` : ""}`, { forceRefresh });
  },

  // Contacts
  getContacts: (params = "", forceRefresh = false) =>
    apiRequest(`/contacts${params}`, { forceRefresh }),
  getContactById: (id) => apiRequest(`/contacts/${id}`),
  updateContact: (id, data) =>
    apiRequest(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // Leads
  getLeads: (params = "", forceRefresh = false) =>
    apiRequest(`/leads${params}`, { forceRefresh }),
  updateLeadStage: (id, status, comment) =>
    apiRequest(`/leads/${id}/stage`, { method: "PATCH", body: JSON.stringify({ status, comment }) }),
  createLead: (data) => apiRequest("/leads", { method: "POST", body: JSON.stringify(data) }),
  deleteLead: (id) => apiRequest(`/leads/${id}`, { method: "DELETE" }),
  cleanTestNumberLeads: (phone) =>
    apiRequest("/leads/clean-test-number", { method: "POST", body: JSON.stringify({ phone }) }),

  // Conversations
  getConversations: (params = "", forceRefresh = false) =>
    apiRequest(`/conversations${params}`, { forceRefresh }),
  getMessages: (id) => apiRequest(`/conversations/${id}/messages`, { noCache: true }),
  sendReply: (data) => apiRequest("/conversations/reply", { method: "POST", body: JSON.stringify(data) }),
  toggleMode: (data) => apiRequest("/conversations/mode", { method: "PATCH", body: JSON.stringify(data) }),

  // AI & Knowledge Base
  getAiSettings: () => apiRequest("/ai/settings"),
  updateAiSettings: (data) => apiRequest("/ai/settings", { method: "PUT", body: JSON.stringify(data) }),
  getKnowledgeBase: () => apiRequest("/ai/knowledge-base"),
  createKnowledgeBaseItem: (data) => apiRequest("/ai/knowledge-base", { method: "POST", body: JSON.stringify(data) }),

  // Follow-ups
  getFollowups: (params = "", forceRefresh = false) =>
    apiRequest(`/followups${params}`, { forceRefresh }),
  createFollowup: (data) =>
    apiRequest("/followups", { method: "POST", body: JSON.stringify(data) }),
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
  getDistributionAnalytics: (forceRefresh = false) =>
    apiRequest(`/distribution/analytics${forceRefresh ? "?refresh=1" : ""}`, { forceRefresh }),
  getDistributionCounts: () => apiRequest("/distribution/analytics?countsOnly=1"),
  repLogin: (data) =>
    apiRequest("/distribution/rep-login", { method: "POST", body: JSON.stringify(data) }),
  getMyLeads: (token, forceRefresh = false, scope = "team", repNameOverride = "") => {
    const qs = new URLSearchParams();
    if (scope) qs.set("scope", scope);
    if (repNameOverride) qs.set("repName", repNameOverride);
    const queryStr = qs.toString() ? `?${qs.toString()}` : "";
    return apiRequest(
      `/distribution/my-leads${queryStr}`,
      token ? { headers: { Authorization: `Bearer ${token}` }, forceRefresh } : { forceRefresh }
    );
  },
  assignLeadToExecutive: (data) =>
    apiRequest("/distribution/assign-lead", { method: "POST", body: JSON.stringify(data) }),
  resendRepAlert: (data) =>
    apiRequest("/distribution/resend-rep-alert", { method: "POST", body: JSON.stringify(data) }),
  reengageCustomer: (data) =>
    apiRequest("/distribution/reengage", { method: "POST", body: JSON.stringify(data) }),
  reengageBulkCustomers: (data) =>
    apiRequest("/distribution/reengage-bulk", { method: "POST", body: JSON.stringify(data) }),
  resolveCustomerQuery: (data) =>
    apiRequest("/distribution/resolve-query", { method: "POST", body: JSON.stringify(data) }),
  updateLeadFollowup: (data) =>
    apiRequest("/distribution/update-followup", { method: "POST", body: JSON.stringify(data) }),

  // Generic HTTP helpers
  get: (endpoint) => apiRequest(endpoint),
  post: (endpoint, body) => apiRequest(endpoint, { method: "POST", body: JSON.stringify(body) }),
  put: (endpoint, body) => apiRequest(endpoint, { method: "PUT", body: JSON.stringify(body) }),
  patch: (endpoint, body) => apiRequest(endpoint, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (endpoint) => apiRequest(endpoint, { method: "DELETE" }),
};
