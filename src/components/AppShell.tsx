"use client";

import React, { useEffect } from "react";
import { useSidebarStore, initializeSidebarState } from "@/store/useSidebarStore";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { GuestBanner } from "./GuestBanner";
import { MobileBottomNav } from "./MobileBottomNav";
import clsx from "clsx";
import { usePathname } from "@/i18n/routing";
import { isPublicAuthPath } from "./AuthProvider";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { isCollapsed, toggleSidebar } = useSidebarStore();
  // Called before any early return so hook order stays stable.
  const pathname = usePathname();

  // Initialize state once client-side (safe from SSR hydration mismatch)
  useEffect(() => {
    initializeSidebarState();
  }, []);

  // Global hotkey: Ctrl + B or Cmd + B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  // Auth pages (/auth, /auth/reset) render without Sidebar/Header/MobileBottomNav.
  if (isPublicAuthPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Desktop Collapsible Sidebar Container */}
      <div
        className={clsx(
          "hidden md:flex md:flex-col md:fixed md:inset-y-0 z-50 transition-[width] duration-300 ease-in-out",
          isCollapsed ? "md:w-20" : "md:w-72"
        )}
      >
        <Sidebar />
      </div>

      {/* Main Content Workspace Container (Dynamically padding-shifted) */}
      <div
        className={clsx(
          "flex flex-col flex-1 min-h-screen transition-[padding] duration-300 ease-in-out",
          isCollapsed ? "md:pl-20" : "md:pl-72"
        )}
      >
        <GuestBanner />
        <Header />
        <main className="flex-1 overflow-y-auto bg-gray-950 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (< 768px) */}
      <MobileBottomNav />
    </>
  );
}
