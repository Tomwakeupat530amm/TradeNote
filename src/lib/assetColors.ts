/**
 * Asset Visual Identity & Color Tokens
 * Provides subtle, distinctive color accents for different financial assets
 * without visual clutter.
 */

export interface AssetBadgeStyle {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

export function getAssetBadgeStyle(asset: string): AssetBadgeStyle {
  const a = (asset || "").toUpperCase().trim();

  // Nasdaq Tech Futures (MNQ, NQ, QQQ, NAS100)
  if (a.includes("NQ") || a.includes("MNQ") || a.includes("NAS") || a.includes("QQQ")) {
    return {
      bg: "bg-purple-500/10",
      text: "text-purple-300",
      border: "border-purple-500/25",
      dot: "bg-purple-400",
    };
  }

  // S&P 500 Broad Market Futures (MES, ES, SPX, SPY)
  if (a.includes("ES") || a.includes("MES") || a.includes("SPX") || a.includes("SPY")) {
    return {
      bg: "bg-blue-500/10",
      text: "text-blue-300",
      border: "border-blue-500/25",
      dot: "bg-blue-400",
    };
  }

  // Dow Jones Futures (MYM, YM, DIA)
  if (a.includes("YM") || a.includes("MYM") || a.includes("DOW") || a.includes("DIA")) {
    return {
      bg: "bg-sky-500/10",
      text: "text-sky-300",
      border: "border-sky-500/25",
      dot: "bg-sky-400",
    };
  }

  // Gold & Metals (XAUUSD, GOLD, GC, XAGUSD, SILVER)
  if (a.includes("XAU") || a.includes("GOLD") || a.includes("GC") || a.includes("SILVER") || a.includes("XAG")) {
    return {
      bg: "bg-amber-500/10",
      text: "text-amber-300",
      border: "border-amber-500/25",
      dot: "bg-amber-400",
    };
  }

  // Major Forex Currencies (EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD)
  if (
    a.includes("EUR") ||
    a.includes("GBP") ||
    a.includes("JPY") ||
    a.includes("AUD") ||
    a.includes("CAD") ||
    a.includes("CHF") ||
    a.includes("NZD")
  ) {
    return {
      bg: "bg-emerald-500/10",
      text: "text-emerald-300",
      border: "border-emerald-500/25",
      dot: "bg-emerald-400",
    };
  }

  // Cryptocurrencies (BTC, ETH, SOL)
  if (a.includes("BTC") || a.includes("ETH") || a.includes("SOL") || a.includes("CRYPTO")) {
    return {
      bg: "bg-cyan-500/10",
      text: "text-cyan-300",
      border: "border-cyan-500/25",
      dot: "bg-cyan-400",
    };
  }

  // Default Fallback
  return {
    bg: "bg-white/5",
    text: "text-gray-300",
    border: "border-white/10",
    dot: "bg-gray-400",
  };
}
