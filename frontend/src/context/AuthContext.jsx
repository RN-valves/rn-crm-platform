"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

function resolveApiBaseUrl() {
  const envUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (envUrl) {
    return envUrl.endsWith("/api") ? envUrl : `${envUrl}/api`;
  }
  if (typeof window !== "undefined" && window.location.hostname.includes("rnvalves.com")) {
    return "https://crm-api.rnvalves.com/api";
  }
  return "http://localhost:5000/api";
}

function normalizeUserRole(rawRole) {
  return rawRole === "ADMIN" || rawRole === "Admin" || rawRole === "Manager"
    ? "ADMIN"
    : "SALES";
}

function clearClientStorageAndLegacyCookies() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("rn_crm_token");
    localStorage.removeItem("rn_rep_token");
    localStorage.removeItem("rn_sales_rep_auth");
    localStorage.removeItem("rn_user");
    // Also expire any legacy non-HttpOnly cookies from older builds
    document.cookie = "rn_crm_token=; path=/; max-age=0";
    if (window.location.hostname.includes("rnvalves.com")) {
      document.cookie = "rn_crm_token=; path=/; domain=.rnvalves.com; max-age=0";
    }
  } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const API_BASE_URL = resolveApiBaseUrl();

  // Check current session cleanly without generating 401 console errors on /login
  const checkAuth = useCallback(async () => {
    try {
      let activeToken =
        typeof window !== "undefined" ? localStorage.getItem("rn_crm_token") : null;

      // 1. Check first-party HttpOnly session on same-origin (/api/session)
      let cookieSession = null;
      try {
        const sessionRes = await fetch("/api/session", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (sessionRes.ok) {
          cookieSession = await sessionRes.json();
          if (cookieSession?.authenticated && cookieSession?.token) {
            activeToken = cookieSession.token;
          }
        }
      } catch {}

      // If no token in cookie OR localStorage, user is unauthenticated (no 401 fetch needed)
      if (!activeToken) {
        setUser(null);
        clearClientStorageAndLegacyCookies();
        return null;
      }

      // If localStorage had a token but first-party cookie was missing, sync it now
      if (!cookieSession?.authenticated && activeToken) {
        await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ token: activeToken }),
        }).catch(() => {});
      }

      // 2. Verify token against backend /api/auth/me
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          const resolvedUser = {
            ...data.user,
            role: normalizeUserRole(data.user.role),
          };
          setUser(resolvedUser);
          if (typeof window !== "undefined") {
            localStorage.setItem("rn_crm_token", activeToken);
            localStorage.setItem("rn_user", JSON.stringify(resolvedUser));
            if (resolvedUser.role === "SALES") {
              localStorage.setItem("rn_rep_token", activeToken);
            }
          }
          return resolvedUser;
        }
      }

      // Token rejected by server -> clean up both cookie and storage
      setUser(null);
      clearClientStorageAndLegacyCookies();
      await fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
    } catch (err) {
      console.warn("[Auth] Session verification notice:", err);
      if (typeof window !== "undefined") {
        const cached = localStorage.getItem("rn_user");
        if (cached) {
          try {
            setUser(JSON.parse(cached));
          } catch {}
        }
      }
    } finally {
      setIsLoading(false);
    }
    return null;
  }, [API_BASE_URL]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Login action: authenticates with backend AND persists first-party HttpOnly cookie
  const login = async (identifier, secret) => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ identifier, password: secret, pin: secret }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success || !data.token) {
      throw new Error(data.error || "Invalid login credentials. Please check your details.");
    }

    const normalizedRole = normalizeUserRole(data.user?.role);
    const resolvedUser = { ...data.user, role: normalizedRole };

    if (typeof window !== "undefined") {
      // Remove any legacy non-HttpOnly cookies before setting fresh HttpOnly session
      document.cookie = "rn_crm_token=; path=/; max-age=0";
      if (window.location.hostname.includes("rnvalves.com")) {
        document.cookie = "rn_crm_token=; path=/; domain=.rnvalves.com; max-age=0";
      }

      localStorage.setItem("rn_crm_token", data.token);
      localStorage.setItem("rn_user", JSON.stringify(resolvedUser));
      if (normalizedRole === "SALES") {
        localStorage.setItem("rn_rep_token", data.token);
        localStorage.setItem("rn_sales_rep_auth", resolvedUser.name || "");
      } else {
        localStorage.removeItem("rn_rep_token");
      }
    }

    // Persist 100% first-party HttpOnly SameSite=Lax cookie on crm.rnvalves.com
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token: data.token }),
    });

    setUser(resolvedUser);

    const destination = normalizedRole === "ADMIN" ? "/dashboard" : "/rep-portal";
    return { success: true, token: data.token, user: resolvedUser, redirectTo: destination };
  };

  // Logout action: clears first-party cookie, domain cookie, backend session, and storage
  const logout = async () => {
    setIsLoading(true);
    try {
      await Promise.allSettled([
        fetch("/api/session", { method: "DELETE", credentials: "same-origin" }),
        fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", credentials: "include" }),
      ]);
    } finally {
      setUser(null);
      clearClientStorageAndLegacyCookies();
      setIsLoading(false);
      if (typeof window !== "undefined") {
        window.location.replace("/login");
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
