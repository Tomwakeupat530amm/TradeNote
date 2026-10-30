"use client";

import { useState } from "react";
import { useAccountStore, Account } from "@/store/useAccountStore";
import { PlusCircle, Save, ShieldAlert, ShieldCheck, Lock, Sparkles, BookOpen, Cpu } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { calculateAccount1RRisk } from "@/lib/riskEngine";
import { PROP_FIRM_PRESETS, PropFirmPreset } from "@/lib/propPresets";
import { DEFAULT_DRAWDOWN_MODE, type DrawdownMode } from "@/lib/propRisk";
import { isValidTimeZone } from "@/lib/tradingDay";
import { Link } from "@/i18n/routing";
import { useEstimatedRiskCounts } from "@/hooks/useEstimatedRiskCounts";
import { useGuestMode } from "@/lib/guest/useGuestMode";
import { toast } from "sonner";
import { HardStopError } from "@/lib/hardStop";
import clsx from "clsx";

type AccountStatus = "Challenge" | "Funded" | "Personal";

const RESET_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function AccountsPage() {
  const { accounts, addAccount, updateAccount, deleteAccount, activeAccountId, setActiveAccount } = useAccountStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const t = useTranslations("Accounts");
  const c = useTranslations("Common");
  const locale = useLocale();
  const tRisk = useTranslations("Risk");
  const tHardStop = useTranslations("HardStop");
  const tPresets = useTranslations("Presets");
  const tGuest = useTranslations("Guest");
  const isGuest = useGuestMode();
  const estimatedCounts = useEstimatedRiskCounts(accounts.map((a) => a.id));
  const totalEstimated = Object.values(estimatedCounts).reduce((sum, n) => sum + n, 0);

  // Form State
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [initialBalance, setInitialBalance] = useState("50000");
  const [status, setStatus] = useState<AccountStatus>("Challenge");
  
  // Rule State
  const [profitTarget, setProfitTarget] = useState("1500");
  const [maxPositions, setMaxPositions] = useState("20");
  const [consistencyPercent, setConsistencyPercent] = useState("50");
  const [trailingMaxDrawdown, setTrailingMaxDrawdown] = useState("1000");
  const [drawdownMode, setDrawdownMode] = useState<DrawdownMode>(DEFAULT_DRAWDOWN_MODE);
  // Per-account trading-day reset override (P3 D7); blank = the user's timezone at 00:00.
  const [resetTime, setResetTime] = useState("");
  const [resetTz, setResetTz] = useState("");
  const [maxDailyLoss, setMaxDailyLoss] = useState("500");
  const [maxDailyLossType, setMaxDailyLossType] = useState<"%" | "$">("$");
  const [defaultRiskType, setDefaultRiskType] = useState<"%" | "$">("%");
  const [defaultRiskValue, setDefaultRiskValue] = useState("5");
  const [riskBase, setRiskBase] = useState<"drawdown" | "balance">("drawdown");
  const [enableHardStop, setEnableHardStop] = useState(false);
  const [dailyLossAlertThreshold, setDailyLossAlertThreshold] = useState("80");

  const handleAddNew = () => {
    setName("");
    setPlatform("");
    setInitialBalance("50000");
    setStatus("Challenge");
    setProfitTarget("1500");
    setMaxPositions("20");
    setConsistencyPercent("50");
    setTrailingMaxDrawdown("1000");
    setDrawdownMode(DEFAULT_DRAWDOWN_MODE);
    setResetTime("");
    setResetTz("");
    setMaxDailyLoss("500");
    setMaxDailyLossType("$");
    setDefaultRiskType("%");
    setDefaultRiskValue("5");
    setRiskBase("drawdown");
    setEnableHardStop(false);
    setDailyLossAlertThreshold("80");
    setEditingAccountId(null);
    setIsAdding(true);
  };

  const handleApplyPreset = (preset: PropFirmPreset) => {
    setName(preset.label);
    setPlatform(preset.firmName);
    setInitialBalance(preset.accountSize.toString());
    setStatus("Challenge");
    setTrailingMaxDrawdown(preset.rules.trailingMaxDrawdown.toString());
    setDrawdownMode(preset.rules.drawdownMode || DEFAULT_DRAWDOWN_MODE);
    setProfitTarget(preset.rules.profitTarget?.toString() || "");
    setMaxPositions(preset.rules.maxPositions?.toString() || "10");
    setConsistencyPercent(preset.rules.consistencyPercent?.toString() || "");
    setMaxDailyLoss(preset.rules.maxDailyLoss?.toString() || "");
    setMaxDailyLossType(preset.rules.maxDailyLossType || "$");
    setDefaultRiskType(preset.rules.defaultRiskType || "$");
    setDefaultRiskValue(preset.rules.defaultRiskValue?.toString() || "150");
    setRiskBase(preset.rules.riskBase || "drawdown");
    setEnableHardStop(preset.rules.enableHardStop ?? false);
    setDailyLossAlertThreshold(preset.rules.dailyLossAlertThreshold?.toString() || "80");
    toast.success(t('preset_applied_toast', { preset: preset.label }));
  };

  const handleEdit = (account: Account) => {
    setName(account.name);
    const [plat, stat] = account.type.split(" - ");
    setPlatform(plat || "");
    setStatus((stat as AccountStatus) || "Challenge");
    setInitialBalance(account.initialBalance.toString());
    
    const rules = account.rules || ({} as Account["rules"]);
    setProfitTarget(rules.profitTarget?.toString() || "");
    setMaxPositions(rules.maxPositions?.toString() || "");
    setConsistencyPercent(rules.consistencyPercent?.toString() || "");
    setTrailingMaxDrawdown(rules.trailingMaxDrawdown?.toString() || "");
    setDrawdownMode(rules.drawdownMode || DEFAULT_DRAWDOWN_MODE);
    setResetTime(rules.resetTime ?? "");
    setResetTz(rules.resetTz ?? "");
    setMaxDailyLoss(rules.maxDailyLoss?.toString() || "");
    setMaxDailyLossType(rules.maxDailyLossType || "$");
    setDefaultRiskType(rules.defaultRiskType || "%");
    setDefaultRiskValue((rules.defaultRiskValue ?? 5).toString());
    setRiskBase(rules.riskBase || "drawdown");
    setEnableHardStop(rules.enableHardStop ?? false);
    setDailyLossAlertThreshold((rules.dailyLossAlertThreshold ?? 80).toString());
    
    setEditingAccountId(account.id);
    setIsAdding(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedResetTime = resetTime.trim();
    const trimmedResetTz = resetTz.trim();
    if (trimmedResetTime !== "" && !RESET_TIME_PATTERN.test(trimmedResetTime)) {
      toast.error(t('resetOverride.invalidTime'));
      return;
    }
    if (trimmedResetTz !== "" && !isValidTimeZone(trimmedResetTz)) {
      toast.error(t('resetOverride.invalidTz'));
      return;
    }
    const accountData = {
      name,
      type: `${platform} - ${status}`,
      initialBalance: Number(initialBalance),
      rules: {
        profitTarget: Number(profitTarget),
        maxPositions: Number(maxPositions),
        consistencyPercent: Number(consistencyPercent),
        trailingMaxDrawdown: Number(trailingMaxDrawdown),
        drawdownMode,
        resetTime: trimmedResetTime !== "" ? trimmedResetTime : undefined,
        resetTz: trimmedResetTz !== "" ? trimmedResetTz : undefined,
        maxDailyLoss: maxDailyLoss ? Number(maxDailyLoss) : undefined,
        maxDailyLossType,
        defaultRiskType,
        defaultRiskValue: defaultRiskValue ? Number(defaultRiskValue) : 5,
        riskBase,
        enableHardStop,
        dailyLossAlertThreshold: Number(dailyLossAlertThreshold) || 80,
      },
    };

    if (editingAccountId) {
      try {
        await updateAccount(editingAccountId, accountData);
      } catch (err) {
        // D6: loosening Hard Stop on a locked day is refused; keep the form open with the reason.
        if (err instanceof HardStopError && err.code === "HARD_STOP_CONFIG_LOCKED") {
          toast.error(tHardStop("configLocked"));
        } else {
          console.error(err);
          toast.error(c("failed_save"));
        }
        return;
      }
    } else {
      addAccount(accountData);
    }
    setIsAdding(false);
    setEditingAccountId(null);
  };

  return (
    <div className="space-y-6">
      {/* System Subtabs: Accounts, Playbook, Simulator */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-4">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold">
          <ShieldCheck className="w-3.5 h-3.5" />
          {t('header_title')}
        </div>
        <Link
          href="/playbook"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 text-xs font-medium transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" />
          {t('link_playbook')}
        </Link>
        <Link
          href="/simulator"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 text-xs font-medium transition-colors"
        >
          <Cpu className="w-3.5 h-3.5" />
          {t('link_simulator')}
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-white sm:truncate sm:text-3xl sm:tracking-tight">
            {t('accounts')}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {t('manage_prop_firm')}
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={handleAddNew}
            className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
          >
            <PlusCircle className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            {t('new_account')}
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSave} className="bg-gray-900 shadow-sm ring-1 ring-gray-800 sm:rounded-xl p-6">
          <h3 className="text-lg font-medium leading-6 text-white mb-4">{editingAccountId ? t('edit_account') : t('add_new_account')}</h3>

          {/* 1-Click Prop Firm Presets */}
          {!editingAccountId && (
            <div className="mb-6 p-4 rounded-xl bg-gray-950/70 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  {t('presets_title')}
                </span>
                <span className="text-[11px] text-gray-400">{t('presets_desc')}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PROP_FIRM_PRESETS.map((preset) => (
                  <div key={preset.id} className="flex flex-col gap-1" data-testid={`preset-${preset.id}`}>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:scale-[1.02] active:scale-[0.98]",
                        preset.badgeColor
                      )}
                    >
                      {preset.id === 'personal-standard' ? t('preset_personal') : preset.label}
                    </button>
                    <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-gray-500">
                      {preset.source && (
                        <a
                          href={preset.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-gray-300"
                        >
                          {tPresets('source')}
                        </a>
                      )}
                      <span>{tPresets('recordedOn', { date: preset.effectiveDate })}</span>
                      {!preset.verified && (
                        <span className="text-amber-400/80">{tPresets('unverified')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="block text-sm font-medium leading-6 text-white">{t('account_name_label')}</label>
              <div className="mt-2">
                <input type="text" name="name" id="name" required value={name} onChange={e => setName(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
              </div>
            </div>
            
            <div className="sm:col-span-2">
              <label htmlFor="platform" className="block text-sm font-medium leading-6 text-white">{t('platform_label')}</label>
              <div className="mt-2">
                <input type="text" name="platform" id="platform" required value={platform} onChange={e => setPlatform(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="balance" className="block text-sm font-medium leading-6 text-white">{t('initial_balance_label')}</label>
              <div className="mt-2">
                <input type="number" name="balance" id="balance" required value={initialBalance} onChange={e => setInitialBalance(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
              </div>
            </div>
            
            <div className="sm:col-span-2">
              <label htmlFor="status" className="block text-sm font-medium leading-6 text-white">{t('status')}</label>
              <div className="mt-2">
                <select id="status" name="status" value={status} onChange={e => setStatus(e.target.value as AccountStatus)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3">
                  <option className="bg-gray-800" value="Challenge">{t('challenge')}</option>
                  <option className="bg-gray-800" value="Funded">{t('funded')}</option>
                  <option className="bg-gray-800" value="Personal">{t('personal')}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-gray-800 pt-8">
            <h3 className="text-lg font-medium leading-6 text-white mb-4">{t('rules_limits')}</h3>
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              
              <div className="sm:col-span-2">
                <label htmlFor="profitTarget" className="block text-sm font-medium leading-6 text-white">{t('profit_target_label')}</label>
                <div className="mt-2">
                  <input type="number" name="profitTarget" id="profitTarget" required value={profitTarget} onChange={e => setProfitTarget(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="maxPositions" className="block text-sm font-medium leading-6 text-white">{t('max_positions_label')}</label>
                <div className="mt-2">
                  <input type="number" name="maxPositions" id="maxPositions" required value={maxPositions} onChange={e => setMaxPositions(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="consistency" className="block text-sm font-medium leading-6 text-white">{t('consistency_rule_label')}</label>
                <div className="mt-2">
                  <input type="number" name="consistency" id="consistency" required value={consistencyPercent} onChange={e => setConsistencyPercent(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="trailingMaxDrawdown" className="block text-sm font-medium leading-6 text-white">{t('trailing_max_drawdown_label')}</label>
                <div className="mt-2">
                  <input type="number" name="trailingMaxDrawdown" id="trailingMaxDrawdown" required value={trailingMaxDrawdown} onChange={e => setTrailingMaxDrawdown(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="drawdownMode" className="block text-sm font-medium leading-6 text-white">{t('drawdown_mode_label')}</label>
                <div className="mt-2">
                  <select id="drawdownMode" name="drawdownMode" value={drawdownMode} onChange={e => setDrawdownMode(e.target.value as DrawdownMode)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3">
                    <option className="bg-gray-800" value="End of Day">{t('end_of_day')}</option>
                    <option className="bg-gray-800" value="Intraday">{t('intraday')}</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="resetTime" className="block text-sm font-medium leading-6 text-white">{t('resetOverride.timeLabel')}</label>
                <div className="mt-2">
                  <input type="time" id="resetTime" name="resetTime" value={resetTime} onChange={e => setResetTime(e.target.value)} className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="resetTz" className="block text-sm font-medium leading-6 text-white">{t('resetOverride.tzLabel')}</label>
                <div className="mt-2">
                  <input type="text" id="resetTz" name="resetTz" value={resetTz} onChange={e => setResetTz(e.target.value)} placeholder="America/New_York" className="block w-full rounded-md border-0 bg-white/5 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6 px-3" />
                </div>
                <p className="mt-1 text-xs text-gray-500">{t('resetOverride.hint')}</p>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="maxDailyLoss" className="block text-sm font-medium leading-6 text-white">{t('max_daily_loss_label')}</label>
                <div className="mt-2 flex rounded-md shadow-sm">
                  <select
                    value={maxDailyLossType}
                    onChange={(e) => setMaxDailyLossType(e.target.value as "%" | "$")}
                    className="inline-flex items-center rounded-l-md border-0 bg-white/5 py-1.5 pl-3 pr-8 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6"
                  >
                    <option className="bg-gray-800" value="$">{t('amount_usd')}</option>
                    <option className="bg-gray-800" value="%">{t('percent')}</option>
                  </select>
                  <input
                    type="number"
                    name="maxDailyLoss"
                    id="maxDailyLoss"
                    value={maxDailyLoss}
                    onChange={(e) => setMaxDailyLoss(e.target.value)}
                    className="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-0 bg-white/5 py-1.5 px-3 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-green-500 sm:text-sm sm:leading-6"
                    placeholder="e.g. 500"
                  />
                </div>
              </div>

              {/* Enhanced 1R Risk Base & Bullets Engine */}
              <div className="sm:col-span-6 bg-gray-950/60 p-4 rounded-xl border border-white/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="defaultRiskValue" className="block text-sm font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    {t('risk_1r_target')}
                  </label>
                  <span className="text-[11px] text-gray-400">
                    {t('risk_1r_desc')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-400 mb-1">{t('risk_base_label')}</label>
                    <select
                      value={defaultRiskType === "$" ? "fixed" : riskBase}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "fixed") {
                          setDefaultRiskType("$");
                          setDefaultRiskValue("100");
                        } else if (val === "drawdown") {
                          setDefaultRiskType("%");
                          setRiskBase("drawdown");
                          setDefaultRiskValue("5"); // 5% Drawdown
                        } else {
                          setDefaultRiskType("%");
                          setRiskBase("balance");
                          setDefaultRiskValue("1"); // 1% Balance
                        }
                      }}
                      className="block w-full rounded-lg border-0 bg-white/5 py-2 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-emerald-500 sm:text-sm px-3"
                    >
                      <option className="bg-gray-900 text-white" value="drawdown">{t('risk_base_dd')}</option>
                      <option className="bg-gray-900 text-white" value="balance">{t('risk_base_balance')}</option>
                      <option className="bg-gray-900 text-white" value="fixed">{t('risk_base_fixed')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      {defaultRiskType === "$" ? t('risk_value_amount') : t('risk_value_ratio')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      name="defaultRiskValue"
                      id="defaultRiskValue"
                      value={defaultRiskValue}
                      onChange={(e) => setDefaultRiskValue(e.target.value)}
                      className="block w-full rounded-lg border-0 bg-white/5 py-2 px-3 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-emerald-500 sm:text-sm font-bold font-mono"
                      placeholder={defaultRiskType === "$" ? "e.g. 100" : "e.g. 5"}
                    />
                  </div>
                </div>

                {/* Live Preview Card */}
                {(() => {
                  const previewDetails = calculateAccount1RRisk({
                    id: "preview",
                    name: name || t('label_default_account'),
                    type: `${platform || "Prop"} - ${status}`,
                    initialBalance: Number(initialBalance) || 50000,
                    rules: {
                      trailingMaxDrawdown: Number(trailingMaxDrawdown) || 2000,
                      defaultRiskType,
                      defaultRiskValue: Number(defaultRiskValue) || 1,
                      riskBase,
                    }
                  }, locale);

                  return (
                    <div className={clsx(
                      "mt-2 p-3 rounded-xl border backdrop-blur-md transition-all",
                      previewDetails.safetyLevel === 'safe' ? "bg-emerald-500/5 border-emerald-500/20" :
                      previewDetails.safetyLevel === 'moderate' ? "bg-amber-500/5 border-amber-500/20" :
                      "bg-rose-500/10 border-rose-500/30"
                    )}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{t('preview_actual_1r')}</span>
                          <span className="text-lg font-bold font-mono text-emerald-400">
                            ${previewDetails.riskDollar.toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-400">{t('per_trade')}</span>
                        </div>
                        <span className={clsx(
                          "text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1",
                          previewDetails.safetyLevel === 'safe' ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" :
                          previewDetails.safetyLevel === 'moderate' ? "bg-amber-500/20 border-amber-500/40 text-amber-300" :
                          "bg-rose-500/20 border-rose-500/40 text-rose-300 animate-pulse"
                        )}>
                          🛡️ {previewDetails.bullets} Bullets ({previewDetails.safetyLevel === 'safe' ? t('safety_safe') : previewDetails.safetyLevel === 'moderate' ? t('safety_moderate') : t('safety_danger')})
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {t('bullets_explanation', { riskBaseLabel: previewDetails.riskBaseLabel, bullets: previewDetails.bullets, maxDD: `$${(Number(trailingMaxDrawdown) || 2000).toLocaleString()}` })}
                      </p>
                      {previewDetails.safetyLevel === 'danger' && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400 font-semibold bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                          <span>{t('danger_bullets_warning', { bullets: previewDetails.bullets })}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Hard Stop & Alert Thresholds */}
              <div className="sm:col-span-6 rounded-2xl bg-gray-950/60 p-4 border border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-semibold text-white flex items-center gap-2">
                      <Lock className="w-4 h-4 text-amber-400" />
                      {t('hard_stop_title')}
                    </label>
                    <p className="text-xs text-gray-400">
                      {t('hard_stop_desc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableHardStop(!enableHardStop)}
                    className={clsx(
                      "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      enableHardStop ? "bg-red-500" : "bg-gray-700"
                    )}
                  >
                    <span
                      className={clsx(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        enableHardStop ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                <div className="pt-2 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      {t('alert_threshold_label')}
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="100"
                      value={dailyLossAlertThreshold}
                      onChange={(e) => setDailyLossAlertThreshold(e.target.value)}
                      placeholder="80"
                      className="block w-full rounded-lg border-0 bg-white/5 py-1.5 text-white ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm px-3"
                    />
                    <span className="text-[10px] text-gray-500 mt-0.5 block">
                      {t('alert_threshold_hint', { threshold: dailyLossAlertThreshold })}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-x-6">
            <button type="button" onClick={() => { setIsAdding(false); setEditingAccountId(null); }} className="text-sm font-semibold leading-6 text-white">
              {c('cancel')}
            </button>
            <button type="submit" className="inline-flex justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600">
              <Save className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
              {t('save_account')}
            </button>
          </div>
        </form>
      )}

      {totalEstimated > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-200">{tRisk("estimatedBannerTitle")}</p>
            <p className="text-xs text-amber-200/80">{tRisk("estimatedBannerBody", { count: totalEstimated })}</p>
          </div>
          <Link
            href={{ pathname: "/journal", query: { estimatedRisk: "1" } }}
            className="shrink-0 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/30"
          >
            {tRisk("viewEstimated")}
          </Link>
        </div>
      )}

      {/* Account List */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <div key={account.id} className={`bg-gray-900 rounded-xl border p-6 flex flex-col ${activeAccountId === account.id ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-800'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-lg font-medium text-white truncate">{account.name}</h3>
                {(estimatedCounts[account.id] ?? 0) > 0 && (
                  <span
                    title={tRisk("estimatedHint")}
                    className="shrink-0 inline-flex items-center rounded-md bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
                  >
                    {tRisk("estimatedCount", { count: estimatedCounts[account.id] })}
                  </span>
                )}
              </div>
              <span className={clsx(
                "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
                account.type.includes('Personal')
                  ? 'bg-purple-500/10 text-purple-400 ring-purple-500/20'
                  : account.type.includes('Challenge')
                  ? 'bg-blue-500/10 text-blue-400 ring-blue-500/20'
                  : 'bg-green-500/10 text-green-400 ring-green-500/20'
              )}>
                {account.type}
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 flex-1">
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-400">{t('balance')}</dt>
                <dd className="mt-1 text-sm text-white">${account.initialBalance.toLocaleString()}</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-400">{t('drawdown')}</dt>
                <dd className="mt-1 text-sm text-white">${account.rules.trailingMaxDrawdown.toLocaleString()} ({account.rules.drawdownMode === 'End of Day' ? t('end_of_day') : t('intraday')})</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-400">{t('consistency')}</dt>
                <dd className="mt-1 text-sm text-white">{account.rules.consistencyPercent}%</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-400">{t('card_1r_bullets')}</dt>
                <dd className="mt-1 flex flex-wrap items-center justify-between gap-1 text-sm">
                  {(() => {
                    const rInfo = calculateAccount1RRisk(account, locale);
                    return (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-400 font-bold font-mono text-base">
                            ${rInfo.riskDollar.toLocaleString()}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            ({rInfo.riskBase === 'drawdown' ? `${account.rules.defaultRiskValue ?? 5}% DD` : rInfo.riskBase === 'balance' ? `${account.rules.defaultRiskValue ?? 1}% Balance` : t('risk_fixed_short')})
                          </span>
                        </div>
                        <span className={clsx(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                          rInfo.safetyLevel === 'safe' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" :
                          rInfo.safetyLevel === 'moderate' ? "bg-amber-500/10 border-amber-500/30 text-amber-300" :
                          "bg-rose-500/10 border-rose-500/30 text-rose-300"
                        )}>
                          🛡️ {rInfo.bullets} Bullets
                        </span>
                      </>
                    );
                  })()}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-400">{t('platform_label')}</dt>
                <dd className="mt-1 flex items-center justify-between text-sm text-white">
                  <span>{account.type.split(' - ')[0]}</span>
                  {account.rules.enableHardStop && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-xs font-semibold text-rose-300">
                      <Lock className="w-3 h-3" /> {t('hard_stop_active')}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex gap-3">
              <button 
                onClick={() => setActiveAccount(account.id)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold shadow-sm ${activeAccountId === account.id ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                {activeAccountId === account.id ? t('active') : t('set_active')}
              </button>
              <button 
                onClick={() => handleEdit(account)}
                className="rounded-md bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-500/20"
              >
                {t('edit')}
              </button>
              <button 
                onClick={() => {
                  // Guest demo: confirm that only sample data is removed (D4).
                  if (isGuest && !window.confirm(tGuest("delete_account_confirm"))) return;
                  deleteAccount(account.id);
                }}
                className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/20"
              >
                {c('delete')}
              </button>
            </div>
          </div>
        ))}
        {accounts.length === 0 && !isAdding && (
          <div className="col-span-full border-2 border-dashed border-gray-700 rounded-xl p-12 text-center">
            <h3 className="mt-2 text-sm font-semibold text-white">{t('no_accounts')}</h3>
            <p className="mt-1 text-sm text-gray-400">{t('get_started_new_account')}</p>
            <div className="mt-6">
              <button onClick={handleAddNew} type="button" className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600">
                <PlusCircle className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                {t('new_account')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
