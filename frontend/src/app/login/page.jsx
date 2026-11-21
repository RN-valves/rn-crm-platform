"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  Phone,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  KeyRound,
} from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect") || "";

  const { login, user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("admin"); // "admin" | "sales"

  // If already authenticated on initial load (not mid-submit), redirect immediately
  useEffect(() => {
    if (!isSubmitting && !authLoading && isAuthenticated && user) {
      const dest =
        user.role === "ADMIN"
          ? redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("/login")
            ? redirectParam
            : "/dashboard"
          : "/rep-portal";
      window.location.replace(dest);
    }
  }, [isSubmitting, authLoading, isAuthenticated, user, redirectParam]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanIdentifier = identifier.trim();
    const cleanSecret = password.trim();

    if (!cleanIdentifier) {
      setError(
        activeTab === "admin"
          ? "Please enter your email or username."
          : "Please enter your name or 10-digit mobile number."
      );
      return;
    }

    if (!cleanSecret) {
      setError(
        activeTab === "admin"
          ? "Please enter your password."
          : "Please enter your 4-digit security PIN."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(cleanIdentifier, cleanSecret);
      if (result && result.redirectTo) {
        const dest =
          redirectParam &&
          redirectParam.startsWith("/") &&
          !redirectParam.startsWith("/login") &&
          result.user.role === "ADMIN"
            ? redirectParam
            : result.redirectTo;
        window.location.replace(dest);
        return;
      }
      setIsSubmitting(false);
    } catch (err) {
      setError(err.message || "Invalid credentials. Please verify and try again.");
      setIsSubmitting(false);
    }
  };

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setError("");
    setIdentifier("");
    setPassword("");
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F8FAFC] bg-[radial-gradient(ellipse_at_top,_rgba(16,145,208,0.07),_transparent_60%)] px-4 py-10">
      <div className="w-full max-w-[410px]">
        {/* White Minimalist Card */}
        <div className="bg-white border border-slate-200/80 rounded-3xl px-8 py-9 sm:px-9 sm:py-10 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.08)]">
          {/* Official Logo Only — Clean & Minimalist */}
          <div className="text-center mb-7">
            <img
              src="/rn-logo.png"
              alt="RN Valves & Faucets — Built for Long Life"
              className="h-[92px] w-auto mx-auto object-contain select-none"
            />
            <p className="text-[13px] text-slate-500 mt-3 font-medium">
              Sign in to access your CRM workspace
            </p>
          </div>

          {/* Minimalist Segmented Role Switcher */}
          <div className="grid grid-cols-2 p-1 bg-slate-100/90 rounded-xl border border-slate-200/60 mb-6 text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleTabSwitch("admin")}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "admin"
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/70"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <ShieldCheck
                className={`w-3.5 h-3.5 ${
                  activeTab === "admin" ? "text-[#1091d0]" : "text-slate-400"
                }`}
              />
              <span>Admin</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch("sales")}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "sales"
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/70"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <User
                className={`w-3.5 h-3.5 ${
                  activeTab === "sales" ? "text-[#1091d0]" : "text-slate-400"
                }`}
              />
              <span>Sales Rep</span>
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-5 px-3.5 py-3 rounded-xl bg-red-50 border border-red-200/80 text-red-700 text-xs font-medium flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {activeTab === "admin" ? "Email or Username" : "Name or Mobile Number"}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  {activeTab === "admin" ? (
                    <Mail className="w-4 h-4" />
                  ) : (
                    <Phone className="w-4 h-4" />
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={
                    activeTab === "admin" ? "Enter email or username" : "Enter name or mobile number"
                  }
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1091d0] focus:ring-4 focus:ring-[#1091d0]/10 transition-all placeholder:text-slate-400"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {activeTab === "admin" ? "Password" : "Security PIN"}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  {activeTab === "admin" ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  maxLength={activeTab === "sales" ? 8 : 100}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={activeTab === "admin" ? "Enter password" : "Enter 4-digit PIN"}
                  className="w-full pl-10 pr-11 py-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1091d0] focus:ring-4 focus:ring-[#1091d0]/10 transition-all placeholder:text-slate-400"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-[#1091d0] hover:bg-[#0c7db5] active:scale-[0.99] flex items-center justify-center gap-2 shadow-sm shadow-[#1091d0]/25 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Subtle Security Footer */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <Lock className="w-3 h-3 text-emerald-500" />
              <span>Private & Role-Protected Access</span>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <p className="text-center text-[11px] text-slate-400 mt-5 font-medium">
          © {new Date().getFullYear()} RN Valves & Faucets. All rights reserved.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-[#F8FAFC]">
          <img
            src="/rn-logo.png"
            alt="RN Valves & Faucets"
            className="h-20 w-auto object-contain animate-pulse"
          />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
