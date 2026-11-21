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
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-rn-600 to-rn-500 flex items-center justify-center font-black text-white text-2xl shadow-xl shadow-rn-600/30 mb-4 animate-pulse">
        RN
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
        <div className="w-4 h-4 border-2 border-rn-500 border-t-transparent rounded-full animate-spin" />
        <span>Verifying RN Valves CRM Session...</span>
      </div>
    </div>
  );
}
