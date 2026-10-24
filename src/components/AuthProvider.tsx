"use client";

import { useEffect } from "react";
import { useAuthStore, ensureAuthListener } from "@/store/useAuthStore";
import { useAccountStore } from "@/store/useAccountStore";
import { useTradeStore } from "@/store/useTradeStore";
import { usePlaybookStore } from "@/store/usePlaybookStore";
import { useRouter, usePathname } from "@/i18n/routing";
import { Loader2 } from "lucide-react";

/** The ONE shared list of public (unauthenticated) auth paths, locale-less (next-intl pathname). */
export const PUBLIC_AUTH_PATHS: readonly string[] = ["/auth", "/auth/reset"];

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.includes(pathname);
}

// Register the auth listener as early as possible (module load on the client).
ensureAuthListener();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading, checkSession } = useAuthStore();
  const activeAccountId = useAccountStore(state => state.activeAccountId);
  const router = useRouter();
  const pathname = usePathname();
  const isPublic = isPublicAuthPath(pathname);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!isLoading) {
      if (!user && !isPublic) {
        router.push("/auth");
      } else if (user && pathname === "/auth") {
        // Signed-in users leave the login page; /auth/reset stays (recovery session).
        router.push("/");
      }
    }
  }, [user, isLoading, isPublic, pathname, router]);

  useEffect(() => {
    if (user) {
      useAccountStore.getState().fetchAccounts();
      usePlaybookStore.getState().fetchPlaybooks();
    }
  }, [user]);

  useEffect(() => {
    if (activeAccountId) {
      useTradeStore.getState().fetchTrades(activeAccountId);
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
  if (!user && !isPublic) {
    return null;
  }

  return <>{children}</>;
}
