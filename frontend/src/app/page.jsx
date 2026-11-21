"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

export default function RootPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || !user) {
        router.replace("/login");
      } else if (user.role === "ADMIN") {
        router.replace("/dashboard");
      } else if (user.role === "SALES") {
        router.replace("/rep-portal");
      } else {
        router.replace("/login");
      }
    }
  }, [isLoading, isAuthenticated, user, router]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-slate-200">
      <div className="bg-white rounded-2xl px-5 py-3 shadow-xl shadow-black/40 mb-4 animate-pulse">
        <img
          src="/rn-logo.png"
          alt="RN Valves & Faucets"
          className="h-20 w-auto object-contain select-none"
        />
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
        <div className="w-4 h-4 border-2 border-rn-500 border-t-transparent rounded-full animate-spin" />
        <span>Verifying RN Valves CRM Session...</span>
      </div>
    </div>
  );
}
