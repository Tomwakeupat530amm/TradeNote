"use client";

import { useState } from "react";
import { Trade } from "@/store/useTradeStore";
import { Copy, Check, Eye, EyeOff, X, Sparkles, Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { toast } from "sonner";
import { useTagTranslation } from "@/hooks/useTagTranslation";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { pathFromLegacyUrl } from "@/lib/screenshotStorage";

interface ShareCardData {
  asset: string;
  date: string;
  session?: string;
  lotSize: number;
  resultLabel: string;
  result: Trade["result"];
  rText: string | null;
  rPositive: boolean;
  pnlText: string | null;
  pnl: number;
  setupText: string;
  tags: string[];
  notes?: string;
}

const CARD_W = 1080;
const PAD = 64;

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, "")}…`;
  }
  return lines;
}

/**
 * Render the share card with the plain Canvas 2D API (no DOM-to-image dependency).
 * The chart image arrives as an ImageBitmap decoded from a fetched Blob, so the canvas is never tainted.
 */
async function renderShareCardPng(data: ShareCardData, chart: ImageBitmap | null): Promise<Blob> {
  const chartH = chart ? Math.round(Math.min((CARD_W - PAD * 2) * (chart.height / chart.width), 640)) : 0;
  const height = 560 + (data.notes ? 150 : 0) + (chart ? chartH + 40 : 0);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  const bg = ctx.createLinearGradient(0, 0, CARD_W, height);
  bg.addColorStop(0, "#030712");
  bg.addColorStop(0.6, "#111827");
  bg.addColorStop(1, "#1e1b4b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, height);

  ctx.textBaseline = "top";
  ctx.fillStyle = "#818cf8";
  ctx.font = "900 34px system-ui, sans-serif";
  ctx.fillText("TRADENOTE", PAD, PAD);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 26px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText(data.date, CARD_W - PAD, PAD + 4);
  ctx.textAlign = "left";

  ctx.strokeStyle = "rgba(55,65,81,0.6)";
  ctx.beginPath();
  ctx.moveTo(PAD, PAD + 60);
  ctx.lineTo(CARD_W - PAD, PAD + 60);
  ctx.stroke();

  let y = PAD + 100;
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 72px system-ui, sans-serif";
  ctx.fillText(data.asset, PAD, y);

  const resultColor = data.result === "Win" ? "#34d399" : data.result === "Loss" ? "#fb7185" : "#d1d5db";
  ctx.textAlign = "right";
  ctx.fillStyle = resultColor;
  ctx.font = "900 40px system-ui, sans-serif";
  ctx.fillText(data.resultLabel.toUpperCase(), CARD_W - PAD, y);
  if (data.rText) {
    ctx.fillStyle = data.rPositive ? "#34d399" : "#fb7185";
    ctx.font = "700 36px ui-monospace, monospace";
    ctx.fillText(data.rText, CARD_W - PAD, y + 52);
  }
  if (data.pnlText) {
    ctx.fillStyle = data.pnl > 0 ? "#34d399" : data.pnl < 0 ? "#fb7185" : "#9ca3af";
    ctx.font = "600 30px ui-monospace, monospace";
    ctx.fillText(data.pnlText, CARD_W - PAD, y + 98);
  }
  ctx.textAlign = "left";

  y += 92;
  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 28px system-ui, sans-serif";
  ctx.fillText(`${data.session ? `${data.session} Session · ` : ""}Lot: ${data.lotSize}`, PAD, y);

  y += 80;
  ctx.fillStyle = "#60a5fa";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText(data.setupText, PAD, y);
  if (data.tags.length > 0) {
    y += 48;
    ctx.fillStyle = "#a5b4fc";
    ctx.font = "500 26px system-ui, sans-serif";
    wrapLines(ctx, data.tags.join(" · "), CARD_W - PAD * 2, 2).forEach((l, i) => ctx.fillText(l, PAD, y + i * 36));
    y += 36;
  }

  if (data.notes) {
    y += 70;
    ctx.fillStyle = "#d1d5db";
    ctx.font = "italic 400 28px system-ui, sans-serif";
    wrapLines(ctx, `“${data.notes}”`, CARD_W - PAD * 2, 3).forEach((l, i) => ctx.fillText(l, PAD, y + i * 40));
    y += 120;
  }

  if (chart) {
    y += 60;
    const w = CARD_W - PAD * 2;
    const drawW = Math.min(w, Math.round(chartH * (chart.width / chart.height)));
    ctx.fillStyle = "#000000";
    ctx.fillRect(PAD, y, w, chartH);
    ctx.drawImage(chart, PAD + Math.round((w - drawW) / 2), y, drawW, chartH);
  }

  ctx.fillStyle = "#6b7280";
  ctx.font = "500 22px system-ui, sans-serif";
  ctx.fillText("Logged via #TradeNote", PAD, height - PAD + 10);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob returned null"))), "image/png");
  });
}

async function loadChartBitmap(signedUrl: string): Promise<ImageBitmap> {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

interface ShareTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  trade: Trade | null;
}

export function ShareTradeModal({ isOpen, onClose, trade }: ShareTradeModalProps) {
  const t = useTranslations("ShareModal");
  const tTag = useTagTranslation();
  const [hideDollarAmount, setHideDollarAmount] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [exporting, setExporting] = useState(false);
  const tShot = useTranslations("Screenshots");
  const screenshotPath = trade ? (trade.screenshotPath ?? pathFromLegacyUrl(trade.screenshotUrl)) : null;
  const signedShot = useSignedUrl(isOpen ? screenshotPath : null);

  if (!isOpen || !trade) return null;

  const isAplus = trade.checklistResults && 
    Object.keys(trade.checklistResults).length > 0 && 
    Object.values(trade.checklistResults).every(Boolean);

  const formattedR = trade.rMultiple !== undefined
    ? trade.rMultiple > 0 ? `+${trade.rMultiple.toFixed(2)}R` : `${trade.rMultiple.toFixed(2)}R`
    : null;

  const formattedPnl = trade.pnl > 0 ? `+$${trade.pnl.toLocaleString()}` : `-$${Math.abs(trade.pnl).toLocaleString()}`;

  const generateShareText = () => {
    const lines = [
      `📊 **Trade Note Execution: ${trade.asset}**`,
      `🎯 Result: ${trade.result.toUpperCase()} ${formattedR ? `(${formattedR})` : ""}${hideDollarAmount ? "" : ` | ${formattedPnl}`}`,
      `🕒 Session: ${trade.session || "N/A"} | Date: ${trade.date}`,
      `⚡ Setup: ${tTag(trade.setup)}${isAplus ? " ⭐ [A+ Setup]" : ""}`,
    ];

    if (trade.confluences && trade.confluences.length > 0) {
      lines.push(`🔍 Confluences: ${trade.confluences.map(c => tTag(c)).join(", ")}`);
    }

    if (trade.notes) {
      lines.push(`📝 Notes: "${trade.notes.slice(0, 140)}${trade.notes.length > 140 ? "..." : ""}"`);
    }

    lines.push(`\n🛡️ Logged via #TradeNote`);
    return lines.join("\n");
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generateShareText());
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      // Fallback if clipboard API is restricted
      const textarea = document.createElement("textarea");
      textarea.value = generateShareText();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    }
  };

  const handleDownloadPng = async () => {
    setExporting(true);
    let chart: ImageBitmap | null = null;
    try {
      if (screenshotPath) {
        try {
          if (!signedShot.url) throw new Error("Signed URL unavailable");
          chart = await loadChartBitmap(signedShot.url);
        } catch (imgErr) {
          console.warn("Share PNG: chart image skipped:", imgErr);
          toast.warning(tShot("shareImageSkipped"));
        }
      }
      const blob = await renderShareCardPng(
        {
          asset: trade.asset,
          date: trade.date,
          session: trade.session,
          lotSize: trade.lotSize,
          resultLabel: tTag(trade.result),
          result: trade.result,
          rText: formattedR,
          rPositive: Boolean(trade.rMultiple && trade.rMultiple > 0),
          pnlText: hideDollarAmount ? null : formattedPnl,
          pnl: trade.pnl,
          setupText: `Setup: ${tTag(trade.setup)}${isAplus ? " ⭐ A+" : ""}`,
          tags: (trade.confluences || []).map(c => tTag(c)),
          notes: trade.notes || undefined,
        },
        chart
      );
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `tradenote-${trade.asset}-${trade.id.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      toast.success(tShot("shareDownloaded"));
    } catch (err) {
      console.error("Share PNG export failed:", err);
      toast.error(tShot("shareExportFailed"));
    } finally {
      chart?.close();
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t("title")}</h3>
              <p className="text-xs text-gray-400">{t("subtitle")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Privacy Toggle Switch */}
          <div className="flex items-center justify-between bg-gray-950/40 border border-gray-800/80 px-4 py-3 rounded-xl">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              {hideDollarAmount ? <EyeOff className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4 text-emerald-400" />}
              <span>{t("anon_mode")}</span>
            </div>
            <button
              type="button"
              onClick={() => setHideDollarAmount(!hideDollarAmount)}
              className={clsx(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                hideDollarAmount ? "bg-indigo-600" : "bg-gray-700"
              )}
            >
              <span
                className={clsx(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  hideDollarAmount ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>

          {/* Card Preview Container */}
          <div
            id="trade-share-card"
            className="relative rounded-2xl p-5 border border-indigo-500/20 bg-gradient-to-br from-gray-950 via-gray-900 to-indigo-950/40 shadow-xl space-y-4 overflow-hidden"
          >
            {/* Ambient Background Glow */}
            <div className="absolute -top-16 -right-16 w-36 h-36 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

            {/* Card Brand Header */}
            <div className="flex items-center justify-between border-b border-gray-800/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-black text-sm tracking-wider bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  TRADENOTE
                </span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Verified Log
                </span>
              </div>
              <span className="text-xs text-gray-400 font-mono">{trade.date}</span>
            </div>

            {/* Symbol & Main Result */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-2xl font-black text-white tracking-tight">{trade.asset}</h4>
                <div className="flex items-center gap-2 mt-1">
                  {trade.session && (
                    <span className="text-xs text-gray-400 bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700/50">
                      {trade.session} Session
                    </span>
                  )}
                  <span className="text-xs text-gray-400">Lot: {trade.lotSize}</span>
                </div>
              </div>

              {/* Badges */}
              <div className="text-right flex flex-col items-end gap-1">
                <span
                  className={clsx(
                    "px-3 py-1 rounded-full text-xs font-black ring-1 uppercase tracking-wider",
                    trade.result === "Win"
                      ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
                      : trade.result === "Loss"
                      ? "bg-rose-500/15 text-rose-400 ring-rose-500/30"
                      : "bg-gray-500/15 text-gray-300 ring-gray-500/30"
                  )}
                >
                  {tTag(trade.result)}
                </span>
                {formattedR && (
                  <span
                    className={clsx(
                      "text-sm font-mono font-bold",
                      trade.rMultiple && trade.rMultiple > 0 ? "text-emerald-400" : "text-rose-400"
                    )}
                  >
                    {formattedR}
                  </span>
                )}
                {!hideDollarAmount && (
                  <span
                    className={clsx(
                      "text-xs font-mono font-semibold",
                      trade.pnl > 0 ? "text-emerald-400" : trade.pnl < 0 ? "text-rose-400" : "text-gray-400"
                    )}
                  >
                    {formattedPnl}
                  </span>
                )}
              </div>
            </div>

            {/* Setup & Tags */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <span className="inline-flex items-center rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-400">
                Setup: {tTag(trade.setup)}
              </span>
              {isAplus && (
                <span className="inline-flex items-center rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-xs font-bold text-emerald-300">
                  ⭐ A+ Setup
                </span>
              )}
              {trade.confluences?.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-400"
                >
                  {tTag(c)}
                </span>
              ))}
            </div>

            {/* Notes quote */}
            {trade.notes && (
              <div className="bg-gray-950/60 border border-gray-800/80 rounded-xl p-3 text-xs text-gray-300 italic line-clamp-3">
                &ldquo;{trade.notes}&rdquo;
              </div>
            )}

            {/* Screenshot preview if available */}
            {screenshotPath && (
              <div className="rounded-xl overflow-hidden border border-gray-800 aspect-video bg-black/60 max-h-48 flex items-center justify-center">
                {signedShot.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={signedShot.url}
                    alt="Trade setup screenshot"
                    className="w-full h-full object-contain"
                  />
                ) : signedShot.error ? (
                  <button type="button" onClick={signedShot.retry} className="text-xs text-rose-300 underline">
                    {tShot("loadError")} · {tShot("retry")}
                  </button>
                ) : (
                  <span className="text-xs text-gray-500 animate-pulse">{tShot("signing")}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-gray-950/60 border-t border-gray-800 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
          >
            {t("close")}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPng}
              disabled={exporting || Boolean(screenshotPath && signedShot.loading)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 transition-all active:scale-95 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{tShot("downloadPng")}</span>
            </button>
            <button
              onClick={handleCopyText}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
            >
              {copiedText ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>{t("copied")}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>{t("copy_summary")}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
