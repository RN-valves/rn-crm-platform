"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== "undefined" && window.location.hostname.includes("rnvalves.com")
      ? "https://crm-api.rnvalves.com/api"
      : "http://localhost:5000/api");

  // Check current session from backend /api/auth/me
  const checkAuth = useCallback(async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("rn_crm_token") : null;
      const headers = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "GET",
        headers,
        credentials: "include", // send HttpOnly cookie
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          const normalizedRole =
            data.user.role === "ADMIN" || data.user.role === "Admin" || data.user.role === "Manager"
              ? "ADMIN"
              : "SALES";
          const resolvedUser = { ...data.user, role: normalizedRole };
          setUser(resolvedUser);
          if (typeof window !== "undefined") {
            localStorage.setItem("rn_user", JSON.stringify(resolvedUser));
            if (resolvedUser.role === "SALES") {
              localStorage.setItem("rn_rep_token", token || "");
            }
          }
          return resolvedUser;
        }
      } else {
        // Not authenticated
        setUser(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem("rn_user");
          localStorage.removeItem("rn_crm_token");
          localStorage.removeItem("rn_rep_token");
        }
      }
    } catch (err) {
      console.warn("[Auth] Check auth warning:", err);
      // In offline / fallback, inspect cached user if exists
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

  // Login action
  const login = async (identifier, secret) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier, password: secret, pin: secret }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Invalid login credentials. Please check your details.");
      }

      const normalizedRole =
        data.user.role === "ADMIN" || data.user.role === "Admin" ? "ADMIN" : "SALES";
      const resolvedUser = { ...data.user, role: normalizedRole };

      setUser(resolvedUser);

      if (typeof window !== "undefined") {
        if (data.token) {
          localStorage.setItem("rn_crm_token", data.token);
          if (normalizedRole === "SALES") {
            localStorage.setItem("rn_rep_token", data.token);
          }
          // Set client cookie on crm.rnvalves.com so Next.js middleware reads it
          try {
            const isHttps = window.location.protocol === "https:";
            const isProd = window.location.hostname.includes("rnvalves.com");
            const domainPart = isProd ? "; domain=.rnvalves.com" : "";
            const securePart = isHttps ? "; Secure" : "";
            const maxAge = 7 * 24 * 60 * 60; // 7 days
            document.cookie = `rn_crm_token=${data.token}; path=/${domainPart}; max-age=${maxAge}; SameSite=Lax${securePart}`;
            document.cookie = `rn_crm_token=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax${securePart}`;
          } catch {}
        }
        localStorage.setItem("rn_user", JSON.stringify(resolvedUser));
      }

      const destination = normalizedRole === "ADMIN" ? "/dashboard" : "/rep-portal";
      return { success: true, user: resolvedUser, redirectTo: destination };
    } finally {
      setIsLoading(false);
    }
  };

  // Logout action
  const logout = async () => {
    setIsLoading(true);
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    } finally {
      setUser(null);
      if (typeof window !== "undefined") {
        try {
          const isProd = window.location.hostname.includes("rnvalves.com");
          const domainPart = isProd ? "; domain=.rnvalves.com" : "";
          document.cookie = `rn_crm_token=; path=/${domainPart}; max-age=0`;
          document.cookie = `rn_crm_token=; path=/; max-age=0`;
        } catch {}
        localStorage.removeItem("rn_crm_token");
        localStorage.removeItem("rn_rep_token");
        localStorage.removeItem("rn_user");
      }
      setIsLoading(false);
      window.location.href = "/login";
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
