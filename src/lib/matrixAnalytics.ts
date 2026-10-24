import type { Trade } from "@/store/useTradeStore";
import { isRatedForR, rMultiple } from "@/lib/risk";
import { avgR as statsAvgR, winRate as statsWinRate } from "@/lib/stats";
import { TradingSession, SESSIONS } from "./sessionUtils";

export type MatrixMetricType = "winRate" | "netPnl" | "totalR" | "count";

export interface MatrixCellData {
  count: number;
  wins: number;
  losses: number;
  breakEvens: number;
  winRate: number; // 0 - 100
  netPnl: number;
  totalR: number;
  avgR: number;
  trades: Trade[];
}

export interface SetupSessionMatrixResult {
  setups: string[];
  sessions: TradingSession[];
  cells: Record<string, Record<TradingSession, MatrixCellData>>; // setup -> session -> cell
  setupTotals: Record<string, MatrixCellData>;
  sessionTotals: Record<TradingSession, MatrixCellData>;
  grandTotal: MatrixCellData;
}

export const HOUR_BLOCKS = [
  "00-02", "02-04", "04-06", "06-08",
  "08-10", "10-12", "12-14", "14-16",
  "16-18", "18-20", "20-22", "22-24"
] as const;

export type HourBlock = typeof HOUR_BLOCKS[number];

export const DAYS_OF_WEEK = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"
] as const;

export type DayOfWeek = typeof DAYS_OF_WEEK[number];

export interface DayHourMatrixResult {
  days: DayOfWeek[];
  hourBlocks: HourBlock[];
  cells: Record<DayOfWeek, Record<HourBlock, MatrixCellData>>;
  dayTotals: Record<DayOfWeek, MatrixCellData>;
  hourTotals: Record<HourBlock, MatrixCellData>;
  grandTotal: MatrixCellData;
}

export interface EmotionExpectancyItem extends MatrixCellData {
  emotion: string;
  /** Mean R over RATED trades of this emotion; null when no trade is rated (F-5: no fabricated 1R). */
  expectancyR: number | null;
  expectancyDollar: number;
  /** Rated-only averages; null when that side has no rated trade. */
  avgWinR: number | null;
  avgLossR: number | null;
}

export interface EmotionExpectancyMatrixResult {
  items: EmotionExpectancyItem[];
  calmVsEmotional: {
    calmAvgR: number;
    calmWinRate: number;
    emotionalAvgR: number;
    emotionalWinRate: number;
    edgeDeltaR: number; // calmAvgR - emotionalAvgR
  };
  grandTotal: MatrixCellData;
}

function createEmptyCell(): MatrixCellData {
  return {
    count: 0,
    wins: 0,
    losses: 0,
    breakEvens: 0,
    winRate: 0,
    netPnl: 0,
    totalR: 0,
    avgR: 0,
    trades: []
  };
}

function aggregateCell(trades: Trade[]): MatrixCellData {
  const count = trades.length;
  if (count === 0) return createEmptyCell();

  let wins = 0;
  let losses = 0;
  let breakEvens = 0;
  let netPnl = 0;
  let totalR = 0;

  for (const t of trades) {
    netPnl += t.pnl;
    // P3: unrated trades (no risk) are excluded from R, never counted as 0R.
    const r = isRatedForR(t) ? rMultiple(t.pnl, t.riskAmount) : null;
    if (r != null) totalR += r;

    if (t.pnl > 0) wins++;
    else if (t.pnl < 0) losses++;
    else breakEvens++;
  }

  const winRate = Math.round(statsWinRate(trades));
  const avgRValue = statsAvgR(trades);
  const avgR = avgRValue != null ? Number(avgRValue.toFixed(2)) : 0;

  return {
    count,
    wins,
    losses,
    breakEvens,
    winRate,
    netPnl: Math.round(netPnl * 100) / 100,
    totalR: Number(totalR.toFixed(2)),
    avgR,
    trades
  };
}

/**
 * 1. Setup x Session Correlation Matrix
 */
export function calculateSetupSessionMatrix(trades: Trade[]): SetupSessionMatrixResult {
  // Extract unique setups, standardizing empty setups
  const rawSetups = Array.from(new Set(trades.map((t) => t.setup?.trim() || "Unspecified")));
  const setups = rawSetups.length > 0 ? rawSetups : ["Unspecified"];
  const sessions: TradingSession[] = [...SESSIONS];

  const cells: Record<string, Record<TradingSession, MatrixCellData>> = {};
  const setupGroups: Record<string, Trade[]> = {};
  const sessionGroups: Record<TradingSession, Trade[]> = {
    Asian: [],
    London: [],
    "London-NY Overlap": [],
    "New York": []
  };

  for (const s of setups) {
    cells[s] = {
      Asian: createEmptyCell(),
      London: createEmptyCell(),
      "London-NY Overlap": createEmptyCell(),
      "New York": createEmptyCell()
    };
    setupGroups[s] = [];
  }

  // Populate trade groupings
  for (const t of trades) {
    const sName = t.setup?.trim() || "Unspecified";
    const sess = (t.session as TradingSession) || "New York";

    if (!cells[sName]) {
      cells[sName] = {
        Asian: createEmptyCell(),
        London: createEmptyCell(),
        "London-NY Overlap": createEmptyCell(),
        "New York": createEmptyCell()
      };
      setupGroups[sName] = [];
    }

    if (cells[sName][sess]) {
      cells[sName][sess].trades.push(t);
    }
    setupGroups[sName].push(t);
    if (sessionGroups[sess]) {
      sessionGroups[sess].push(t);
    }
  }

  // Calculate aggregated cell metrics
  for (const s of Object.keys(cells)) {
    for (const sess of sessions) {
      cells[s][sess] = aggregateCell(cells[s][sess].trades);
    }
  }

  const setupTotals: Record<string, MatrixCellData> = {};
  for (const s of Object.keys(setupGroups)) {
    setupTotals[s] = aggregateCell(setupGroups[s]);
  }

  const sessionTotals: Record<TradingSession, MatrixCellData> = {
    Asian: aggregateCell(sessionGroups.Asian),
    London: aggregateCell(sessionGroups.London),
    "London-NY Overlap": aggregateCell(sessionGroups["London-NY Overlap"]),
    "New York": aggregateCell(sessionGroups["New York"])
  };

  const grandTotal = aggregateCell(trades);

  return {
    setups: Object.keys(cells),
    sessions,
    cells,
    setupTotals,
    sessionTotals,
    grandTotal
  };
}

/**
 * 2. Day of Week x Hourly Heatmap (UTC)
 */
export function calculateDayHourMatrix(trades: Trade[]): DayHourMatrixResult {
  const days: DayOfWeek[] = [...DAYS_OF_WEEK];
  const hourBlocks: HourBlock[] = [...HOUR_BLOCKS];

  const cells = {} as Record<DayOfWeek, Record<HourBlock, MatrixCellData>>;
  for (const d of days) {
    cells[d] = {} as Record<HourBlock, MatrixCellData>;
    for (const h of hourBlocks) {
      cells[d][h] = createEmptyCell();
    }
  }

  const dayGroups: Record<DayOfWeek, Trade[]> = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: []
  };

  const hourGroups = {} as Record<HourBlock, Trade[]>;
  for (const h of hourBlocks) {
    hourGroups[h] = [];
  }

  for (const t of trades) {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) continue;

    const dayIndex = d.getUTCDay(); // 0 is Sunday, 1 is Monday ... 5 is Friday
    let dayName: DayOfWeek | null = null;
    if (dayIndex === 1) dayName = "Monday";
    else if (dayIndex === 2) dayName = "Tuesday";
    else if (dayIndex === 3) dayName = "Wednesday";
    else if (dayIndex === 4) dayName = "Thursday";
    else if (dayIndex === 5) dayName = "Friday";

    if (!dayName) continue; // Skip weekend trades for standard weekday heatmap

    const utcHour = d.getUTCHours();
    const blockIndex = Math.min(11, Math.floor(utcHour / 2));
    const hourBlock = HOUR_BLOCKS[blockIndex];

    cells[dayName][hourBlock].trades.push(t);
    dayGroups[dayName].push(t);
    hourGroups[hourBlock].push(t);
  }

  // Aggregate cells
  for (const d of days) {
    for (const h of hourBlocks) {
      cells[d][h] = aggregateCell(cells[d][h].trades);
    }
  }

  const dayTotals = {} as Record<DayOfWeek, MatrixCellData>;
  for (const d of days) {
    dayTotals[d] = aggregateCell(dayGroups[d]);
  }

  const hourTotals = {} as Record<HourBlock, MatrixCellData>;
  for (const h of hourBlocks) {
    hourTotals[h] = aggregateCell(hourGroups[h]);
  }

  const grandTotal = aggregateCell(trades);

  return {
    days,
    hourBlocks,
    cells,
    dayTotals,
    hourTotals,
    grandTotal
  };
}

/**
 * 3. Emotion x Expectancy Matrix
 */
export function calculateEmotionExpectancyMatrix(trades: Trade[]): EmotionExpectancyMatrixResult {
  const DEFAULT_EMOTIONS = ["Calm", "Confident", "Hesitant", "FOMO", "Greedy", "Fearful", "Revenge"];
  const emotionMap: Record<string, Trade[]> = {};

  for (const emo of DEFAULT_EMOTIONS) {
    emotionMap[emo] = [];
  }

  for (const t of trades) {
    const emo = t.emotion?.trim() || "Calm";
    if (!emotionMap[emo]) {
      emotionMap[emo] = [];
    }
    emotionMap[emo].push(t);
  }

  const items: EmotionExpectancyItem[] = [];

  for (const [emotion, emoTrades] of Object.entries(emotionMap)) {
    if (emoTrades.length === 0) continue;
    const baseCell = aggregateCell(emoTrades);

    // Compute win/loss R averages
    const winTrades = emoTrades.filter((t) => t.pnl > 0);
    const lossTrades = emoTrades.filter((t) => t.pnl < 0);

    // P3/F-5: R figures use the RATED sample only (no 1R fallback, no mixing with all-trade probabilities).
    // Expectancy R = mean R over rated trades (== rated win% * avgWinR - rated loss% * avgLossR).
    const avgWinRValue = statsAvgR(winTrades);
    const avgLossRValue = statsAvgR(lossTrades);
    const expectancyRValue = statsAvgR(emoTrades);
    const avgWinR = avgWinRValue != null ? Number(avgWinRValue.toFixed(2)) : null;
    const avgLossR = avgLossRValue != null ? Number(Math.abs(avgLossRValue).toFixed(2)) : null;
    const expectancyR = expectancyRValue != null ? Number(expectancyRValue.toFixed(2)) : null;

    const winProb = baseCell.wins / baseCell.count;
    const lossProb = baseCell.losses / baseCell.count;

    const avgWinDollar = winTrades.length > 0 ? winTrades.reduce((s, t) => s + t.pnl, 0) / winTrades.length : 0;
    const avgLossDollar = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + t.pnl, 0) / lossTrades.length) : 0;
    const expectancyDollar = Number(((winProb * avgWinDollar) - (lossProb * avgLossDollar)).toFixed(2));

    items.push({
      ...baseCell,
      emotion,
      expectancyR,
      expectancyDollar,
      avgWinR,
      avgLossR
    });
  }

  // Sort items: High expectancy first
  // Unrated emotions (null expectancy) sort last.
  items.sort((a, b) => (b.expectancyR ?? -Infinity) - (a.expectancyR ?? -Infinity));

  // Calm vs Emotional Comparison
  const calmTrades = trades.filter((t) => (t.emotion || "").toLowerCase() === "calm");
  const emotionalTrades = trades.filter((t) => ["fomo", "revenge", "greedy", "fearful"].includes((t.emotion || "").toLowerCase()));

  const calmStats = aggregateCell(calmTrades);
  const emotionalStats = aggregateCell(emotionalTrades);

  return {
    items,
    calmVsEmotional: {
      calmAvgR: calmStats.avgR,
      calmWinRate: calmStats.winRate,
      emotionalAvgR: emotionalStats.avgR,
      emotionalWinRate: emotionalStats.winRate,
      edgeDeltaR: Number((calmStats.avgR - emotionalStats.avgR).toFixed(2))
    },
    grandTotal: aggregateCell(trades)
  };
}
