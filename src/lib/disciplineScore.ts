import type { Trade } from "@/store/useTradeStore";
import type { Account } from "@/store/useAccountStore";
import { isRatedForR, rMultiple } from "@/lib/risk";

/** R of a rated trade; null when the trade has no risk (P3: never a 0/1 fallback). */
function ratedR(t: Trade): number | null {
  return isRatedForR(t) ? rMultiple(t.pnl, t.riskAmount) : null;
}

export type DisciplineTier = "tier_master" | "tier_disciplined" | "tier_leak" | "tier_tilt";

export interface PillarBreakdown {
  /** 0 - 100; null = unrated (no measurable sample, excluded from the weighted score). */
  score: number | null;
  /** true when the pillar could not be measured (F-4: losses without any risk set). */
  unrated?: boolean;
  weight: number; // e.g. 0.40
  weightedScore: number;
  labelKey: string;
  notes: string;
}

export interface DailyDisciplineReport {
  score: number; // 0 - 100
  tier: DisciplineTier;
  isRestDay: boolean;
  totalTrades: number;
  wins: number;
  losses: number;
  netPnl: number;
  totalR: number;
  pillars: {
    playbook: PillarBreakdown;
    risk: PillarBreakdown;
    hardStop: PillarBreakdown;
    frequency: PillarBreakdown;
  };
  mvpTrade: Trade | null;
  costliestLeakTrade: Trade | null;
  directive: string;
}

export function calculateDailyDisciplineScore(
  trades: Trade[],
  account?: Account | null,
  targetDateStr?: string
): DailyDisciplineReport {
  const targetDate = targetDateStr || new Date().toDateString();

  // Filter trades for target calendar day
  const dayTrades = trades
    .filter((t) => {
      const d = new Date(t.date);
      return !isNaN(d.getTime()) && (d.toDateString() === targetDate || t.date.startsWith(targetDate));
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Rest Day (0 trades)
  if (dayTrades.length === 0) {
    return {
      score: 100,
      tier: "tier_master",
      isRestDay: true,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      netPnl: 0,
      totalR: 0,
      pillars: {
        playbook: { score: 100, weight: 0.40, weightedScore: 40, labelKey: "pillar_playbook", notes: "No trades taken" },
        risk: { score: 100, weight: 0.25, weightedScore: 25, labelKey: "pillar_risk", notes: "Zero capital risked" },
        hardStop: { score: 100, weight: 0.20, weightedScore: 20, labelKey: "pillar_stop", notes: "Hard stop fully intact" },
        frequency: { score: 100, weight: 0.15, weightedScore: 15, labelKey: "pillar_frequency", notes: "Patiently sat on hands" }
      },
      mvpTrade: null,
      costliestLeakTrade: null,
      directive: "Patience is a trading edge. Preserving capital on no-setup days is elite discipline."
    };
  }

  let netPnl = 0;
  let totalR = 0;
  let wins = 0;
  let losses = 0;

  for (const t of dayTrades) {
    netPnl += t.pnl;
    const r = ratedR(t);
    if (r != null) totalR += r;
    if (t.pnl > 0) wins++;
    else if (t.pnl < 0) losses++;
  }

  // 1. Playbook Compliance (40%)
  let playbookScoreSum = 0;
  for (const t of dayTrades) {
    if (t.checklistResults && Object.keys(t.checklistResults).length > 0) {
      const allChecked = Object.values(t.checklistResults).every(Boolean);
      playbookScoreSum += allChecked ? 100 : 70;
    } else if (t.setup && t.setup !== "Other" && t.setup !== "Unspecified") {
      playbookScoreSum += 75;
    } else {
      playbookScoreSum += 25; // Impulse trade without playbook setup
    }
  }
  const sPlaybook = Math.round(playbookScoreSum / dayTrades.length);

  // 2. Risk 1R Containment (25%)
  const lossTrades = dayTrades.filter((t) => t.pnl < 0);
  let sRisk: number | null = 100;
  if (lossTrades.length > 0) {
    // P3: only rated losses can be measured against 1R; unrated losses are excluded (no fallback R).
    let riskScoreSum = 0;
    let ratedLossCount = 0;
    for (const lt of lossTrades) {
      const rated = ratedR(lt);
      if (rated == null) continue;
      ratedLossCount++;
      const r = Math.abs(rated);

      if (r <= 1.05) {
        riskScoreSum += 100;
      } else {
        const excess = r - 1.0;
        riskScoreSum += Math.max(0, Math.round(100 - excess * 80));
      }
    }
    // F-4: losses exist but none carries a risk -> unrated (blank risk must not earn a perfect score).
    sRisk = ratedLossCount > 0 ? Math.round(riskScoreSum / ratedLossCount) : null;
  }

  // 3. Hard Stop Respect (20%)
  let sHardStop = 100;
  const dailyRule = account?.rules?.maxDailyLoss;
  if (dailyRule && dailyRule > 0) {
    const maxLimit = account.rules?.maxDailyLossType === "%"
      ? account.initialBalance * (dailyRule / 100)
      : dailyRule;
    const currentLoss = Math.max(0, -netPnl);

    if (currentLoss >= maxLimit) {
      sHardStop = 0; // Breached hard stop
    } else if (currentLoss >= maxLimit * 0.8) {
      sHardStop = 60; // Warned
    } else {
      sHardStop = 100;
    }
  }

  // 4. Frequency & Overtrading (15%)
  let sFrequency = 100;
  if (dayTrades.length <= 3) sFrequency = 100;
  else if (dayTrades.length === 4) sFrequency = 85;
  else if (dayTrades.length === 5) sFrequency = 65;
  else sFrequency = Math.max(20, 100 - (dayTrades.length - 3) * 15);

  // Impulse cluster check (< 3 min apart)
  for (let i = 1; i < dayTrades.length; i++) {
    const diffMs = new Date(dayTrades[i].date).getTime() - new Date(dayTrades[i - 1].date).getTime();
    if (diffMs > 0 && diffMs < 3 * 60 * 1000) {
      sFrequency = Math.max(10, sFrequency - 25);
      break;
    }
  }

  // Final Weighted Score
  // An unrated risk pillar is dropped and the remaining weights are renormalized to 100%.
  const otherWeighted = sPlaybook * 0.40 + sHardStop * 0.20 + sFrequency * 0.15;
  const weightedScore = Math.round(
    sRisk != null ? otherWeighted + sRisk * 0.25 : otherWeighted / 0.75
  );
  const score = Math.max(0, Math.min(100, weightedScore));

  let tier: DisciplineTier = "tier_master";
  if (score >= 90) tier = "tier_master";
  else if (score >= 75) tier = "tier_disciplined";
  else if (score >= 50) tier = "tier_leak";
  else tier = "tier_tilt";

  // MVP Trade (highest R win with valid setup)
  const winningTrades = dayTrades.filter((t) => t.pnl > 0);
  const mvpTrade = winningTrades.length > 0
    ? winningTrades.reduce((best, cur) => {
        // P3: a rated trade outranks an unrated one; unrated trades compare by pnl.
        const curR = ratedR(cur);
        const bestR = ratedR(best);
        if (curR != null && bestR != null) return curR > bestR ? cur : best;
        if (curR != null) return cur;
        if (bestR != null) return best;
        return cur.pnl > best.pnl ? cur : best;
      }, winningTrades[0])
    : null;

  // Costliest Leak (worst loss trade or costliest mistake)
  const costliestLeakTrade = lossTrades.length > 0
    ? lossTrades.reduce((worst, cur) => (cur.pnl < worst.pnl ? cur : worst), lossTrades[0])
    : null;

  // Context-aware directive
  let directive = "";
  if (tier === "tier_master") {
    directive = "Flawless execution today. Keep your ego quiet, rest your mind, and repeat the exact process tomorrow.";
  } else if (tier === "tier_disciplined") {
    directive = "Solid discipline maintained. Watch your entry patience in the first 15 minutes of the next session.";
  } else if (tier === "tier_leak") {
    directive = "Rules were bent today. Review your playbook before taking any new trades tomorrow morning.";
  } else {
    directive = "Emotional tilt detected. Step away from the screens immediately and complete a 4-7-8 Zen cool-down.";
  }

  return {
    score,
    tier,
    isRestDay: false,
    totalTrades: dayTrades.length,
    wins,
    losses,
    netPnl: Math.round(netPnl * 100) / 100,
    totalR: Number(totalR.toFixed(2)),
    pillars: {
      playbook: {
        score: sPlaybook,
        weight: 0.40,
        weightedScore: Number((sPlaybook * 0.40).toFixed(1)),
        labelKey: "pillar_playbook",
        notes: `${dayTrades.length} trade(s) evaluated against setups`
      },
      risk: {
        score: sRisk,
        unrated: sRisk == null,
        weight: sRisk == null ? 0 : 0.25,
        weightedScore: sRisk == null ? 0 : Number((sRisk * 0.25).toFixed(1)),
        labelKey: "pillar_risk",
        notes: sRisk == null
          ? `${lossTrades.length} loss(es) without risk set (unrated)`
          : lossTrades.length > 0 ? `${lossTrades.length} loss(es) contained` : "Zero losses incurred"
      },
      hardStop: {
        score: sHardStop,
        weight: 0.20,
        weightedScore: Number((sHardStop * 0.20).toFixed(1)),
        labelKey: "pillar_stop",
        notes: sHardStop === 100 ? "Capital well guarded" : "Approached/breached threshold"
      },
      frequency: {
        score: sFrequency,
        weight: 0.15,
        weightedScore: Number((sFrequency * 0.15).toFixed(1)),
        labelKey: "pillar_frequency",
        notes: `${dayTrades.length} trade(s) session volume`
      }
    },
    mvpTrade,
    costliestLeakTrade,
    directive
  };
}
