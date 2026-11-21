"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Sparkles,
  CheckCircle2,
  KeyRound,
  Building2,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect") || "";

  const { login, user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("admin"); // "admin" or "sales"

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
          ? "Please enter your Admin email or username."
          : "Please enter your Name or 10-digit mobile number."
      );
      return;
    }

    if (!cleanSecret) {
      setError(
        activeTab === "admin"
          ? "Please enter your Admin password."
          : "Please enter your 4-digit security PIN."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(cleanIdentifier, cleanSecret);
      if (result && result.redirectTo) {
        const dest =
          redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("/login") && result.user.role === "ADMIN"
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
    if (tab === "admin") {
      setIdentifier("admin@rnvalves.com");
      setPassword("");
    } else {
      setIdentifier("");
      setPassword("");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-rn-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-black/60">
          {/* Logo & Header */}
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center bg-white rounded-2xl px-6 py-3.5 shadow-xl shadow-black/30 ring-1 ring-white/20 mb-4">
              <img
                src="/rn-logo.png"
                alt="RN Valves & Faucets — Built for Long Life"
                className="h-24 w-auto object-contain select-none"
              />
            </div>
            <h1 className="text-xl font-black text-white tracking-wide flex items-center justify-center gap-2">
              RN VALVES
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rn-500/20 text-rn-300 border border-rn-500/30">
                PRO CRM
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Enterprise WhatsApp CRM & Sales Execution Platform
            </p>
          </div>

          {/* Role Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-950/80 rounded-2xl border border-slate-800/80 mb-6 text-xs font-bold">
            <button
              type="button"
              onClick={() => handleTabSwitch("admin")}
              className={`py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
                activeTab === "admin"
                  ? "bg-rn-600 text-white shadow-md shadow-rn-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Admin Login</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch("sales")}
              className={`py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
                activeTab === "sales"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <User className="w-4 h-4" />
              <span>Sales Rep</span>
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-950/60 border border-red-500/30 text-red-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {activeTab === "admin"
                  ? "Admin Email or Username"
                  : "Sales Rep Name or Mobile Number"}
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
                  type={activeTab === "admin" ? "text" : "text"}
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={
                    activeTab === "admin"
                      ? "admin@rnvalves.com"
                      : "e.g. Danish / 9315600189"
                  }
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-rn-500 focus:border-transparent transition-all placeholder:text-slate-500"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {activeTab === "admin" ? "Password" : "4-Digit Security PIN"}
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
                  placeholder={
                    activeTab === "admin"
                      ? "Enter admin password"
                      : "Enter 4-digit PIN (Default: 1234)"
                  }
                  className="w-full pl-10 pr-11 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-rn-500 focus:border-transparent transition-all placeholder:text-slate-500"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Helper Hints */}
            <div className="pt-1 text-[11px] text-slate-400 flex items-center justify-between">
              {activeTab === "admin" ? (
                <span className="text-slate-400">
                  Master Admin: <code className="text-rn-300">admin@rnvalves.com</code>
                </span>
              ) : (
                <span className="text-slate-400">
                  Default Rep PIN: <code className="text-blue-300">1234</code>
                </span>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-all ${
                activeTab === "admin"
                  ? "bg-rn-600 hover:bg-rn-500 shadow-rn-600/30"
                  : "bg-blue-600 hover:bg-blue-500 shadow-blue-600/30"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to RN Valves CRM</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Security Note */}
          <div className="mt-6 pt-5 border-t border-slate-800 text-center">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>256-Bit SSL Encrypted & Role-Protected Session</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-400 mt-6">
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
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-200">
          <div className="bg-white rounded-2xl p-3 shadow-xl animate-pulse">
            <img src="/rn-logo.png" alt="RN Valves & Faucets" className="h-16 w-auto object-contain" />
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
