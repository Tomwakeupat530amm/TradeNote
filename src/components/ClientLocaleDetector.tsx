"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";

export function ClientLocaleDetector() {
  const currentLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check if user already has an explicit cookie set
    const hasLocaleCookie = document.cookie
      .split("; ")
      .some((row) => row.startsWith("NEXT_LOCALE="));

    if (hasLocaleCookie) {
      return; // Respect user's explicit preference
    }

    try {
      // 1. Detect user timezone
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      const isVietnamTimezone =
        timeZone === "Asia/Ho_Chi_Minh" ||
        timeZone === "Asia/Saigon" ||
        timeZone.includes("Ho_Chi_Minh") ||
        timeZone.includes("Saigon");

      // 2. Detect navigator languages
      const languages = navigator.languages || [navigator.language];
      const isVietnameseLanguage = languages.some(
        (lang) => lang && lang.toLowerCase().startsWith("vi")
      );

      const isVietnamLocal = isVietnamTimezone || isVietnameseLanguage;

      if (isVietnamLocal && currentLocale !== "vi") {
        // Auto-switch to Vietnamese for local Vietnam users
        document.cookie = `NEXT_LOCALE=vi; path=/; max-age=31536000; SameSite=Lax`;
        router.replace(pathname, { locale: "vi" });
      } else if (!isVietnamLocal && currentLocale !== "en") {
        // Default to English for international users
        document.cookie = `NEXT_LOCALE=en; path=/; max-age=31536000; SameSite=Lax`;
        router.replace(pathname, { locale: "en" });
      }
    } catch {
      // Fallback silently if browser restrictions apply
    }
  }, [currentLocale, pathname, router]);

  return null;
}
