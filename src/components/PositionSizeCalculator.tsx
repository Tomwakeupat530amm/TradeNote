"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calculator, Copy, Check, ShieldAlert, DollarSign, PlusCircle } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import { useAccountStore } from "@/store/useAccountStore";
import { 
  calculateFuturesPosition, 
  calculateGoldPosition, 
  calculateForexPosition,
  FuturesSymbol,
  FUTURES_POINT_VALUES 
} from "@/lib/positionCalculator";
import { calculateAccount1RRisk } from "@/lib/riskEngine";
import { toast } from "sonner";
import clsx from "clsx";

interface PositionSizeCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export type SupportedAsset = FuturesSymbol | 'GOLD' | 'FOREX';

export function PositionSizeCalculator({ isOpen, onClose }: PositionSizeCalculatorProps) {
  const t = useTranslations("Calculator");
  const locale = useLocale();
  const { accounts, activeAccountId } = useAccountStore();
  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];
  const router = useRouter();

  const assetConfigs: Record<SupportedAsset, { label: string; subLabel: string; type: 'futures' | 'commodity' | 'forex'; pointLabel: string; defaultSL: string }> = useMemo(() => ({
    MNQ: { label: "MNQ", subLabel: "Micro Nasdaq ($2/pt)", type: 'futures', pointLabel: "Points ($2/pt)", defaultSL: "15" },
    NQ: { label: "NQ", subLabel: "E-mini Nasdaq ($20/pt)", type: 'futures', pointLabel: "Points ($20/pt)", defaultSL: "15" },
    MES: { label: "MES", subLabel: "Micro S&P 500 ($5/pt)", type: 'futures', pointLabel: "Points ($5/pt)", defaultSL: "3.0" },
    ES: { label: "ES", subLabel: "E-mini S&P 500 ($50/pt)", type: 'futures', pointLabel: "Points ($50/pt)", defaultSL: "3.0" },
    GOLD: { label: t("asset_gold_label"), subLabel: t("asset_gold_sub"), type: 'commodity', pointLabel: t("asset_gold_point"), defaultSL: "5.0" },
    FOREX: { label: t("asset_forex_label"), subLabel: t("asset_forex_sub"), type: 'forex', pointLabel: t("asset_forex_point"), defaultSL: "20" },
  }), [t]);

  const account1R = useMemo(() => calculateAccount1RRisk(activeAccount, locale), [activeAccount, locale]);

  const effectiveRiskCapital = useMemo(() => {
    if (activeAccount?.rules?.riskBase === "balance") {
      return activeAccount.initialBalance;
    }
    return activeAccount?.rules?.trailingMaxDrawdown && activeAccount.rules.trailingMaxDrawdown > 0
      ? activeAccount.rules.trailingMaxDrawdown
      : (activeAccount ? activeAccount.initialBalance * 0.05 : 2000);
  }, [activeAccount]);

  const [activeAsset, setActiveAsset] = useState<SupportedAsset>('MNQ');
  const [customBalance, setCustomBalance] = useState<string | null>(null);
  const [customRiskType, setCustomRiskType] = useState<'percent' | 'fixed' | null>(null);
  const [customRiskValue, setCustomRiskValue] = useState<string | null>(null);
  const [prevAccountId, setPrevAccountId] = useState(activeAccountId);

  if (activeAccountId !== prevAccountId) {
    setPrevAccountId(activeAccountId);
    setCustomBalance(null);
    setCustomRiskType(null);
    setCustomRiskValue(null);
  }

  const balance = customBalance !== null 
    ? customBalance 
    : effectiveRiskCapital.toString();

  const riskType = customRiskType !== null
    ? customRiskType
    : (activeAccount?.rules?.defaultRiskType === "$" ? "fixed" : "percent");

  const riskValue = customRiskValue !== null
    ? customRiskValue
    : (activeAccount?.rules?.defaultRiskValue ?? (activeAccount?.rules?.defaultRiskType === "$" ? 100 : 5)).toString();

  // Stop Loss inputs
  const [stopLossPoints, setStopLossPoints] = useState<string>("15"); // MNQ / NQ / MES / ES points
  const [stopLossDistance, setStopLossDistance] = useState<string>("5.0"); // Gold $ distance
  const [stopLossPips, setStopLossPips] = useState<string>("20"); // Forex pips
  const [copied, setCopied] = useState(false);

  const numBalance = parseFloat(balance) || 100000;
  const numRiskValue = parseFloat(riskValue) || 0;

  // Futures Calculation
  const isFutures = activeAsset === 'MNQ' || activeAsset === 'NQ' || activeAsset === 'MES' || activeAsset === 'ES';
  const futuresResult = useMemo(() => {
    if (!isFutures) return null;
    const sl = parseFloat(stopLossPoints) || 0;
    return calculateFuturesPosition(activeAsset as FuturesSymbol, {
      balance: numBalance,
      riskType,
      riskValue: numRiskValue,
      stopLossPoints: sl
    }, locale);
  }, [isFutures, activeAsset, numBalance, riskType, numRiskValue, stopLossPoints, locale]);

  // Gold Calculation
  const goldResult = useMemo(() => {
    if (activeAsset !== 'GOLD') return null;
    const sl = parseFloat(stopLossDistance) || 0;
    return calculateGoldPosition({
      balance: numBalance,
      riskType,
      riskValue: numRiskValue,
      stopLossDistance: sl
    }, locale);
  }, [activeAsset, numBalance, riskType, numRiskValue, stopLossDistance, locale]);

  // Forex Calculation
  const forexResult = useMemo(() => {
    if (activeAsset !== 'FOREX') return null;
    const sl = parseFloat(stopLossPips) || 0;
    return calculateForexPosition({
      balance: numBalance,
      riskType,
      riskValue: numRiskValue,
      stopLossPips: sl,
      pipValuePerLot: 10
    }, locale);
  }, [activeAsset, numBalance, riskType, numRiskValue, stopLossPips, locale]);

  // Unified Result
  const currentResult = useMemo(() => {
    if (isFutures && futuresResult) {
      return {
        amount: futuresResult.contracts,
        unit: t("unit_contracts", { symbol: activeAsset }),
        dollarRisk: futuresResult.dollarRisk,
        actualRisk: futuresResult.actualRisk,
        recommendation: futuresResult.recommendation,
        canCopyOrLog: futuresResult.contracts > 0
      };
    } else if (activeAsset === 'GOLD' && goldResult) {
      return {
        amount: goldResult.lotSize.toFixed(2),
        unit: t("unit_gold_lots"),
        dollarRisk: goldResult.dollarRisk,
        actualRisk: goldResult.actualRisk,
        recommendation: goldResult.recommendation,
        canCopyOrLog: goldResult.lotSize >= 0.01
      };
    } else if (activeAsset === 'FOREX' && forexResult) {
      return {
        amount: forexResult.lotSize.toFixed(2),
        unit: t("unit_forex_lots"),
        dollarRisk: forexResult.dollarRisk,
        actualRisk: forexResult.actualRisk,
        recommendation: forexResult.recommendation,
        canCopyOrLog: forexResult.lotSize >= 0.01
      };
    }
    return {
      amount: "0",
      unit: "",
      dollarRisk: 0,
      actualRisk: 0,
      recommendation: "",
      canCopyOrLog: false
    };
  }, [isFutures, activeAsset, futuresResult, goldResult, forexResult, t]);

  const handleCopy = () => {
    const textToCopy = `${currentResult.amount}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success(t("copy_success", { amount: textToCopy, unit: currentResult.unit }));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogTrade = () => {
    let assetTicker = activeAsset;
    if (activeAsset === 'GOLD') assetTicker = 'XAUUSD' as SupportedAsset;
    if (activeAsset === 'FOREX') assetTicker = 'EURUSD' as SupportedAsset;

    const chosenLot = currentResult.amount.toString();
    const chosenRisk = currentResult.dollarRisk.toString();

    onClose();
    router.push(`/journal?newTrade=true&asset=${assetTicker}&lotSize=${chosenLot}&riskAmount=${chosenRisk}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          {/* Backdrop Click */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-gray-950/95 p-6 shadow-2xl shadow-indigo-500/10"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-400">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    {t("title")}
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      {t("tag_multi_asset")}
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      1R: ${account1R.riskDollar} ({account1R.bullets} Bullets)
                    </span>
                  </h2>
                  <p className="text-xs text-gray-400">{t("subtitle")}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Asset Selector Tabs */}
            <div className="mt-4">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                {t("select_asset")}
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 rounded-xl bg-gray-900/80 p-1 border border-white/5">
                {(Object.keys(assetConfigs) as SupportedAsset[]).map((sym) => {
                  const cfg = assetConfigs[sym];
                  const isSelected = activeAsset === sym;
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => {
                        setActiveAsset(sym);
                        if (sym === 'MES' || sym === 'ES') {
                          setStopLossPoints("3.0");
                        } else if (sym === 'MNQ' || sym === 'NQ') {
                          setStopLossPoints("15");
                        }
                      }}
                      className={clsx(
                        "flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-xs font-semibold transition-all duration-200",
                        isSelected
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-500/20 border border-indigo-400/30"
                          : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                      )}
                    >
                      <span>{cfg.label}</span>
                      <span className="text-[9px] opacity-70 font-mono scale-90">
                        {cfg.type === 'futures' ? `$${FUTURES_POINT_VALUES[sym as FuturesSymbol]}/pt` : sym === 'GOLD' ? '$100/L' : '$10/pip'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Input Form */}
            <div className="mt-4 space-y-3.5">
              {/* Account Balance */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-gray-300">{t("balance_label")}</label>
                  {activeAccount && (
                    <span className="text-[11px] text-gray-500">
                      {t("account_prefix")} <span className="text-gray-300 font-medium">{activeAccount.name}</span>
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <input
                    type="number"
                    value={balance}
                    onChange={(e) => setCustomBalance(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-gray-900/60 pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="100000"
                  />
                </div>
              </div>

              {/* Risk Type & Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-300 block mb-1">{t("risk_type_label")}</label>
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-900/60 p-1 border border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomRiskType('percent');
                        if (activeAccount?.rules?.defaultRiskType === '%' && activeAccount?.rules?.defaultRiskValue) {
                          setCustomRiskValue(activeAccount.rules.defaultRiskValue.toString());
                        } else {
                          setCustomRiskValue("1.0");
                        }
                      }}
                      className={clsx(
                        "py-1.5 text-xs font-semibold rounded-lg transition-all",
                        riskType === 'percent' ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200"
                      )}
                    >
                      {t("risk_type_percent")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomRiskType('fixed');
                        if (activeAccount?.rules?.defaultRiskType === '$' && activeAccount?.rules?.defaultRiskValue) {
                          setCustomRiskValue(activeAccount.rules.defaultRiskValue.toString());
                        } else {
                          setCustomRiskValue(isFutures ? "300" : "500");
                        }
                      }}
                      className={clsx(
                        "py-1.5 text-xs font-semibold rounded-lg transition-all",
                        riskType === 'fixed' ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200"
                      )}
                    >
                      {t("risk_type_fixed")}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium text-gray-300">
                      {riskType === 'percent' ? t("risk_target_percent") : t("risk_target_fixed")}
                    </label>
                    {activeAccount?.rules?.defaultRiskValue && (
                      <span className="text-[10px] text-indigo-400 font-medium">{t("standard_1r")}</span>
                    )}
                  </div>
                  <input
                    type="number"
                    step={riskType === 'percent' ? "0.1" : "10"}
                    value={riskValue}
                    onChange={(e) => setCustomRiskValue(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-gray-900/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder={riskType === 'percent' ? "1.0" : "500"}
                  />
                </div>
              </div>

              {/* Stop Loss Input (Dynamic per asset) */}
              {isFutures ? (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium text-gray-300">{t("sl_points")}</label>
                    <span className="text-[11px] text-blue-400 font-mono">
                      {t("pt_val_futures", { val: FUTURES_POINT_VALUES[activeAsset as FuturesSymbol] })}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.25"
                    value={stopLossPoints}
                    onChange={(e) => setStopLossPoints(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-gray-900/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="15.00"
                  />
                </div>
              ) : activeAsset === 'GOLD' ? (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium text-gray-300">{t("sl_gold")}</label>
                    <span className="text-[11px] text-amber-400 font-mono">{t("pt_val_gold")}</span>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    value={stopLossDistance}
                    onChange={(e) => setStopLossDistance(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-gray-900/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="5.00"
                  />
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium text-gray-300">{t("sl_pips")}</label>
                    <span className="text-[11px] text-emerald-400 font-mono">{t("pt_val_forex")}</span>
                  </div>
                  <input
                    type="number"
                    step="0.5"
                    value={stopLossPips}
                    onChange={(e) => setStopLossPips(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-gray-900/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="20.0"
                  />
                </div>
              )}
            </div>

            {/* Results Banner with Bullets Engine */}
            {(() => {
              const currentRiskDollar = currentResult.dollarRisk;
              const bulletsForThis = account1R.riskDollar > 0 ? (currentRiskDollar / account1R.riskDollar).toFixed(1) : "1.0";
              const totalBulletsAvailable = currentRiskDollar > 0 ? Math.floor(effectiveRiskCapital / currentRiskDollar) : 20;

              return (
                <div className="mt-4 rounded-2xl border border-white/10 bg-gradient-to-br from-gray-900 to-gray-950 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        {t("rec_size_title")}
                      </span>
                      <span className={clsx(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                        totalBulletsAvailable >= 15 ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" :
                        totalBulletsAvailable >= 8 ? "bg-amber-500/15 border-amber-500/30 text-amber-300" :
                        "bg-rose-500/15 border-rose-500/30 text-rose-300"
                      )}>
                        {t("bullets_avail", { count: totalBulletsAvailable })}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-gray-400">
                      {t("risk_summary", { risk: currentRiskDollar, bullets: bulletsForThis })}
                    </span>
                  </div>

                  {totalBulletsAvailable < 8 && (
                    <div className="mb-3 flex items-center gap-1.5 text-xs text-rose-400 font-semibold bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                      <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{t("danger_size", { count: totalBulletsAvailable })}</span>
                    </div>
                  )}

                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-400">
                        {currentResult.amount}
                      </span>
                      <span className="text-sm font-semibold text-gray-300">{currentResult.unit}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopy}
                      disabled={!currentResult.canCopyOrLog}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-semibold border border-blue-500/30 transition-all disabled:opacity-50"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? t("copied") : t("copy")}
                    </button>
                  </div>

                  {/* Extra Summary */}
                  <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <ShieldAlert className="h-3.5 w-3.5 text-indigo-400" />
                      {t("actual_risk")}
                    </span>
                    <span className="font-mono font-medium text-gray-200">
                      ${currentResult.actualRisk}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-semibold transition-colors border border-white/5 order-2 sm:order-1"
              >
                {t("close")}
              </button>
              <button
                type="button"
                onClick={handleLogTrade}
                disabled={!currentResult.canCopyOrLog}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-sm font-bold shadow-lg shadow-green-500/20 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 order-1 sm:order-2"
              >
                <PlusCircle className="h-4 w-4" />
                {t("apply_trade")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

