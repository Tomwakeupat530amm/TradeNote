"use client";

import { useState } from "react";
import { useAccountStore, Account } from "@/store/useAccountStore";
import { Save, ShieldAlert, Bell, User } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { accounts, activeAccountId, updateAccount } = useAccountStore();
  
  const activeAccount = accounts.find(a => a.id === activeAccountId);
  
  const [maxDailyLoss, setMaxDailyLoss] = useState("");
  const [maxDailyLossType, setMaxDailyLossType] = useState<"%" | "$">("$");
  const [isSaving, setIsSaving] = useState(false);

  const [prevAccount, setPrevAccount] = useState<Account | undefined>(activeAccount);
  if (activeAccount !== prevAccount) {
    setPrevAccount(activeAccount);
    if (activeAccount && activeAccount.rules) {
      setMaxDailyLoss(activeAccount.rules.maxDailyLoss?.toString() || "");
      setMaxDailyLossType(activeAccount.rules.maxDailyLossType || "$");
    }
  }

  const handleSaveRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;

    setIsSaving(true);
    try {
      await updateAccount(activeAccount.id, {
        rules: {
          ...activeAccount.rules,
          maxDailyLoss: maxDailyLoss ? Number(maxDailyLoss) : undefined,
          maxDailyLossType
        }
      });
      toast.success("Risk settings saved successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save risk settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
          Settings
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          Manage your application preferences and risk rules.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Sidebar Nav (mock) */}
        <div className="md:col-span-1 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 font-medium">
            <ShieldAlert className="w-5 h-5" />
            Risk Management
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white font-medium transition-colors">
            <User className="w-5 h-5" />
            Profile Settings
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white font-medium transition-colors">
            <Bell className="w-5 h-5" />
            Notifications
          </button>
        </div>

        {/* Content Area */}
        <div className="md:col-span-2 space-y-6">
          
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 sm:p-8">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white">Risk Management</h3>
              <p className="text-sm text-gray-400 mt-1">
                Set up automated warnings when you breach your risk rules. These apply to your currently active account: <span className="text-green-400 font-medium">{activeAccount?.name || 'None'}</span>
              </p>
            </div>

            {activeAccount ? (
              <form onSubmit={handleSaveRisk} className="space-y-6">
                <div>
                  <label htmlFor="maxDailyLoss" className="block text-sm font-medium text-gray-300">
                    Max Daily Loss
                  </label>
                  <div className="mt-2 flex rounded-md shadow-sm">
                    <select
                      value={maxDailyLossType}
                      onChange={(e) => setMaxDailyLossType(e.target.value as "%" | "$")}
                      className="inline-flex items-center rounded-l-md border-0 bg-white/5 py-1.5 pl-3 pr-8 text-gray-400 ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6"
                    >
                      <option value="$">Amount ($)</option>
                      <option value="%">Percent (%)</option>
                    </select>
                    <input
                      type="number"
                      name="maxDailyLoss"
                      id="maxDailyLoss"
                      value={maxDailyLoss}
                      onChange={(e) => setMaxDailyLoss(e.target.value)}
                      className="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-0 bg-white/5 py-1.5 px-3 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6"
                      placeholder={maxDailyLossType === '$' ? "e.g. 500" : "e.g. 2"}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    You will receive a warning when your daily loss reaches 80% of this limit, and an error when exceeded.
                  </p>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? "Saving..." : "Save Risk Rules"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="py-8 text-center border-2 border-dashed border-gray-800 rounded-xl">
                <p className="text-gray-400 text-sm">Please select an active account from the Accounts page first.</p>
              </div>
            )}
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 sm:p-8 opacity-50 pointer-events-none">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white">Application Preferences</h3>
              <p className="text-sm text-gray-400 mt-1">
                General app settings (Coming soon)
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-300">Dark Mode</p>
                  <p className="text-xs text-gray-500">Enable dark theme across the app</p>
                </div>
                <div className="w-11 h-6 bg-green-500 rounded-full relative">
                  <div className="w-4 h-4 bg-white rounded-full absolute right-1 top-1"></div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
