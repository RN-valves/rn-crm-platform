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
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F8FAFC] text-slate-600">
      <img
        src="/rn-logo.png"
        alt="RN Valves & Faucets"
        className="h-20 w-auto object-contain select-none mb-5"
      />
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <div className="w-3.5 h-3.5 border-2 border-[#1091d0] border-t-transparent rounded-full animate-spin" />
        <span>Loading workspace...</span>
      </div>
    </div>
  );
}
