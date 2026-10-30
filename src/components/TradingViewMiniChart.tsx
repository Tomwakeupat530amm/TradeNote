"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, ExternalLink } from "lucide-react";

interface TradingViewMiniChartProps {
  asset: string;
}

export function mapAssetToTradingViewSymbol(asset: string): string {
  const upper = asset.toUpperCase().trim();
  switch (upper) {
    case "MNQ":
      return "CME_MINI:MNQ1!";
    case "NQ":
      return "NASDAQ:NDX";
    case "MES":
      return "CME_MINI:MES1!";
    case "ES":
      return "CME_MINI:ES1!";
    case "XAUUSD":
      return "OANDA:XAUUSD";
    case "EURUSD":
      return "FX:EURUSD";
    case "BTCUSD":
      return "COINBASE:BTCUSD";
    case "US30":
    case "YM":
      return "CBOT:YM1!";
    default:
      return upper.includes("USD") ? `OANDA:${upper}` : `NASDAQ:${upper}`;
  }
}

export function TradingViewMiniChart({ asset }: TradingViewMiniChartProps) {
  const t = useTranslations("VisualRR");
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState(false);

  const symbol = mapAssetToTradingViewSymbol(asset);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    let isMounted = true;

    const resetTimer = setTimeout(() => {
      if (isMounted) setLoadError(false);
    }, 0);

    try {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        symbol: symbol,
        width: "100%",
        height: "240",
        locale: "en",
        dateRange: "1D",
        colorTheme: "dark",
        isTransparent: true,
        autosize: false,
        largeChartUrl: "",
        chartOnly: false,
        noTimeScale: false,
      });

      script.onerror = () => {
        if (isMounted) setLoadError(true);
      };

      container.appendChild(script);
    } catch {
      setTimeout(() => {
        if (isMounted) setLoadError(true);
      }, 0);
    }

    return () => {
      isMounted = false;
      clearTimeout(resetTimer);
    };
  }, [symbol]);

  return (
    <div className="relative w-full rounded-2xl bg-gray-950/80 border border-white/10 p-2 overflow-hidden min-h-[250px] flex flex-col justify-center">
      {loadError ? (
        <div className="text-center p-6 space-y-2">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="text-xs text-gray-400">{t("chart_unavailable")}</p>
          <a
            href={`https://www.tradingview.com/symbols/${symbol}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline pt-1"
          >
            <span>{t("tradingview_link", { symbol })}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ) : (
        <div ref={containerRef} className="tradingview-widget-container w-full" />
      )}
    </div>
  );
}
