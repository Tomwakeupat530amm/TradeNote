"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase";
import { useRouter } from "@/i18n/routing";
import { Activity, MailCheck } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

type AuthErrorKey = "invalidCredentials" | "emailNotConfirmed" | "rateLimited" | "weakPassword" | "generic";

/**
 * Maps a Supabase auth error to a localized generic key. Never surfaces raw provider text and
 * never distinguishes "email exists" from "email unknown" (anti account-enumeration).
 */
function mapAuthError(err: unknown, mode: "login" | "signup"): AuthErrorKey {
  const e = (err ?? {}) as { code?: unknown; status?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  if (status === 429 || code.includes("rate_limit")) return "rateLimited";
  if (code === "weak_password") return "weakPassword";
  if (mode === "login") {
    if (code === "email_not_confirmed") return "emailNotConfirmed";
    return "invalidCredentials";
  }
  return "generic";
}

/** Sign-up "already exists" codes are treated as success so the response never reveals the email exists. */
function isExistingAccountError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "user_already_exists" || code === "email_exists";
}

const inputClass =
  "block w-full rounded-xl border-0 bg-white/5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-4 transition-all";

export default function AuthPage() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [checkEmailFor, setCheckEmailFor] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast.error(t(`errors.${mapAuthError(error, "login")}`));
          return;
        }
        toast.success(t("welcomeBack"));
        router.push("/");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/${locale}/auth` },
        });
        if (error && !isExistingAccountError(error)) {
          toast.error(t(`errors.${mapAuthError(error, "signup")}`));
          return;
        }
        if (!error && data.session) {
          toast.success(t("accountCreated"));
          router.push("/");
          return;
        }
        // Confirmation required (or account already exists): same neutral screen either way.
        setCheckEmailFor(email);
      }
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!checkEmailFor) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: checkEmailFor,
        options: { emailRedirectTo: `${window.location.origin}/${locale}/auth` },
      });
      if (error && mapAuthError(error, "signup") === "rateLimited") {
        toast.error(t("errors.rateLimited"));
      } else {
        toast.success(t("resendDone"));
      }
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setResending(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error(t("forgotNeedEmail"));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/${locale}/auth/reset`,
      });
      if (error && mapAuthError(error, "signup") === "rateLimited") {
        toast.error(t("errors.rateLimited"));
        return;
      }
      // Always the same message, whether or not the email has an account.
      toast.success(t("forgotSent"));
    } catch {
      toast.success(t("forgotSent"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col justify-center px-6 py-12 lg:px-8 relative overflow-hidden bg-gray-950">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-green-500/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[600px] h-[400px] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="sm:mx-auto sm:w-full sm:max-w-sm relative z-10"
      >
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-green-500/20 rounded-2xl border border-green-500/30">
            <Activity className="w-10 h-10 text-green-400" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-bold leading-9 tracking-tight text-white">
          {t("brand")}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          {isLogin ? t("subtitleLogin") : t("subtitleSignup")}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm relative z-10"
      >
        <div className="bg-gray-900/60 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-white/10">
          {checkEmailFor ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <MailCheck className="w-10 h-10 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">{t("checkEmailTitle")}</h3>
              <p className="text-sm text-gray-400">{t("checkEmailBody", { email: checkEmailFor })}</p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="flex w-full justify-center rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50 transition-all"
              >
                {resending ? t("processing") : t("resend")}
              </button>
              <button
                type="button"
                onClick={() => { setCheckEmailFor(null); setIsLogin(true); }}
                className="text-sm font-semibold text-green-400 hover:text-green-300 transition-colors"
              >
                {t("backToLogin")}
              </button>
            </div>
          ) : (
            <>
              <form className="space-y-6" onSubmit={handleAuth}>
                <div>
                  <label htmlFor="auth-email" className="block text-sm font-medium leading-6 text-gray-300">
                    {t("emailLabel")}
                  </label>
                  <div className="mt-2">
                    <input
                      id="auth-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                      placeholder={t("emailPlaceholder")}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="auth-password" className="block text-sm font-medium leading-6 text-gray-300">
                      {t("passwordLabel")}
                    </label>
                    {isLogin && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={loading}
                        className="text-xs font-semibold text-green-400 hover:text-green-300 disabled:opacity-50 transition-colors"
                      >
                        {t("forgotPassword")}
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    <input
                      id="auth-password"
                      type="password"
                      required
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={loading}
                    className="flex w-full justify-center rounded-xl bg-green-600 px-3 py-2.5 text-sm font-semibold leading-6 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)] hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50 transition-all"
                  >
                    {loading ? t("processing") : isLogin ? t("signIn") : t("createAccount")}
                  </motion.button>
                </div>
              </form>

              <p className="mt-8 text-center text-sm text-gray-400">
                {isLogin ? t("notMember") : t("haveAccount")}{" "}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="font-semibold leading-6 text-green-400 hover:text-green-300 transition-colors"
                >
                  {isLogin ? t("switchToSignup") : t("switchToLogin")}
                </button>
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
