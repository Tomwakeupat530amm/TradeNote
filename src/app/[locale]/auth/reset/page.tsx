"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { Link, useRouter } from "@/i18n/routing";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 8;

type Status = "checking" | "ready" | "expired";

export default function ResetPasswordPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const passwordRecovery = useAuthStore((s) => s.passwordRecovery);
  const clearPasswordRecovery = useAuthStore((s) => s.clearPasswordRecovery);
  const [sessionStatus, setSessionStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!cancelled) setSessionStatus(session ? "ready" : "expired");
      })
      .catch(() => {
        if (!cancelled) setSessionStatus("expired");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The PASSWORD_RECOVERY flag (set by the singleton listener) wins over a late/empty getSession.
  const status: Status = passwordRecovery ? "ready" : sessionStatus;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(t("reset.tooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirm) {
      toast.error(t("reset.mismatch"));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const code = (error as { code?: unknown }).code;
        toast.error(code === "weak_password" ? t("errors.weakPassword") : t("reset.failed"));
        return;
      }
      toast.success(t("reset.success"));
      clearPasswordRecovery();
      await supabase.auth.signOut();
      router.push("/auth");
    } catch {
      toast.error(t("reset.failed"));
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "block w-full rounded-xl border-0 bg-white/5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-4 transition-all";

  return (
    <div className="flex min-h-screen flex-1 flex-col justify-center px-6 py-12 lg:px-8 relative overflow-hidden bg-gray-950">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-green-500/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="sm:mx-auto sm:w-full sm:max-w-sm relative z-10">
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-green-500/20 rounded-2xl border border-green-500/30">
            <KeyRound className="w-10 h-10 text-green-400" />
          </div>
        </div>
        <h2 className="text-center text-2xl font-bold tracking-tight text-white">{t("reset.title")}</h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm relative z-10">
        <div className="bg-gray-900/60 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-white/10">
          {status === "checking" && (
            <div className="flex justify-center">
              <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
            </div>
          )}

          {status === "expired" && (
            <div className="space-y-6 text-center">
              <p className="text-sm text-gray-300">{t("reset.expired")}</p>
              <Link href="/auth" className="text-sm font-semibold text-green-400 hover:text-green-300 transition-colors">
                {t("backToLogin")}
              </Link>
            </div>
          )}

          {status === "ready" && (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="reset-password" className="block text-sm font-medium leading-6 text-gray-300">
                  {t("reset.newPassword")}
                </label>
                <input
                  id="reset-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`mt-2 ${inputClass}`}
                />
              </div>
              <div>
                <label htmlFor="reset-confirm" className="block text-sm font-medium leading-6 text-gray-300">
                  {t("reset.confirmPassword")}
                </label>
                <input
                  id="reset-confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={`mt-2 ${inputClass}`}
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="flex w-full justify-center rounded-xl bg-green-600 px-3 py-2.5 text-sm font-semibold leading-6 text-white hover:bg-green-500 disabled:opacity-50 transition-all"
              >
                {saving ? t("processing") : t("reset.submit")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
