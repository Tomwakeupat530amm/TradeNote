/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useRef } from "react";
import { useAccountStore, Account } from "@/store/useAccountStore";
import { usePreferenceStore } from "@/store/usePreferenceStore";
import { useAuthStore } from "@/store/useAuthStore";
import { supabase } from "@/lib/supabase";
import { Save, ShieldAlert, Tag, Settings, Trash, Plus, EyeOff, Lock, User, Upload, Key, Mail } from "lucide-react";
import { toast } from "sonner";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useTranslations } from "next-intl";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const { user } = useAuthStore();
  const { accounts, activeAccountId, updateAccount } = useAccountStore();
  const { preferences, fetchPreferences, updatePreferences, isLoading: prefsLoading } = usePreferenceStore();
  
  const activeAccount = accounts.find(a => a.id === activeAccountId);
  
  const [activeTab, setActiveTab] = useState<"profile" | "risk" | "preferences" | "app">("profile");

  // --- Risk Form State ---
  const [dailyLossAlertThreshold, setDailyLossAlertThreshold] = useState<number>(80);
  const [drawdownAlertThreshold, setDrawdownAlertThreshold] = useState<number>(80);
  const [enableHardStop, setEnableHardStop] = useState<boolean>(false);
  const [isSavingRisk, setIsSavingRisk] = useState(false);

  // --- Profile Form State ---
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  // --- Security Form State ---
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isUpdatingAuth, setIsUpdatingAuth] = useState(false);

  // --- Avatar Upload State ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // --- Preferences Form State ---
  const [newPsychTag, setNewPsychTag] = useState("");
  const [newMistakeTag, setNewMistakeTag] = useState("");
  const [newConfluenceTag, setNewConfluenceTag] = useState("");

  const [prevAccount, setPrevAccount] = useState<Account | undefined>(activeAccount);
  if (activeAccount !== prevAccount) {
    setPrevAccount(activeAccount);
    if (activeAccount && activeAccount.rules) {
      setDailyLossAlertThreshold(activeAccount.rules.dailyLossAlertThreshold ?? 80);
      setDrawdownAlertThreshold(activeAccount.rules.drawdownAlertThreshold ?? 80);
      setEnableHardStop(activeAccount.rules.enableHardStop ?? false);
    }
  }

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

   
  useEffect(() => {
    if (preferences) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayName(preferences.displayName || "");
      setTimezone(preferences.timezone || "UTC");
      setBaseCurrency(preferences.baseCurrency || "USD");
    }
  }, [preferences]);

   
  useEffect(() => {
    if (user?.email) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmail(user.email);
    }
  }, [user]);

  const handleSaveRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;

    setIsSavingRisk(true);
    try {
      await updateAccount(activeAccount.id, {
        rules: {
          ...activeAccount.rules,
          dailyLossAlertThreshold,
          drawdownAlertThreshold,
          enableHardStop
        }
      });
      toast.success("Risk settings saved successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save risk settings.");
    } finally {
      setIsSavingRisk(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      await updatePreferences({ displayName, timezone, baseCurrency });
      toast.success("Profile settings saved!");
    } catch {
      toast.error("Failed to save profile settings.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!email || email === user?.email) return;
    setIsUpdatingAuth(true);
    const { error } = await supabase.auth.updateUser({ email });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Check both emails to confirm the change.");
    }
    setIsUpdatingAuth(false);
  };

  const handleUpdatePassword = async () => {
    if (!password) return;
    setIsUpdatingAuth(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully!");
      setPassword("");
    }
    setIsUpdatingAuth(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setIsUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}-${Math.random()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      
      await updatePreferences({ avatarUrl: data.publicUrl });
      toast.success("Avatar updated!");
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to upload avatar");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddPsychTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPsychTag.trim() || !preferences) return;
    const tags = [...preferences.psychologyTags, newPsychTag.trim()];
    await updatePreferences({ psychologyTags: tags });
    setNewPsychTag("");
    toast.success("Tag added!");
  };

  const handleRemovePsychTag = async (tagToRemove: string) => {
    if (!preferences) return;
    const tags = preferences.psychologyTags.filter(t => t !== tagToRemove);
    await updatePreferences({ psychologyTags: tags });
  };

  const handleAddMistakeTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMistakeTag.trim() || !preferences) return;
    const tags = [...preferences.mistakeTags, newMistakeTag.trim()];
    await updatePreferences({ mistakeTags: tags });
    setNewMistakeTag("");
    toast.success("Tag added!");
  };

  const handleRemoveMistakeTag = async (tagToRemove: string) => {
    if (!preferences) return;
    const tags = preferences.mistakeTags.filter(t => t !== tagToRemove);
    await updatePreferences({ mistakeTags: tags });
  };

  const handleAddConfluenceTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConfluenceTag.trim() || !preferences) return;
    const tags = [...preferences.confluenceTags, newConfluenceTag.trim()];
    await updatePreferences({ confluenceTags: tags });
    setNewConfluenceTag("");
    toast.success("Tag added!");
  };

  const handleRemoveConfluenceTag = async (tagToRemove: string) => {
    if (!preferences) return;
    const tags = preferences.confluenceTags.filter(t => t !== tagToRemove);
    await updatePreferences({ confluenceTags: tags });
  };

  const handleTogglePrivacy = async () => {
    if (!preferences) return;
    await updatePreferences({ privacyMode: !preferences.privacyMode });
    toast.success(`Privacy mode ${!preferences.privacyMode ? "enabled" : "disabled"}`);
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          {t("description")}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Sidebar Nav */}
        <div className="lg:col-span-1 space-y-2">
          <button 
            onClick={() => setActiveTab("profile")}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors border",
              activeTab === "profile" 
                ? "bg-green-500/10 text-green-400 border-green-500/20" 
                : "text-gray-400 border-transparent hover:bg-white/5 hover:text-white"
            )}>
            <User className="w-5 h-5" />
            {t("profile")}
          </button>
          <button 
            onClick={() => setActiveTab("risk")}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors border",
              activeTab === "risk" 
                ? "bg-green-500/10 text-green-400 border-green-500/20" 
                : "text-gray-400 border-transparent hover:bg-white/5 hover:text-white"
            )}>
            <ShieldAlert className="w-5 h-5" />
            {t("risk")}
          </button>
          <button 
            onClick={() => setActiveTab("preferences")}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors border",
              activeTab === "preferences" 
                ? "bg-green-500/10 text-green-400 border-green-500/20" 
                : "text-gray-400 border-transparent hover:bg-white/5 hover:text-white"
            )}>
            <Tag className="w-5 h-5" />
            {t("tags")}
          </button>
          <button 
            onClick={() => setActiveTab("app")}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors border",
              activeTab === "app" 
                ? "bg-green-500/10 text-green-400 border-green-500/20" 
                : "text-gray-400 border-transparent hover:bg-white/5 hover:text-white"
            )}>
            <Settings className="w-5 h-5" />
            {t("app")}
          </button>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* PROFILE TAB */}
          {activeTab === "profile" && (
            <div className="space-y-6">
              {/* Basic Info & Trading Preferences */}
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 sm:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{t("profile_info")}</h3>
                    <p className="text-sm text-gray-400 mt-1">{t("profile_desc")}</p>
                  </div>
                  {/* Avatar Upload */}
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-full bg-gray-800 overflow-hidden border border-gray-700">
                      {preferences?.avatarUrl ? (
                        <img src={preferences.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-gray-500">
                          <User className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div>
                      <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleAvatarUpload} />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingAvatar}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-sm text-white rounded-lg transition-colors border border-gray-700"
                      >
                        <Upload className="w-4 h-4" />
                        {isUploadingAvatar ? t("avatar_uploading") : t("avatar_change")}
                      </button>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-6">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-300">{t("display_name")}</label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. John Doe"
                        className="mt-2 block w-full rounded-xl border-0 bg-white/5 py-2.5 px-4 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300">{t("base_currency")}</label>
                      <select
                        value={baseCurrency}
                        onChange={(e) => setBaseCurrency(e.target.value)}
                        className="mt-2 block w-full rounded-xl border-0 bg-gray-800 py-2.5 px-4 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm [&>option]:bg-gray-900"
                      >
                        <option value="USD">USD - US Dollar</option>
                        <option value="EUR">EUR - Euro</option>
                        <option value="GBP">GBP - British Pound</option>
                        <option value="AUD">AUD - Australian Dollar</option>
                        <option value="CAD">CAD - Canadian Dollar</option>
                        <option value="JPY">JPY - Japanese Yen</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-300">{t("timezone")}</label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="mt-2 block w-full rounded-xl border-0 bg-gray-800 py-2.5 px-4 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm [&>option]:bg-gray-900"
                      >
                        <option value="UTC">UTC (Coordinated Universal Time)</option>
                        <option value="America/New_York">EST/EDT (New York)</option>
                        <option value="America/Chicago">CST/CDT (Chicago)</option>
                        <option value="America/Denver">MST/MDT (Denver)</option>
                        <option value="America/Los_Angeles">PST/PDT (Los Angeles)</option>
                        <option value="Europe/London">GMT/BST (London)</option>
                        <option value="Europe/Berlin">CET/CEST (Berlin)</option>
                        <option value="Asia/Tokyo">JST (Tokyo)</option>
                        <option value="Asia/Ho_Chi_Minh">ICT (Ho Chi Minh / Hanoi)</option>
                        <option value="Australia/Sydney">AEST/AEDT (Sydney)</option>
                      </select>
                      <p className="mt-2 text-xs text-gray-500">{t("timezone_desc")}</p>
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isSavingProfile}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      {isSavingProfile ? t("saving") : t("save_profile")}
                    </button>
                  </div>
                </form>
              </div>

              {/* Security */}
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 sm:p-8">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white">{t("security")}</h3>
                  <p className="text-sm text-gray-400 mt-1">{t("security_desc")}</p>
                </div>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-300">{t("email")}</label>
                      <div className="relative mt-2">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <Mail className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="block w-full rounded-xl border-0 bg-white/5 py-2.5 pl-10 pr-4 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <button
                        onClick={handleUpdateEmail}
                        disabled={isUpdatingAuth || email === user?.email}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 transition-colors border border-gray-700"
                      >
                        {t("update_email")}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end pt-4 border-t border-gray-800">
                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-300">{t("new_password")}</label>
                      <div className="relative mt-2">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <Key className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={t("new_password_placeholder")}
                          className="block w-full rounded-xl border-0 bg-white/5 py-2.5 pl-10 pr-4 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <button
                        onClick={handleUpdatePassword}
                        disabled={isUpdatingAuth || !password}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50 transition-colors border border-gray-700"
                      >
                        {t("change_password")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RISK MANAGEMENT TAB */}
          {activeTab === "risk" && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 sm:p-8">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white">{t("risk_title")}</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {t("risk_desc")}<span className="text-green-400 font-medium">{activeAccount?.name || 'None'}</span>
                </p>
              </div>

              {activeAccount ? (
                <form onSubmit={handleSaveRisk} className="space-y-8">
                  <div className="space-y-6">
                    {/* Daily Loss Alert */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300">
                        {t("daily_loss")}
                      </label>
                      <p className="text-xs text-gray-500 mb-3">{t("daily_loss_desc")}</p>
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="50" max="100" step="5"
                          value={dailyLossAlertThreshold}
                          onChange={(e) => setDailyLossAlertThreshold(Number(e.target.value))}
                          className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-green-500"
                        />
                        <span className="text-white font-mono bg-white/10 px-3 py-1 rounded-lg w-16 text-center">{dailyLossAlertThreshold}%</span>
                      </div>
                    </div>

                    {/* Drawdown Alert */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300">
                        {t("drawdown")}
                      </label>
                      <p className="text-xs text-gray-500 mb-3">{t("drawdown_desc")}</p>
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="50" max="100" step="5"
                          value={drawdownAlertThreshold}
                          onChange={(e) => setDrawdownAlertThreshold(Number(e.target.value))}
                          className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-green-500"
                        />
                        <span className="text-white font-mono bg-white/10 px-3 py-1 rounded-lg w-16 text-center">{drawdownAlertThreshold}%</span>
                      </div>
                    </div>

                    {/* Tilt Guard / Hard Stop */}
                    <div className="pt-4 border-t border-gray-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-red-400 flex items-center gap-2">
                            <Lock className="w-4 h-4" /> {t("tilt_guard")}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 max-w-md">
                            {t("tilt_guard_desc")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEnableHardStop(!enableHardStop)}
                          className={cn(
                            "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900",
                            enableHardStop ? "bg-red-500" : "bg-gray-700"
                          )}
                        >
                          <span className={cn(
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            enableHardStop ? "translate-x-5" : "translate-x-0"
                          )} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={isSavingRisk}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      {isSavingRisk ? t("saving") : t("save_risk")}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="py-8 text-center border-2 border-dashed border-gray-800 rounded-xl">
                  <p className="text-gray-400 text-sm">{t("select_account")}</p>
                </div>
              )}
            </div>
          )}

          {/* PREFERENCES TAB */}
          {activeTab === "preferences" && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 sm:p-8 space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-white">{t("tags_title")}</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {t("tags_desc")}
                </p>
              </div>

              {prefsLoading ? (
                <div className="text-gray-400 text-sm animate-pulse">{t("loading")}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Psychology Tags */}
                  <div>
                    <h4 className="text-sm font-medium text-white mb-4">{t("psych_tags")}</h4>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {preferences?.psychologyTags.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400 text-sm border border-blue-500/20">
                          {tag}
                          <button onClick={() => handleRemovePsychTag(tag)} className="hover:text-blue-300">
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <form onSubmit={handleAddPsychTag} className="flex gap-2">
                      <input 
                        type="text" 
                        value={newPsychTag} 
                        onChange={e => setNewPsychTag(e.target.value)}
                        placeholder={t("add_emotion")}
                        className="flex-1 rounded-lg border-0 bg-white/5 py-1.5 px-3 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm"
                      />
                      <button type="submit" className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </form>
                  </div>

                  {/* Mistake Tags */}
                  <div>
                    <h4 className="text-sm font-medium text-white mb-4">{t("mistake_tags")}</h4>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {preferences?.mistakeTags.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-400 text-sm border border-red-500/20">
                          {tag}
                          <button onClick={() => handleRemoveMistakeTag(tag)} className="hover:text-red-300">
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <form onSubmit={handleAddMistakeTag} className="flex gap-2">
                      <input 
                        type="text" 
                        value={newMistakeTag} 
                        onChange={e => setNewMistakeTag(e.target.value)}
                        placeholder={t("add_mistake")}
                        className="flex-1 rounded-lg border-0 bg-white/5 py-1.5 px-3 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm"
                      />
                      <button type="submit" className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </form>
                  </div>

                  {/* Confluence Tags */}
                  <div className="md:col-span-2 border-t border-gray-800 pt-8 mt-4">
                    <h4 className="text-sm font-medium text-white mb-4">{t("confluence_tags")}</h4>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {preferences?.confluenceTags?.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-400 text-sm border border-purple-500/20">
                          {tag}
                          <button onClick={() => handleRemoveConfluenceTag(tag)} className="hover:text-purple-300">
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <form onSubmit={handleAddConfluenceTag} className="flex gap-2 max-w-sm">
                      <input 
                        type="text" 
                        value={newConfluenceTag} 
                        onChange={e => setNewConfluenceTag(e.target.value)}
                        placeholder={t("add_confluence")}
                        className="flex-1 rounded-lg border-0 bg-white/5 py-1.5 px-3 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-green-500 sm:text-sm"
                      />
                      <button type="submit" className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* APP PREFERENCES TAB */}
          {activeTab === "app" && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white">{t("app_title")}</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {t("app_desc")}
                </p>
              </div>

              {prefsLoading ? (
                <div className="text-gray-400 text-sm animate-pulse">{t("loading")}</div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between py-2 border-b border-gray-800">
                    <div>
                      <p className="text-sm font-medium text-white flex items-center gap-2">
                        <EyeOff className="w-4 h-4 text-gray-400" /> {t("privacy_mode")}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{t("privacy_mode_desc")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleTogglePrivacy}
                      className={cn(
                        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900",
                        preferences?.privacyMode ? "bg-green-500" : "bg-gray-700"
                      )}
                    >
                      <span className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        preferences?.privacyMode ? "translate-x-5" : "translate-x-0"
                      )} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
