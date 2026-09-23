"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/routing";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export default function CalendarPage() {
  const router = useRouter();
  const t = useTranslations("Journal");

  useEffect(() => {
    router.replace("/journal?view=calendar");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-gray-400">
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 shadow-xl flex items-center gap-3">
        <CalendarIcon className="w-6 h-6 text-blue-400 animate-pulse" />
        <span className="text-sm font-medium text-gray-300">
          {t("calendar_redirect")}
        </span>
        <Loader2 className="w-4 h-4 text-blue-400 animate-spin ml-1" />
      </div>
    </div>
  );
}
