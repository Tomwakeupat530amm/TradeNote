"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("TradeNote client error boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-rose-500/20 bg-gray-900/95 p-8 shadow-2xl backdrop-blur-xl text-center space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shadow-lg shadow-rose-500/10">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Đã xảy ra sự cố hiển thị / An error occurred
          </h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            Ứng dụng đã tự động bảo vệ dữ liệu phiên giao dịch của bạn. Vui lòng thử tải lại giao diện hoặc quay về trang chủ.
          </p>
          {error.digest && (
            <p className="text-[10px] font-mono text-gray-500 bg-black/40 py-1 px-2.5 rounded-lg inline-block">
              Digest: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition-all cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Thử lại / Retry</span>
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-semibold transition-all cursor-pointer"
          >
            <Home className="h-4 w-4" />
            <span>Trang chủ / Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
