"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ShieldAlert, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back to TradeNote!");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Account created successfully!");
      }
      router.push("/");
    } catch (err: any) {
      toast.error(err.message);
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
          TradeNote
        </h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          {isLogin ? "Sign in to your journal" : "Start your trading journey"}
        </p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm relative z-10"
      >
        <div className="bg-gray-900/60 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-white/10">
          <form className="space-y-6" onSubmit={handleAuth}>
            <div>
              <label className="block text-sm font-medium leading-6 text-gray-300">
                Email address
              </label>
              <div className="mt-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-4 transition-all"
                  placeholder="trader@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium leading-6 text-gray-300">
                Password
              </label>
              <div className="mt-2">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border-0 bg-white/5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-4 transition-all"
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
                {loading ? "Processing..." : isLogin ? "Sign in" : "Create Account"}
              </motion.button>
            </div>
          </form>

          <p className="mt-8 text-center text-sm text-gray-400">
            {isLogin ? "Not a member? " : "Already have an account? "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="font-semibold leading-6 text-green-400 hover:text-green-300 transition-colors"
            >
              {isLogin ? "Sign up for free" : "Log in to your account"}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
