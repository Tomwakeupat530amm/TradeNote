"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useAccountStore } from "@/store/useAccountStore";
import { useTradeStore } from "@/store/useTradeStore";
import { usePlaybookStore } from "@/store/usePlaybookStore";
import { useRouter, usePathname } from "@/i18n/routing";
import { Loader2 } from "lucide-react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading, checkSession } = useAuthStore();
  const activeAccountId = useAccountStore(state => state.activeAccountId);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!isLoading) {
      if (!user && pathname !== "/auth") {
        router.push("/auth");
      } else if (user && pathname === "/auth") {
        router.push("/");
      }
    }
  }, [user, isLoading, pathname, router]);

  useEffect(() => {
    if (user) {
      useAccountStore.getState().fetchAccounts();
      usePlaybookStore.getState().fetchPlaybooks();
    }
  }, [user]);

  useEffect(() => {
    if (activeAccountId) {
      useTradeStore.getState().fetchTrades(activeAccountId);
      useTradeStore.getState().fetchAccountStats(activeAccountId);
    }
  }, [activeAccountId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
      </div>
    );
  }

  // Prevent flashing protected content before redirect
  if (!user && pathname !== "/auth") {
    return null;
  }

  return <>{children}</>;
}
