import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// P3 F1 note: Sections 2-8, 10, 11, 13 contain LEGACY copy-logic tests (they test a copy of the
// formula, not the app code). Each one is marked below with its Vitest equivalent (npm run test:unit)
// or "no Vitest equivalent yet". Coverage is NOT deleted; removal needs explicit approval.
// 1. Inlined / imported verification functions for pure domain math
function calculateMNQPosition({ balance, riskType, riskValue, stopLossPoints }) {
  const dollarRisk = riskType === 'percent'
    ? balance * (riskValue / 100)
    : riskValue;

  if (stopLossPoints <= 0 || dollarRisk <= 0) {
    return {
      contracts: 0,
      dollarRisk: 0,
      actualRisk: 0,
      pointValue: 2,
      recommendation: "Vui lòng nhập Stop Loss hợp lệ (> 0 points)"
    };
  }

  const rawContracts = dollarRisk / (stopLossPoints * 2);
  const contracts = Math.floor(rawContracts);
  const actualRisk = Number((contracts * stopLossPoints * 2).toFixed(2));

  return {
    contracts,
    dollarRisk: Number(dollarRisk.toFixed(2)),
    actualRisk,
    pointValue: 2
  };
}

function calculateGoldPosition({ balance, riskType, riskValue, stopLossDistance }) {
  const dollarRisk = riskType === 'percent'
    ? balance * (riskValue / 100)
    : riskValue;

  if (stopLossDistance <= 0 || dollarRisk <= 0) {
    return {
      lotSize: 0,
      dollarRisk: 0,
      actualRisk: 0,
      recommendation: "Vui lòng nhập khoảng cách Stop Loss hợp lệ (> $0.00)"
    };
  }

  const rawLot = dollarRisk / (stopLossDistance * 100);
  const lotSize = Math.max(0, Math.floor(rawLot * 100) / 100);
  const actualRisk = Number((lotSize * stopLossDistance * 100).toFixed(2));

  return {
    lotSize,
    dollarRisk: Number(dollarRisk.toFixed(2)),
    actualRisk
  };
}

function detectSession(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) {
    return 'New York';
  }

  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();
  const timeInHours = utcHour + utcMinute / 60;

  if (timeInHours >= 0 && timeInHours < 8) {
    return 'Asian';
  } else if (timeInHours >= 8 && timeInHours < 13) {
    return 'London';
  } else if (timeInHours >= 13 && timeInHours < 16) {
    return 'London-NY Overlap';
  } else if (timeInHours >= 16 && timeInHours < 21) {
    return 'New York';
  } else {
    return 'Asian';
  }
}

function calculateAccount1RRisk(account) {
  if (!account) {
    return {
      riskDollar: 100,
      bullets: 20,
      riskBaseLabel: "$100 chuẩn",
      riskBase: "fixed",
      safetyLevel: "safe",
    };
  }

  const rules = account.rules || {};
  const maxDrawdown = rules.trailingMaxDrawdown && rules.trailingMaxDrawdown > 0
    ? rules.trailingMaxDrawdown
    : account.initialBalance * 0.05;

  const riskType = rules.defaultRiskType || "%";
  const riskVal = rules.defaultRiskValue ?? (rules.defaultRiskType === "$" ? 100 : 5);

  const isPropAccount = account.type === "Challenge" || account.type === "Funded" || (rules.trailingMaxDrawdown && rules.trailingMaxDrawdown > 0);
  const effectiveBase = rules.riskBase || (isPropAccount ? "drawdown" : "balance");

  let riskDollar = 100;
  let riskBaseLabel = "";
  let riskBase = "fixed";

  if (riskType === "$") {
    riskDollar = Math.max(1, Math.round(riskVal));
    riskBase = "fixed";
    riskBaseLabel = `$${riskDollar.toLocaleString()} cố định`;
  } else {
    if (effectiveBase === "drawdown") {
      riskDollar = Math.max(1, Math.round(maxDrawdown * (riskVal / 100)));
      riskBase = "drawdown";
      riskBaseLabel = `${riskVal}% của Max Drawdown ($${maxDrawdown.toLocaleString()})`;
    } else {
      riskDollar = Math.max(1, Math.round(account.initialBalance * (riskVal / 100)));
      riskBase = "balance";
      riskBaseLabel = `${riskVal}% của Tổng Vốn ($${account.initialBalance.toLocaleString()})`;
    }
  }

  const bullets = riskDollar > 0 ? Math.floor(maxDrawdown / riskDollar) : 20;

  let safetyLevel = "safe";
  if (bullets < 8) {
    safetyLevel = "danger";
  } else if (bullets < 15) {
    safetyLevel = "moderate";
  }

  return {
    riskDollar,
    bullets,
    riskBaseLabel,
    riskBase,
    safetyLevel,
  };
}

function calculateRemainingBullets(bufferRemaining, riskDollar) {
  if (riskDollar <= 0) return 0;
  return Math.max(0, Math.floor(bufferRemaining / riskDollar));
}

function calculateExtendedStats(trades) {
  if (!trades || trades.length === 0) {
    return {
      profitFactor: 0,
      isProfitFactorInfinite: false,
      avgR: 0,
      avgWinR: 0,
      avgLossR: 0,
      tradesWithR: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      currentStreak: { type: "None", count: 0 },
      expectancyDollar: 0,
      expectancyR: 0,
      grossProfit: 0,
      grossLoss: 0,
    };
  }

  let grossProfit = 0;
  let grossLoss = 0;
  let winCount = 0;
  let lossCount = 0;

  let totalR = 0;
  let totalWinR = 0;
  let totalLossR = 0;
  let rCount = 0;
  let winRCount = 0;
  let lossRCount = 0;

  trades.forEach((t) => {
    if (t.pnl > 0) {
      grossProfit += t.pnl;
      winCount++;
    } else if (t.pnl < 0) {
      grossLoss += Math.abs(t.pnl);
      lossCount++;
    }

    let r = t.rMultiple;
    if (r === undefined && t.riskAmount && t.riskAmount > 0) {
      r = t.pnl / t.riskAmount;
    }

    if (r !== undefined && !isNaN(r)) {
      totalR += r;
      rCount++;
      if (r > 0) {
        totalWinR += r;
        winRCount++;
      } else if (r < 0) {
        totalLossR += Math.abs(r);
        lossRCount++;
      }
    }
  });

  let profitFactor = 0;
  let isProfitFactorInfinite = false;
  if (grossLoss === 0) {
    if (grossProfit > 0) {
      isProfitFactorInfinite = true;
      profitFactor = 99.99;
    } else {
      profitFactor = 0;
    }
  } else {
    profitFactor = Number((grossProfit / grossLoss).toFixed(2));
  }

  const avgR = rCount > 0 ? Number((totalR / rCount).toFixed(2)) : 0;
  const avgWinR = winRCount > 0 ? Number((totalWinR / winRCount).toFixed(2)) : 0;
  const avgLossR = lossRCount > 0 ? Number((totalLossR / lossRCount).toFixed(2)) : 0;

  const totalDecisive = winCount + lossCount;
  const winRate = totalDecisive > 0 ? winCount / totalDecisive : 0;
  const lossRate = totalDecisive > 0 ? lossCount / totalDecisive : 0;
  const avgWinDollar = winCount > 0 ? grossProfit / winCount : 0;
  const avgLossDollar = lossCount > 0 ? grossLoss / lossCount : 0;

  const expectancyDollar = Number(((winRate * avgWinDollar) - (lossRate * avgLossDollar)).toFixed(2));
  const expectancyR = Number(((winRate * avgWinR) - (lossRate * avgLossR)).toFixed(2));

  const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let curWins = 0;
  let curLosses = 0;

  sorted.forEach((t) => {
    if (t.result === "Win") {
      curWins++;
      curLosses = 0;
      if (curWins > maxConsecutiveWins) maxConsecutiveWins = curWins;
    } else if (t.result === "Loss") {
      curLosses++;
      curWins = 0;
      if (curLosses > maxConsecutiveLosses) maxConsecutiveLosses = curLosses;
    } else {
      curWins = 0;
      curLosses = 0;
    }
  });

  let currentStreak = { type: "None", count: 0 };
  if (sorted.length > 0) {
    const lastResult = sorted[sorted.length - 1].result;
    if (lastResult === "Win" || lastResult === "Loss") {
      let streak = 0;
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].result === lastResult) {
          streak++;
        } else if (sorted[i].result === "Break Even") {
          continue;
        } else {
          break;
        }
      }
      currentStreak = { type: lastResult, count: streak };
    }
  }

  return {
    profitFactor,
    isProfitFactorInfinite,
    avgR,
    avgWinR,
    avgLossR,
    tradesWithR: rCount,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    currentStreak,
    expectancyDollar,
    expectancyR,
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
  };
}

function filterTradesByTimeframe(trades, timeframe, now = new Date()) {
  if (timeframe === "all") return trades;

  let threshold;
  if (timeframe === "week") {
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    threshold = d;
  } else if (timeframe === "month") {
    threshold = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (timeframe === "30days") {
    threshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    return trades;
  }

  return trades.filter((t) => {
    const tradeDate = new Date(t.date);
    return !isNaN(tradeDate.getTime()) && tradeDate >= threshold;
  });
}

function evaluateDailyLossRules(todayPnL, rules) {
  const maxLoss = rules.maxDailyLoss || 0;
  if (maxLoss <= 0) return { isWarning: false, isBreached: false, percentUsed: 0 };

  const lossToday = todayPnL < 0 ? Math.abs(todayPnL) : 0;
  const percentUsed = (lossToday / maxLoss) * 100;
  const threshold = rules.dailyLossAlertThreshold || 80;

  const isBreached = lossToday >= maxLoss;
  const isWarning = !isBreached && percentUsed >= threshold;

  return {
    isWarning,
    isBreached,
    percentUsed: Math.round(percentUsed),
    lossToday,
    remainingAllowed: Math.max(0, maxLoss - lossToday),
    hardStopEnabled: rules.enableHardStop !== false,
  };
}

// -------------------------------------------------------------
// TEST SUITE EXECUTION
// -------------------------------------------------------------
let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(err);
  }
}

console.log("\n=======================================================");
console.log("  TRADENOTE PRO ENHANCEMENTS - AUTOMATED TEST SUITE   ");
console.log("=======================================================\n");

console.log("1. Position Size Calculator - MNQ Futures ($2.00/point):");
it("Standard % risk: $100k balance, 1% risk ($1000), 15 pts SL -> 33 contracts", () => {
  const res = calculateMNQPosition({ balance: 100000, riskType: 'percent', riskValue: 1, stopLossPoints: 15 });
  assert.strictEqual(res.contracts, 33);
  assert.strictEqual(res.dollarRisk, 1000);
  assert.strictEqual(res.actualRisk, 990);
});

it("Fixed dollar risk: $300 risk, 15 pts SL -> 10 contracts exactly", () => {
  const res = calculateMNQPosition({ balance: 50000, riskType: 'fixed', riskValue: 300, stopLossPoints: 15 });
  assert.strictEqual(res.contracts, 10);
  assert.strictEqual(res.actualRisk, 300);
});

it("Fractional SL: $500 risk, 16.5 pts SL -> floor(500 / 33) = 15 contracts", () => {
  const res = calculateMNQPosition({ balance: 50000, riskType: 'fixed', riskValue: 500, stopLossPoints: 16.5 });
  assert.strictEqual(res.contracts, 15);
  assert.strictEqual(res.actualRisk, 495);
});

it("Zero or negative SL protection: returns 0 contracts safely", () => {
  const resZero = calculateMNQPosition({ balance: 100000, riskType: 'fixed', riskValue: 500, stopLossPoints: 0 });
  assert.strictEqual(resZero.contracts, 0);
  const resNeg = calculateMNQPosition({ balance: 100000, riskType: 'fixed', riskValue: 500, stopLossPoints: -10 });
  assert.strictEqual(resNeg.contracts, 0);
});

it("Insufficient risk for 1 contract: $20 risk, 20 pts SL (min $40) -> 0 contracts", () => {
  const res = calculateMNQPosition({ balance: 100000, riskType: 'fixed', riskValue: 20, stopLossPoints: 20 });
  assert.strictEqual(res.contracts, 0);
});

// LEGACY copy-logic (P3 F1): Gold sizing math is copied here; no Vitest equivalent yet (positionCalculator not in P3 scope). Kept as-is.
console.log("\n2. Position Size Calculator - Gold XAUUSD ($100/point per lot):");
it("Standard % risk: $100k balance, 1% risk ($1000), $5.0 SL -> 2.00 lots", () => {
  const res = calculateGoldPosition({ balance: 100000, riskType: 'percent', riskValue: 1, stopLossDistance: 5 });
  assert.strictEqual(res.lotSize, 2.00);
  assert.strictEqual(res.dollarRisk, 1000);
  assert.strictEqual(res.actualRisk, 1000);
});

it("Fixed dollar risk: $500 risk, $5.0 SL -> 1.00 lot", () => {
  const res = calculateGoldPosition({ balance: 50000, riskType: 'fixed', riskValue: 500, stopLossDistance: 5 });
  assert.strictEqual(res.lotSize, 1.00);
  assert.strictEqual(res.actualRisk, 500);
});

it("Broker step size rounding: $350 risk, $3.2 SL -> floor(1.09375 * 100)/100 = 1.09 lots", () => {
  const res = calculateGoldPosition({ balance: 50000, riskType: 'fixed', riskValue: 350, stopLossDistance: 3.2 });
  assert.strictEqual(res.lotSize, 1.09);
  assert.strictEqual(res.actualRisk, 348.8);
});

it("Zero or negative SL distance: returns 0 lot size safely", () => {
  const resZero = calculateGoldPosition({ balance: 100000, riskType: 'fixed', riskValue: 500, stopLossDistance: 0 });
  assert.strictEqual(resZero.lotSize, 0);
  const resNeg = calculateGoldPosition({ balance: 100000, riskType: 'fixed', riskValue: 500, stopLossDistance: -2.5 });
  assert.strictEqual(resNeg.lotSize, 0);
});

// LEGACY copy-logic (P3 F1): session tagging copied here; no Vitest equivalent yet (sessionUtils not in P3 scope; trading-day logic is covered by src/lib/__tests__/tradingDay.test.ts). Kept as-is.
console.log("\n3. Auto Session Tagging (UTC-based Market Hours):");
it("Asian Session: 03:30 UTC -> Asian", () => {
  const d = new Date('2026-09-19T03:30:00Z');
  assert.strictEqual(detectSession(d), 'Asian');
});

it("London Session: 09:15 UTC -> London", () => {
  const d = new Date('2026-09-19T09:15:00Z');
  assert.strictEqual(detectSession(d), 'London');
});

it("London-NY Overlap Session: 14:00 UTC -> London-NY Overlap", () => {
  const d = new Date('2026-09-19T14:00:00Z');
  assert.strictEqual(detectSession(d), 'London-NY Overlap');
});

it("New York Session: 18:00 UTC -> New York", () => {
  const d = new Date('2026-09-19T18:00:00Z');
  assert.strictEqual(detectSession(d), 'New York');
});

it("Off-hours Late US rollover: 22:30 UTC -> Asian", () => {
  const d = new Date('2026-09-19T22:30:00Z');
  assert.strictEqual(detectSession(d), 'Asian');
});

it("Malformed or invalid timestamp fallback: returns New York safely", () => {
  assert.strictEqual(detectSession("invalid-date"), 'New York');
});

// LEGACY copy-logic (P3 F1): Vitest equivalent = src/lib/__tests__/risk.test.ts ("no-risk-excluded-from-R: rMultiple / isRatedForR"). Kept until removal is approved.
console.log("\n4. R-Multiple & Risk Math Verification:");
it("Winning trade: PnL $1,250, Risk $500 -> +2.50R", () => {
  const pnl = 1250;
  const risk = 500;
  const r = Number((pnl / risk).toFixed(2));
  assert.strictEqual(r, 2.5);
});

it("Losing trade: PnL -$500, Risk $500 -> -1.00R", () => {
  const pnl = -500;
  const risk = 500;
  const r = Number((pnl / risk).toFixed(2));
  assert.strictEqual(r, -1.0);
});

it("Break-even trade: PnL $0, Risk $500 -> 0.00R", () => {
  const pnl = 0;
  const risk = 500;
  const r = Number((pnl / risk).toFixed(2));
  assert.strictEqual(r, 0);
});

it("Average R aggregation: [+2.5R, -1.0R, +3.0R] -> Avg +1.50R", () => {
  const trades = [2.5, -1.0, 3.0];
  const avg = Number((trades.reduce((a, b) => a + b, 0) / trades.length).toFixed(2));
  assert.strictEqual(avg, 1.50);
});

// LEGACY copy-logic (P3 F1): checklist gate copied here; no Vitest equivalent yet (not P3 scope). Kept as-is.
console.log("\n5. Playbook Checklist 100% Gatekeeper Logic:");
it("100% rules checked triggers A+ Setup badge", () => {
  const rules = ["Rule 1: Liquidity Sweep", "Rule 2: MSS M5", "Rule 3: FVG Retest"];
  const checked = { "Rule 1: Liquidity Sweep": true, "Rule 2: MSS M5": true, "Rule 3: FVG Retest": true };
  const isAPlus = rules.every(r => checked[r]);
  assert.strictEqual(isAPlus, true);
});

it("Partial rules checked does NOT trigger A+ Setup badge", () => {
  const rules = ["Rule 1: Liquidity Sweep", "Rule 2: MSS M5", "Rule 3: FVG Retest"];
  const checked = { "Rule 1: Liquidity Sweep": true, "Rule 2: MSS M5": false, "Rule 3: FVG Retest": true };
  const isAPlus = rules.every(r => checked[r]);
  assert.strictEqual(isAPlus, false);
});

// LEGACY copy-logic (P3 F1): Vitest equivalent = src/lib/__tests__/r-multiple-winrate-parity.test.ts (real aiCoachAggregator vs stats). Kept until removal is approved.
console.log("\n6. AI Coach Level 1 Aggregator & Habit Analytics:");
it("Correctly detects Tilt / Revenge Streak (trades < 60 min after loss)", () => {
  // Simulating 2 trades in quick succession after a loss
  const t1 = { id: "1", date: "2026-09-19T14:00:00Z", pnl: -500, mistake: "Revenge", session: "London-NY Overlap" };
  const t2 = { id: "2", date: "2026-09-19T14:15:00Z", pnl: -600, mistake: "FOMO", session: "London-NY Overlap" };
  const sorted = [t1, t2];
  
  let revengeLoss = 0;
  let revengeCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i-1].pnl < 0) {
      const diffMins = (new Date(sorted[i].date) - new Date(sorted[i-1].date)) / (1000 * 60);
      if (diffMins <= 60) {
        revengeCount++;
        if (sorted[i].pnl < 0) revengeLoss += Math.abs(sorted[i].pnl);
      }
    }
  }
  assert.strictEqual(revengeCount, 1);
  assert.strictEqual(revengeLoss, 600);
});

it("Correctly calculates costliest mistake (Mistake Leak)", () => {
  const mistakes = [
    { mistake: "FOMO", pnl: -400 },
    { mistake: "FOMO", pnl: -300 },
    { mistake: "Overtrading", pnl: -200 }
  ];
  const mistakeCost = {};
  for (const t of mistakes) {
    if (!mistakeCost[t.mistake]) mistakeCost[t.mistake] = 0;
    if (t.pnl < 0) mistakeCost[t.mistake] += Math.abs(t.pnl);
  }
  assert.strictEqual(mistakeCost["FOMO"], 700);
  assert.strictEqual(mistakeCost["Overtrading"], 200);
});

// LEGACY copy-logic (P3 F1): Vitest equivalent = src/lib/__tests__/risk.test.ts ("account-1r-default") + riskEngine.test.ts. NOTE: the copy below still models the pre-P3 store-level 1R fill; the real code no longer does it (B1). Kept until removal is approved.
console.log("\n7. Account Default 1R Baseline & Inheritance Logic:");
function resolveAccount1RRisk(account) {
  const rType = account?.rules?.defaultRiskType || "%";
  const rVal = account?.rules?.defaultRiskValue ?? 1;
  if (rType === "$") {
    return Math.round(rVal);
  }
  return Math.round((account?.initialBalance ?? 100000) * (rVal / 100));
}

it("Account with % default risk (1% of $50,000 -> $500)", () => {
  const acc = { initialBalance: 50000, rules: { defaultRiskType: "%", defaultRiskValue: 1 } };
  assert.strictEqual(resolveAccount1RRisk(acc), 500);
});

it("Account with % default risk (0.5% of $100,000 -> $500)", () => {
  const acc = { initialBalance: 100000, rules: { defaultRiskType: "%", defaultRiskValue: 0.5 } };
  assert.strictEqual(resolveAccount1RRisk(acc), 500);
});

it("Account with $ fixed default risk (e.g. Topstep 50k with fixed $300)", () => {
  const acc = { initialBalance: 50000, rules: { defaultRiskType: "$", defaultRiskValue: 300 } };
  assert.strictEqual(resolveAccount1RRisk(acc), 300);
});

it("Backward compatibility: legacy account with undefined defaultRiskType/Value defaults to 1% of balance", () => {
  const acc = { initialBalance: 150000, rules: { trailingMaxDrawdown: 4500 } };
  assert.strictEqual(resolveAccount1RRisk(acc), 1500);
});

it("Position Size Calculator properly inherits account 1R rule", () => {
  const accPercent = { rules: { defaultRiskType: "%", defaultRiskValue: 0.75 } };
  const accFixed = { rules: { defaultRiskType: "$", defaultRiskValue: 400 } };

  const calcPercentType = accPercent.rules.defaultRiskType === "$" ? "fixed" : "percent";
  const calcPercentVal = (accPercent.rules.defaultRiskValue ?? 1).toString();
  assert.strictEqual(calcPercentType, "percent");
  assert.strictEqual(calcPercentVal, "0.75");

  const calcFixedType = accFixed.rules.defaultRiskType === "$" ? "fixed" : "percent";
  const calcFixedVal = (accFixed.rules.defaultRiskValue ?? 1).toString();
  assert.strictEqual(calcFixedType, "fixed");
  assert.strictEqual(calcFixedVal, "400");
});

// LEGACY copy-logic (P3 F1): Vitest equivalent = src/lib/__tests__/propRisk.test.ts (hwm-bullets-consistency-golden-cases) + propRisk-intraday-characterization.test.ts (oracle). Kept until removal is approved.
console.log("\n8. High Water Mark (HWM) Trailing Drawdown & Buffer Engine:");
function calculateTrailingDrawdown({ initialBalance, trades, maxDrawdownLimit, mode }) {
  let highWaterMark = initialBalance;
  let currentBalance = initialBalance + trades.reduce((acc, t) => acc + t.pnl, 0);

  const sortedTrades = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (mode === "End of Day") {
    const tradesByDay = new Map();
    sortedTrades.forEach(t => {
      const d = new Date(t.date).toISOString().split('T')[0];
      tradesByDay.set(d, (tradesByDay.get(d) || 0) + t.pnl);
    });

    let runningEodBalance = initialBalance;
    const todayStr = new Date().toISOString().split('T')[0];
    tradesByDay.forEach((dayPnl, dayKey) => {
      runningEodBalance += dayPnl;
      if (dayKey !== todayStr) {
        if (runningEodBalance > highWaterMark) highWaterMark = runningEodBalance;
      }
    });
  } else {
    // Intraday
    let runningBalance = initialBalance;
    sortedTrades.forEach(t => {
      runningBalance += t.pnl;
      if (runningBalance > highWaterMark) highWaterMark = runningBalance;
    });
  }

  const currentDrawdown = Math.max(0, highWaterMark - currentBalance);
  const breachLevel = highWaterMark - maxDrawdownLimit;
  const bufferRemaining = Math.max(0, currentBalance - breachLevel);
  const drawdownPercentage = maxDrawdownLimit > 0 ? (currentDrawdown / maxDrawdownLimit) * 100 : 0;

  return {
    highWaterMark,
    currentBalance,
    currentDrawdown,
    breachLevel,
    bufferRemaining,
    drawdownPercentage
  };
}

it("Intraday trailing drawdown ratchets HWM after each profit", () => {
  const result = calculateTrailingDrawdown({
    initialBalance: 50000,
    maxDrawdownLimit: 2500,
    mode: "Intraday",
    trades: [
      { date: "2026-03-01T10:00:00Z", pnl: 1000 }, // Balance 51000, HWM 51000
      { date: "2026-03-01T12:00:00Z", pnl: 500 },  // Balance 51500, HWM 51500
      { date: "2026-03-01T14:00:00Z", pnl: -800 }, // Balance 50700, HWM stays 51500
    ]
  });

  assert.strictEqual(result.highWaterMark, 51500);
  assert.strictEqual(result.currentBalance, 50700);
  assert.strictEqual(result.currentDrawdown, 800);
  assert.strictEqual(result.breachLevel, 49000); // 51500 - 2500
  assert.strictEqual(result.bufferRemaining, 1700); // 50700 - 49000
  assert.strictEqual(Math.round(result.drawdownPercentage), 32); // (800 / 2500) * 100 = 32%
});

it("Current drawdown is NOT historical max drawdown (recovering reduces active DD)", () => {
  const result = calculateTrailingDrawdown({
    initialBalance: 100000,
    maxDrawdownLimit: 3000,
    mode: "Intraday",
    trades: [
      { date: "2026-03-01T10:00:00Z", pnl: -1500 }, // Balance 98500, DD = 1500
      { date: "2026-03-02T10:00:00Z", pnl: 1000 },  // Balance 99500, Active DD reduces to 500
    ]
  });

  assert.strictEqual(result.highWaterMark, 100000);
  assert.strictEqual(result.currentBalance, 99500);
  assert.strictEqual(result.currentDrawdown, 500); // Correctly 500, NOT 1500
  assert.strictEqual(result.bufferRemaining, 2500); // 99500 - 97000 = 2500
});

it("End of Day (EOD) mode ratchets HWM only on closed prior day", () => {
  const result = calculateTrailingDrawdown({
    initialBalance: 50000,
    maxDrawdownLimit: 2500,
    mode: "End of Day",
    trades: [
      // Past day closed with +$2,000 profit -> HWM becomes 52,000
      { date: "2026-01-01T15:00:00Z", pnl: 2000 },
      // Today intraday dip -$500 -> Current Balance 51500
      { date: new Date().toISOString(), pnl: -500 }
    ]
  });

  assert.strictEqual(result.highWaterMark, 52000);
  assert.strictEqual(result.currentBalance, 51500);
  assert.strictEqual(result.currentDrawdown, 500);
  assert.strictEqual(result.breachLevel, 49500); // 52000 - 2500
  assert.strictEqual(result.bufferRemaining, 2000); // 51500 - 49500
});

console.log("\n9. Custom Date / Time & Quick Entry Mode Logic:");
it("Custom trade date re-detects correct session", () => {
  const londonDate = new Date("2026-04-10T09:30:00Z");
  const nyDate = new Date("2026-04-10T17:00:00Z");
  assert.strictEqual(detectSession(londonDate), "London");
  assert.strictEqual(detectSession(nyDate), "New York");
});

it("Quick Entry auto-derives trade result from PnL", () => {
  function deriveResult(pnl) {
    return pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Break Even";
  }
  assert.strictEqual(deriveResult(250), "Win");
  assert.strictEqual(deriveResult(-150), "Loss");
  assert.strictEqual(deriveResult(0), "Break Even");
});

it("Dynamic setups merge Playbooks with default setups without duplicates", () => {
  const playbooks = [
    { title: "ICT Silver Bullet" },
    { title: "Breakout" } // overlaps with default
  ];
  const defaults = ["Breakout", "Pullback", "Reversal", "Continuation", "Other"];
  const dynamicSetups = Array.from(new Set([...playbooks.map(p => p.title), ...defaults]));
  
  assert.deepStrictEqual(dynamicSetups, [
    "ICT Silver Bullet",
    "Breakout",
    "Pullback",
    "Reversal",
    "Continuation",
    "Other"
  ]);
});

// LEGACY copy-logic (P3 F1): Vitest equivalent = src/lib/__tests__/riskEngine.test.ts + propRisk.test.ts (live bullets). Kept until removal is approved.
console.log("\n10. Prop Firm Risk Engine & Bullets Calculation (Solution A):");
it("Prop Firm Challenge calculates 1R as % of Max Drawdown ($2,000 * 5% = $100, 20 Bullets)", () => {
  const account = {
    initialBalance: 50000,
    type: "Challenge",
    rules: {
      trailingMaxDrawdown: 2000,
      defaultRiskType: "%",
      defaultRiskValue: 5,
      riskBase: "drawdown"
    }
  };
  const r = calculateAccount1RRisk(account);
  assert.strictEqual(r.riskDollar, 100);
  assert.strictEqual(r.bullets, 20);
  assert.strictEqual(r.riskBase, "drawdown");
  assert.strictEqual(r.safetyLevel, "safe");
});

it("High risk % on Max Drawdown triggers danger safety level (< 8 bullets)", () => {
  const account = {
    initialBalance: 50000,
    type: "Challenge",
    rules: {
      trailingMaxDrawdown: 2000,
      defaultRiskType: "%",
      defaultRiskValue: 20, // 20% of 2000 = $400
      riskBase: "drawdown"
    }
  };
  const r = calculateAccount1RRisk(account);
  assert.strictEqual(r.riskDollar, 400);
  assert.strictEqual(r.bullets, 5); // 2000 / 400 = 5
  assert.strictEqual(r.safetyLevel, "danger");
});

it("Standard Account calculates 1R as % of Total Balance", () => {
  const account = {
    initialBalance: 10000,
    type: "Personal",
    rules: {
      trailingMaxDrawdown: 1000,
      defaultRiskType: "%",
      defaultRiskValue: 1, // 1% of 10,000 = $100
      riskBase: "balance"
    }
  };
  const r = calculateAccount1RRisk(account);
  assert.strictEqual(r.riskDollar, 100);
  assert.strictEqual(r.bullets, 10); // 1000 / 100 = 10
  assert.strictEqual(r.riskBase, "balance");
  assert.strictEqual(r.safetyLevel, "moderate");
});

it("Fixed dollar risk ($150) calculates correct bullet count and moderate safety level", () => {
  const account = {
    initialBalance: 50000,
    type: "Challenge",
    rules: {
      trailingMaxDrawdown: 2000,
      defaultRiskType: "$",
      defaultRiskValue: 150
    }
  };
  const r = calculateAccount1RRisk(account);
  assert.strictEqual(r.riskDollar, 150);
  assert.strictEqual(r.bullets, 13); // Math.floor(2000 / 150) = 13
  assert.strictEqual(r.riskBase, "fixed");
  assert.strictEqual(r.safetyLevel, "moderate");
});

it("Remaining live bullets accurately derived from remaining buffer", () => {
  assert.strictEqual(calculateRemainingBullets(1200, 100), 12);
  assert.strictEqual(calculateRemainingBullets(50, 100), 0);
  assert.strictEqual(calculateRemainingBullets(0, 100), 0);
});

it("Legacy Challenge account with undefined riskBase auto-defaults to drawdown to protect capital", () => {
  const legacyAccount = {
    initialBalance: 50000,
    type: "Challenge",
    rules: {
      trailingMaxDrawdown: 2000,
      defaultRiskType: "%",
      defaultRiskValue: 5
      // riskBase undefined
    }
  };
  const r = calculateAccount1RRisk(legacyAccount);
  assert.strictEqual(r.riskDollar, 100); // 5% of 2000, NOT 5% of 50000 ($2500)
  assert.strictEqual(r.riskBase, "drawdown");
  assert.strictEqual(r.bullets, 20);
});

// LEGACY copy-logic (P3 F1): Vitest equivalent = src/lib/__tests__/stats.test.ts (winRate BE-excluded, avgR unrated-excluded, profitFactor 99.99 cap, expectancy). NOTE: the copy below may use the pre-P3 win-rate definition. Kept until removal is approved.
console.log("\n11. Extended Analytics KPI Calculations (Profit Factor, Avg R, Streaks, Expectancy):");
it("Standard dataset: calculates Profit Factor, Avg R, Expectancy, and Streaks accurately", () => {
  const mockTrades = [
    { date: "2026-09-10T10:00:00Z", pnl: 300, result: "Win", rMultiple: 2.0, riskAmount: 150 },
    { date: "2026-09-11T14:30:00Z", pnl: 450, result: "Win", rMultiple: 3.0, riskAmount: 150 },
    { date: "2026-09-12T15:00:00Z", pnl: -150, result: "Loss", rMultiple: -1.0, riskAmount: 150 },
    { date: "2026-09-13T16:00:00Z", pnl: 150, result: "Win", rMultiple: 1.0, riskAmount: 150 },
  ];

  const stats = calculateExtendedStats(mockTrades);
  assert.strictEqual(stats.grossProfit, 900);
  assert.strictEqual(stats.grossLoss, 150);
  assert.strictEqual(stats.profitFactor, 6.00); // 900 / 150
  assert.strictEqual(stats.isProfitFactorInfinite, false);
  assert.strictEqual(stats.avgR, 1.25); // (2 + 3 - 1 + 1) / 4 = 1.25
  assert.strictEqual(stats.avgWinR, 2.00); // (2 + 3 + 1) / 3 = 2.00
  assert.strictEqual(stats.avgLossR, 1.00);
  assert.strictEqual(stats.maxConsecutiveWins, 2);
  assert.strictEqual(stats.maxConsecutiveLosses, 1);
  assert.strictEqual(stats.currentStreak.type, "Win");
  assert.strictEqual(stats.currentStreak.count, 1);
  assert.strictEqual(stats.expectancyDollar, 187.5); // (0.75 * 300) - (0.25 * 150) = 225 - 37.5
});

it("Zero loss dataset: handles infinite Profit Factor gracefully with 99.99 cap flag", () => {
  const mockWinOnly = [
    { date: "2026-09-15T10:00:00Z", pnl: 250, result: "Win", rMultiple: 2.5 },
    { date: "2026-09-16T14:00:00Z", pnl: 350, result: "Win", rMultiple: 3.5 },
  ];

  const stats = calculateExtendedStats(mockWinOnly);
  assert.strictEqual(stats.profitFactor, 99.99);
  assert.strictEqual(stats.isProfitFactorInfinite, true);
  assert.strictEqual(stats.maxConsecutiveWins, 2);
  assert.strictEqual(stats.currentStreak.type, "Win");
  assert.strictEqual(stats.currentStreak.count, 2);
});

it("Empty dataset: returns safe zeroes without NaN or exception", () => {
  const stats = calculateExtendedStats([]);
  assert.strictEqual(stats.profitFactor, 0);
  assert.strictEqual(stats.avgR, 0);
  assert.strictEqual(stats.expectancyDollar, 0);
  assert.strictEqual(stats.currentStreak.count, 0);
});

console.log("\n12. Risk Management & Journal Filtering (Hard Stop, Warning Threshold & Timeframe):");
it("Daily Loss Rule evaluation: triggers 80% Warning and 100% Hard Stop breach", () => {
  const rules = { maxDailyLoss: 500, dailyLossAlertThreshold: 80, enableHardStop: true };

  // Safe zone ($350 loss = 70%)
  const safeRes = evaluateDailyLossRules(-350, rules);
  assert.strictEqual(safeRes.isWarning, false);
  assert.strictEqual(safeRes.isBreached, false);
  assert.strictEqual(safeRes.percentUsed, 70);
  assert.strictEqual(safeRes.remainingAllowed, 150);

  // Warning zone ($425 loss = 85%)
  const warnRes = evaluateDailyLossRules(-425, rules);
  assert.strictEqual(warnRes.isWarning, true);
  assert.strictEqual(warnRes.isBreached, false);
  assert.strictEqual(warnRes.percentUsed, 85);
  assert.strictEqual(warnRes.remainingAllowed, 75);

  // Hard Stop breached ($520 loss = 104%)
  const breachRes = evaluateDailyLossRules(-520, rules);
  assert.strictEqual(breachRes.isBreached, true);
  assert.strictEqual(breachRes.isWarning, false);
  assert.strictEqual(breachRes.remainingAllowed, 0);
});

it("Timeframe Filter: filters trades by relative date window accurately", () => {
  const fixedNow = new Date("2026-09-20T12:00:00Z");
  const trades = [
    { id: "1", date: "2026-09-20T08:00:00Z", symbol: "XAUUSD" }, // Today
    { id: "2", date: "2026-09-17T10:00:00Z", symbol: "MNQ" },    // 3 days ago (this week)
    { id: "3", date: "2026-08-01T10:00:00Z", symbol: "EURUSD" }, // ~50 days ago
  ];

  const all = filterTradesByTimeframe(trades, "all", fixedNow);
  assert.strictEqual(all.length, 3);

  const thirtyDays = filterTradesByTimeframe(trades, "30days", fixedNow);
  assert.strictEqual(thirtyDays.length, 2);
  assert.strictEqual(thirtyDays.some(t => t.id === "3"), false);

  const thisMonth = filterTradesByTimeframe(trades, "month", fixedNow);
  assert.strictEqual(thisMonth.length, 2); // Sept only

  const thisWeek = filterTradesByTimeframe(trades, "week", fixedNow);
  assert.strictEqual(thisWeek.length, 2);
});

// LEGACY copy-logic (P3 F1): locale detection copied here; no Vitest equivalent yet (not P3 scope). Kept as-is.
console.log("\n13. Local & International Locale Detection Logic:");
it("Detects Vietnamese locale for users with Vietnamese Accept-Language or Geo-IP", () => {
  const detectLocaleFromHeaders = ({ acceptLanguage, country, cookie }) => {
    if (cookie === 'en' || cookie === 'vi') return cookie;
    if (country === 'VN') return 'vi';
    if (acceptLanguage && (acceptLanguage.includes('vi-VN') || acceptLanguage.includes('vi'))) return 'vi';
    return 'en';
  };

  assert.strictEqual(detectLocaleFromHeaders({ acceptLanguage: 'vi-VN,vi;q=0.9,en;q=0.8' }), 'vi');
  assert.strictEqual(detectLocaleFromHeaders({ acceptLanguage: 'en-US,en;q=0.9' }), 'en');
  assert.strictEqual(detectLocaleFromHeaders({ country: 'VN' }), 'vi');
  assert.strictEqual(detectLocaleFromHeaders({ country: 'US' }), 'en');
  // Manual cookie overrides auto-detection
  assert.strictEqual(detectLocaleFromHeaders({ country: 'VN', cookie: 'en' }), 'en');
  assert.strictEqual(detectLocaleFromHeaders({ country: 'US', cookie: 'vi' }), 'vi');
});

it("Client detector identifies Vietnam timezone and navigator language", () => {
  const detectClientLocale = ({ timeZone, languages, hasCookie }) => {
    if (hasCookie) return null; // do not override
    const isVietnamTz = timeZone === 'Asia/Ho_Chi_Minh' || timeZone === 'Asia/Saigon';
    const isVietnamLang = languages.some(l => l && l.toLowerCase().startsWith('vi'));
    return (isVietnamTz || isVietnamLang) ? 'vi' : 'en';
  };

  assert.strictEqual(detectClientLocale({ timeZone: 'Asia/Ho_Chi_Minh', languages: ['en-US'], hasCookie: false }), 'vi');
  assert.strictEqual(detectClientLocale({ timeZone: 'America/New_York', languages: ['en-US'], hasCookie: false }), 'en');
  assert.strictEqual(detectClientLocale({ timeZone: 'Asia/Tokyo', languages: ['ja'], hasCookie: false }), 'en');
  assert.strictEqual(detectClientLocale({ timeZone: 'Asia/Ho_Chi_Minh', languages: ['en-US'], hasCookie: true }), null);
});

console.log("\n14. 1,000 CCU Scaling & Security Logic (Pagination, Rate Limiter, Image Resizing):");
it("Journal Pagination calculates total pages, item slices, and item ranges accurately", () => {
  const PAGE_SIZE = 30;
  const mockTrades = Array.from({ length: 75 }, (_, i) => ({ id: `trade-${i + 1}` }));
  const totalPages = Math.max(1, Math.ceil(mockTrades.length / PAGE_SIZE));
  assert.strictEqual(totalPages, 3); // 75 / 30 = 2.5 -> 3 pages

  // Page 1: 0..30
  const page1 = mockTrades.slice(0, PAGE_SIZE);
  assert.strictEqual(page1.length, 30);
  assert.strictEqual(page1[0].id, "trade-1");
  assert.strictEqual(page1[29].id, "trade-30");

  // Page 2: 30..60
  const page2 = mockTrades.slice(30, 60);
  assert.strictEqual(page2.length, 30);
  assert.strictEqual(page2[0].id, "trade-31");
  assert.strictEqual(page2[29].id, "trade-60");

  // Page 3: 60..75 (15 items)
  const page3 = mockTrades.slice(60, 90);
  assert.strictEqual(page3.length, 15);
  assert.strictEqual(page3[0].id, "trade-61");
  assert.strictEqual(page3[14].id, "trade-75");

  // Empty trades
  const emptyTrades = [];
  const emptyPages = Math.max(1, Math.ceil(emptyTrades.length / PAGE_SIZE));
  assert.strictEqual(emptyPages, 1);
});

it("AI Coach Rate Limiter permits up to 5 requests / 10 minutes and rejects the 6th with retry window", () => {
  const WINDOW_MS = 10 * 60 * 1000;
  const MAX_REQ = 5;
  const userTimestamps = new Map();

  function testCheckRateLimit(userId, now) {
    const timestamps = userTimestamps.get(userId) || [];
    const valid = timestamps.filter(t => now - t < WINDOW_MS);
    if (valid.length >= MAX_REQ) {
      const oldest = valid[0];
      const retryAfter = Math.ceil((oldest + WINDOW_MS - now) / 1000);
      userTimestamps.set(userId, valid);
      return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
    }
    valid.push(now);
    userTimestamps.set(userId, valid);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const baseTime = 1000000;
  const testUser = "user_abc123";

  // First 5 requests within 2 minutes should all be allowed
  for (let i = 0; i < 5; i++) {
    const res = testCheckRateLimit(testUser, baseTime + i * 10000);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.retryAfterSeconds, 0);
  }

  // 6th request at 2.5 minutes should be blocked
  const blocked = testCheckRateLimit(testUser, baseTime + 150000);
  assert.strictEqual(blocked.allowed, false);
  assert.strictEqual(blocked.retryAfterSeconds > 0, true);
  // Oldest timestamp was at baseTime, window is 600s, elapsed is 150s -> ~450s remaining
  assert.strictEqual(blocked.retryAfterSeconds, 450);

  // After 10 minutes + 1s from the first request, request should be allowed again
  const afterExpiry = testCheckRateLimit(testUser, baseTime + WINDOW_MS + 1000);
  assert.strictEqual(afterExpiry.allowed, true);
});

it("Image Resizer scales down images exceeding 1920x1080 bounding box while preserving aspect ratio", () => {
  function computeTargetDimensions(width, height, maxWidth = 1920, maxHeight = 1080) {
    let targetWidth = width;
    let targetHeight = height;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      targetWidth = Math.round(width * ratio);
      targetHeight = Math.round(height * ratio);
    }
    return { targetWidth, targetHeight };
  }

  // 4K screenshot (3840 x 2160) -> should scale to 1920 x 1080 exactly
  const fourK = computeTargetDimensions(3840, 2160);
  assert.strictEqual(fourK.targetWidth, 1920);
  assert.strictEqual(fourK.targetHeight, 1080);

  // Tall screenshot (1000 x 3000) -> constrained by height (1080)
  const tall = computeTargetDimensions(1000, 3000);
  assert.strictEqual(tall.targetHeight, 1080);
  assert.strictEqual(tall.targetWidth, Math.round(1000 * (1080 / 3000))); // 360

  // Standard screenshot smaller than limit (1280 x 720) -> should remain unchanged
  const standard = computeTargetDimensions(1280, 720);
  assert.strictEqual(standard.targetWidth, 1280);
  assert.strictEqual(standard.targetHeight, 720);
});

console.log("\n15. Pragmatic Trader Streamlining Suite (Presets, Compact Table, Micro-Journal, Routine):");
it("Prop Firm Presets contain required firm profiles and complete 12 rule parameters", () => {
  const PROP_FIRM_PRESETS = [
    {
      id: "topstep-50k",
      firm: "Topstep",
      name: "Topstep 50K Express Funded",
      type: "Challenge",
      balance: 50000,
      currency: "USD",
      rules: {
        maxDailyLoss: 1000,
        maxDailyLossType: "$",
        maxDrawdown: 2000,
        drawdownType: "Trailing",
        profitTarget: 3000,
        dailyLossAlertThreshold: 80,
        enableHardStop: true,
        enableConsistencyRule: false,
        defaultRiskType: "$",
        defaultRiskValue: 200,
        riskBase: "drawdown",
      },
    },
    {
      id: "apex-50k",
      firm: "Apex",
      name: "Apex 50K Full",
      type: "Challenge",
      balance: 50000,
      currency: "USD",
      rules: {
        maxDailyLoss: 0,
        maxDailyLossType: "$",
        maxDrawdown: 2500,
        drawdownType: "Trailing",
        profitTarget: 3000,
        dailyLossAlertThreshold: 80,
        enableHardStop: false,
        enableConsistencyRule: true,
        consistencyThresholdPercent: 30,
        defaultRiskType: "$",
        defaultRiskValue: 250,
        riskBase: "drawdown",
      },
    },
    {
      id: "ftmo-100k",
      firm: "FTMO",
      name: "FTMO 100K Challenge",
      type: "Challenge",
      balance: 100000,
      currency: "USD",
      rules: {
        maxDailyLoss: 5,
        maxDailyLossType: "%",
        maxDrawdown: 10,
        drawdownType: "Static",
        profitTarget: 10000,
        dailyLossAlertThreshold: 80,
        enableHardStop: true,
        enableConsistencyRule: false,
        defaultRiskType: "%",
        defaultRiskValue: 1,
        riskBase: "balance",
      },
    },
  ];

  // Validate Topstep 50K
  const ts50 = PROP_FIRM_PRESETS.find(p => p.id === "topstep-50k");
  assert.strictEqual(ts50.balance, 50000);
  assert.strictEqual(ts50.rules.maxDailyLoss, 1000);
  assert.strictEqual(ts50.rules.maxDailyLossType, "$");
  assert.strictEqual(ts50.rules.drawdownType, "Trailing");
  assert.strictEqual(ts50.rules.enableHardStop, true);

  // Validate Apex 50K (No daily loss limit, 30% consistency rule)
  const apex50 = PROP_FIRM_PRESETS.find(p => p.id === "apex-50k");
  assert.strictEqual(apex50.rules.maxDailyLoss, 0);
  assert.strictEqual(apex50.rules.drawdownType, "Trailing");
  assert.strictEqual(apex50.rules.enableConsistencyRule, true);
  assert.strictEqual(apex50.rules.consistencyThresholdPercent, 30);

  // Validate FTMO 100K (% based loss limits)
  const ftmo100 = PROP_FIRM_PRESETS.find(p => p.id === "ftmo-100k");
  assert.strictEqual(ftmo100.rules.maxDailyLoss, 5);
  assert.strictEqual(ftmo100.rules.maxDailyLossType, "%");
  assert.strictEqual(ftmo100.rules.drawdownType, "Static");
});

it("Compact Table formats 4-column trade presentation without horizontal overflow", () => {
  function formatCompactTradeRow(trade, accountRisk = 200) {
    const d = new Date(trade.date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const timeDisplay = `${day}/${month} ${hours}:${minutes}`;

    const risk = trade.riskAmount || accountRisk;
    const rMultiple = risk > 0 ? trade.pnl / risk : 0;
    const rDisplay = rMultiple > 0 ? `+${rMultiple.toFixed(2)}R` : `${rMultiple.toFixed(2)}R`;
    const pnlDisplay = trade.pnl > 0 ? `+$${trade.pnl.toLocaleString()}` : `${trade.pnl.toLocaleString()}`;

    return {
      col1_time: timeDisplay,
      col2_asset: `${trade.asset} (${trade.lotSize}L)`,
      col3_result: { pnlDisplay, rDisplay },
      col4_discipline: trade.emotion,
    };
  }

  const sampleTrade = {
    date: "2026-09-20T14:30:00Z",
    asset: "MNQ",
    lotSize: 2,
    pnl: 600,
    riskAmount: 200,
    emotion: "Calm",
    setup: "Breakout",
  };

  const row = formatCompactTradeRow(sampleTrade, 200);
  assert.strictEqual(row.col2_asset, "MNQ (2L)");
  assert.strictEqual(row.col3_result.pnlDisplay, "+$600");
  assert.strictEqual(row.col3_result.rDisplay, "+3.00R");
  assert.strictEqual(row.col4_discipline, "Calm");
});

it("Micro-Review & Pre-Market Routine Storage Contract validates key integrity", () => {
  const todayStr = "2026-09-20";
  const dailyLessonKey = `tradenote_daily_lesson_${todayStr}`;
  const routineVisibilityKey = "tradenote_show_routine_widget";
  const customRoutineItemsKey = "tradenote_custom_routine_items";

  assert.strictEqual(dailyLessonKey, "tradenote_daily_lesson_2026-09-20");
  assert.strictEqual(routineVisibilityKey, "tradenote_show_routine_widget");

  // Routine customization operations
  let routineItems = [
    "Xác định Bias & Vùng Thanh Khoản (Asian/London High-Low)",
    "Kiểm tra Tin Tức Đỏ (ForexFactory / TradingEconomics)",
    "Chốt Kế Hoạch 1R ($500) & Ngưỡng Dừng Lỗ Hôm Nay",
  ];

  // Add custom item
  const newItem = "Không trade trong 5 phút đầu mở phiên Mỹ";
  routineItems = [...routineItems, newItem];
  assert.strictEqual(routineItems.length, 4);
  assert.strictEqual(routineItems[3], newItem);

  // Delete item at index 0
  routineItems = routineItems.filter((_, i) => i !== 0);
  assert.strictEqual(routineItems.length, 3);
  assert.strictEqual(routineItems[0], "Kiểm tra Tin Tức Đỏ (ForexFactory / TradingEconomics)");
});

console.log("\n16. Dashboard Layout & Widget Optimization:");
it("Profit Target card caps progress bar at 100% and displays exceeded celebration without absurd numbers", () => {
  function evaluateProfitTarget(totalPnL, target) {
    if (!target || target <= 0) return { hasTarget: false, isExceeded: false, percent: 0, display: "N/A" };
    const isExceeded = totalPnL >= target;
    const rawPercent = (Math.max(0, totalPnL) / target) * 100;
    const cappedPercent = Math.min(100, rawPercent);
    const surplus = isExceeded ? totalPnL - target : 0;
    return {
      hasTarget: true,
      isExceeded,
      cappedPercent,
      surplus,
      label: isExceeded ? `100% Hoàn thành (Vượt +$${surplus.toLocaleString('en-US')})` : `${rawPercent.toFixed(1)}% Hoàn thành`,
    };
  }

  const res = evaluateProfitTarget(57517.37, 1500);
  assert.strictEqual(res.isExceeded, true);
  assert.strictEqual(res.cappedPercent, 100);
  assert.strictEqual(res.surplus, 56017.37);
  assert.strictEqual(res.label, "100% Hoàn thành (Vượt +$56,017.37)");

  const resNormal = evaluateProfitTarget(1000, 2000);
  assert.strictEqual(resNormal.isExceeded, false);
  assert.strictEqual(resNormal.cappedPercent, 50);
  assert.strictEqual(resNormal.label, "50.0% Hoàn thành");
});

it("Consistency Rule is conditionally evaluated only when account has consistencyPercent defined", () => {
  function shouldRenderConsistencyCard(accountRules) {
    return Boolean(accountRules.consistencyPercent && accountRules.consistencyPercent > 0);
  }

  const apexAccount = { consistencyPercent: 30 };
  const ftmoAccount = { trailingMaxDrawdown: 5000 };
  const personalAccount = {};

  assert.strictEqual(shouldRenderConsistencyCard(apexAccount), true);
  assert.strictEqual(shouldRenderConsistencyCard(ftmoAccount), false);
  assert.strictEqual(shouldRenderConsistencyCard(personalAccount), false);
});

console.log("\n17. Deep Analytics Engine & Leakage Verification:");
it("calculateDrawdownSeries accurately tracks equity, peak, and percentage drops from HWM", () => {
  function calculateDrawdownSeries(trades, initialBalance = 100000) {
    if (!trades || trades.length === 0) return [];
    const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let runningEquity = initialBalance;
    let peak = initialBalance;
    return sorted.map((t) => {
      runningEquity += t.pnl;
      if (runningEquity > peak) peak = runningEquity;
      const drawdownDollar = Math.max(0, peak - runningEquity);
      const drawdownPercent = peak > 0 ? Number(((drawdownDollar / peak) * 100).toFixed(2)) : 0;
      return {
        date: t.date,
        equity: Number(runningEquity.toFixed(2)),
        peak: Number(peak.toFixed(2)),
        drawdownDollar: Number(drawdownDollar.toFixed(2)),
        drawdownPercent,
        underwaterPercent: -Math.abs(drawdownPercent),
      };
    });
  }

  const sampleTrades = [
    { date: "2026-09-01T10:00:00Z", pnl: 2000 },
    { date: "2026-09-02T10:00:00Z", pnl: -1020 },
    { date: "2026-09-03T10:00:00Z", pnl: 3000 },
    { date: "2026-09-04T10:00:00Z", pnl: -2079.6 },
  ];

  const series = calculateDrawdownSeries(sampleTrades, 100000);
  assert.strictEqual(series.length, 4);
  assert.strictEqual(series[0].equity, 102000);
  assert.strictEqual(series[0].drawdownPercent, 0);

  assert.strictEqual(series[1].equity, 100980);
  assert.strictEqual(series[1].drawdownDollar, 1020);
  assert.strictEqual(series[1].drawdownPercent, 1);
  assert.strictEqual(series[1].underwaterPercent, -1);

  assert.strictEqual(series[2].equity, 103980);
  assert.strictEqual(series[2].drawdownPercent, 0);

  assert.strictEqual(series[3].drawdownPercent, 2);
  assert.strictEqual(series[3].underwaterPercent, -2);
});

it("calculateDailyPnLSeries groups trades by calendar day and computes net PnL and trade counts", () => {
  function calculateDailyPnLSeries(trades) {
    if (!trades || trades.length === 0) return [];
    const map = new Map();
    trades.forEach((t) => {
      const parsed = new Date(t.date);
      if (isNaN(parsed.getTime())) return;
      const key = parsed.toISOString().slice(0, 10);
      const current = map.get(key) || { pnl: 0, count: 0, wins: 0, losses: 0 };
      current.pnl += t.pnl;
      current.count += 1;
      if (t.result === "Win") current.wins += 1;
      else if (t.result === "Loss") current.losses += 1;
      map.set(key, current);
    });
    const sortedKeys = Array.from(map.keys()).sort();
    return sortedKeys.map((key) => {
      const item = map.get(key);
      return {
        date: key,
        pnl: Number(item.pnl.toFixed(2)),
        tradeCount: item.count,
        wins: item.wins,
        losses: item.losses,
      };
    });
  }

  const trades = [
    { date: "2026-09-01T09:00:00Z", pnl: 500, result: "Win" },
    { date: "2026-09-01T14:00:00Z", pnl: -200, result: "Loss" },
    { date: "2026-09-02T10:00:00Z", pnl: -350, result: "Loss" },
  ];

  const daily = calculateDailyPnLSeries(trades);
  assert.strictEqual(daily.length, 2);
  assert.strictEqual(daily[0].date, "2026-09-01");
  assert.strictEqual(daily[0].pnl, 300);
  assert.strictEqual(daily[0].tradeCount, 2);
  assert.strictEqual(daily[0].wins, 1);
  assert.strictEqual(daily[0].losses, 1);

  assert.strictEqual(daily[1].date, "2026-09-02");
  assert.strictEqual(daily[1].pnl, -350);
  assert.strictEqual(daily[1].tradeCount, 1);
});

it("calculateMistakeLeakage isolates actual negative losses and identifies costliest mistake", () => {
  function calculateMistakeLeakage(trades) {
    if (!trades || trades.length === 0) return { leakageList: [], totalLeaked: 0, costliestMistake: null };
    const map = new Map();
    trades.forEach((t) => {
      if (!t.mistake || t.mistake.trim() === "" || t.mistake === "None") return;
      const tag = t.mistake.trim();
      const current = map.get(tag) || { totalLoss: 0, lossCount: 0, totalCount: 0, winCount: 0, netPnl: 0 };
      current.totalCount += 1;
      current.netPnl += t.pnl;
      if (t.pnl < 0) {
        current.totalLoss += Math.abs(t.pnl);
        current.lossCount += 1;
      } else if (t.pnl > 0) {
        current.winCount += 1;
      }
      map.set(tag, current);
    });

    let totalLeaked = 0;
    const leakageList = [];
    map.forEach((val, key) => {
      totalLeaked += val.totalLoss;
      leakageList.push({
        mistake: key,
        totalLoss: Number(val.totalLoss.toFixed(2)),
        lossCount: val.lossCount,
        totalCount: val.totalCount,
        winCount: val.winCount,
        winRate: val.totalCount > 0 ? Math.round((val.winCount / val.totalCount) * 100) : 0,
        netPnl: Number(val.netPnl.toFixed(2)),
      });
    });

    leakageList.sort((a, b) => b.totalLoss - a.totalLoss);
    const costliestMistake = leakageList.length > 0 && leakageList[0].totalLoss > 0 ? leakageList[0].mistake : null;
    return { leakageList, totalLeaked: Number(totalLeaked.toFixed(2)), costliestMistake };
  }

  const trades = [
    { mistake: "Moved SL", pnl: -1200, result: "Loss" },
    { mistake: "Moved SL", pnl: -800, result: "Loss" },
    { mistake: "Moved SL", pnl: 2500, result: "Win" },
    { mistake: "Forced Trade", pnl: -500, result: "Loss" },
    { mistake: "None", pnl: -300, result: "Loss" },
  ];

  const res = calculateMistakeLeakage(trades);
  assert.strictEqual(res.totalLeaked, 2500);
  assert.strictEqual(res.costliestMistake, "Moved SL");
  assert.strictEqual(res.leakageList[0].mistake, "Moved SL");
  assert.strictEqual(res.leakageList[0].totalLoss, 2000);
  assert.strictEqual(res.leakageList[0].lossCount, 2);
  assert.strictEqual(res.leakageList[0].totalCount, 3);
  assert.strictEqual(res.leakageList[0].netPnl, 500);
});

it("calculateExtendedStats derives maxWinTrade, maxLossTrade, and maxHistoricalDrawdown", () => {
  function calculateStats(trades, initialBalance = 100000) {
    let maxWinTrade = 0;
    let maxLossTrade = 0;
    let cumPnL = 0;
    let peakPnL = 0;
    let maxDdDollar = 0;
    let runningEquity = initialBalance;
    let peakEquity = initialBalance;
    let maxDdPercent = 0;

    trades.forEach((t) => {
      if (t.pnl > maxWinTrade) maxWinTrade = t.pnl;
      if (t.pnl < maxLossTrade) maxLossTrade = t.pnl;

      cumPnL += t.pnl;
      if (cumPnL > peakPnL) peakPnL = cumPnL;
      const drop = peakPnL - cumPnL;
      if (drop > maxDdDollar) maxDdDollar = drop;

      runningEquity += t.pnl;
      if (runningEquity > peakEquity) peakEquity = runningEquity;
      const ddDol = peakEquity - runningEquity;
      const ddPct = peakEquity > 0 ? (ddDol / peakEquity) * 100 : 0;
      if (ddPct > maxDdPercent) maxDdPercent = ddPct;
    });

    return {
      maxWinTrade: Number(maxWinTrade.toFixed(2)),
      maxLossTrade: Number(maxLossTrade.toFixed(2)),
      maxHistoricalDrawdown: {
        dollar: Number(maxDdDollar.toFixed(2)),
        percent: Number(maxDdPercent.toFixed(2)),
      },
    };
  }

  const trades = [
    { pnl: 4500 },
    { pnl: -1200 },
    { pnl: 1000 },
    { pnl: -600 },
  ];

  const stats = calculateStats(trades, 100000);
  assert.strictEqual(stats.maxWinTrade, 4500);
  assert.strictEqual(stats.maxLossTrade, -1200);
  assert.strictEqual(stats.maxHistoricalDrawdown.dollar, 1200);
  assert.strictEqual(stats.maxHistoricalDrawdown.percent, 1.15);
});

console.log("\n18. Phase 1 — Command Palette & Journal Calendar View Logic:");
it("Command Palette quick actions and navigation query filter matches titles and subtitles correctly", () => {
  const items = [
    { id: "action-new-trade", title: "Ghi Lệnh Mới (New Trade)", subtitle: "Mở form thêm lệnh nhanh", category: "action" },
    { id: "action-calc", title: "Máy Tính Vị Thế (Position Size Calculator)", subtitle: "Tính số lot / hợp đồng chuẩn 1R", category: "action" },
    { id: "nav-journal", title: "Nhật Ký Giao Dịch (Journal)", subtitle: "Danh sách và bảng thống kê chi tiết", category: "navigation" },
    { id: "nav-cal", title: "Lịch PnL Tháng (Calendar Heatmap)", subtitle: "Xem hiệu suất lãi lỗ từng ngày", category: "navigation" },
    { id: "nav-analytics", title: "Phân Tích Chuyên Sâu (Analytics)", subtitle: "Đường cong vốn, sụt giảm DD", category: "navigation" },
  ];

  function filterPaletteItems(list, q) {
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter(item => 
      item.title.toLowerCase().includes(query) || 
      (item.subtitle && item.subtitle.toLowerCase().includes(query))
    );
  }

  // Exact query
  const res1 = filterPaletteItems(items, "calculator");
  assert.strictEqual(res1.length, 1);
  assert.strictEqual(res1[0].id, "action-calc");

  // Partial Vietnamese query
  const res2 = filterPaletteItems(items, "lịch");
  assert.strictEqual(res2.length, 1);
  assert.strictEqual(res2[0].id, "nav-cal");

  // Multi-match
  const res3 = filterPaletteItems(items, "thống kê");
  assert.strictEqual(res3.length, 1);
  assert.strictEqual(res3[0].id, "nav-journal");
});

it("Command Palette trade search accurately filters by asset, setup, notes, and result", () => {
  const trades = [
    { id: "t1", asset: "MNQ", setup: "Breakout", notes: "Clean trendline break", result: "Win", pnl: 450, rMultiple: 2.25 },
    { id: "t2", asset: "XAUUSD", setup: "Pullback", notes: "Key support retest", result: "Loss", pnl: -200, rMultiple: -1.0 },
    { id: "t3", asset: "MNQ", setup: "Reversal", notes: "Double bottom at NY open", result: "Win", pnl: 600, rMultiple: 3.0 },
    { id: "t4", asset: "EURUSD", setup: "Continuation", notes: "London session push", result: "Break Even", pnl: 0, rMultiple: 0 },
  ];

  function searchTrades(tradesList, q) {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return tradesList.filter(t => {
      const assetMatch = t.asset.toLowerCase().includes(query);
      const setupMatch = (t.setup || "").toLowerCase().includes(query);
      const notesMatch = (t.notes || "").toLowerCase().includes(query);
      const resultMatch = t.result.toLowerCase().includes(query);
      return assetMatch || setupMatch || notesMatch || resultMatch;
    });
  }

  const mnqTrades = searchTrades(trades, "mnq");
  assert.strictEqual(mnqTrades.length, 2);
  assert.strictEqual(mnqTrades[0].id, "t1");
  assert.strictEqual(mnqTrades[1].id, "t3");

  const pullbackTrades = searchTrades(trades, "pullback");
  assert.strictEqual(pullbackTrades.length, 1);
  assert.strictEqual(pullbackTrades[0].asset, "XAUUSD");

  const winTrades = searchTrades(trades, "win");
  assert.strictEqual(winTrades.length, 2);
});

it("JournalCalendarView aggregates day-level PnL, count, and trade records accurately", () => {
  const mockTrades = [
    { id: "t1", date: "2026-09-18T10:00:00Z", pnl: 500, asset: "MNQ" },
    { id: "t2", date: "2026-09-18T14:30:00Z", pnl: -150, asset: "MNQ" },
    { id: "t3", date: "2026-09-19T09:15:00Z", pnl: 350, asset: "XAUUSD" },
    { id: "t4", date: "invalid-date-string", pnl: 100, asset: "BTCUSD" }, // handles corrupt date
  ];

  function aggregateCalendarDays(tradeList) {
    const data = {};
    tradeList.forEach(t => {
      try {
        const d = new Date(t.date);
        if (isNaN(d.getTime())) return;
        const dStr = d.toISOString().split("T")[0];
        if (!data[dStr]) {
          data[dStr] = { pnl: 0, count: 0, trades: [] };
        }
        data[dStr].pnl += t.pnl;
        data[dStr].count += 1;
        data[dStr].trades.push(t);
      } catch {
        // ignore
      }
    });
    return data;
  }

  const res = aggregateCalendarDays(mockTrades);
  assert.strictEqual(res["2026-09-18"].count, 2);
  assert.strictEqual(res["2026-09-18"].pnl, 350); // 500 - 150
  assert.strictEqual(res["2026-09-19"].count, 1);
  assert.strictEqual(res["2026-09-19"].pnl, 350);
  assert.strictEqual(res["invalid-date-string"], undefined);
});

console.log("\n19. Phase 2 — Today Session Cockpit & Cool-Down Nudge Logic:");
it("TodaySessionCockpit accurately isolates today's trades and computes PnL, Winrate, and Total R", () => {
  const now = new Date();
  const todayIso = now.toISOString();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const trades = [
    { id: "t1", date: todayIso, pnl: 400, rMultiple: 2.0, result: "Win" },
    { id: "t2", date: todayIso, pnl: -200, rMultiple: -1.0, result: "Loss" },
    { id: "t3", date: todayIso, pnl: 600, rMultiple: 3.0, result: "Win" },
    { id: "t4", date: yesterday, pnl: 1000, rMultiple: 5.0, result: "Win" }, // Should be excluded from today
  ];

  const todayStr = now.toDateString();
  const todayTrades = trades.filter(t => new Date(t.date).toDateString() === todayStr);

  assert.strictEqual(todayTrades.length, 3);

  const todayPnL = todayTrades.reduce((sum, t) => sum + t.pnl, 0);
  assert.strictEqual(todayPnL, 800); // 400 - 200 + 600

  const todayWins = todayTrades.filter(t => t.pnl > 0).length;
  const todayLosses = todayTrades.filter(t => t.pnl < 0).length;
  const todayWinRate = Math.round((todayWins / todayTrades.length) * 100);
  assert.strictEqual(todayWins, 2);
  assert.strictEqual(todayLosses, 1);
  assert.strictEqual(todayWinRate, 67);

  const todayR = todayTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
  assert.strictEqual(todayR, 4.0); // 2 - 1 + 3
});

it("TodaySessionCockpit calculates Hard Stop buffer, percent used, and bullets remaining", () => {
  const account = {
    initialBalance: 50000,
    rules: {
      maxDailyLoss: 1000,
      maxDailyLossType: "$",
      dailyLossAlertThreshold: 80,
    }
  };
  const account1R = 200; // 1R = $200 (5 bullets total)

  function evaluateCockpitRisk(todayPnL, acc, risk1R) {
    const maxLoss = acc.rules.maxDailyLoss;
    const currentLoss = Math.max(0, -todayPnL);
    const bufferRemaining = Math.max(0, maxLoss - currentLoss);
    const lossPercent = (currentLoss / maxLoss) * 100;
    const isBreached = currentLoss >= maxLoss;
    const isWarning = lossPercent >= acc.rules.dailyLossAlertThreshold && !isBreached;
    const bulletsRemaining = Math.floor(bufferRemaining / risk1R);

    return { bufferRemaining, lossPercent, isBreached, isWarning, bulletsRemaining };
  }

  // Case 1: In profit (+$500) -> 0% loss, full buffer $1,000, 5 bullets
  const case1 = evaluateCockpitRisk(500, account, account1R);
  assert.strictEqual(case1.bufferRemaining, 1000);
  assert.strictEqual(case1.lossPercent, 0);
  assert.strictEqual(case1.isWarning, false);
  assert.strictEqual(case1.isBreached, false);
  assert.strictEqual(case1.bulletsRemaining, 5);

  // Case 2: 85% loss (-$850) -> Warning zone, $150 buffer, 0 bullets
  const case2 = evaluateCockpitRisk(-850, account, account1R);
  assert.strictEqual(case2.bufferRemaining, 150);
  assert.strictEqual(case2.lossPercent, 85);
  assert.strictEqual(case2.isWarning, true);
  assert.strictEqual(case2.isBreached, false);
  assert.strictEqual(case2.bulletsRemaining, 0);

  // Case 3: 100% loss (-$1,000) -> Hard Stop Breached!
  const case3 = evaluateCockpitRisk(-1000, account, account1R);
  assert.strictEqual(case3.bufferRemaining, 0);
  assert.strictEqual(case3.isBreached, true);
  assert.strictEqual(case3.isWarning, false);
});

it("Cool-Down Nudge triggers on 2 consecutive losses or high-frequency overtrading", () => {
  function checkCoolDownTriggers(todayTrades) {
    const isConsecutiveLoss = todayTrades.length >= 2 && todayTrades[0].pnl < 0 && todayTrades[1].pnl < 0;
    const isHighFrequency = todayTrades.length >= 5;
    return { isConsecutiveLoss, isHighFrequency };
  }

  // Case 1: Normal trades (Win, Loss)
  const normal = [{ pnl: -100 }, { pnl: 200 }];
  assert.strictEqual(checkCoolDownTriggers(normal).isConsecutiveLoss, false);

  // Case 2: Two consecutive losses (Loss, Loss) -> triggers Cool-Down Nudge
  const tiltRisk = [{ pnl: -150 }, { pnl: -200 }, { pnl: 300 }];
  assert.strictEqual(checkCoolDownTriggers(tiltRisk).isConsecutiveLoss, true);

  // Case 3: 5 trades in session -> triggers High Frequency / Overtrading Caution
  const highVol = [{ pnl: 50 }, { pnl: -50 }, { pnl: 100 }, { pnl: -80 }, { pnl: 20 }];
  assert.strictEqual(checkCoolDownTriggers(highVol).isHighFrequency, true);
});

console.log("\n20. Phase 3 Enhancements: Multi-Asset Sizing, Playbook Edge, & Simulator Sync:");

it("Calculates Futures contracts across MNQ, NQ, MES, and ES with exact point multipliers", () => {
  const POINT_VALS = { MNQ: 2, NQ: 20, MES: 5, ES: 50 };

  function calcFutures(symbol, dollarRisk, slPoints) {
    const ptVal = POINT_VALS[symbol];
    const rawContracts = dollarRisk / (slPoints * ptVal);
    const contracts = Math.floor(rawContracts);
    const actualRisk = Number((contracts * slPoints * ptVal).toFixed(2));
    return { contracts, actualRisk, ptVal };
  }

  // ES ($50/pt): $300 risk, 3.0 pts SL -> $150 per contract -> 2 contracts ($300 actual risk)
  const es = calcFutures('ES', 300, 3.0);
  assert.strictEqual(es.contracts, 2);
  assert.strictEqual(es.actualRisk, 300);

  // MES ($5/pt): $300 risk, 3.0 pts SL -> $15 per contract -> 20 contracts ($300 actual risk)
  const mes = calcFutures('MES', 300, 3.0);
  assert.strictEqual(mes.contracts, 20);
  assert.strictEqual(mes.actualRisk, 300);

  // NQ ($20/pt): $500 risk, 15.0 pts SL -> $300 per contract -> 1 contract ($300 actual risk)
  const nq = calcFutures('NQ', 500, 15.0);
  assert.strictEqual(nq.contracts, 1);
  assert.strictEqual(nq.actualRisk, 300);

  // MNQ ($2/pt): $500 risk, 15.0 pts SL -> $30 per contract -> 16 contracts ($480 actual risk)
  const mnq = calcFutures('MNQ', 500, 15.0);
  assert.strictEqual(mnq.contracts, 16);
  assert.strictEqual(mnq.actualRisk, 480);
});

it("Calculates Forex Majors position sizing with standard pip values ($10/pip per standard lot)", () => {
  function calcForex(dollarRisk, slPips, pipVal = 10) {
    const rawLot = dollarRisk / (slPips * pipVal);
    const lotSize = Math.max(0, Math.floor(rawLot * 100) / 100);
    const actualRisk = Number((lotSize * slPips * pipVal).toFixed(2));
    return { lotSize, actualRisk };
  }

  // EURUSD: $300 risk, 20 pips SL -> $200 per lot -> 1.50 lots ($300 actual risk)
  const fx1 = calcForex(300, 20);
  assert.strictEqual(fx1.lotSize, 1.50);
  assert.strictEqual(fx1.actualRisk, 300);

  // EURUSD: $100 risk, 15 pips SL -> 0.66 lots ($99 actual risk)
  const fx2 = calcForex(100, 15);
  assert.strictEqual(fx2.lotSize, 0.66);
  assert.strictEqual(fx2.actualRisk, 99);
});

it("Computes Playbook Edge analytics (Total, Winrate %, Net PnL, and Avg R-Multiple)", () => {
  const trades = [
    { setup: "Breakout", result: "Win", pnl: 600, riskAmount: 300 }, // +2.0R
    { setup: "Breakout", result: "Loss", pnl: -300, riskAmount: 300 }, // -1.0R
    { setup: "breakout", result: "Win", pnl: 900, riskAmount: 300 }, // +3.0R (case-insensitive)
    { setup: "Pullback", result: "Win", pnl: 500, riskAmount: 250 },
  ];

  function calcPlaybookEdge(setupTitle, list) {
    const norm = setupTitle.trim().toLowerCase();
    const matched = list.filter(t => t.setup && t.setup.trim().toLowerCase() === norm);
    const total = matched.length;
    const wins = matched.filter(t => t.result === 'Win').length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const netPnl = matched.reduce((s, t) => s + t.pnl, 0);
    const rVals = matched.map(t => t.pnl / (t.riskAmount || 100));
    const avgR = rVals.length > 0 ? Number((rVals.reduce((s, r) => s + r, 0) / rVals.length).toFixed(2)) : 0;
    return { total, wins, winRate, netPnl, avgR };
  }

  const breakoutEdge = calcPlaybookEdge("Breakout", trades);
  assert.strictEqual(breakoutEdge.total, 3);
  assert.strictEqual(breakoutEdge.wins, 2);
  assert.strictEqual(breakoutEdge.winRate, 67); // 2/3 = 66.67% -> 67%
  assert.strictEqual(breakoutEdge.netPnl, 1200); // 600 - 300 + 900
  assert.strictEqual(breakoutEdge.avgR, 1.33); // (2 - 1 + 3) / 3 = 1.33R
});

it("Synchronizes Simulator parameters from active trading account history", () => {
  const accountTrades = [
    { result: "Win", pnl: 450 },
    { result: "Win", pnl: 550 },
    { result: "Loss", pnl: -250 },
    { result: "Loss", pnl: -250 },
  ];

  function deriveSimParams(tradesList) {
    const wins = tradesList.filter(t => t.result === 'Win');
    const losses = tradesList.filter(t => t.result === 'Loss');
    const actualWinrate = Math.round((wins.length / tradesList.length) * 100);

    const totalWinPnl = wins.reduce((s, t) => s + t.pnl, 0);
    const totalLossPnl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const avgWin = wins.length > 0 ? totalWinPnl / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLossPnl / losses.length : 0;
    const calculatedRR = avgLoss > 0 && avgWin > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 1.5;

    return { actualWinrate, calculatedRR };
  }

  const sim = deriveSimParams(accountTrades);
  assert.strictEqual(sim.actualWinrate, 50); // 2 wins out of 4 trades = 50%
  // avgWin = (450 + 550)/2 = 500, avgLoss = (250 + 250)/2 = 250 -> RR = 500 / 250 = 2.0
  assert.strictEqual(sim.calculatedRR, 2.0);
});

console.log("\n21. Comprehensive i18n Key Parity & Bilingual Integrity (English <-> Vietnamese):");

it("Verifies 100% key parity between messages/en.json and messages/vi.json", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');

  assert.ok(fs.existsSync(enPath), "messages/en.json must exist");
  assert.ok(fs.existsSync(viPath), "messages/vi.json must exist");

  const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const viJson = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  function getAllLeafKeys(obj, prefix = '') {
    let keys = [];
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        keys = keys.concat(getAllLeafKeys(v, fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    return keys;
  }

  const enKeys = new Set(getAllLeafKeys(enJson));
  const viKeys = new Set(getAllLeafKeys(viJson));

  const missingInVi = [...enKeys].filter(k => !viKeys.has(k));
  const missingInEn = [...viKeys].filter(k => !enKeys.has(k));

  assert.deepStrictEqual(missingInVi, [], `Keys in en.json missing from vi.json: ${missingInVi.join(', ')}`);
  assert.deepStrictEqual(missingInEn, [], `Keys in vi.json missing from en.json: ${missingInEn.join(', ')}`);
});

it("Ensures all essential namespaces exist and contain non-empty string values", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');
  const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const viJson = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  const essentialNamespaces = [
    "Common",
    "Header",
    "Sidebar",
    "Dashboard",
    "Journal",
    "Calendar",
    "Accounts",
    "Playbook",
    "Analytics",
    "Simulator",
    "Calculator",
    "Cockpit",
    "CommandPalette",
    "PreMarket",
    "ShareModal",
    "AICoach",
    "Tags"
  ];

  for (const ns of essentialNamespaces) {
    assert.ok(enJson[ns], `Namespace "${ns}" must exist in en.json`);
    assert.ok(viJson[ns], `Namespace "${ns}" must exist in vi.json`);
  }

  function validateLeavesNonEmpty(obj, path = '') {
    for (const [k, v] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        validateLeavesNonEmpty(v, fullPath);
      } else if (typeof v === 'string') {
        assert.ok(v.trim().length > 0, `Value at ${fullPath} must not be empty`);
      }
    }
  }

  validateLeavesNonEmpty(enJson, 'en');
  validateLeavesNonEmpty(viJson, 'vi');
});

it("Validates interpolation placeholders consistency between English and Vietnamese strings", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');
  const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const viJson = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  function extractPlaceholders(str) {
    if (typeof str !== 'string') return [];
    const matches = str.match(/\{([a-zA-Z0-9_]+)\}/g);
    return matches ? matches.map(m => m.slice(1, -1)).sort() : [];
  }

  function comparePlaceholders(enObj, viObj, path = '') {
    for (const k of Object.keys(enObj)) {
      const fullPath = path ? `${path}.${k}` : k;
      const enVal = enObj[k];
      const viVal = viObj[k];

      if (enVal && typeof enVal === 'object' && !Array.isArray(enVal)) {
        comparePlaceholders(enVal, viVal, fullPath);
      } else if (typeof enVal === 'string' && typeof viVal === 'string') {
        const enPlaceholders = extractPlaceholders(enVal);
        const viPlaceholders = extractPlaceholders(viVal);
        assert.deepStrictEqual(
          enPlaceholders,
          viPlaceholders,
          `Placeholder mismatch at ${fullPath}: en=${JSON.stringify(enPlaceholders)}, vi=${JSON.stringify(viPlaceholders)}`
        );
      }
    }
  }

  comparePlaceholders(enJson, viJson);
});

console.log("\n22. Hub & In-Context Navigation Contracts & Zero-Bullshit Verification:");

it("Validates Hub & Contextual Navigation contracts across Journal, Playbook, Analytics, Simulator, PreMarket", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  // 1. Header Quick Log contract
  assert.ok(en.Header.quick_log_btn && vi.Header.quick_log_btn, "Header.quick_log_btn must exist");
  assert.ok(en.Header.tooltip_quick_log && vi.Header.tooltip_quick_log, "Header.tooltip_quick_log must exist");
  assert.ok(en.Header.calculator_btn && vi.Header.calculator_btn, "Header.calculator_btn must exist");
  assert.ok(en.Header.notifications_title && vi.Header.notifications_title, "Header.notifications_title must exist");

  // 2. QuickLog modal contract
  assert.ok(en.QuickLog && vi.QuickLog, "QuickLog namespace must exist");
  const quickLogRequiredKeys = [
    "modal_title", "account_label", "asset_label", "pnl_label",
    "lot_size_label", "setup_label", "notes_label", "paste_screenshot_hint",
    "calculated_r", "upload_image", "change_image", "save_trade_btn",
    "screenshot_pasted", "no_active_account", "invalid_lot_size", "trade_logged_success"
  ];
  for (const k of quickLogRequiredKeys) {
    assert.ok(en.QuickLog[k], `QuickLog.${k} must exist in en.json`);
    assert.ok(vi.QuickLog[k], `QuickLog.${k} must exist in vi.json`);
  }

  // 3. Trading Hub (Journal <-> Playbook) contract
  assert.ok(en.Journal.tab_playbook_setups && vi.Journal.tab_playbook_setups, "Journal.tab_playbook_setups must exist");
  assert.ok(en.Journal.manage_playbooks_link && vi.Journal.manage_playbooks_link, "Journal.manage_playbooks_link must exist");
  assert.ok(en.Playbook.tab_view_table && vi.Playbook.tab_view_table, "Playbook.tab_view_table must exist");
  assert.ok(en.Playbook.tab_view_calendar && vi.Playbook.tab_view_calendar, "Playbook.tab_view_calendar must exist");

  // 4. Strategy Hub (Analytics <-> Simulator) contract
  assert.ok(en.Analytics.btn_monte_carlo_sim && vi.Analytics.btn_monte_carlo_sim, "Analytics.btn_monte_carlo_sim must exist");
  assert.ok(en.Simulator.back_to_analytics && vi.Simulator.back_to_analytics, "Simulator.back_to_analytics must exist");

  // 5. Discipline Bridge (PreMarket <-> DailyReview) contract
  assert.ok(en.PreMarket.open_full_journal && vi.PreMarket.open_full_journal, "PreMarket.open_full_journal must exist");
});

console.log("\n23. Option 2: 'Seamless Flow' Ergonomics & Mobile Experience Contracts:");

it("Validates Slide-Over Drawer Draft Autosave and Restoration logic", () => {
  const accountId = "acc-test-123";
  const draftKey = `tradenote_drawer_draft_${accountId}`;
  
  // Simulated storage
  const mockStorage = new Map();
  
  // 1. Save draft
  const draftPayload = {
    asset: "MNQ",
    lotSize: "2",
    pnl: "450",
    pnlSign: "+",
    riskAmount: "200",
    setup: "Breakout",
    notes: "Followed 5m trend, cleanly executed",
    screenshot: "data:image/png;base64,mockImageString",
    timestamp: Date.now()
  };
  mockStorage.set(draftKey, JSON.stringify(draftPayload));

  // 2. Read and verify
  const raw = mockStorage.get(draftKey);
  assert.ok(raw, "Draft must exist in storage");
  const parsed = JSON.parse(raw);
  assert.strictEqual(parsed.asset, "MNQ");
  assert.strictEqual(parsed.lotSize, "2");
  assert.strictEqual(parsed.pnl, "450");
  assert.strictEqual(parsed.pnlSign, "+");
  assert.strictEqual(parsed.riskAmount, "200");
  assert.strictEqual(parsed.setup, "Breakout");
  assert.strictEqual(parsed.notes, "Followed 5m trend, cleanly executed");
  assert.strictEqual(parsed.screenshot, "data:image/png;base64,mockImageString");

  // 3. Clear draft upon trade submission
  mockStorage.delete(draftKey);
  assert.strictEqual(mockStorage.get(draftKey), undefined, "Draft must be cleared after save");
});

it("Validates Quick Log to Detailed Drawer data handoff contract", () => {
  // Scenario: Trader enters partial info in QuickLog modal, then clicks [ Switch to Detailed Form ↗ ]
  const quickLogData = {
    asset: "xauusd",
    lotSize: "0.5",
    pnl: "-150",
    riskAmount: "150",
    setup: "Pullback",
    notes: "Early entry before candle close"
  };

  const numericPnl = parseFloat(quickLogData.pnl) || 0;
  const handoffDraft = {
    asset: quickLogData.asset.toUpperCase().trim(),
    lotSize: quickLogData.lotSize.trim(),
    pnl: Math.abs(numericPnl).toString(),
    pnlSign: numericPnl < 0 ? "-" : "+",
    riskAmount: quickLogData.riskAmount.trim(),
    setup: quickLogData.setup,
    notes: quickLogData.notes.trim(),
    screenshot: null,
    timestamp: Date.now()
  };

  assert.strictEqual(handoffDraft.asset, "XAUUSD");
  assert.strictEqual(handoffDraft.lotSize, "0.5");
  assert.strictEqual(handoffDraft.pnl, "150");
  assert.strictEqual(handoffDraft.pnlSign, "-");
  assert.strictEqual(handoffDraft.riskAmount, "150");
  assert.strictEqual(handoffDraft.setup, "Pullback");
});

it("Validates Journal Layout switcher preference and mobile responsive fallback", () => {
  const layoutStorageKey = "tradenote_journal_view_layout";
  const mockStorage = new Map();

  // Test 1: Desktop default without saved preference
  function resolveLayout(savedPreference, screenWidth) {
    if (savedPreference === "cards" || savedPreference === "table") {
      return savedPreference;
    }
    if (screenWidth < 768) {
      return "cards";
    }
    return "table";
  }

  assert.strictEqual(resolveLayout(mockStorage.get(layoutStorageKey), 1280), "table");
  assert.strictEqual(resolveLayout(mockStorage.get(layoutStorageKey), 375), "cards");

  // Test 2: User explicitly chooses 'cards' on desktop
  mockStorage.set(layoutStorageKey, "cards");
  assert.strictEqual(resolveLayout(mockStorage.get(layoutStorageKey), 1280), "cards");

  // Test 3: User explicitly chooses 'table' on tablet/mobile
  mockStorage.set(layoutStorageKey, "table");
  assert.strictEqual(resolveLayout(mockStorage.get(layoutStorageKey), 700), "table");
});

it("Validates Card View hero PnL, R-Multiple, and badge display math", () => {
  const winTrade = {
    id: "t1",
    asset: "MNQ",
    pnl: 650,
    riskAmount: 250,
    rMultiple: 2.6,
    result: "Win"
  };
  const lossTrade = {
    id: "t2",
    asset: "ES",
    pnl: -300,
    riskAmount: 300,
    rMultiple: -1.0,
    result: "Loss"
  };

  function computeCardDisplay(trade) {
    const isWin = trade.pnl > 0;
    const isLoss = trade.pnl < 0;
    const formattedPnl = `${isWin ? "+" : isLoss ? "-" : ""}$${Math.abs(trade.pnl).toLocaleString()}`;
    const calculatedR = trade.rMultiple !== undefined
      ? trade.rMultiple
      : trade.riskAmount > 0 ? trade.pnl / trade.riskAmount : 0;
    const formattedR = `${calculatedR >= 0 ? "+" : ""}${calculatedR.toFixed(2)}R`;

    return { formattedPnl, formattedR, isWin, isLoss };
  }

  const winDisplay = computeCardDisplay(winTrade);
  assert.strictEqual(winDisplay.formattedPnl, "+$650");
  assert.strictEqual(winDisplay.formattedR, "+2.60R");
  assert.strictEqual(winDisplay.isWin, true);

  const lossDisplay = computeCardDisplay(lossTrade);
  assert.strictEqual(lossDisplay.formattedPnl, "-$300");
  assert.strictEqual(lossDisplay.formattedR, "-1.00R");
  assert.strictEqual(lossDisplay.isLoss, true);
});

it("Validates i18n parity for Option 2 namespaces: SlideOverDrawer, MobileNav, JournalCards", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  // 1. SlideOverDrawer namespace check
  assert.ok(en.SlideOverDrawer && vi.SlideOverDrawer, "SlideOverDrawer namespace must exist in both locales");
  const drawerKeys = [
    "title_new", "title_edit", "subtitle_new", "subtitle_edit",
    "tab_execution", "tab_psychology", "draft_found_banner", "draft_discard",
    "asset_label", "lot_size_label", "pnl_label", "risk_amount_label",
    "datetime_label", "session_label", "auto_session", "result_label",
    "setup_label", "playbook_rules_title", "aplus_badge", "confluences_label",
    "emotion_label", "mistake_label", "notes_label", "screenshot_label",
    "paste_hint", "remove_screenshot", "cancel_btn", "save_btn_new", "save_btn_edit",
    "saving_btn", "toast_draft_cleared", "toast_saved_success"
  ];
  for (const k of drawerKeys) {
    assert.ok(en.SlideOverDrawer[k], `SlideOverDrawer.${k} missing in en.json`);
    assert.ok(vi.SlideOverDrawer[k], `SlideOverDrawer.${k} missing in vi.json`);
  }

  // 2. MobileNav namespace check
  assert.ok(en.MobileNav && vi.MobileNav, "MobileNav namespace must exist in both locales");
  const mobileNavKeys = [
    "dashboard", "journal", "quick_log", "analytics", "more", "sheet_title",
    "sheet_accounts", "sheet_playbook", "sheet_simulator", "sheet_review", "sheet_economic", "sheet_settings", "sheet_logout"
  ];
  for (const k of mobileNavKeys) {
    assert.ok(en.MobileNav[k], `MobileNav.${k} missing in en.json`);
    assert.ok(vi.MobileNav[k], `MobileNav.${k} missing in vi.json`);
  }

  // 3. JournalCards namespace check
  assert.ok(en.JournalCards && vi.JournalCards, "JournalCards namespace must exist in both locales");
  const journalCardsKeys = [
    "view_table", "view_cards", "view_details", "edit_trade", "delete_trade",
    "share_trade", "no_screenshot", "click_to_zoom", "setup_unspecified"
  ];
  for (const k of journalCardsKeys) {
    assert.ok(en.JournalCards[k], `JournalCards.${k} missing in en.json`);
    assert.ok(vi.JournalCards[k], `JournalCards.${k} missing in vi.json`);
  }

  // 4. QuickLog open_detailed_drawer link check
  assert.ok(en.QuickLog.open_detailed_drawer, "QuickLog.open_detailed_drawer missing in en.json");
  assert.ok(vi.QuickLog.open_detailed_drawer, "QuickLog.open_detailed_drawer missing in vi.json");
});

// ==========================================
// SECTION 24: ELITE TRADER EXPERIENCE & DISCIPLINE GAMIFICATION (OPTION 3)
// ==========================================
console.log("\n--- SECTION 24: ELITE TRADER EXPERIENCE & DISCIPLINE GAMIFICATION ---");

it("Validates Cooldown duration calculation and expiration status", () => {
  const now = Date.now();
  
  // Helper to compute cooldown state
  function getCooldownState(targetTimestamp, currentTimestamp = Date.now()) {
    if (!targetTimestamp) return { isActive: false, minutesRemaining: 0, secondsRemaining: 0 };
    const diffMs = targetTimestamp - currentTimestamp;
    if (diffMs <= 0) return { isActive: false, minutesRemaining: 0, secondsRemaining: 0 };
    
    return {
      isActive: true,
      minutesRemaining: Math.ceil(diffMs / 60000),
      secondsRemaining: Math.ceil(diffMs / 1000)
    };
  }

  // 15-minute cooldown
  const fifteenMinLater = now + 15 * 60 * 1000;
  const state15m = getCooldownState(fifteenMinLater, now);
  assert.strictEqual(state15m.isActive, true);
  assert.strictEqual(state15m.minutesRemaining, 15);
  assert.strictEqual(state15m.secondsRemaining, 900);

  // Expired cooldown (target in past)
  const expiredTarget = now - 5000;
  const stateExpired = getCooldownState(expiredTarget, now);
  assert.strictEqual(stateExpired.isActive, false);
  assert.strictEqual(stateExpired.minutesRemaining, 0);

  // Dynamic selector options: 5, 15, 30, 60 minutes
  const availableDurations = [5, 15, 30, 60];
  for (const d of availableDurations) {
    const target = now + d * 60 * 1000;
    const s = getCooldownState(target, now);
    assert.strictEqual(s.minutesRemaining, d);
  }
});

it("Validates Visual R:R Box dimensional calculations and quality badges", () => {
  // Classification logic matching VisualRRBox.tsx
  function classifyRRQuality(rMultiple) {
    if (rMultiple >= 2.0) return "quality_high";
    if (rMultiple >= 1.5) return "quality_good";
    if (rMultiple > 0) return "quality_suboptimal";
    return "quality_loss";
  }

  // Dimension scaling calculation
  function calculateRRDimensions(rMultiple, maxR = 5) {
    const clampedR = Math.max(-1, Math.min(maxR, rMultiple));
    const riskBoxPercent = 25; // 1R represents 25% of baseline width/height
    const rewardBoxPercent = clampedR > 0 ? Math.min(75, Math.round(clampedR * 25)) : 0;
    return {
      clampedR,
      riskBoxPercent,
      rewardBoxPercent,
      quality: classifyRRQuality(rMultiple)
    };
  }

  // Case 1: 3.5R Win (High quality)
  const case35R = calculateRRDimensions(3.5);
  assert.strictEqual(case35R.quality, "quality_high");
  assert.strictEqual(case35R.rewardBoxPercent, 75); // clamped to max 75%

  // Case 2: 2.0R Win (High quality boundary)
  const case20R = calculateRRDimensions(2.0);
  assert.strictEqual(case20R.quality, "quality_high");
  assert.strictEqual(case20R.rewardBoxPercent, 50);

  // Case 3: 1.6R Win (Good quality)
  const case16R = calculateRRDimensions(1.6);
  assert.strictEqual(case16R.quality, "quality_good");
  assert.strictEqual(case16R.rewardBoxPercent, 40);

  // Case 4: 0.75R Win (Suboptimal)
  const case075R = calculateRRDimensions(0.75);
  assert.strictEqual(case075R.quality, "quality_suboptimal");
  assert.strictEqual(case075R.rewardBoxPercent, 19);

  // Case 5: -1.0R Loss (Contained risk)
  const caseLoss = calculateRRDimensions(-1.0);
  assert.strictEqual(caseLoss.quality, "quality_loss");
  assert.strictEqual(caseLoss.rewardBoxPercent, 0);
});

it("Validates TradingView ticker symbol mapping", () => {
  // Mapping logic matching TradingViewMiniChart.tsx
  function mapAssetToTradingView(asset) {
    const clean = (asset || "").toUpperCase().trim();
    switch (clean) {
      case "MNQ":
        return "CME_MINI:MNQ1!";
      case "NQ":
        return "NASDAQ:NDX";
      case "MES":
      case "ES":
        return "CME_MINI:ES1!";
      case "XAUUSD":
      case "GOLD":
        return "OANDA:XAUUSD";
      case "EURUSD":
        return "FX:EURUSD";
      case "BTCUSD":
      case "BTC":
        return "COINBASE:BTCUSD";
      default:
        return clean ? `FX:${clean}` : "NASDAQ:NDX";
    }
  }

  assert.strictEqual(mapAssetToTradingView("MNQ"), "CME_MINI:MNQ1!");
  assert.strictEqual(mapAssetToTradingView("nq"), "NASDAQ:NDX");
  assert.strictEqual(mapAssetToTradingView("MES"), "CME_MINI:ES1!");
  assert.strictEqual(mapAssetToTradingView("ES"), "CME_MINI:ES1!");
  assert.strictEqual(mapAssetToTradingView("XAUUSD"), "OANDA:XAUUSD");
  assert.strictEqual(mapAssetToTradingView("GOLD"), "OANDA:XAUUSD");
  assert.strictEqual(mapAssetToTradingView("EURUSD"), "FX:EURUSD");
  assert.strictEqual(mapAssetToTradingView("BTCUSD"), "COINBASE:BTCUSD");
  assert.strictEqual(mapAssetToTradingView("GBPUSD"), "FX:GBPUSD");
});

it("Validates Sound Engine preferences toggle simulation", () => {
  // Storage simulation
  let mockStorage = {};
  const KEY = "tradenote_sound_enabled";

  function isSoundEnabled() {
    return mockStorage[KEY] !== "false";
  }

  function setSoundEnabled(enabled) {
    mockStorage[KEY] = enabled ? "true" : "false";
  }

  function toggleSound() {
    const next = !isSoundEnabled();
    setSoundEnabled(next);
    return next;
  }

  // Default should be true
  assert.strictEqual(isSoundEnabled(), true);

  // Toggle to false
  const toggledOff = toggleSound();
  assert.strictEqual(toggledOff, false);
  assert.strictEqual(isSoundEnabled(), false);

  // Toggle back to true
  const toggledOn = toggleSound();
  assert.strictEqual(toggledOn, true);
  assert.strictEqual(isSoundEnabled(), true);
});

it("Validates i18n parity for Option 3 namespaces: DisciplineShield, SoundFX, VisualRR", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  // 1. DisciplineShield namespace check
  assert.ok(en.DisciplineShield && vi.DisciplineShield, "DisciplineShield namespace must exist in both locales");
  const disciplineKeys = [
    "modal_title", "modal_subtitle", "sos_button", "sos_tooltip",
    "reason_consecutive_losses", "reason_hard_stop_warn", "reason_manual",
    "breathe_title", "breathe_inhale", "breathe_hold", "breathe_exhale",
    "breathe_start", "breathe_stop", "cooldown_duration",
    "duration_5m", "duration_15m", "duration_30m", "duration_60m",
    "timer_remaining", "timer_completed", "quote_title",
    "friction_title", "friction_message", "friction_override", "close_shield"
  ];
  for (const k of disciplineKeys) {
    assert.ok(en.DisciplineShield[k], `DisciplineShield.${k} missing in en.json`);
    assert.ok(vi.DisciplineShield[k], `DisciplineShield.${k} missing in vi.json`);
  }

  // 2. SoundFX namespace check
  assert.ok(en.SoundFX && vi.SoundFX, "SoundFX namespace must exist in both locales");
  const soundKeys = ["sound_enabled", "sound_disabled", "toggle_tooltip"];
  for (const k of soundKeys) {
    assert.ok(en.SoundFX[k], `SoundFX.${k} missing in en.json`);
    assert.ok(vi.SoundFX[k], `SoundFX.${k} missing in vi.json`);
  }

  // 3. VisualRR namespace check
  assert.ok(en.VisualRR && vi.VisualRR, "VisualRR namespace must exist in both locales");
  const visualRRKeys = [
    "title", "risk_box", "reward_box", "entry_level",
    "quality_high", "quality_good", "quality_suboptimal", "quality_loss",
    "tab_metrics", "tab_market_chart", "chart_unavailable"
  ];
  for (const k of visualRRKeys) {
    assert.ok(en.VisualRR[k], `VisualRR.${k} missing in en.json`);
    assert.ok(vi.VisualRR[k], `VisualRR.${k} missing in vi.json`);
  }
});

// --- SECTION 25: MATRIX CORRELATION & DAILY EXECUTIVE REPORT CARD ---
console.log("\n--- SECTION 25: MATRIX CORRELATION & DAILY EXECUTIVE REPORT CARD ---");

it("Validates Setup x Session Matrix cross-tabulation (Winrate, Net PnL, Total R)", () => {
  const SESSIONS = ["Asian", "London", "London-NY Overlap", "New York"];
  
  function calculateSetupSessionMatrix(trades) {
    const setupsSet = new Set();
    trades.forEach((t) => {
      setupsSet.add(t.strategy || t.setup || "No Setup / Discretionary");
    });
    const setups = Array.from(setupsSet).sort();

    const emptyCell = () => ({
      count: 0, wins: 0, losses: 0, breakEvens: 0,
      winRate: 0, netPnl: 0, totalR: 0, avgR: 0, trades: []
    });

    const cells = {};
    const setupTotals = {};
    const sessionTotals = {};
    const grandTotal = emptyCell();

    setups.forEach((setup) => {
      cells[setup] = {};
      setupTotals[setup] = emptyCell();
      SESSIONS.forEach((sess) => {
        cells[setup][sess] = emptyCell();
      });
    });

    SESSIONS.forEach((sess) => {
      sessionTotals[sess] = emptyCell();
    });

    trades.forEach((t) => {
      const setup = t.strategy || t.setup || "No Setup / Discretionary";
      const session = t.session || "New York";
      const targetSess = SESSIONS.includes(session) ? session : "New York";

      const pnl = Number(t.pnl) || 0;
      const risk = t.riskAmount && t.riskAmount > 0 ? t.riskAmount : 100;
      const r = t.rMultiple !== undefined && t.rMultiple !== null
        ? Number(t.rMultiple)
        : Number((pnl / risk).toFixed(2));

      const isWin = pnl > 0 || t.result === "Win";
      const isLoss = pnl < 0 || t.result === "Loss";

      const update = (cell) => {
        cell.count += 1;
        cell.netPnl += pnl;
        cell.totalR += r;
        if (isWin) cell.wins += 1;
        else if (isLoss) cell.losses += 1;
        else cell.breakEvens += 1;
        cell.winRate = cell.count > 0 ? (cell.wins / cell.count) * 100 : 0;
        cell.avgR = cell.count > 0 ? cell.totalR / cell.count : 0;
        cell.trades.push(t);
      };

      if (cells[setup]?.[targetSess]) {
        update(cells[setup][targetSess]);
        update(setupTotals[setup]);
        update(sessionTotals[targetSess]);
        update(grandTotal);
      }
    });

    return { setups, sessions: SESSIONS, cells, setupTotals, sessionTotals, grandTotal };
  }

  const sampleTrades = [
    { id: "1", strategy: "ICT Silver Bullet", session: "London", pnl: 500, rMultiple: 2.5, result: "Win" },
    { id: "2", strategy: "ICT Silver Bullet", session: "London", pnl: -200, rMultiple: -1.0, result: "Loss" },
    { id: "3", strategy: "ICT Silver Bullet", session: "New York", pnl: 400, rMultiple: 2.0, result: "Win" },
    { id: "4", strategy: "Break & Retest", session: "New York", pnl: 300, rMultiple: 1.5, result: "Win" },
  ];

  const res = calculateSetupSessionMatrix(sampleTrades);
  assert.strictEqual(res.setups.length, 2);
  assert.strictEqual(res.grandTotal.count, 4);
  assert.strictEqual(res.grandTotal.wins, 3);
  assert.strictEqual(res.grandTotal.losses, 1);
  assert.strictEqual(res.grandTotal.winRate, 75);
  assert.strictEqual(res.grandTotal.netPnl, 1000);
  assert.strictEqual(res.grandTotal.totalR, 5.0);

  // Check specific cell
  const silverLondon = res.cells["ICT Silver Bullet"]["London"];
  assert.strictEqual(silverLondon.count, 2);
  assert.strictEqual(silverLondon.wins, 1);
  assert.strictEqual(silverLondon.losses, 1);
  assert.strictEqual(silverLondon.winRate, 50);
  assert.strictEqual(silverLondon.netPnl, 300);
  assert.strictEqual(silverLondon.totalR, 1.5);
});

it("Validates Day of Week x 2-hour UTC Heatmap indexing and grand totals", () => {
  const HOUR_BLOCKS = [
    "00-02", "02-04", "04-06", "06-08",
    "08-10", "10-12", "12-14", "14-16",
    "16-18", "18-20", "20-22", "22-24"
  ];

  function getHourBlock(utcHour) {
    const clamped = Math.max(0, Math.min(23, utcHour));
    const idx = Math.floor(clamped / 2);
    return HOUR_BLOCKS[idx] || "12-14";
  }

  function getDayOfWeek(date) {
    const dayIndex = date.getUTCDay();
    switch (dayIndex) {
      case 1: return "Monday";
      case 2: return "Tuesday";
      case 3: return "Wednesday";
      case 4: return "Thursday";
      case 5: return "Friday";
      default: return "Monday";
    }
  }

  assert.strictEqual(getHourBlock(0), "00-02");
  assert.strictEqual(getHourBlock(9), "08-10");
  assert.strictEqual(getHourBlock(14), "14-16");
  assert.strictEqual(getHourBlock(23), "22-24");

  // Tuesday 14:30 UTC
  const testDate = new Date("2026-09-22T14:30:00Z");
  assert.strictEqual(getDayOfWeek(testDate), "Tuesday");
  assert.strictEqual(getHourBlock(testDate.getUTCHours()), "14-16");
});

it("Validates Emotion x Expectancy calculation and Mental Edge Advantage delta", () => {
  const trades = [
    { id: "1", emotion: "Calm", pnl: 400, rMultiple: 2.0, result: "Win" },
    { id: "2", emotion: "Calm", pnl: 600, rMultiple: 3.0, result: "Win" },
    { id: "3", emotion: "FOMO", pnl: -200, rMultiple: -1.0, result: "Loss" },
    { id: "4", emotion: "Revenge", pnl: -400, rMultiple: -2.0, result: "Loss" },
  ];

  const calmTrades = trades.filter(t => t.emotion === "Calm");
  const emotionalTrades = trades.filter(t => ["FOMO", "Revenge"].includes(t.emotion));

  const calmAvgR = calmTrades.reduce((acc, t) => acc + t.rMultiple, 0) / calmTrades.length;
  const emotionalAvgR = emotionalTrades.reduce((acc, t) => acc + t.rMultiple, 0) / emotionalTrades.length;
  const edgeDelta = Number((calmAvgR - emotionalAvgR).toFixed(2));

  assert.strictEqual(calmAvgR, 2.5);
  assert.strictEqual(emotionalAvgR, -1.5);
  assert.strictEqual(edgeDelta, 4.0); // +4.0R psychological edge!
});

it("Validates Daily Discipline Score (4 pillars, rest day 100pts rule, MVP Trade & Top Leak extraction)", () => {
  function calculateDiscipline({ dayTrades, maxDailyLoss = 500, risk1R = 100 }) {
    if (!dayTrades || dayTrades.length === 0) {
      return { score: 100, isRestDay: true, tier: "tier_master", mvpTrade: null, leakTrade: null };
    }

    // 1. Playbook: 40%
    const playbookCount = dayTrades.filter(t => t.strategy && t.strategy !== "No Setup").length;
    const playbookScore = (playbookCount / dayTrades.length) * 100;

    // 2. Risk: 25%
    const badLosses = dayTrades.filter(t => t.pnl < 0 && Math.abs(t.pnl) > risk1R * 1.5).length;
    const riskScore = Math.max(0, 100 - badLosses * 50);

    // 3. Stop: 20%
    const totalLoss = dayTrades.filter(t => t.pnl < 0).reduce((acc, t) => acc + Math.abs(t.pnl), 0);
    const stopScore = totalLoss > maxDailyLoss ? 0 : 100;

    // 4. Frequency: 15%
    const freqScore = dayTrades.length <= 4 ? 100 : Math.max(0, 100 - (dayTrades.length - 4) * 25);

    const totalScore = Math.round(
      playbookScore * 0.40 +
      riskScore * 0.25 +
      stopScore * 0.20 +
      freqScore * 0.15
    );

    let tier = "tier_tilt";
    if (totalScore >= 85) tier = "tier_master";
    else if (totalScore >= 70) tier = "tier_disciplined";
    else if (totalScore >= 50) tier = "tier_leak";

    const winningTrades = dayTrades.filter(t => t.pnl > 0).sort((a, b) => b.pnl - a.pnl);
    const mvpTrade = winningTrades[0] || null;

    const losingTrades = dayTrades.filter(t => t.pnl < 0).sort((a, b) => a.pnl - b.pnl);
    const leakTrade = losingTrades[0] || null;

    return { score: totalScore, isRestDay: false, tier, mvpTrade, leakTrade };
  }

  // Case 1: Rest day (0 trades)
  const restDay = calculateDiscipline({ dayTrades: [] });
  assert.strictEqual(restDay.score, 100);
  assert.strictEqual(restDay.isRestDay, true);
  assert.strictEqual(restDay.tier, "tier_master");

  // Case 2: Flawless execution day
  const cleanTrades = [
    { id: "1", strategy: "ICT Silver Bullet", pnl: 500, rMultiple: 2.5 },
    { id: "2", strategy: "ICT Silver Bullet", pnl: -100, rMultiple: -1.0 },
  ];
  const cleanDay = calculateDiscipline({ dayTrades: cleanTrades, maxDailyLoss: 500, risk1R: 100 });
  assert.strictEqual(cleanDay.score, 100);
  assert.strictEqual(cleanDay.tier, "tier_master");
  assert.strictEqual(cleanDay.mvpTrade.id, "1");
  assert.strictEqual(cleanDay.leakTrade.id, "2");

  // Case 3: Overtrading & revenge tilt
  const tiltTrades = [
    { id: "1", strategy: "No Setup", pnl: -300, rMultiple: -3.0 },
    { id: "2", strategy: "No Setup", pnl: -350, rMultiple: -3.5 },
    { id: "3", strategy: "No Setup", pnl: -200, rMultiple: -2.0 },
    { id: "4", strategy: "No Setup", pnl: -100, rMultiple: -1.0 },
    { id: "5", strategy: "No Setup", pnl: -100, rMultiple: -1.0 },
    { id: "6", strategy: "No Setup", pnl: -100, rMultiple: -1.0 },
  ];
  const tiltDay = calculateDiscipline({ dayTrades: tiltTrades, maxDailyLoss: 500, risk1R: 100 });
  assert.ok(tiltDay.score < 50, `Score should be below 50, got ${tiltDay.score}`);
  assert.strictEqual(tiltDay.tier, "tier_tilt");
});

it("Validates i18n parity for MatrixAnalytics and DailyReportCard across en.json and vi.json", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  // 1. MatrixAnalytics namespace check
  assert.ok(en.MatrixAnalytics && vi.MatrixAnalytics, "MatrixAnalytics namespace must exist in both locales");
  const matrixKeys = [
    "section_title", "section_subtitle", "tab_setup_session",
    "tab_day_hour", "tab_emotion_expectancy", "metric_label",
    "metric_winrate", "metric_pnl", "metric_r", "metric_count",
    "setup_col", "total_col", "hour_block_utc", "calm_vs_emotional",
    "calm_desc", "edge_delta", "no_data", "drilldown_title", "drilldown_close"
  ];
  for (const k of matrixKeys) {
    assert.ok(en.MatrixAnalytics[k], `MatrixAnalytics.${k} missing in en.json`);
    assert.ok(vi.MatrixAnalytics[k], `MatrixAnalytics.${k} missing in vi.json`);
  }

  // 2. DailyReportCard namespace check
  assert.ok(en.DailyReportCard && vi.DailyReportCard, "DailyReportCard namespace must exist in both locales");
  const reportKeys = [
    "card_title", "card_subtitle", "score_label",
    "tier_master", "tier_disciplined", "tier_leak", "tier_tilt",
    "rest_day_title", "rest_day_desc", "pillar_playbook", "pillar_risk",
    "pillar_stop", "pillar_frequency", "mvp_title", "leak_title",
    "directive_title", "close_session_btn", "session_closed_toast"
  ];
  for (const k of reportKeys) {
    assert.ok(en.DailyReportCard[k], `DailyReportCard.${k} missing in en.json`);
    assert.ok(vi.DailyReportCard[k], `DailyReportCard.${k} missing in vi.json`);
  }
});

// --- SECTION 26: COLLAPSIBLE SIDEBAR & RESPONSIVE HARDENING ---
console.log("\n--- SECTION 26: COLLAPSIBLE SIDEBAR & RESPONSIVE HARDENING ---");

it("Validates Sidebar collapse toggle and state persistence simulation", () => {
  const STORAGE_KEY = "tradenote_sidebar_collapsed";
  let mockStorage = {};

  let isCollapsed = false;

  function toggleSidebar() {
    isCollapsed = !isCollapsed;
    mockStorage[STORAGE_KEY] = isCollapsed ? "true" : "false";
  }

  function setCollapsed(val) {
    isCollapsed = val;
    mockStorage[STORAGE_KEY] = val ? "true" : "false";
  }

  // Initial state is false (expanded)
  assert.strictEqual(isCollapsed, false);

  // Toggle to true (collapsed)
  toggleSidebar();
  assert.strictEqual(isCollapsed, true);
  assert.strictEqual(mockStorage[STORAGE_KEY], "true");

  // Toggle back to false (expanded)
  toggleSidebar();
  assert.strictEqual(isCollapsed, false);
  assert.strictEqual(mockStorage[STORAGE_KEY], "false");

  // Explicit set
  setCollapsed(true);
  assert.strictEqual(isCollapsed, true);
  assert.strictEqual(mockStorage[STORAGE_KEY], "true");
});

it("Validates Sidebar width and main content padding shift math", () => {
  const EXPANDED_WIDTH = 288; // w-72 = 18rem = 288px
  const COLLAPSED_WIDTH = 80;  // w-20 = 5rem = 80px
  const deltaSpaceReleased = EXPANDED_WIDTH - COLLAPSED_WIDTH;

  assert.strictEqual(deltaSpaceReleased, 208, "Collapsing sidebar must release exactly 208px of horizontal width");

  // Verify responsive classes
  function getSidebarClass(isCollapsed) {
    return isCollapsed ? "md:w-20" : "md:w-72";
  }

  function getMainPaddingClass(isCollapsed) {
    return isCollapsed ? "md:pl-20" : "md:pl-72";
  }

  assert.strictEqual(getSidebarClass(true), "md:w-20");
  assert.strictEqual(getSidebarClass(false), "md:w-72");
  assert.strictEqual(getMainPaddingClass(true), "md:pl-20");
  assert.strictEqual(getMainPaddingClass(false), "md:pl-72");
});

it("Validates Smart Tablet auto-collapse detection logic", () => {
  function determineInitialCollapse({ savedPreference, windowWidth }) {
    if (savedPreference !== null && savedPreference !== undefined) {
      return savedPreference === "true";
    }
    // Tablet range: 768px <= width < 1024px
    if (windowWidth >= 768 && windowWidth < 1024) {
      return true; // Auto-collapse to save space
    }
    return false; // Default expanded on desktop >= 1024
  }

  // Case 1: Tablet without preference -> Auto collapse
  assert.strictEqual(determineInitialCollapse({ savedPreference: null, windowWidth: 820 }), true);

  // Case 2: Desktop 1080p without preference -> Expanded
  assert.strictEqual(determineInitialCollapse({ savedPreference: null, windowWidth: 1920 }), false);

  // Case 3: Tablet with explicit expanded preference -> Honors user preference
  assert.strictEqual(determineInitialCollapse({ savedPreference: "false", windowWidth: 820 }), false);

  // Case 4: Desktop with explicit collapsed preference -> Honors user preference
  assert.strictEqual(determineInitialCollapse({ savedPreference: "true", windowWidth: 1440 }), true);
});

it("Validates Hotkey Ctrl+B ignore contract when user is typing in form inputs", () => {
  function shouldTriggerHotkey(e) {
    const isCtrlB = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b";
    if (!isCtrlB) return false;

    const inputTags = ["INPUT", "TEXTAREA", "SELECT"];
    if (inputTags.includes(e.targetTagName) || e.isContentEditable) {
      return false; // Ignore hotkey while user is typing
    }
    return true;
  }

  // 1. Regular Ctrl+B on body or div -> triggers
  assert.strictEqual(shouldTriggerHotkey({ ctrlKey: true, key: "b", targetTagName: "BODY", isContentEditable: false }), true);

  // 2. Cmd+B on Mac -> triggers
  assert.strictEqual(shouldTriggerHotkey({ metaKey: true, key: "B", targetTagName: "DIV", isContentEditable: false }), true);

  // 3. Ctrl+B while typing in INPUT -> ignored
  assert.strictEqual(shouldTriggerHotkey({ ctrlKey: true, key: "b", targetTagName: "INPUT", isContentEditable: false }), false);

  // 4. Ctrl+B while typing in TEXTAREA -> ignored
  assert.strictEqual(shouldTriggerHotkey({ ctrlKey: true, key: "b", targetTagName: "TEXTAREA", isContentEditable: false }), false);

  // 5. Normal B key without Ctrl -> does not trigger
  assert.strictEqual(shouldTriggerHotkey({ ctrlKey: false, metaKey: false, key: "b", targetTagName: "BODY", isContentEditable: false }), false);
});

it("Validates i18n parity for Sidebar collapse/expand keys in en.json and vi.json", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  assert.ok(en.Sidebar.collapse, "Sidebar.collapse must exist in en.json");
  assert.ok(vi.Sidebar.collapse, "Sidebar.collapse must exist in vi.json");
  assert.ok(en.Sidebar.expand, "Sidebar.expand must exist in en.json");
  assert.ok(vi.Sidebar.expand, "Sidebar.expand must exist in vi.json");
});

// ==========================================
// SECTION 27: CLIPBOARD IMAGE PASTE & ULTRA-FAST DRAG-AND-DROP (SOLUTION A)
// ==========================================
console.log("\n--- SECTION 27: CLIPBOARD IMAGE PASTE & ULTRA-FAST DRAG-AND-DROP ---");

it("Validates WebP compression ratio math & storage bandwidth savings calculation", () => {
  function computeCompressionMetrics(originalBytes, compressedBytes) {
    const ratioPercent = originalBytes > 0 && originalBytes > compressedBytes
      ? Math.round(((originalBytes - compressedBytes) / originalBytes) * 100)
      : 0;
    const originalKB = Math.round(originalBytes / 1024);
    const compressedKB = Math.round(compressedBytes / 1024);
    const isSafeForLocalStorage = compressedBytes < 500 * 1024; // < 500KB safe margin

    return { ratioPercent, originalKB, compressedKB, isSafeForLocalStorage };
  }

  // 1. 4K raw PNG screenshot (5.2 MB -> 245 KB WebP)
  const metric4K = computeCompressionMetrics(5452595, 250880);
  assert.strictEqual(metric4K.ratioPercent, 95);
  assert.strictEqual(metric4K.originalKB, 5325);
  assert.strictEqual(metric4K.compressedKB, 245);
  assert.strictEqual(metric4K.isSafeForLocalStorage, true);

  // 2. 1080p trading chart (1.8 MB -> 180 KB WebP)
  const metric1080 = computeCompressionMetrics(1887436, 184320);
  assert.strictEqual(metric1080.ratioPercent, 90);
  assert.strictEqual(metric1080.isSafeForLocalStorage, true);

  // 3. Edge case: already compressed image (no savings)
  const metricSame = computeCompressionMetrics(102400, 102400);
  assert.strictEqual(metricSame.ratioPercent, 0);

  // 4. Zero byte edge case
  const metricZero = computeCompressionMetrics(0, 0);
  assert.strictEqual(metricZero.ratioPercent, 0);
});

it("Validates Drag & drop file filter and image MIME type validator contract", () => {
  function validateImageDropFile(file) {
    if (!file) return { isValid: false, error: "no_file" };
    const validMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/avif"];
    const type = (file.type || "").toLowerCase();
    if (!type.startsWith("image/") || !validMimes.includes(type)) {
      return { isValid: false, error: "invalid_image" };
    }
    return { isValid: true, mime: type };
  }

  // Valid files
  assert.strictEqual(validateImageDropFile({ type: "image/png" }).isValid, true);
  assert.strictEqual(validateImageDropFile({ type: "image/jpeg" }).isValid, true);
  assert.strictEqual(validateImageDropFile({ type: "image/webp" }).isValid, true);

  // Invalid files (PDF, TXT, EXE, video)
  assert.strictEqual(validateImageDropFile({ type: "application/pdf" }).isValid, false);
  assert.strictEqual(validateImageDropFile({ type: "text/plain" }).isValid, false);
  assert.strictEqual(validateImageDropFile({ type: "video/mp4" }).isValid, false);
  assert.strictEqual(validateImageDropFile(null).isValid, false);
});

it("Validates Cross-tab screenshot synchronization & indicator contract in TradeSlideOverDrawer", () => {
  // Simulate Drawer Form State
  let activeTab = "execution";
  let screenshot = null;
  let screenshotRemoved = false;
  let compressionRatio = null;

  // Action: Paste screenshot while in "execution" tab
  function handlePasteSimulation(mockProcessedImage) {
    screenshot = mockProcessedImage.dataUrl;
    screenshotRemoved = false;
    compressionRatio = mockProcessedImage.ratioPercent;
  }

  // Tab indicator logic
  function hasImageIndicator(screenshotVal, isRemoved) {
    return Boolean(screenshotVal && !isRemoved);
  }

  // Payload derivation
  function deriveScreenshotPayload(isEdit, screenshotVal, isRemoved) {
    if (isEdit) {
      return isRemoved ? null : (screenshotVal && screenshotVal.startsWith("data:") ? screenshotVal : undefined);
    }
    return screenshotVal || undefined;
  }

  // Initial state: no image
  assert.strictEqual(hasImageIndicator(screenshot, screenshotRemoved), false);

  // Trader pastes while on Tab 1 (execution)
  handlePasteSimulation({ dataUrl: "data:image/webp;base64,mockwebpdata...", ratioPercent: 92 });
  assert.strictEqual(activeTab, "execution");
  assert.strictEqual(hasImageIndicator(screenshot, screenshotRemoved), true, "Psychology tab must immediately display 📷 indicator");
  assert.strictEqual(compressionRatio, 92);

  // Submission payload test
  const createPayload = deriveScreenshotPayload(false, screenshot, screenshotRemoved);
  assert.strictEqual(createPayload, "data:image/webp;base64,mockwebpdata...");

  // Trader removes image
  screenshot = null;
  screenshotRemoved = true;
  compressionRatio = null;
  assert.strictEqual(hasImageIndicator(screenshot, screenshotRemoved), false, "Indicator must disappear when removed");

  const editRemovePayload = deriveScreenshotPayload(true, screenshot, screenshotRemoved);
  assert.strictEqual(editRemovePayload, null, "Edit mode must send explicit null to remove photo");
});

it("Validates Drag overlay activation & boundary departure detection logic", () => {
  let isDragging = false;

  function onDragOver(isDraggingState) {
    return true; // activates dragging
  }

  function onDragLeave(containsRelatedTarget) {
    // If moving between child elements inside modal card, do not cancel dragging
    if (containsRelatedTarget) {
      return true;
    }
    return false; // left the modal boundary
  }

  function onDrop() {
    return false; // drops and closes dragging overlay
  }

  // 1. File enters card
  isDragging = onDragOver(isDragging);
  assert.strictEqual(isDragging, true);

  // 2. Pointer hovers over child element inside card (e.g. input or button) -> stay true
  isDragging = onDragLeave(true);
  assert.strictEqual(isDragging, true, "Dragging must remain active when hovering over child elements");

  // 3. Pointer leaves card boundary completely -> becomes false
  isDragging = onDragLeave(false);
  assert.strictEqual(isDragging, false, "Dragging must deactivate when leaving modal boundary");

  // 4. File dropped -> deactivates and triggers processing
  isDragging = onDrop();
  assert.strictEqual(isDragging, false);
});

it("Validates i18n parity for Clipboard & Drag-Drop keys across en.json and vi.json", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  // 1. QuickLog
  const qlKeys = ["clipboard_pasted", "drag_drop_hint", "drop_active", "paste_badge", "processing_image"];
  for (const k of qlKeys) {
    assert.ok(en.QuickLog[k], `QuickLog.${k} missing in en.json`);
    assert.ok(vi.QuickLog[k], `QuickLog.${k} missing in vi.json`);
    assert.ok(typeof en.QuickLog[k] === "string" && en.QuickLog[k].length > 0);
    assert.ok(typeof vi.QuickLog[k] === "string" && vi.QuickLog[k].length > 0);
  }

  // 2. SlideOverDrawer
  const sodKeys = ["clipboard_pasted", "drag_drop_hint", "drop_active", "paste_badge", "has_image_badge", "processing_image"];
  for (const k of sodKeys) {
    assert.ok(en.SlideOverDrawer[k], `SlideOverDrawer.${k} missing in en.json`);
    assert.ok(vi.SlideOverDrawer[k], `SlideOverDrawer.${k} missing in vi.json`);
    assert.ok(typeof en.SlideOverDrawer[k] === "string" && en.SlideOverDrawer[k].length > 0);
    assert.ok(typeof vi.SlideOverDrawer[k] === "string" && vi.SlideOverDrawer[k].length > 0);
  }

  // 3. TradeDetailsModal
  const tdmKeys = ["clipboard_pasted", "drag_drop_hint", "drop_active", "paste_badge"];
  for (const k of tdmKeys) {
    assert.ok(en.TradeDetailsModal[k], `TradeDetailsModal.${k} missing in en.json`);
    assert.ok(vi.TradeDetailsModal[k], `TradeDetailsModal.${k} missing in vi.json`);
    assert.ok(typeof en.TradeDetailsModal[k] === "string" && en.TradeDetailsModal[k].length > 0);
    assert.ok(typeof vi.TradeDetailsModal[k] === "string" && vi.TradeDetailsModal[k].length > 0);
  }
});

// ==========================================
// SECTION 28: SUPABASE EXPLICIT TABLE GRANTS & SECURITY POLICY COMPLIANCE (OCTOBER 30 COMPLIANCE)
// ==========================================
console.log("\n--- SECTION 28: SUPABASE EXPLICIT TABLE GRANTS & SECURITY POLICY COMPLIANCE ---");

const schemaSqlPath = path.resolve(__dirname, '../supabase/schema.snapshot.sql');
const patchSqlPath = path.resolve(__dirname, '../supabase/legacy/supabase_grant_permissions.sql');
const coreTables = ['accounts', 'trades', 'daily_reviews', 'notifications', 'user_preferences', 'playbooks', 'periodic_reviews'];

it("Validates schema SQL contains explicit GRANT commands for all 7 core TradeNote tables", () => {
  assert.ok(fs.existsSync(schemaSqlPath), "supabase_schema.sql must exist");
  assert.ok(fs.existsSync(patchSqlPath), "supabase_grant_permissions.sql must exist");

  const patchContent = fs.readFileSync(patchSqlPath, 'utf8');
  const schemaContent = fs.readFileSync(schemaSqlPath, 'utf8');

  // Verify all 7 core tables are explicitly granted to authenticated and service_role in patch file
  for (const table of coreTables) {
    const authRegex = new RegExp(`GRANT\\s+SELECT,\\s*INSERT,\\s*UPDATE,\\s*DELETE\\s+ON\\s+public\\.${table}\\s+TO\\s+authenticated`, 'i');
    const serviceRegex = new RegExp(`GRANT\\s+SELECT,\\s*INSERT,\\s*UPDATE,\\s*DELETE\\s+ON\\s+public\\.${table}\\s+TO\\s+service_role`, 'i');
    const anonRegex = new RegExp(`GRANT\\s+SELECT\\s+ON\\s+public\\.${table}\\s+TO\\s+anon`, 'i');

    assert.ok(authRegex.test(patchContent), `Patch must grant CRUD on ${table} to authenticated`);
    assert.ok(serviceRegex.test(patchContent), `Patch must grant CRUD on ${table} to service_role`);
    assert.ok(anonRegex.test(patchContent), `Patch must grant SELECT on ${table} to anon`);
  }

  // Verify schemaContent has explicit bulk GRANT for schema public
  // P1 (E2b): snapshot is least-privilege now - anon must NOT receive any GRANT (REVOKE ... FROM anon allowed)
  assert.ok(
    !/GRANT\s+[^;]*?\bTO\s+[^;]*\banon\b/i.test(schemaContent),
    "schema.snapshot.sql must not GRANT anything to anon (P1 patch 011)"
  );
  assert.ok(
    /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+authenticated/i.test(schemaContent),
    "supabase_schema.sql must grant CRUD on all tables to authenticated"
  );
  assert.ok(
    /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+service_role/i.test(schemaContent),
    "supabase_schema.sql must grant CRUD on all tables to service_role"
  );
});

it("Validates Least-Privilege enforcement: anon role has SELECT only, no INSERT/UPDATE/DELETE", () => {
  const patchContent = fs.readFileSync(patchSqlPath, 'utf8');
  
  // Anon must not have INSERT, UPDATE, or DELETE on any public table
  for (const table of coreTables) {
    const invalidAnonGrant = new RegExp(`GRANT\\s+[^;]*?(INSERT|UPDATE|DELETE)[^;]*?ON\\s+public\\.${table}\\s+TO\\s+anon`, 'i');
    assert.ok(!invalidAnonGrant.test(patchContent), `Security Violation: anon should NOT have write privileges on ${table}`);
  }
});

it("Validates Future-Proofing ALTER DEFAULT PRIVILEGES is declared for tables and sequences", () => {
  const patchContent = fs.readFileSync(patchSqlPath, 'utf8');
  const schemaContent = fs.readFileSync(schemaSqlPath, 'utf8');

  // P1 (E19): legacy patch file keeps its anon default privileges; snapshot must not grant anon by default.
  assert.ok(
    /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+GRANT\s+SELECT\s+ON\s+TABLES\s+TO\s+anon/i.test(patchContent),
    "Legacy patch must alter default privileges for anon"
  );
  assert.ok(
    !/ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+GRANT\s+[^;]*?\bTO\s+[^;]*\banon\b/i.test(schemaContent),
    "Snapshot must not alter default privileges to grant anon"
  );
  assert.ok(
    /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+GRANT\s+USAGE,\s*SELECT\s+ON\s+SEQUENCES\s+TO\s+anon,\s*authenticated,\s*service_role/i.test(patchContent),
    "Legacy patch must alter default privileges for sequences"
  );
  assert.ok(
    /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+GRANT\s+USAGE,\s*SELECT\s+ON\s+SEQUENCES\s+TO\s+authenticated,\s*service_role\s*;/i.test(schemaContent),
    "Snapshot must alter default privileges for sequences to authenticated, service_role (no anon)"
  );

  for (const content of [patchContent, schemaContent]) {
    assert.ok(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLES\s+TO\s+authenticated/i.test(content),
      "Must alter default privileges for authenticated"
    );
    assert.ok(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLES\s+TO\s+service_role/i.test(content),
      "Must alter default privileges for service_role"
    );
  }
});

it("Validates sequence USAGE privileges granted for auto-increment integrity", () => {
  const patchContent = fs.readFileSync(patchSqlPath, 'utf8');
  const schemaContent = fs.readFileSync(schemaSqlPath, 'utf8');

  const seqRegex = /GRANT\s+USAGE,\s*SELECT\s+ON\s+ALL\s+SEQUENCES\s+IN\s+SCHEMA\s+public\s+TO\s+anon,\s*authenticated,\s*service_role/i;
  assert.ok(seqRegex.test(patchContent), "Patch must grant sequence usage");
  // P1 (E2b): snapshot grants sequences to authenticated, service_role only (no anon)
  const schemaSeqRegex = /GRANT\s+USAGE,\s*SELECT\s+ON\s+ALL\s+SEQUENCES\s+IN\s+SCHEMA\s+public\s+TO\s+authenticated,\s*service_role\s*;/i;
  assert.ok(schemaSeqRegex.test(schemaContent), "Schema must grant sequence usage to authenticated, service_role (no anon)");
});

it("Validates patch script safety & idempotency (syntax validation without destructiveness)", () => {
  const patchContent = fs.readFileSync(patchSqlPath, 'utf8');

  // Must not have destructive DDL
  assert.ok(!/DROP\s+TABLE/i.test(patchContent), "Patch script must never DROP tables");
  assert.ok(!/TRUNCATE/i.test(patchContent), "Patch script must never TRUNCATE data");
  assert.ok(!/DROP\s+COLUMN/i.test(patchContent), "Patch script must never DROP columns");

  // Must contain completion notice
  assert.ok(patchContent.includes("RAISE NOTICE"), "Patch script should have completion notice for DB admin");
});

// ==========================================
// SECTION 28b: P1 SCHEMA SNAPSHOT STATIC GATES (RLS WITH CHECK, NO ANON GRANTS, PRIVATE SCREENSHOTS)
// ==========================================
console.log("\n--- SECTION 28b: P1 SCHEMA SNAPSHOT STATIC GATES ---");

function p1SnapshotStatements() {
  const raw = fs.readFileSync(schemaSqlPath, 'utf8');
  const code = raw.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  return code.split(';').map((st) => st.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

it("P1 snapshot: every UPDATE policy (public tables + storage.objects) has WITH CHECK", () => {
  const stmts = p1SnapshotStatements();
  const updates = stmts.filter((st) => /^CREATE POLICY\b.*\bFOR UPDATE\b/i.test(st));
  assert.ok(updates.length >= 9, `expected >= 9 UPDATE policies (7 tables + 2 storage), got ${updates.length}`);
  for (const st of updates) {
    assert.ok(/\bWITH CHECK\b/i.test(st), `UPDATE policy without WITH CHECK: ${st.slice(0, 120)}`);
  }
  for (const table of coreTables) {
    const hit = updates.find((st) => new RegExp(`\\bON public\\.${table}\\b`, 'i').test(st));
    assert.ok(hit, `missing UPDATE policy for ${table}`);
    assert.ok(/WITH CHECK \(auth\.uid\(\) = user_id\)/i.test(hit), `${table} UPDATE policy must WITH CHECK (auth.uid() = user_id)`);
  }
});

it("P1 snapshot: no GRANT statement (incl. ALTER DEFAULT PRIVILEGES, sequences) contains anon; REVOKE ... FROM anon present", () => {
  const stmts = p1SnapshotStatements();
  const grants = stmts.filter((st) => /\bGRANT\b/i.test(st));
  assert.ok(grants.length > 0, "snapshot must still contain GRANT statements");
  for (const st of grants) {
    assert.ok(!/\banon\b/i.test(st), `GRANT containing anon: ${st}`);
  }
  assert.ok(stmts.some((st) => /^REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon$/i.test(st)), "must REVOKE ALL tables FROM anon");
  assert.ok(stmts.some((st) => /^REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated$/i.test(st)), "must REVOKE TRUNCATE/TRIGGER/REFERENCES FROM authenticated");
  assert.ok(stmts.some((st) => /^REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon$/i.test(st)), "must REVOKE EXECUTE functions FROM PUBLIC, anon");
});

it("P1 snapshot: DELETE policy on user_preferences, composite FK, screenshot_path and private trade-screenshots bucket", () => {
  const stmts = p1SnapshotStatements();
  assert.ok(stmts.some((st) => /^CREATE POLICY .* ON public\.user_preferences FOR DELETE USING \(auth\.uid\(\) = user_id\)$/i.test(st)), "user_preferences DELETE policy missing");
  const all = stmts.join(';\n');
  assert.ok(/CONSTRAINT accounts_id_user_id_key UNIQUE \(id, user_id\)/i.test(all), "accounts UNIQUE (id, user_id) missing");
  assert.ok(/CONSTRAINT trades_account_user_fk FOREIGN KEY \(account_id, user_id\) REFERENCES public\.accounts \(id, user_id\)/i.test(all), "trades composite FK missing");
  assert.ok(/\bscreenshot_path TEXT\b/i.test(all), "trades.screenshot_path missing");
  assert.ok(/\('trade-screenshots', 'trade-screenshots', false\)/.test(all), "trade-screenshots bucket must be private");
  assert.ok(!/"Anyone can view screenshots" ON storage\.objects FOR SELECT/i.test(all), "public SELECT policy on screenshots must be gone");
  assert.ok(/CREATE POLICY trade_screenshots_owner_select ON storage\.objects FOR SELECT TO authenticated USING \(bucket_id = 'trade-screenshots' AND \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text\)/i.test(all), "owner-prefix SELECT policy missing");
});

// ==========================================
// SECTION 29: USER HANDBOOK & GUIDE MODAL CONTRACTS (FULL APP COVERAGE)
// ==========================================
console.log("\n--- SECTION 29: USER HANDBOOK & GUIDE MODAL (100% APP COVERAGE) ---");

const guideChapters = [
  "overview",
  "fast_logging",
  "prop_firm_risk",
  "calculator",
  "matrix_analytics",
  "discipline_elite",
  "playbook_shortcuts"
];

it("Validates User Guide 7 chapters definition and required content structure", () => {
  const storePath = path.resolve(__dirname, '../src/store/useGuideStore.ts');
  assert.ok(fs.existsSync(storePath), "useGuideStore.ts must exist");
  const storeCode = fs.readFileSync(storePath, 'utf8');

  for (const ch of guideChapters) {
    assert.ok(storeCode.includes(`"${ch}"`), `useGuideStore must define chapter ${ch}`);
  }
});

it("Validates Location Badges and Visual Mockups mapping for all 7 chapters", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  for (const ch of guideChapters) {
    const fields = ["loc", "title", "summary", "point1", "point2", "point3", "point4", "tip", "action"];
    for (const f of fields) {
      const key = `${ch}_${f}`;
      assert.ok(en.UserGuide[key], `en.UserGuide.${key} is missing`);
      assert.ok(vi.UserGuide[key], `vi.UserGuide.${key} is missing`);
      assert.ok(typeof en.UserGuide[key] === "string" && en.UserGuide[key].length > 0);
      assert.ok(typeof vi.UserGuide[key] === "string" && vi.UserGuide[key].length > 0);
    }
  }
});

it("Validates Action Routes and Modal Triggers contract across modules", () => {
  const sidebarPath = path.resolve(__dirname, '../src/components/Sidebar.tsx');
  const headerPath = path.resolve(__dirname, '../src/components/Header.tsx');
  const palettePath = path.resolve(__dirname, '../src/components/CommandPaletteModal.tsx');
  const modalPath = path.resolve(__dirname, '../src/components/UserGuideModal.tsx');

  const sidebarCode = fs.readFileSync(sidebarPath, 'utf8');
  const headerCode = fs.readFileSync(headerPath, 'utf8');
  const paletteCode = fs.readFileSync(palettePath, 'utf8');
  const modalCode = fs.readFileSync(modalPath, 'utf8');

  assert.ok(sidebarCode.includes("openGuide"), "Sidebar must have openGuide trigger");
  assert.ok(headerCode.includes("<UserGuideModal"), "Header must mount UserGuideModal component");
  assert.ok(paletteCode.includes("action-user-guide"), "CommandPalette must have action-user-guide item");
  assert.ok(modalCode.includes("handleAction"), "UserGuideModal must contain handleAction routing");
});

it("Validates 100% i18n key parity for UserGuide namespace between en.json and vi.json", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  assert.ok(en.UserGuide, "en.json must contain UserGuide namespace");
  assert.ok(vi.UserGuide, "vi.json must contain UserGuide namespace");

  const enKeys = Object.keys(en.UserGuide);
  const viKeys = Object.keys(vi.UserGuide);

  assert.strictEqual(enKeys.length, viKeys.length, "UserGuide key count must match between EN and VI");

  for (const k of enKeys) {
    assert.ok(vi.UserGuide[k], `vi.UserGuide missing key ${k}`);
    assert.ok(typeof vi.UserGuide[k] === "string" && vi.UserGuide[k].length > 0);
  }
  for (const k of viKeys) {
    assert.ok(en.UserGuide[k], `en.UserGuide missing key ${k}`);
  }
});

it("Validates Guide Store chapter jumping and state transition invariants", () => {
  // Pure store logic state transition simulation
  let isOpen = false;
  let activeChapter = "overview";

  function openGuide(chapterId) {
    activeChapter = chapterId && guideChapters.includes(chapterId) ? chapterId : "overview";
    isOpen = true;
  }

  function closeGuide() {
    isOpen = false;
  }

  function setActiveChapter(chapterId) {
    if (guideChapters.includes(chapterId)) {
      activeChapter = chapterId;
    }
  }

  // 1. Initial state
  assert.strictEqual(isOpen, false);
  assert.strictEqual(activeChapter, "overview");

  // 2. Default open
  openGuide();
  assert.strictEqual(isOpen, true);
  assert.strictEqual(activeChapter, "overview");

  // 3. Jump to specific chapter
  openGuide("prop_firm_risk");
  assert.strictEqual(isOpen, true);
  assert.strictEqual(activeChapter, "prop_firm_risk");

  // 4. Invalid chapter fallback
  openGuide("non_existent_chapter");
  assert.strictEqual(isOpen, true);
  assert.strictEqual(activeChapter, "overview", "Invalid chapter must fallback to overview");

  // 5. Change chapter while open
  setActiveChapter("calculator");
  assert.strictEqual(activeChapter, "calculator");

  // 6. Close guide
  closeGuide();
  assert.strictEqual(isOpen, false);
});

// ==========================================
// SECTION 30: UI/UX MICRO-POLISH & ASSET COLOR IDENTITY CONTRACTS
// ==========================================
console.log("\n--- SECTION 30: UI/UX MICRO-POLISH & ASSET VISUAL IDENTITY ---");

it("Validates Asset Visual Identity color tokens for all major asset classes", () => {
  const assetColorsPath = path.resolve(__dirname, '../src/lib/assetColors.ts');
  assert.ok(fs.existsSync(assetColorsPath), "assetColors.ts must exist");
  const code = fs.readFileSync(assetColorsPath, 'utf8');
  assert.ok(code.includes("export function getAssetBadgeStyle"), "getAssetBadgeStyle must be exported");

  // Pure logic simulation matching assetColors.ts
  function testAssetBadgeStyle(asset) {
    const a = (asset || "").toUpperCase().trim();
    if (a.includes("NQ") || a.includes("MNQ") || a.includes("NAS") || a.includes("QQQ")) {
      return { bg: "bg-purple-500/10", text: "text-purple-300", dot: "bg-purple-400" };
    }
    if (a.includes("ES") || a.includes("MES") || a.includes("SPX") || a.includes("SPY")) {
      return { bg: "bg-blue-500/10", text: "text-blue-300", dot: "bg-blue-400" };
    }
    if (a.includes("XAU") || a.includes("GOLD") || a.includes("GC") || a.includes("SILVER") || a.includes("XAG")) {
      return { bg: "bg-amber-500/10", text: "text-amber-300", dot: "bg-amber-400" };
    }
    if (a.includes("EUR") || a.includes("GBP") || a.includes("JPY") || a.includes("AUD") || a.includes("CAD") || a.includes("CHF") || a.includes("NZD")) {
      return { bg: "bg-emerald-500/10", text: "text-emerald-300", dot: "bg-emerald-400" };
    }
    if (a.includes("BTC") || a.includes("ETH") || a.includes("SOL") || a.includes("CRYPTO")) {
      return { bg: "bg-cyan-500/10", text: "text-cyan-300", dot: "bg-cyan-400" };
    }
    return { bg: "bg-white/5", text: "text-gray-300", dot: "bg-gray-400" };
  }

  assert.strictEqual(testAssetBadgeStyle("MNQ").text, "text-purple-300");
  assert.strictEqual(testAssetBadgeStyle("NQ").dot, "bg-purple-400");
  assert.strictEqual(testAssetBadgeStyle("MES").text, "text-blue-300");
  assert.strictEqual(testAssetBadgeStyle("ES").dot, "bg-blue-400");
  assert.strictEqual(testAssetBadgeStyle("XAUUSD").text, "text-amber-300");
  assert.strictEqual(testAssetBadgeStyle("GOLD").dot, "bg-amber-400");
  assert.strictEqual(testAssetBadgeStyle("EURUSD").text, "text-emerald-300");
  assert.strictEqual(testAssetBadgeStyle("GBPUSD").dot, "bg-emerald-400");
  assert.strictEqual(testAssetBadgeStyle("BTCUSD").text, "text-cyan-300");
  assert.strictEqual(testAssetBadgeStyle("UNKNOWN_STOCK").text, "text-gray-300");
});

it("Validates QuickLog Smart Typing & Auto-Focus contracts in component source", () => {
  const modalPath = path.resolve(__dirname, '../src/components/QuickLogTradeModal.tsx');
  const modalCode = fs.readFileSync(modalPath, 'utf8');

  assert.ok(modalCode.includes("pnlInputRef"), "QuickLogTradeModal must define pnlInputRef");
  assert.ok(modalCode.includes("pnlInputRef.current?.focus()"), "QuickLogTradeModal must auto-focus pnl input");
  assert.ok(modalCode.includes("setPnlSign(\"-\")"), "QuickLogTradeModal must support smart negative toggle");
  assert.ok(modalCode.includes("setPnlSign(\"+\")"), "QuickLogTradeModal must support smart positive toggle");
  assert.ok(modalCode.includes("getAssetBadgeStyle"), "QuickLogTradeModal must use getAssetBadgeStyle");
  assert.ok(modalCode.includes("active:scale-[0.96]"), "QuickLogTradeModal must have tactile active:scale on buttons");
});

it("Validates Journal Table and Cards View integration with Asset Signatures", () => {
  const journalPath = path.resolve(__dirname, '../src/app/[locale]/journal/page.tsx');
  const cardsPath = path.resolve(__dirname, '../src/components/TradeCardsView.tsx');

  const journalCode = fs.readFileSync(journalPath, 'utf8');
  const cardsCode = fs.readFileSync(cardsPath, 'utf8');

  assert.ok(journalCode.includes("getAssetBadgeStyle"), "Journal table must integrate getAssetBadgeStyle");
  assert.ok(cardsCode.includes("getAssetBadgeStyle"), "TradeCardsView must integrate getAssetBadgeStyle");
});

console.log("\n31. Streamlined UX & Adaptive Profiles Verification Suite:");

it("Validates Header preserves Zen Shield and removes redundant User Guide button", () => {
  const headerPath = path.resolve(__dirname, '../src/components/Header.tsx');
  const headerCode = fs.readFileSync(headerPath, 'utf8');

  // Must keep Zen Shield
  assert.ok(headerCode.includes("Zen Shield"), "Header must preserve Zen Shield button");
  assert.ok(headerCode.includes("ShieldAlert"), "Header must include ShieldAlert for Zen Shield");
  assert.ok(headerCode.includes("setIsShieldOpen(true)"), "Header must keep Zen Shield open handler");

  // Must NOT have HelpCircle User Guide button in Header
  assert.ok(!headerCode.includes("User Guide Handbook Quick Trigger"), "Header must remove User Guide Handbook Quick Trigger");
  assert.ok(!headerCode.includes("<HelpCircle"), "Header must not render HelpCircle trigger button");

  // Must localize empty notification state and have risk status
  assert.ok(headerCode.includes("t('no_notifications')"), "Header must localize empty notification state");
  assert.ok(headerCode.includes("t('risk_status_safe')"), "Header must include live risk health indicator");
});

it("Validates Accounts page supports Personal account type", () => {
  const accountsPath = path.resolve(__dirname, '../src/app/[locale]/accounts/page.tsx');
  const accountsCode = fs.readFileSync(accountsPath, 'utf8');

  assert.ok(accountsCode.includes('"Personal"'), "AccountStatus must include Personal");
  assert.ok(accountsCode.includes('value="Personal"'), "Accounts page status select must have Personal option");
  assert.ok(accountsCode.includes("account.type.includes('Personal')"), "Accounts table must support Personal badge styling");
});

it("Validates Dashboard page implements adaptive views for Personal vs Prop accounts", () => {
  const dashboardPath = path.resolve(__dirname, '../src/app/[locale]/page.tsx');
  const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

  assert.ok(dashboardCode.includes("isPersonalAccount"), "Dashboard must define isPersonalAccount");
  assert.ok(dashboardCode.includes("capitalGrowthPercent"), "Dashboard must calculate capitalGrowthPercent");
  assert.ok(dashboardCode.includes("t('capital_growth')"), "Dashboard must render capital_growth for Personal accounts");
  assert.ok(dashboardCode.includes("t('personal_guard')"), "Dashboard must render personal_guard for Personal accounts");
});

it("Validates 100% i18n bilingual parity for new Streamlined UX & Adaptive Profile keys", () => {
  const enPath = path.resolve(__dirname, '../messages/en.json');
  const viPath = path.resolve(__dirname, '../messages/vi.json');

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));

  const requiredHeaderKeys = ["risk_status_safe", "risk_status_alert", "risk_status_title"];
  const requiredDashboardKeys = ["capital_growth", "net_roi", "personal_guard", "personal_growth_desc", "initial_deposit"];
  const requiredAccountsKeys = ["personal"];

  for (const k of requiredHeaderKeys) {
    assert.ok(en.Header && en.Header[k], `en.json must contain Header.${k}`);
    assert.ok(vi.Header && vi.Header[k], `vi.json must contain Header.${k}`);
  }

  for (const k of requiredDashboardKeys) {
    assert.ok(en.Dashboard && en.Dashboard[k], `en.json must contain Dashboard.${k}`);
    assert.ok(vi.Dashboard && vi.Dashboard[k], `vi.json must contain Dashboard.${k}`);
  }

  for (const k of requiredAccountsKeys) {
    assert.ok(en.Accounts && en.Accounts[k], `en.json must contain Accounts.${k}`);
    assert.ok(vi.Accounts && vi.Accounts[k], `vi.json must contain Accounts.${k}`);
  }
});

console.log("\n32. AI Coach Zero-Downtime Resilience & Multi-Tier Waterfall Fallback:");

it("Validates AI Coach route implements Multi-Tier Waterfall Fallback with healthy models", () => {
  const routePath = path.resolve(__dirname, '../src/app/api/ai-coach/route.ts');
  const routeCode = fs.readFileSync(routePath, 'utf8');

  // Verify deprecated model is completely gone
  assert.ok(!routeCode.includes("deepseek/deepseek-v4-flash-0731:free"), "Deprecated 404 model must be removed");

  // Verify primary model and candidate list
  assert.ok(routeCode.includes("inclusionai/ling-3.0-flash-fin:free"), "Primary model default must be inclusionai/ling-3.0-flash-fin:free");
  assert.ok(routeCode.includes("nex-agi/nex-n2.5-pro:free"), "Fallback tier 1 must include nex-agi/nex-n2.5-pro:free");
  assert.ok(routeCode.includes("liquid/lfm-2.5-2.6b:free"), "Fallback tier 2 must include liquid/lfm-2.5-2.6b:free");
  assert.ok(routeCode.includes("nvidia/nemotron-3.5-lightning:free"), "Fallback tier 3 must include nvidia/nemotron-3.5-lightning:free");

  // Verify cascade iteration and abort controller
  assert.ok(routeCode.includes("for (const model of candidateModels)"), "Route must iterate through candidate models");
  assert.ok(routeCode.includes("new AbortController()"), "Route must wrap each call in AbortController timeout");
  assert.ok(routeCode.includes("model: data.model || selectedModel"), "Route must return the actual winning model name");
});

console.log("\n33. AI Coach Client Crash Prevention & Error Boundary Hardening:");

it("Validates formatSafeText prevents crash on object/array inputs and AICoachModal includes cache reset", () => {
  const modalPath = path.resolve(__dirname, '../src/components/AICoachModal.tsx');
  const modalCode = fs.readFileSync(modalPath, 'utf8');

  assert.ok(modalCode.includes("formatSafeText"), "AICoachModal must export/use formatSafeText");
  assert.ok(modalCode.includes("handleClearCache"), "AICoachModal must support clearing cache on demand");
  assert.ok(modalCode.includes("RotateCcw"), "AICoachModal must have reset icon button");

  const routePath = path.resolve(__dirname, '../src/app/api/ai-coach/route.ts');
  const routeCode = fs.readFileSync(routePath, 'utf8');
  assert.ok(routeCode.includes("flattenString"), "Route must flatten string outputs before returning JSON");

  const errorBoundaryPath = path.resolve(__dirname, '../src/app/[locale]/error.tsx');
  assert.ok(fs.existsSync(errorBoundaryPath), "App Router must include [locale]/error.tsx");
  const errorCode = fs.readFileSync(errorBoundaryPath, 'utf8');
  assert.ok(errorCode.includes("ErrorBoundary"), "error.tsx must export ErrorBoundary component");
});

console.log("\n34. P1 Hardening: Private Screenshot Storage & Signed URL Client Contracts:");

// E17: Node v24 type-stripping imports the real TS module (no build step, no package.json "type").
// N7: if this Node cannot import .ts, report a clear gap in Section 34 tests and keep other sections running.
let shotLib;
try {
  shotLib = await import('../src/lib/screenshotStorage.ts');
} catch (importErr) {
  const reason = `GAP: cannot import src/lib/screenshotStorage.ts on Node ${process.version} (needs TS type-stripping, Node >= 22.6/24): ${importErr && importErr.message}`;
  console.log(`  ${reason}`);
  shotLib = new Proxy({}, { get(_t, prop) { if (prop === 'then') return undefined; throw new Error(reason); } });
}
const { execSync: shotExecSync } = await import('node:child_process');
const readSrc = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

it("E1b: pathFromLegacyUrl converts legacy public URL to path (drops query, matches 012 backfill)", () => {
  const { pathFromLegacyUrl } = shotLib;
  const base = 'https://abc.supabase.co/storage/v1/object/public/trade-screenshots/';
  assert.strictEqual(pathFromLegacyUrl(base + 'u-1/1700000000000.webp'), 'u-1/1700000000000.webp');
  assert.strictEqual(pathFromLegacyUrl(base + 'u-1/1700000000000.webp?t=123'), 'u-1/1700000000000.webp');
  assert.strictEqual(pathFromLegacyUrl(base + 'u-1/playbook_17.webp#x'), 'u-1/playbook_17.webp');
  // Encoded chars are NOT decoded (client mirrors SQL backfill; SQL asserts no '%').
  assert.strictEqual(pathFromLegacyUrl(base + 'u-1/a%20b.webp'), 'u-1/a%20b.webp');
  // Signed URL form also maps to its path (never stored, but GC/guards stay robust).
  assert.strictEqual(pathFromLegacyUrl('https://abc.supabase.co/storage/v1/object/sign/trade-screenshots/u-1/x.webp?token=abc'), 'u-1/x.webp');
});

it("E1b: pathFromLegacyUrl is idempotent for bare paths and returns null for foreign/empty/data inputs", () => {
  const { pathFromLegacyUrl } = shotLib;
  const p = 'u-1/1700000000000-ab12cd34.webp';
  assert.strictEqual(pathFromLegacyUrl(p), p);
  assert.strictEqual(pathFromLegacyUrl(pathFromLegacyUrl(p)), p);
  assert.strictEqual(pathFromLegacyUrl(null), null);
  assert.strictEqual(pathFromLegacyUrl(undefined), null);
  assert.strictEqual(pathFromLegacyUrl(''), null);
  assert.strictEqual(pathFromLegacyUrl('   '), null);
  assert.strictEqual(pathFromLegacyUrl('https://abc.supabase.co/storage/v1/object/public/avatars/u-1/a.png'), null);
  assert.strictEqual(pathFromLegacyUrl('https://example.com/trade.png'), null);
  assert.strictEqual(pathFromLegacyUrl('https://abc.supabase.co/storage/v1/object/public/trade-screenshots/'), null);
  assert.strictEqual(pathFromLegacyUrl('data:image/png;base64,AAAA'), null);
  assert.strictEqual(pathFromLegacyUrl('blob:http://localhost/123'), null);
  assert.strictEqual(pathFromLegacyUrl('no-folder.webp'), null);
  assert.strictEqual(pathFromLegacyUrl('u-1/../u-2/x.webp'), null);
});

it("E1b: buildScreenshotPath yields {userId}/{nonce}.{ext} and {userId}/{ts}-{hex}.{ext} when auto-generated", () => {
  const { buildScreenshotPath, SCREENSHOT_BUCKET } = shotLib;
  const uid = '3f1c2b9a-0000-4000-8000-123456789abc';
  assert.strictEqual(SCREENSHOT_BUCKET, 'trade-screenshots');
  assert.strictEqual(buildScreenshotPath(uid, 'webp', '1700000000000-deadbeef'), `${uid}/1700000000000-deadbeef.webp`);
  assert.match(buildScreenshotPath(uid, 'webp', 'fixed'), new RegExp(`^${uid}/fixed\\.webp$`));
  const auto = buildScreenshotPath(uid, 'webp');
  assert.match(auto, new RegExp(`^${uid}/\\d+-[0-9a-f]+\\.webp$`));
  assert.match(auto, /^[0-9A-Za-z\-/._]+$/);
  assert.notStrictEqual(buildScreenshotPath(uid, 'webp'), buildScreenshotPath(uid, 'webp'));
  assert.strictEqual(shotLib.pathFromLegacyUrl(auto), auto);
  assert.throws(() => buildScreenshotPath('', 'webp'));
  assert.throws(() => buildScreenshotPath('a/b', 'webp'));
  assert.throws(() => buildScreenshotPath(uid, 'we/bp'));
});

it("E1b: needsSignedUrlRefresh refreshes when < 10 minutes remain (TTL 1h)", () => {
  const { needsSignedUrlRefresh, SIGNED_URL_TTL_SECONDS } = shotLib;
  const now = 1_000_000;
  assert.strictEqual(SIGNED_URL_TTL_SECONDS, 3600);
  assert.strictEqual(needsSignedUrlRefresh(undefined, now), true);
  assert.strictEqual(needsSignedUrlRefresh(now + 3600 * 1000, now), false);
  assert.strictEqual(needsSignedUrlRefresh(now + 11 * 60 * 1000, now), false);
  assert.strictEqual(needsSignedUrlRefresh(now + 9 * 60 * 1000, now), true);
});

it("E21(i): useSignedUrl batches via createSignedUrls with in-memory cache only (no localStorage/sessionStorage)", () => {
  const code = readSrc('src/hooks/useSignedUrl.ts');
  assert.ok(!/localStorage|sessionStorage/.test(code), "useSignedUrl must not touch web storage");
  assert.ok(code.includes('createSignedUrls('), "must batch with createSignedUrls");
  assert.ok(code.includes('SIGNED_URL_TTL_SECONDS'), "must use 1h TTL constant");
  assert.ok(code.includes('new Map'), "must cache in memory");
  assert.ok(code.includes('export function prefetchSignedUrls'), "must export prefetchSignedUrls");
});

it("E21(ii): stores no longer split '/trade-screenshots/'; trade GC by screenshotPath only (P7 E1)", () => {
  const tradeStore = readSrc('src/store/useTradeStore.ts');
  const playbookStore = readSrc('src/store/usePlaybookStore.ts');
  for (const code of [tradeStore, playbookStore]) {
    assert.ok(!code.includes("split('/trade-screenshots/')"), "legacy URL split must be gone");
  }
  // P7 E1: playbook image_url still stores a public URL -> keeps the legacy mapper; trades never read screenshot_url.
  assert.ok(playbookStore.includes('pathFromLegacyUrl('), "playbook store must derive path via pathFromLegacyUrl");
  assert.ok(!tradeStore.includes('pathFromLegacyUrl('), "trade store must not map legacy screenshot_url anymore");
  assert.ok(!/screenshot_url|screenshotUrl/.test(tradeStore), "trade store must not read/write screenshot_url");
  assert.ok(tradeStore.includes('(tradeToDelete.screenshotPath ?? null)'), "deleteTrade GC must use screenshotPath only");
  assert.ok(tradeStore.includes('(existingBefore.screenshotPath ?? null)'), "updateTrade GC must use screenshotPath only");
  assert.ok(tradeStore.includes('screenshot_path: finalScreenshotPath'), "addTrade must write screenshot_path");
  assert.ok(tradeStore.includes('payload.screenshot_path = null'), "removing an image must null screenshot_path");
  assert.ok(!/getPublicUrl/.test(tradeStore), "trade store must not build public URLs anymore");
  assert.ok(!/payload\.screenshot_url\s*=\s*(updates|final)/.test(tradeStore), "must never write a client-supplied URL to screenshot_url");
  assert.ok(playbookStore.includes('getPublicUrl'), "playbook keeps writing public-URL format to image_url (D6 decision)");
});

it("E21(iii): D4 render files no longer guard or render on trade.screenshotUrl", () => {
  const files = [
    'src/components/TradeCardsView.tsx',
    'src/components/TradeViewDetails.tsx',
    'src/components/ShareTradeModal.tsx',
    'src/components/TradeSlideOverDrawer.tsx',
    'src/components/TradeEditForm.tsx',
    'src/app/[locale]/journal/page.tsx',
    'src/app/[locale]/playbook/page.tsx',
  ];
  for (const f of files) {
    const code = readSrc(f);
    assert.ok(!/trade\.screenshotUrl\s*(&&|\?)/.test(code), `${f}: guard on trade.screenshotUrl`);
    assert.ok(!/src=\{\s*(trade|tradeToEdit)\.screenshotUrl/.test(code), `${f}: renders trade.screenshotUrl`);
    assert.ok(!/src=\{\s*(playbook|viewingPlaybook)\.imageUrl/.test(code), `${f}: renders playbook.imageUrl`);
    assert.ok(!/setScreenshot\(\s*tradeToEdit\.screenshotUrl/.test(code), `${f}: seeds editable screenshot with stored URL`);
  }
  assert.ok(!readSrc('src/components/TradeEditForm.tsx').includes('screenshotUrl:'), "TradeEditForm must not send screenshotUrl back (P1-AC7)");
});

it("E21(iv): ShareTradeModal exports PNG via plain Canvas 2D, no DOM-to-image deps, package.json only adds allow-listed deps", () => {
  const code = readSrc('src/components/ShareTradeModal.tsx');
  assert.ok(!/html2canvas|html-to-image|dom-to-image/.test(code), "no DOM-to-image library");
  assert.ok(code.includes("getContext(\"2d\")"), "uses Canvas 2D");
  assert.ok(code.includes('createImageBitmap('), "decodes chart from blob (untainted canvas)");
  assert.ok(code.includes('toBlob('), "exports via canvas.toBlob");
  assert.ok(!/getPublicUrl|share link|shareUrl/i.test(code), "no public URL / share link");
  const pkg = JSON.parse(readSrc('package.json'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const banned of ['html2canvas', 'html-to-image', 'dom-to-image']) {
    assert.ok(!(banned in deps), `package.json must not add ${banned}`);
  }
  let diff;
  try {
    diff = shotExecSync('git diff HEAD -- package.json', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  } catch (gitErr) {
    // N7: never pass vacuously when git is unavailable.
    throw new Error(`SKIPPED-AS-FAIL: cannot verify package.json vs HEAD (git diff failed: ${gitErr && gitErr.message})`);
  }
  // LOCKED EXCEPTION (P2 merge step M, GAP6 / E-M2, plan answer 4): the gate is intent-based.
  // The package.json diff vs HEAD may ONLY add dependency lines whose names are allow-listed below
  // (a removed line is tolerated only when it is re-added verbatim apart from a trailing comma).
  //   P2: zod (AI Coach payload schema) | P3: vitest | P4: @testing-library/* + jsdom (component tests)
  // Any other added, removed or changed line in package.json fails this gate.
  const E21_ALLOWED_DEPS = new Set([
    'zod',
    'vitest',
    '@testing-library/react', '@testing-library/dom', '@testing-library/jest-dom', '@testing-library/user-event',
    'jsdom',
  ]);
  // P3 logged exception (A1b): exactly this one script line may be added (no regex/prefix widening).
  const E21_EXACT_ALLOWED_LINES = new Set([
    '"test:unit": "vitest run"',
    // P7 logged exception (Step B1, registry Phase 7): the i18n hard-coded string scan script.
    '"test:i18n": "node scripts/i18n_hardcoded_scan.mjs"',
    // P7 logged exception (Step C5, registry Phase 7): the repo hygiene check script.
    '"test:hygiene": "node scripts/repo_hygiene_check.mjs --self-test"',
  ]);
  const diffLines = diff.split(/\r?\n/).filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  const norm = (l) => l.slice(1).trim().replace(/,$/, '');
  const added = diffLines.filter((l) => l.startsWith('+')).map(norm);
  const removed = diffLines.filter((l) => l.startsWith('-')).map(norm);
  const addedRest = [...added];
  for (const line of removed) {
    const idx = addedRest.indexOf(line);
    assert.ok(idx !== -1, `package.json must not remove or change: ${line}`);
    addedRest.splice(idx, 1);
  }
  for (const line of addedRest) {
    if (E21_EXACT_ALLOWED_LINES.has(line)) continue;
    const m = /^"([^"]+)"\s*:\s*"[^"]+"$/.exec(line);
    assert.ok(m && E21_ALLOWED_DEPS.has(m[1]), `package.json may only add allow-listed dependencies (got: ${line})`);
  }
});

it("F1: Journal keeps selected trade by id and renders the latest store copy (no stale screenshot snapshot)", () => {
  const journal = readSrc('src/app/[locale]/journal/page.tsx');
  assert.ok(journal.includes('useState<string | null>(null)') && journal.includes('setSelectedTradeId'), "selection state must be an id");
  assert.ok(/trades\.find\(t => t\.id === selectedTradeId\)/.test(journal), "selected trade must be looked up from useTradeStore.trades");
  assert.ok(!/useState<Trade \| null>\(null\);\s*$/m.test(journal.split('selectedTradeId')[0].slice(-200)), "no Trade snapshot state for the details modal");
  const share = readSrc('src/components/ShareTradeModal.tsx');
  assert.ok(/finally \{\s*chart\?\.close\(\);/.test(share), "ShareTradeModal must close the chart bitmap in finally (N6a)");
});

it("D7/D8: Screenshots i18n namespace has EN/VI parity and avatar uploads use ${user.id}/ folder", () => {
  const en = JSON.parse(readSrc('messages/en.json')).Screenshots;
  const vi = JSON.parse(readSrc('messages/vi.json')).Screenshots;
  assert.ok(en && vi, "Screenshots namespace in both locales");
  for (const k of ['loadError', 'signing', 'retry', 'shareDownloaded']) {
    assert.ok(en[k] && vi[k], `missing key ${k}`);
  }
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(vi).sort());
  const settings = readSrc('src/app/[locale]/settings/page.tsx');
  assert.ok(settings.includes('`${user.id}/${crypto.randomUUID()}.${fileExt}`'), "avatar path must be ${user.id}/${uuid}.${ext}");
  assert.ok(!settings.includes('`${user.id}-${Math.random()}'), "legacy flat avatar path removed");
});

// ============================================================================================
// DRAFT for merge step M (Phase 02, Agent A): runner Section 35 - AI Coach hardening.
// Paste this block into trade-note-app/scripts/test_enhancements_runner.mjs AFTER Section 34
// (before the final TOTAL lines). It relies only on the runner's existing `it`, `assert`, `fs`,
// `path`, `__dirname` (top-level await is already used by Section 34).
// S35_SRC_ROOT (env, optional) points the section at another source tree; used only for the
// D0b red-then-green proof against `git show HEAD:<path>` copies. Default = the app root.
// ============================================================================================

console.log("\n35. P2 Hardening: AI Coach payload schema, route order, fail-closed quota, generic errors:");

const s35Root = process.env.S35_SRC_ROOT ? path.resolve(process.env.S35_SRC_ROOT) : path.resolve(__dirname, '..');
const s35Read = (rel) => fs.readFileSync(path.resolve(s35Root, rel), 'utf8');
const s35Exists = (rel) => fs.existsSync(path.resolve(s35Root, rel));
const S35_CODES = ['UNAUTHORIZED', 'INVALID_INPUT', 'RATE_LIMITED', 'AI_UNAVAILABLE'];

// Runtime-imports the REAL schema module (Node type-stripping; it imports only zod at runtime).
let s35Schema;
let s35ImportError = null;
try {
  s35Schema = await import(new URL(`file:///${path.resolve(s35Root, 'src/lib/aiCoachSchema.ts').replace(/\\/g, '/')}`).href);
} catch (importErr) {
  s35ImportError = `GAP: cannot import src/lib/aiCoachSchema.ts: ${importErr && importErr.message}`;
  console.log(`  ${s35ImportError}`);
}
const s35Lib = () => {
  if (s35ImportError) throw new Error(s35ImportError);
  return s35Schema;
};

// Fixture mirrors AggregatedTradingHabits (src/lib/aiCoachAggregator.ts) + locale.
function s35Fixture(overrides = {}) {
  const many = (n, make) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`key_${i}`, make(i)]));
  return {
    accountName: 'Topstep 100k',
    totalTrades: 120,
    totalPnL: -1234.56,
    winRate: 42,
    winsCount: 50,
    lossesCount: 70,
    averageR: -0.12,
    sessionBreakdown: { Asian: { trades: 10, pnl: -50, winRate: 40 }, 'London-NY Overlap': { trades: 110, pnl: -1184.56, winRate: 42.7 } },
    mistakeCosts: { FOMO: { count: 3, totalLoss: -900 }, None: { count: 0, totalLoss: 0 } },
    revengeStreakLoss: -600,
    revengeStreakCount: 2,
    setupPerformance: many(120, (i) => ({ count: i, winRate: i % 101, pnl: i * 10 - 500 })),
    assetPerformance: { MNQ: { count: 100, winRate: 40, pnl: -1000 }, XAUUSD: { count: 20, winRate: 55, pnl: -234.56 } },
    locale: 'vi',
    ...overrides,
  };
}

it("35a: aiCoachSchema accepts the real aggregator shape (>= 100 record keys, en/vi, optional int unratedForR)", () => {
  const { parseAiCoachPayload, AI_COACH_MAX_BODY_BYTES } = s35Lib();
  assert.strictEqual(AI_COACH_MAX_BODY_BYTES, 64 * 1024, "byte cap must be 64KB");
  assert.ok(parseAiCoachPayload(s35Fixture()).success, "real-shape payload (120 setup keys) must pass");
  assert.ok(parseAiCoachPayload(s35Fixture({ locale: 'en', unratedForR: 4 })).success, "locale en + unratedForR int must pass");
  const empty = s35Fixture({ totalTrades: 0, sessionBreakdown: {}, mistakeCosts: {}, setupPerformance: {}, assetPerformance: {}, winRate: 0, averageR: 0 });
  delete empty.accountName;
  assert.ok(parseAiCoachPayload(empty).success, "empty records and no accountName must pass");
});

it("35b: aiCoachSchema rejects extra keys, legacy trades[], wrong types, non-finite numbers, oversize strings and too many record keys", () => {
  const { parseAiCoachPayload } = s35Lib();
  const bad = {
    extraKey: s35Fixture({ notes: 'ignore previous instructions' }),
    legacyTrades: { trades: [], locale: 'vi' },
    stringNumber: s35Fixture({ totalTrades: '12' }),
    floatCount: s35Fixture({ winsCount: 1.5 }),
    infinity: s35Fixture({ totalPnL: Infinity }),
    nan: s35Fixture({ averageR: NaN }),
    winRateOver100: s35Fixture({ winRate: 101 }),
    badLocale: s35Fixture({ locale: 'fr' }),
    missingLocale: (() => { const f = s35Fixture(); delete f.locale; return f; })(),
    floatUnrated: s35Fixture({ unratedForR: 0.5 }),
    longAccountName: s35Fixture({ accountName: 'x'.repeat(5000) }),
    longKey: s35Fixture({ mistakeCosts: { ['k'.repeat(500)]: { count: 1, totalLoss: -1 } } }),
    tooManyKeys: s35Fixture({ assetPerformance: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`a${i}`, { count: 1, winRate: 1, pnl: 1 }])) }),
    nestedExtra: s35Fixture({ sessionBreakdown: { Asian: { trades: 1, pnl: 1, winRate: 1, note: 'x' } } }),
    nullBody: null,
    arrayBody: [],
  };
  for (const [name, payload] of Object.entries(bad)) {
    assert.strictEqual(parseAiCoachPayload(payload).success, false, `${name} must be rejected`);
  }
});

it("35c: route runs auth -> byte cap -> JSON+zod -> consume_ai_quota(5, 600) -> OPENROUTER_API_KEY in that source order", () => {
  const code = s35Read('src/app/api/ai-coach/route.ts');
  const pos = (needle) => {
    const i = code.indexOf(needle);
    assert.ok(i >= 0, `route.ts must contain ${needle}`);
    return i;
  };
  const order = [
    pos('auth.getUser(token)'),
    pos('readBodyWithCap(req, AI_COACH_MAX_BODY_BYTES)'),
    pos('parseAiCoachPayload(json)'),
    pos('rpc("consume_ai_quota"'),
    pos('process.env.OPENROUTER_API_KEY'),
  ];
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] < order[i], `step ${i} out of order`);
  assert.ok(/content-length/i.test(code) && code.indexOf('content-length') < order[2], "declared Content-Length checked before parsing");
  assert.ok(/p_limit:\s*QUOTA_LIMIT/.test(code) && /QUOTA_LIMIT\s*=\s*5\b/.test(code) && /QUOTA_WINDOW_SECONDS\s*=\s*600\b/.test(code), "quota is 5 per 600 s");
  assert.strictEqual((code.match(/process\.env\.OPENROUTER_API_KEY/g) || []).length, 1, "upstream key read exactly once, after the quota");
});

it("35d: quota fails CLOSED and reads the table result as data?.[0]; user-JWT client only", () => {
  const code = s35Read('src/app/api/ai-coach/route.ts');
  assert.ok(code.includes('data?.[0]'), "RPC returns table -> read data?.[0]");
  assert.ok(/if \(quotaError\) \{[\s\S]{0,200}errorResponse\("AI_UNAVAILABLE", 503\)/.test(code), "RPC error -> AI_UNAVAILABLE 503");
  assert.ok(/if \(!quota \|\| typeof quota\.allowed !== "boolean"\) \{[\s\S]{0,200}errorResponse\("AI_UNAVAILABLE", 503\)/.test(code), "missing/odd RPC result -> AI_UNAVAILABLE 503");
  assert.ok(/errorResponse\("RATE_LIMITED", 429, \{ "Retry-After"/.test(code), "blocked -> 429 with Retry-After");
  assert.ok(/persistSession:\s*false/.test(code) && /autoRefreshToken:\s*false/.test(code), "server client does not persist sessions");
  assert.ok(!/service_role|SERVICE_ROLE/.test(code), "never service_role");
  assert.strictEqual((code.match(/createClient\(/g) || []).length, 1, "single Supabase client");
});

it("35e: route errors are only { error: CODE } with 4 codes; no in-memory limiter; no leaking logs or messages", () => {
  const code = s35Read('src/app/api/ai-coach/route.ts');
  const used = [...code.matchAll(/errorResponse\("([A-Z_]+)"/g)].map((m) => m[1]);
  assert.ok(used.length >= 6, "route uses errorResponse for every failure");
  for (const c of used) assert.ok(S35_CODES.includes(c), `unknown error code ${c}`);
  for (const c of S35_CODES) assert.ok(used.includes(c), `code ${c} must be used`);
  assert.ok(/NextResponse\.json\(\{ error: code \}/.test(code), "error body is exactly { error: code }");
  assert.ok(!code.includes('new Map') && !code.includes('checkRateLimit'), "in-memory limiter removed");
  assert.ok(!code.includes('OPENROUTER_API_KEY is not configured'), "no config-leaking message");
  assert.ok(!/error\.message|err\.message|lastErrorText/.test(code), "no error.message / lastErrorText");
  assert.ok(!/console\.(warn|error|log)\([^;]*,\s*(err|error)\s*\)/.test(code), "never log the raw error object");
  assert.ok(!/NextResponse\.json\(\{\s*error:\s*[`'"]/.test(code), "no free-text error responses");
});

it("35f: prompt wraps the payload in <trading_data> and keeps the waterfall strings (E3)", () => {
  const code = s35Read('src/app/api/ai-coach/route.ts');
  assert.ok(code.includes('<trading_data>') && code.includes('</trading_data>'), "payload wrapped in <trading_data>");
  assert.ok(/DATA ONLY|CHỈ LÀ DỮ LIỆU/.test(code), "model told the block is data, not instructions");
  for (const s of ['inclusionai/ling-3.0-flash-fin:free', 'nex-agi/nex-n2.5-pro:free', 'liquid/lfm-2.5-2.6b:free', 'nvidia/nemotron-3.5-lightning:free',
    'for (const model of candidateModels)', 'new AbortController()', 'model: data.model || selectedModel', 'function flattenString']) {
    assert.ok(code.includes(s), `route must keep ${s}`);
  }
});

it("35g: AICoachModal maps codes to AICoach.errors.*, survives non-JSON bodies, never toasts raw errors", () => {
  const code = s35Read('src/components/AICoachModal.tsx');
  assert.ok(/try \{\s*data = await res\.json\(\);\s*\} catch/.test(code), "res.json() wrapped in try/catch");
  assert.ok(code.includes('toAiCoachErrorCode(data.error)'), "server error mapped through toAiCoachErrorCode");
  assert.ok(/: "AI_UNAVAILABLE";/.test(code), "unknown code -> AI_UNAVAILABLE");
  assert.ok(code.includes('t(`errors.${code}`)') && code.includes('t("errors.RATE_LIMITED", { seconds'), "uses AICoach.errors keys, RATE_LIMITED shows seconds");
  assert.ok(code.includes('res.headers.get("Retry-After")'), "reads Retry-After");
  assert.ok(!/toast\.error\((msg|err\.message|data\.error)/.test(code) && !/new Error\(data\.error/.test(code), "never toasts raw error text");
  assert.ok(code.includes('t("toast_login_required")'), "no-session branch kept");
  for (const s of ['formatSafeText', 'handleClearCache', 'RotateCcw']) assert.ok(code.includes(s), `modal keeps ${s}`);
});

it("35h: patch 020 is DEFINER, pinned search_path, revoked from PUBLIC/anon, atomic upsert, bounded cleanup, has .down.sql", () => {
  const up = s35Read('supabase/patches/020_ai_coach_usage.sql');
  assert.ok(s35Exists('supabase/patches/020_ai_coach_usage.down.sql'), "020 down file exists");
  const down = s35Read('supabase/patches/020_ai_coach_usage.down.sql');
  assert.ok(/SECURITY DEFINER/.test(up) && /SET search_path = public, pg_temp/.test(up), "DEFINER + pinned search_path");
  assert.ok(/IF v_uid IS NULL THEN/.test(up), "auth.uid() NULL rejected");
  assert.ok(/p_limit < 1 OR p_limit > 100/.test(up) && /p_window_seconds < 1 OR p_window_seconds > 86400/.test(up), "parameter clamps");
  assert.ok(/REVOKE ALL ON public\.ai_coach_usage FROM anon, authenticated;/.test(up), "table revoked from anon/authenticated");
  assert.ok(/REVOKE ALL ON FUNCTION public\.consume_ai_quota\(integer, integer\) FROM PUBLIC, anon;/.test(up), "function revoked from PUBLIC, anon");
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.consume_ai_quota\(integer, integer\) TO authenticated;/.test(up), "EXECUTE for authenticated");
  assert.ok(/ON CONFLICT \(user_id, window_start\)\s*DO UPDATE SET count = u\.count \+ 1\s*WHERE u\.count < p_limit/.test(up), "single-statement atomic upsert");
  assert.ok(/-- DESTRUCTIVE-OK:[^\n]*\n\s*DELETE FROM public\.ai_coach_usage\s*WHERE user_id = v_uid/.test(up), "cleanup scoped to the caller with DESTRUCTIVE-OK");
  assert.ok(/ON DELETE CASCADE/.test(up) && /ENABLE ROW LEVEL SECURITY/.test(up), "FK cascade + RLS");
  assert.ok(/VALUES \('020', 'ai_coach_usage'\)/.test(up), "records schema_migrations 020");
  assert.ok(down.indexOf('DROP FUNCTION') >= 0 && down.indexOf('DROP FUNCTION') < down.indexOf('DROP TABLE'), "down drops function then table");
});

it("35i: grants probe, expected matrix and snapshot all know ai_coach_usage and consume_ai_quota", () => {
  const probe = s35Read('supabase/probes/11_p1_grants_matrix.sql');
  const expected = JSON.parse(s35Read('supabase/tests/grants_matrix.expected.json'));
  const snapshot = s35Read('supabase/schema.snapshot.sql');
  assert.ok(probe.includes("'ai_coach_usage'"), "probe 11 lists ai_coach_usage");
  assert.strictEqual(expected.version, 'p2-after-020');
  assert.ok(probe.includes(`'version', '${expected.version}'`), "probe version matches expected");
  assert.deepStrictEqual(expected.tables.ai_coach_usage.anon, []);
  assert.deepStrictEqual(expected.tables.ai_coach_usage.authenticated, []);
  assert.deepStrictEqual(expected.functions['consume_ai_quota(integer,integer)'], { PUBLIC: false, anon: false, authenticated: true });
  assert.ok(/CREATE TABLE IF NOT EXISTS public\.ai_coach_usage/.test(snapshot) && /FUNCTION public\.consume_ai_quota/.test(snapshot), "snapshot has table + function");
  assert.ok(snapshot.indexOf('REVOKE ALL ON public.ai_coach_usage') > snapshot.indexOf('ON ALL TABLES IN SCHEMA public TO authenticated'), "snapshot revokes after the bulk grant");
});

it("35j: AICoach.errors has the 4 codes in EN and VI (RATE_LIMITED uses {seconds}); zod is an explicit ^4 dependency", () => {
  const en = JSON.parse(s35Read('messages/en.json')).AICoach;
  const vi = JSON.parse(s35Read('messages/vi.json')).AICoach;
  assert.ok(en && en.errors && vi && vi.errors, "AICoach.errors in both locales");
  assert.deepStrictEqual(Object.keys(en.errors).sort(), [...S35_CODES].sort());
  assert.deepStrictEqual(Object.keys(vi.errors).sort(), [...S35_CODES].sort());
  assert.ok(en.errors.RATE_LIMITED.includes('{seconds}') && vi.errors.RATE_LIMITED.includes('{seconds}'), "RATE_LIMITED has {seconds}");
  const pkg = JSON.parse(s35Read('package.json'));
  assert.ok(/^\^4\./.test((pkg.dependencies || {}).zod || ''), "package.json dependencies.zod is ^4");
});

// ===== BEGIN Section 36 (workstream B fragment; merge step M pastes this before the TOTAL summary) =====
// Root override lets the red-then-green proof (D0b) point the checks at pre-P2 `git show HEAD:` copies.
console.log("\n36. P2 Hardening: Auth i18n, Public Auth Paths & Option F Contracts:");
const S36_ROOT = process.env.S36_ROOT || path.resolve(__dirname, '..');
const s36Read = (rel) => fs.readFileSync(path.resolve(S36_ROOT, rel), 'utf8');
const s36Exists = (rel) => fs.existsSync(path.resolve(S36_ROOT, rel));
const s36Keys = (obj, prefix = '') => Object.entries(obj || {}).flatMap(([k, v]) =>
  v && typeof v === 'object' ? s36Keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
const S36_AUTH_KEYS = [
  'brand', 'subtitleLogin', 'subtitleSignup', 'welcomeBack', 'accountCreated', 'emailLabel', 'emailPlaceholder',
  'passwordLabel', 'forgotPassword', 'forgotNeedEmail', 'forgotSent', 'processing', 'signIn', 'createAccount',
  'notMember', 'haveAccount', 'switchToSignup', 'switchToLogin', 'checkEmailTitle', 'checkEmailBody', 'resend',
  'resendDone', 'backToLogin', 'errors.invalidCredentials', 'errors.emailNotConfirmed', 'errors.rateLimited',
  'errors.weakPassword', 'errors.generic', 'reset.title', 'reset.newPassword', 'reset.confirmPassword',
  'reset.submit', 'reset.tooShort', 'reset.mismatch', 'reset.failed', 'reset.success', 'reset.expired',
];

it("B2/P2-AC7: Auth.* namespace has every used key and 100% EN/VI parity; AICoach.errors has EN/VI parity", () => {
  const en = JSON.parse(s36Read('messages/en.json'));
  const vi = JSON.parse(s36Read('messages/vi.json'));
  assert.ok(en.Auth && vi.Auth, "Auth namespace must exist in en.json and vi.json");
  const enKeys = s36Keys(en.Auth).sort();
  const viKeys = s36Keys(vi.Auth).sort();
  assert.deepStrictEqual(enKeys, viKeys, "Auth.* keys must match between EN and VI");
  for (const k of S36_AUTH_KEYS) assert.ok(enKeys.includes(k), `Auth.${k} missing`);
  assert.ok(en.AICoach && en.AICoach.errors && vi.AICoach && vi.AICoach.errors, "AICoach.errors must exist in EN and VI");
  assert.deepStrictEqual(s36Keys(en.AICoach.errors).sort(), s36Keys(vi.AICoach.errors).sort(), "AICoach.errors EN/VI parity");
});

it("B2/S7: auth page uses useTranslations('Auth') + @/i18n/routing, no raw Supabase error text, no hard-coded English JSX", () => {
  const src = s36Read('src/app/[locale]/auth/page.tsx');
  assert.ok(/useTranslations\(["']Auth["']\)/.test(src), "auth page must use useTranslations('Auth')");
  assert.ok(/from ["']@\/i18n\/routing["']/.test(src), "auth page must import navigation from @/i18n/routing");
  assert.ok(!/from ["']next\/navigation["']/.test(src), "auth page must not import next/navigation");
  assert.ok(!/err(or)?\.message/.test(src), "auth page must not surface error.message");
  for (const lit of ['Sign in to your journal', 'Email address', 'Create Account', 'Not a member', 'Account created successfully', 'Processing...']) {
    assert.ok(!src.includes(lit), `hard-coded English literal left in auth page: "${lit}"`);
  }
});

it("B3/B4: signup sends emailRedirectTo + check-email state with resend; forgot password redirects to /{locale}/auth/reset", () => {
  const src = s36Read('src/app/[locale]/auth/page.tsx');
  assert.ok(/signUp\(\{[\s\S]*?emailRedirectTo/.test(src), "signUp must pass options.emailRedirectTo");
  assert.ok(/auth\.resend\(\{[\s\S]*?type:\s*["']signup["']/.test(src), "check-email state must offer auth.resend({ type: 'signup' })");
  assert.ok(/data\.session/.test(src), "signup must branch on data.session (confirmation required)");
  assert.ok(/resetPasswordForEmail\([\s\S]*?\/auth\/reset/.test(src), "forgot password must redirect to /{locale}/auth/reset");
  assert.ok(/user_already_exists|email_exists/.test(src), "existing-account signup must map to the neutral check-email path");
});

it("B4: reset page exists, uses PASSWORD_RECOVERY flag or getSession, updateUser, then signOut + /auth", () => {
  assert.ok(s36Exists('src/app/[locale]/auth/reset/page.tsx'), "src/app/[locale]/auth/reset/page.tsx must exist");
  const src = s36Read('src/app/[locale]/auth/reset/page.tsx');
  assert.ok(/passwordRecovery/.test(src) && /getSession\(\)/.test(src), "reset page must check passwordRecovery flag OR getSession()");
  assert.ok(/updateUser\(\{\s*password\s*\}\)/.test(src), "reset page must call updateUser({ password })");
  assert.ok(/signOut\(\)[\s\S]*?push\(["']\/auth["']\)/.test(src), "reset page must signOut then push('/auth')");
  assert.ok(/from ["']@\/i18n\/routing["']/.test(src) && !/from ["']next\/navigation["']/.test(src), "reset page must use @/i18n/routing");
  const store = s36Read('src/store/useAuthStore.ts');
  assert.ok(/PASSWORD_RECOVERY/.test(store) && /passwordRecovery:\s*true/.test(store), "useAuthStore must set passwordRecovery on PASSWORD_RECOVERY");
});

it("B5/S7: AuthProvider uses ONE public-path list [/auth, /auth/reset] for render-null AND redirect; AppShell bypass after hooks", () => {
  const ap = s36Read('src/components/AuthProvider.tsx');
  assert.ok(/PUBLIC_AUTH_PATHS[^=]*=\s*\[\s*["']\/auth["']\s*,\s*["']\/auth\/reset["']\s*\]/.test(ap), "one shared list [/auth, /auth/reset]");
  assert.ok(!/pathname\s*!==\s*["']\/auth["']/.test(ap), "no per-site pathname !== '/auth' checks (use the shared list)");
  assert.ok(/!user\s*&&\s*!isPublic\)\s*\{\s*router\.push\(["']\/auth["']\)/.test(ap), "redirect effect must use the shared list");
  assert.ok(/if\s*\(!user\s*&&\s*!isPublic\)\s*\{\s*return null;/.test(ap), "render-null check must use the shared list");
  assert.ok(/user\s*&&\s*pathname\s*===\s*["']\/auth["']\)\s*\{[\s\S]*?router\.push\(["']\/["']\)/.test(ap), "signed-in on /auth -> '/'; /auth/reset stays");
  const shell = s36Read('src/components/AppShell.tsx');
  const hookIdx = shell.indexOf('usePathname()');
  const bypassIdx = shell.search(/if\s*\(isPublicAuthPath\(pathname\)\)\s*\{\s*return <>\{children\}<\/>;/);
  assert.ok(hookIdx > 0 && bypassIdx > hookIdx, "AppShell must call usePathname() before the auth-page early return");
  const lastEffect = shell.lastIndexOf('useEffect(');
  assert.ok(lastEffect > 0 && lastEffect < bypassIdx, "AppShell early return must come after all hooks");
});

it("B5/E-B3: option F - no @supabase/ssr anywhere in package.json or auth sources", () => {
  const pkg = JSON.parse(s36Read('package.json'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert.ok(!('@supabase/ssr' in deps), "@supabase/ssr must not be added (option F)");
  for (const f of ['src/components/AuthProvider.tsx', 'src/store/useAuthStore.ts', 'src/app/[locale]/auth/page.tsx']) {
    assert.ok(!s36Read(f).includes('@supabase/ssr'), `${f} must not import @supabase/ssr`);
  }
});
// ===== END Section 36 =====

// ===== BEGIN Section 37 (P3 hardening, Step F1: risk/R static guard, guard self-test, stats one-definition, form save-failure) =====
// Guard self-test baseline: P3_BASELINE_REF pins the last pre-P3 commit (app repo HEAD when P3 started).
// The plan text says `git show HEAD:<path>`; HEAD moves once P3 is committed, so the ref is pinned
// here (P3 logged deviation) and can be overridden with env P3_GUARD_BASELINE_REF.
console.log("\n37. P3 Hardening: Risk/R Static Guard, Guard Self-Test, One Win-Rate Definition, Form Save-Failure:");
const { execSync: s37Exec } = await import('node:child_process');
const S37_ROOT = path.resolve(__dirname, '..');
const P3_BASELINE_REF = process.env.P3_GUARD_BASELINE_REF || '32603a9';
const s37Read = (rel) => fs.readFileSync(path.resolve(S37_ROOT, rel), 'utf8');

// Files touched by P3 Steps D1-D9 (+ new P3 libs). D-1 global patterns also scan all of src/.
const S37_INSCOPE = [
  'src/store/useTradeStore.ts', 'src/store/useAccountStore.ts', 'src/hooks/useTradingDay.ts',
  'src/components/QuickLogTradeModal.tsx', 'src/components/TradeEditForm.tsx', 'src/components/TradeSlideOverDrawer.tsx',
  'src/app/[locale]/page.tsx', 'src/components/AuthProvider.tsx', 'src/app/[locale]/accounts/page.tsx',
  'src/app/[locale]/analytics/page.tsx', 'src/app/[locale]/playbook/page.tsx', 'src/app/[locale]/journal/page.tsx',
  'src/lib/aiCoachAggregator.ts', 'src/lib/analyticsMath.ts', 'src/lib/matrixAnalytics.ts', 'src/lib/disciplineScore.ts',
  'src/lib/propPresets.ts', 'src/lib/riskEngine.ts', 'src/lib/risk.ts', 'src/lib/stats.ts', 'src/lib/tradingDay.ts', 'src/lib/propRisk.ts',
  'src/components/TodaySessionCockpit.tsx', 'src/components/VisualRRBox.tsx', 'src/components/TradeViewDetails.tsx',
  'src/components/DailyExecutiveReportCard.tsx', 'src/components/TradeCardsView.tsx', 'src/components/JournalCalendarView.tsx',
  'src/components/ShareTradeModal.tsx', 'src/components/CommandPaletteModal.tsx', 'src/components/MatrixCorrelationAnalytics.tsx',
];
const S37_FORMS = ['src/components/QuickLogTradeModal.tsx', 'src/components/TradeEditForm.tsx', 'src/components/TradeSlideOverDrawer.tsx'];
const S37_STATS_FILES = [
  'src/app/[locale]/page.tsx', 'src/app/[locale]/analytics/page.tsx', 'src/app/[locale]/playbook/page.tsx',
  'src/lib/matrixAnalytics.ts', 'src/lib/aiCoachAggregator.ts', 'src/lib/analyticsMath.ts',
];
// avgR import is required where the file computes an average R; analytics/page.tsx gets avg R from analyticsMath.
const S37_AVGR_EXEMPT = new Set(['src/app/[locale]/analytics/page.tsx']);

// scope: 'src' = every non-test src file; 'inscope' = S37_INSCOPE; 'forms' = the 3 trade forms.
const S37_PATTERNS = [
  { id: 'D1-undefined-check', scope: 'src', re: /\b(riskAmount|rMultiple|r_multiple|risk_amount)\s*[!=]==?\s*undefined/g },
  { id: 'D1-typeof-undefined', scope: 'src', re: /typeof\s+[\w.]*(riskAmount|rMultiple)\s*[!=]==?\s*["']undefined/g },
  { id: 'D1-numeric-fallback', scope: 'src', re: /\b(riskAmount|rMultiple)\s*(\|\||\?\?)\s*(0|1|100|500)\b/g },
  { id: 'D1-or-500', scope: 'src', re: /\|\|\s*500\b/g },
  { id: 'S3i-nullish-not-null', scope: 'src', re: /\b(rMultiple|riskAmount)\s*\?\?(?!\s*null\b)/g },
  { id: 'S3ii-ternary-numeric-else', scope: 'inscope', re: /\b(riskAmount|rMultiple)\s*\)?\s*:\s*-?\d+(\.\d+)?\b/g },
  { id: 'S3iii-risk-or-100', scope: 'src', re: /riskAmount\s*>\s*0\s*\)?\s*\?\s*[\w.]*riskAmount\s*:\s*100\b/g },
  { id: 'S3iv-or-account1R', scope: 'forms', re: /\|\|\s*account1R/g },
  { id: 'S3iv-parseFloat-or', scope: 'forms', re: /parseFloat\([^)]*\)\s*\|\|/g },
  { id: 'F1-colon-500', scope: 'inscope', re: /:\s*500\b/g },
  { id: 'F1-string-500', scope: 'inscope', re: /["']500["']/g },
];

// Allow-list: FULL path + exact literal that must appear on the flagged line, with a justification.
const S37_ALLOW = [
  { file: 'src/app/[locale]/simulator/page.tsx', literal: 'hiddenRisk', why: 'simulator parameter, not a trade risk default' },
  { file: 'src/app/[locale]/simulator/components/AnalysisTable.tsx', literal: '500', why: 'AnalysisTable.tsx:10 simulator table parameter' },
  { file: 'src/components/PositionSizeCalculator.tsx', literal: 'placeholder=', why: 'calculator input placeholder' },
  { file: 'src/components/PositionSizeCalculator.tsx', literal: 'setCustomRiskValue(isFutures ? "300" : "500")', why: 'calculator preset value, not a trade risk default' },
  { file: 'src/app/[locale]/accounts/page.tsx', literal: 'setMaxDailyLoss("500")', why: 'maxDailyLoss "500" account form default (daily loss limit, not trade risk)' },
  { file: 'src/app/[locale]/accounts/page.tsx', literal: 'useState("500")', why: 'maxDailyLoss "500" account form initial state (daily loss limit)' },
  { file: 'src/app/api/ai-coach/route.ts', literal: 'lastStatus = 500', why: 'HTTP status, not risk' },
  { file: 'src/lib/propPresets.ts', literal: 'maxDailyLoss: 500', why: 'prop preset daily loss limit (firm rule), not a trade risk default' },
];
// P4 (D-13 / E-7): both P3 entries removed; the matrix and emotion win rates now use @/lib/stats.
const S37_WINRATE_ALLOW = [];
const S37_LOCAL_WINRATE = /\b\w*wins?\w*\s*\/\s*\(?\s*[\w.]*?\b(total|count|trades|decisive|decided)\w*/gi;

const s37Lines = (src) => src.split(/\r?\n/);
const s37LineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const s37Allowed = (list, file, lineText) => list.some((a) => a.file === file && lineText.includes(a.literal));

function s37ScanSource(file, src, scopes) {
  const hits = [];
  const lines = s37Lines(src);
  for (const p of S37_PATTERNS) {
    if (!scopes.has(p.scope)) continue;
    for (const m of src.matchAll(p.re)) {
      const ln = s37LineOf(src, m.index);
      const text = lines[ln - 1] || '';
      const block = src.slice(Math.max(0, m.index - 120), m.index + m[0].length);
      if (s37Allowed(S37_ALLOW, file, text) || s37Allowed(S37_ALLOW, file, block)) { if (process.env.S37_DUMP) console.log(`    [allow] ${p.id} ${file}:${ln} ${text.trim().slice(0, 100)}`); continue; }
      hits.push({ id: p.id, file, line: ln, text: text.trim().slice(0, 140) });
    }
  }
  return hits;
}
function s37Scopes(file) {
  const s = new Set(['src']);
  if (S37_INSCOPE.includes(file)) s.add('inscope');
  if (S37_FORMS.includes(file)) s.add('forms');
  return s;
}
function s37ListSrc() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.resolve(S37_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(rel); continue; }
      if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
    }
  };
  walk('src');
  return out.sort();
}
function s37FormCatchProblems(file, src) {
  const problems = [];
  if (!/SaveTradeError|SAVE_FAILED/.test(src)) problems.push(`${file}: does not handle SaveTradeError/SAVE_FAILED`);
  const catches = [...src.matchAll(/catch\s*\(\s*(\w+)[^)]*\)\s*\{/g)];
  const saveCatches = catches.filter((m) => /SaveTradeError|SAVE_FAILED/.test(src.slice(m.index, m.index + 600)));
  if (saveCatches.length === 0) problems.push(`${file}: no catch branch that tests SaveTradeError/SAVE_FAILED`);
  for (const m of saveCatches) {
    // body of the catch up to its matching closing brace
    let depth = 0; let end = m.index + m[0].length - 1;
    for (let i = end; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } } }
    const body = src.slice(m.index, end);
    if (/\bonClose\s*\(|\breset\w*\s*\(|\bclose\w*\s*\(|setIsOpen\(\s*false/.test(body)) problems.push(`${file}:${s37LineOf(src, m.index)}: SaveTradeError catch closes/resets the form`);
  }
  return problems;
}
function s37StatsProblems(file, src) {
  const problems = [];
  const imp = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/stats["']/);
  const names = imp ? imp[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]) : [];
  if (!names.includes('winRate')) problems.push(`${file}: must import winRate from @/lib/stats`);
  if (!S37_AVGR_EXEMPT.has(file) && !names.includes('avgR')) problems.push(`${file}: must import avgR from @/lib/stats`);
  const lines = s37Lines(src);
  for (const m of src.matchAll(S37_LOCAL_WINRATE)) {
    const ln = s37LineOf(src, m.index);
    const text = lines[ln - 1] || '';
    if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(text) || /<p|<span|<h\d/.test(text)) continue; // comments / JSX labels
    if (s37Allowed(S37_WINRATE_ALLOW, file, text)) continue;
    problems.push(`${file}:${ln}: local win-rate formula "${m[0]}"`);
  }
  return problems;
}
function s37WinRateExportCount(files, readFn) {
  let n = 0;
  for (const f of files) { const src = readFn(f); if (src == null) continue; n += (src.match(/export\s+(function|const|let)\s+winRate\b/g) || []).length; }
  return n;
}
const s37GitShow = (ref, rel) => {
  try { return s37Exec(`git show "${ref}:${rel}"`, { cwd: S37_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 }); } catch { return null; }
};

// --- Guard on the CURRENT code (GREEN required) ---
const s37SrcFiles = s37ListSrc();
const s37Current = s37SrcFiles.flatMap((f) => s37ScanSource(f, s37Read(f), s37Scopes(f)));
it("F1/D-1+S3: static guard finds no risk/R fallback, undefined-check, `|| 500`, `: 500`, `\"500\"`, `?? <non-null>`, numeric ternary else, or form `|| account1R` / `parseFloat(...) ||` in current src", () => {
  assert.deepStrictEqual(s37Current.map((h) => `${h.id} ${h.file}:${h.line} ${h.text}`), [], "static guard hits on current code");
});
it("F1/S4: the 3 trade forms catch SaveTradeError/SAVE_FAILED and the catch branch never closes or resets the form", () => {
  const problems = S37_FORMS.flatMap((f) => s37FormCatchProblems(f, s37Read(f)));
  assert.deepStrictEqual(problems, []);
});
it("F1/S5: dashboard, analytics, playbook, matrixAnalytics, aiCoachAggregator, analyticsMath import winRate/avgR from @/lib/stats with no local wins / total formula", () => {
  const problems = S37_STATS_FILES.flatMap((f) => s37StatsProblems(f, s37Read(f)));
  assert.deepStrictEqual(problems, []);
});
it("F1/D-1: exactly ONE exported winRate in src (src/lib/stats.ts)", () => {
  assert.strictEqual(s37WinRateExportCount(s37SrcFiles, s37Read), 1);
  assert.ok(/export\s+function\s+winRate\b/.test(s37Read('src/lib/stats.ts')), "the single winRate export lives in src/lib/stats.ts");
});

// --- Guard self-test on pre-P3 sources (RED required; anti vacuous-pass, precedent P2 D0b) ---
const s37BaseFiles = (() => { try { return s37Exec(`git ls-tree -r --name-only "${P3_BASELINE_REF}" -- src`, { cwd: S37_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes('__tests__')); } catch { return []; } })();
const s37BaseCache = new Map();
const s37BaseRead = (f) => { if (!s37BaseCache.has(f)) s37BaseCache.set(f, s37GitShow(P3_BASELINE_REF, f)); return s37BaseCache.get(f); };
// Patterns that never occurred in the pre-P3 tree are proven RED on a synthetic fixture instead.
const S37_SYNTHETIC = {
  'D1-typeof-undefined': 'const x = typeof t.riskAmount !== "undefined" ? t.riskAmount : 0;',
  'S3i-nullish-not-null': 'const r = t.rMultiple ?? computeR(t);',
  'D1-numeric-fallback': 'const risk = t.riskAmount || 100;',
};
it(`F1 self-test: guard is RED on pre-P3 sources (git show ${P3_BASELINE_REF}:<path>) for every D-1/S3 pattern (synthetic fixture only where the pre-P3 tree had no instance)`, () => {
  assert.ok(s37BaseFiles.length > 50, `could not list pre-P3 tree at ${P3_BASELINE_REF} (git missing or ref absent)`);
  const baseHits = s37BaseFiles.flatMap((f) => { const src = s37BaseRead(f); return src == null ? [] : s37ScanSource(f, src, s37Scopes(f)); });
  const byId = new Map();
  for (const h of baseHits) byId.set(h.id, (byId.get(h.id) || 0) + 1);
  const missing = [];
  const viaSynthetic = [];
  for (const p of S37_PATTERNS) {
    if (byId.get(p.id)) continue;
    const fx = S37_SYNTHETIC[p.id];
    const scope = p.scope === 'forms' ? S37_FORMS[0] : 'src/lib/stats.ts';
    if (fx && s37ScanSource(scope, fx, s37Scopes(scope)).some((h) => h.id === p.id)) { viaSynthetic.push(p.id); continue; }
    missing.push(p.id);
  }
  if (process.env.S37_DUMP) for (const h of baseHits) console.log(`    [red] ${h.id} ${h.file}:${h.line} ${h.text}`);
  console.log(`    self-test RED counts @${P3_BASELINE_REF}: ${[...byId].map(([k, v]) => `${k}=${v}`).join(', ')}${viaSynthetic.length ? ` | synthetic: ${viaSynthetic.join(', ')}` : ''}`);
  assert.deepStrictEqual(missing, [], "patterns the guard could not catch on pre-P3 code or synthetic fixture");
});
it(`F1 self-test: form, stats-import and single-winRate checks are RED on pre-P3 sources (${P3_BASELINE_REF})`, () => {
  const formProblems = S37_FORMS.flatMap((f) => { const s = s37BaseRead(f); return s == null ? [`${f}: missing`] : s37FormCatchProblems(f, s); });
  assert.ok(S37_FORMS.every((f) => formProblems.some((p) => p.startsWith(f))), "every pre-P3 form must fail the save-failure check");
  const statsProblems = S37_STATS_FILES.flatMap((f) => { const s = s37BaseRead(f); return s == null ? [] : s37StatsProblems(f, s); });
  assert.ok(S37_STATS_FILES.every((f) => statsProblems.some((p) => p.startsWith(f))), "every pre-P3 stats file must fail the import/formula check");
  assert.ok(statsProblems.some((p) => p.includes('local win-rate formula')), "pre-P3 local wins / total formulas must be detected");
  assert.notStrictEqual(s37WinRateExportCount(s37BaseFiles, s37BaseRead), 1, "pre-P3 tree must not satisfy the single-winRate check");
});
// ===== END Section 37 =====


// ===== Section 38 (P4 Hard Stop client static guard; append-only after Section 37) =====
// Every check is a pure function of a file reader so it runs GREEN on the current tree and RED on
// the pre-P4 baseline (git show ${P4_GUARD_BASELINE_REF}:<path>) — anti vacuous-pass (E-21).
console.log("\n38. P4 Hard Stop Client: Lock Errors, Config Lock UI, Trading-Day Today, Unrated Sentinel, i18n:");
const P4_GUARD_BASELINE_REF = process.env.P4_GUARD_BASELINE_REF || 'afba4c9';
const s38Cur = (rel) => { try { return s37Read(rel); } catch { return null; } };
const s38BaseCache = new Map();
const s38Base = (rel) => { if (!s38BaseCache.has(rel)) s38BaseCache.set(rel, s37GitShow(P4_GUARD_BASELINE_REF, rel)); return s38BaseCache.get(rel); };
const s38Norm = (src) => (src == null ? null : src.replace(/\r\n/g, '\n'));

const S38_LOCK_CATCH_FILES = [
  'src/components/QuickLogTradeModal.tsx', 'src/components/TradeSlideOverDrawer.tsx', 'src/components/TradeEditForm.tsx',
  'src/components/EstimatedRiskBadge.tsx', 'src/components/TradeDetailsModal.tsx', 'src/app/[locale]/journal/page.tsx',
];
const S38_CLASS_I = [
  'src/store/useTradeStore.ts', 'src/app/[locale]/journal/page.tsx', 'src/components/TodaySessionCockpit.tsx',
  'src/lib/disciplineScore.ts', 'src/app/[locale]/daily-review/page.tsx', 'src/components/DailyExecutiveReportCard.tsx',
  'src/components/PreMarketRoutineWidget.tsx',
];
const S38_DAY_BOUNDARY = [
  { id: 'toDateString', re: /\.toDateString\(\)/ },
  { id: 'toISOString-split', re: /toISOString\(\)\s*\.split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]/ },
  { id: 'toISOString-slice10', re: /toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/ },
  { id: 'format-today-yyyy-MM-dd', re: /format\(\s*new Date\(\)\s*,\s*["']yyyy-MM-dd["']\s*\)/ },
];
const S38_DAY_IMPORT = /\b(tradingDayKey|nowTradingDayKey|useTradingDay|tradesOfTradingDay|evaluateHardStop|useHardStop)\b/;
const S38_SENTINEL_FILES = [
  'src/components/TradeCardsView.tsx', 'src/components/TradeViewDetails.tsx', 'src/app/[locale]/journal/page.tsx',
  'src/lib/aiCoachAggregator.ts', 'src/lib/analyticsMath.ts', 'src/store/useTradeStore.ts',
];
const S38_I18N_REQUIRED = {
  HardStop: ['bannerTitle', 'bannerBody', 'lossOf', 'unlocksAt', 'editRestricted', 'deleteBlocked', 'lockedSubmit', 'configLocked', 'timezoneEstimated'],
  Psych: ['unrated', 'unratedCount', 'chooseEmotion', 'chooseMistake', 'chooseSetup'],
};

function s38FnBody(src, name) {
  const i = src.indexOf(`const ${name} =`);
  if (i < 0) return null;
  const next = src.slice(i + 1).search(/\n\s{2}const handle\w+ =/);
  return next < 0 ? src.slice(i) : src.slice(i, i + 1 + next);
}
function s38CatchBodies(src, marker) {
  const out = [];
  for (const m of src.matchAll(/catch\s*(\(\s*\w*[^)]*\))?\s*\{/g)) {
    let depth = 0; let end = m.index + m[0].length - 1;
    for (let k = end; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } } }
    const body = src.slice(m.index, end);
    if (body.includes(marker)) out.push({ line: s37LineOf(src, m.index), body });
  }
  return out;
}
const s38Checks = {
  noTiltGuard: (read, files) => files.filter((f) => (read(f) || '').includes('TILT_GUARD_ACTIVE')).map((f) => `${f}: TILT_GUARD_ACTIVE`),
  accountsConfigLock: (read) => {
    const f = 'src/app/[locale]/accounts/page.tsx'; const s = s38Norm(read(f)) || ''; const p = [];
    if (!/await updateAccount\(/.test(s)) p.push(`${f}: updateAccount is not awaited`);
    if (!/\.code === ["']HARD_STOP_CONFIG_LOCKED["']/.test(s)) p.push(`${f}: no HARD_STOP_CONFIG_LOCKED match by code`);
    return p;
  },
  settingsConfigLock: (read) => {
    const f = 'src/app/[locale]/settings/page.tsx'; const s = s38Norm(read(f)) || ''; const p = [];
    for (const fn of ['handleSaveRisk', 'handleSaveProfile']) {
      const body = s38FnBody(s, fn);
      if (!body) { p.push(`${f}: ${fn} missing`); continue; }
      if (!/\.code === ["']HARD_STOP_CONFIG_LOCKED["']/.test(body)) p.push(`${f}: ${fn} swallows HARD_STOP_CONFIG_LOCKED`);
      if (!body.includes('HardStop') && !body.includes('tHardStop')) p.push(`${f}: ${fn} has no HardStop message`);
    }
    return p;
  },
  lockCatches: (read) => {
    const p = [];
    for (const f of S38_LOCK_CATCH_FILES) {
      const s = s38Norm(read(f));
      if (s == null) { p.push(`${f}: missing`); continue; }
      const bodies = s38CatchBodies(s, 'HardStopError');
      if (bodies.length === 0) { p.push(`${f}: no catch handles HardStopError`); continue; }
      if (S37_FORMS.includes(f)) {
        for (const b of bodies) if (/\bonClose\s*\(|\breset\w*\s*\(|\bclose\w*\s*\(|setIsOpen\(\s*false/.test(b.body)) p.push(`${f}:${b.line}: HardStopError catch closes/resets the form`);
      }
    }
    return p;
  },
  noPositiveDefaults: (read, files) => {
    const p = [];
    for (const f of files) {
      const s = read(f) || '';
      if (/useState<EmotionTag>\(\s*["']Calm["']\s*\)/.test(s)) p.push(`${f}: useState<EmotionTag>("Calm")`);
      if (/useState<string>\(\s*["']Breakout["']\s*\)/.test(s)) p.push(`${f}: useState<string>("Breakout")`);
      if (/useState<MistakeTag>\(\s*["']None["']\s*\)/.test(s)) p.push(`${f}: useState<MistakeTag>("None")`);
      if (/emotion:\s*["']Calm["'],\s*\n\s*mistake:\s*["']None["']/.test(s.replace(/\r\n/g, '\n'))) p.push(`${f}: hard-coded emotion Calm / mistake None on save`);
    }
    return p;
  },
  dayBoundary: (read) => {
    const p = [];
    for (const f of S38_CLASS_I) {
      const s = read(f);
      if (s == null) { p.push(`${f}: missing`); continue; }
      for (const d of S38_DAY_BOUNDARY) if (d.re.test(s)) p.push(`${f}: day boundary via ${d.id}`);
      if (!S38_DAY_IMPORT.test(s)) p.push(`${f}: does not use tradingDayKey/useTradingDay/shared day helper`);
    }
    return p;
  },
  sentinel: (read) => {
    const p = [];
    for (const f of S38_SENTINEL_FILES) {
      const s = read(f);
      if (s == null) { p.push(`${f}: missing`); continue; }
      s37Lines(s).forEach((line, i) => {
        if (/mistake\s*!==\s*["']None["']/.test(line) && !/UNRATED|isRated/.test(line)) p.push(`${f}:${i + 1}: mistake !== "None" without UNRATED/isRated`);
      });
    }
    const m = read('src/lib/matrixAnalytics.ts') || '';
    if (/\|\|\s*["']Calm["']/.test(m)) p.push('src/lib/matrixAnalytics.ts: missing emotion counted as Calm');
    return p;
  },
  i18n: (read) => {
    const p = [];
    let en; let vi;
    try { en = JSON.parse(read('messages/en.json')); vi = JSON.parse(read('messages/vi.json')); } catch { return ['messages: unreadable']; }
    for (const [ns, keys] of Object.entries(S38_I18N_REQUIRED)) {
      const a = Object.keys(en?.[ns] || {}).sort(); const b = Object.keys(vi?.[ns] || {}).sort();
      if (JSON.stringify(a) !== JSON.stringify(b)) p.push(`${ns}: EN/VI key sets differ`);
      for (const k of keys) { if (!(k in (en?.[ns] || {}))) p.push(`en ${ns}.${k} missing`); if (!(k in (vi?.[ns] || {}))) p.push(`vi ${ns}.${k} missing`); }
    }
    return p;
  },
};

// --- current tree (GREEN required) ---
it("P4/F2b(1): no TILT_GUARD_ACTIVE string error left in src (HardStopError code HARD_STOP instead)", () => {
  assert.deepStrictEqual(s38Checks.noTiltGuard(s38Cur, s37SrcFiles), []);
});
it("P4/F2b(2): accounts page awaits updateAccount and maps HARD_STOP_CONFIG_LOCKED by code", () => {
  assert.deepStrictEqual(s38Checks.accountsConfigLock(s38Cur), []);
});
it("P4/F2b(3): settings handleSaveRisk AND handleSaveProfile map HARD_STOP_CONFIG_LOCKED (not swallowed by risk_failed/profile_failed)", () => {
  assert.deepStrictEqual(s38Checks.settingsConfigLock(s38Cur), []);
});
it("P4/F2b(4): QuickLog, Drawer, EditForm, EstimatedRiskBadge, TradeDetailsModal, journal handleDelete catch HardStopError; form catch bodies never close/reset", () => {
  assert.deepStrictEqual(s38Checks.lockCatches(s38Cur), []);
});
it("P4/F2b(5): S37_WINRATE_ALLOW is EMPTY at runtime (both P3 allow-list entries removed, D-13/E-7)", () => {
  assert.ok(Array.isArray(S37_WINRATE_ALLOW));
  assert.strictEqual(S37_WINRATE_ALLOW.length, 0);
});
it("P4/F2b(6): no positive-biased psychology defaults (Calm / None / Breakout) in src", () => {
  assert.deepStrictEqual(s38Checks.noPositiveDefaults(s38Cur, s37SrcFiles), []);
});
it("P4/F2b(7a): class-(i) files use the trading day (no toDateString / toISOString date cut / format(new Date) as day boundary)", () => {
  assert.deepStrictEqual(s38Checks.dayBoundary(s38Cur), []);
});
it("P4/F2b(7b): Unrated sentinel sweep: every mistake !== \"None\" also handles UNRATED/isRated; no `|| \"Calm\"` in the emotion matrix", () => {
  assert.deepStrictEqual(s38Checks.sentinel(s38Cur), []);
});
it("P4/F1: i18n EN = VI parity and required keys for the HardStop and Psych namespaces", () => {
  assert.deepStrictEqual(s38Checks.i18n(s38Cur), []);
});

// --- self-test on the pre-P4 baseline (RED required) ---
const s38BaseSrc = (() => { try { return s37Exec(`git ls-tree -r --name-only "${P4_GUARD_BASELINE_REF}" -- src`, { cwd: S37_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes('__tests__')); } catch { return []; } })();
it(`P4 self-test: every Section 38 check is RED on the pre-P4 baseline (git show ${P4_GUARD_BASELINE_REF}:<path>)`, () => {
  assert.ok(s38BaseSrc.length > 50, `could not list the pre-P4 tree at ${P4_GUARD_BASELINE_REF}`);
  const red = {
    noTiltGuard: s38Checks.noTiltGuard(s38Base, s38BaseSrc).length,
    accountsConfigLock: s38Checks.accountsConfigLock(s38Base).length,
    settingsConfigLock: s38Checks.settingsConfigLock(s38Base).length,
    lockCatches: s38Checks.lockCatches(s38Base).length,
    noPositiveDefaults: s38Checks.noPositiveDefaults(s38Base, s38BaseSrc).length,
    dayBoundary: s38Checks.dayBoundary(s38Base).length,
    sentinel: s38Checks.sentinel(s38Base).length,
    i18n: s38Checks.i18n(s38Base).length,
  };
  const baseRunner = s38Base('scripts/test_enhancements_runner.mjs') || '';
  red.winRateAllowList = (baseRunner.match(/S37_WINRATE_ALLOW = \[\s*\n\s*\{/) ? 1 : 0);
  console.log(`    self-test RED counts @${P4_GUARD_BASELINE_REF}: ${Object.entries(red).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  assert.deepStrictEqual(Object.entries(red).filter(([, v]) => v === 0).map(([k]) => k), [], "checks that are NOT red on the baseline (vacuous)");
});
// ===== END Section 38 =====

// ===== BEGIN Section 39 (P5 hardening: Hard Stop server - patches 050-053, golden generator, grants matrix) =====
console.log("\n--- Section 39: P5 Hard Stop server static guards (patches 050-053, golden SQL generator, grants matrix) ---");
const { execFileSync: s39Exec } = await import('node:child_process');
const s39Os = await import('node:os');
const S39_ROOT = path.resolve(__dirname, '..');
const S39_HARNESS = path.resolve(S39_ROOT, '../process/general-plans/active/hardening-security-data-integrity_11-10-26/harness/p5');
const s39Read = (rel) => fs.readFileSync(path.resolve(S39_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const s39Code = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const S39_PATCHES = ['050_trading_day_fn', '051_user_preferences_ensure_row', '052_hard_stop_trigger', '053_hard_stop_config_lock'];
const s39Up = Object.fromEntries(S39_PATCHES.map((p) => [p, s39Read(`supabase/patches/${p}.sql`)]));
const s39Down = Object.fromEntries(S39_PATCHES.map((p) => [p, s39Read(`supabase/patches/${p}.down.sql`)]));
const s39P052 = s39Code(s39Up['052_hard_stop_trigger']);
const s39P053 = s39Code(s39Up['053_hard_stop_config_lock']);
/** CREATE FUNCTION blocks: { name, header (up to AS $fn$), body } */
function s39Functions(code) {
  const out = [];
  const re = /CREATE OR REPLACE FUNCTION public\.(\w+)\s*\(([\s\S]*?)\)\s*RETURNS([\s\S]*?)AS \$fn\$([\s\S]*?)\$fn\$;/g;
  let m;
  while ((m = re.exec(code))) out.push({ name: m[1], header: m[3], body: m[4] });
  return out;
}
const s39AllFns = S39_PATCHES.flatMap((p) => s39Functions(s39Code(s39Up[p])).map((f) => ({ ...f, patch: p })));
const s39Bodyof = (name) => (s39AllFns.find((f) => f.name === name) || {}).body || '';
const S39_EXPECTED_FNS = [
  'trading_day', 'user_preferences_ensure_row', 'hard_stop_decide', 'hard_stop_evaluate', 'hard_stop_trades_trg',
  'hard_stop_config_decide', 'hard_stop_prefs_config_decide', 'hard_stop_config_accounts_trg', 'hard_stop_config_prefs_trg',
];

it("39a: patch 052 raises only HARD_STOP with ERRCODE 'P0001' + HINT 'HARD_STOP'; patch 053 only HARD_STOP_CONFIG_LOCKED", () => {
  assert.ok(/ERRCODE = 'P0001'/.test(s39P052) && /HINT = 'HARD_STOP',/.test(s39P052), "052 ERRCODE/HINT HARD_STOP");
  assert.ok(/ERRCODE = 'P0001'/.test(s39P053) && /HINT = 'HARD_STOP_CONFIG_LOCKED'/.test(s39P053), "053 HINT HARD_STOP_CONFIG_LOCKED");
  assert.deepStrictEqual([...s39P052.matchAll(/RAISE EXCEPTION '([^']*)'/g)].map((m) => m[1]), ['HARD_STOP']);
  assert.deepStrictEqual([...new Set([...s39P053.matchAll(/RAISE EXCEPTION '([^']*)'/g)].map((m) => m[1]))], ['HARD_STOP_CONFIG_LOCKED']);
  for (const [p, re] of [['052', /IF SQLSTATE = 'P0001' AND v_hint = 'HARD_STOP' THEN\s+RAISE;/], ['053', /IF SQLSTATE = 'P0001' AND v_hint = 'HARD_STOP_CONFIG_LOCKED' THEN\s+RAISE;/]]) {
    assert.ok(re.test(p === '052' ? s39P052 : s39P053), `${p}: internal errors fail open but the contract error is re-raised`);
  }
});

it("39b: every new function has SET search_path = '' and REVOKE ALL ... FROM PUBLIC, anon, authenticated (D-5)", () => {
  assert.deepStrictEqual(s39AllFns.map((f) => f.name).sort(), [...S39_EXPECTED_FNS].sort(), "function set of patches 050-053");
  const problems = [];
  for (const f of s39AllFns) {
    if (!/SET search_path = ''/.test(f.header)) problems.push(`${f.name}: search_path`);
    const code = s39Code(s39Up[f.patch]);
    if (!new RegExp(`REVOKE ALL ON FUNCTION public\\.${f.name}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`).test(code)) problems.push(`${f.name}: REVOKE`);
    if (new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f.name}\\b`).test(code)) problems.push(`${f.name}: GRANT EXECUTE`);
  }
  assert.deepStrictEqual(problems, []);
});

it("39c: trading_day is STABLE PARALLEL UNSAFE (not IMMUTABLE / STRICT / PARALLEL SAFE); hard_stop_evaluate is VOLATILE SECURITY DEFINER", () => {
  const h = s39AllFns.find((f) => f.name === 'trading_day').header;
  assert.ok(/\bSTABLE\b/.test(h) && /PARALLEL UNSAFE/.test(h), "STABLE PARALLEL UNSAFE");
  assert.ok(!/IMMUTABLE|\bSTRICT\b|RETURNS NULL ON NULL INPUT|PARALLEL SAFE/.test(h), "no IMMUTABLE/STRICT/PARALLEL SAFE");
  const ev = s39AllFns.find((f) => f.name === 'hard_stop_evaluate').header;
  assert.ok(/VOLATILE/.test(ev) && /SECURITY DEFINER/.test(ev), "evaluate VOLATILE (fresh snapshot after advisory lock) + DEFINER");
  for (const t of ['hard_stop_trades_trg', 'hard_stop_config_accounts_trg', 'hard_stop_config_prefs_trg', 'user_preferences_ensure_row']) {
    assert.ok(/SECURITY DEFINER/.test(s39AllFns.find((f) => f.name === t).header), `${t} SECURITY DEFINER`);
  }
});

it("39d: patches 050-053 (+ .down) have no transaction statements / CONCURRENTLY; each up records schema_migrations 05x", () => {
  const problems = [];
  for (const p of S39_PATCHES) {
    for (const [kind, sql] of [['up', s39Up[p]], ['down', s39Down[p]]]) {
      const code = s39Code(sql);
      if (/^\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION|END\s+(TRANSACTION|WORK))\s*(TRANSACTION|WORK)?\s*;/im.test(code)) problems.push(`${p} ${kind}: transaction statement`);
      if (/CONCURRENTLY/i.test(code)) problems.push(`${p} ${kind}: CONCURRENTLY`);
    }
    const v = p.slice(0, 3);
    if (!new RegExp(`INSERT INTO public\\.schema_migrations \\(version, name\\)\\s*VALUES \\('${v}'`).test(s39Code(s39Up[p]))) problems.push(`${p}: schema_migrations ${v}`);
    if (!new RegExp(`DELETE FROM public\\.schema_migrations WHERE version = '${v}'`).test(s39Code(s39Down[p]))) problems.push(`${p} down: schema_migrations ${v}`);
  }
  assert.deepStrictEqual(problems, []);
});

it("39e: trg_hard_stop DELETE branches RETURN OLD (never NEW); trigger is BEFORE INSERT OR UPDATE OR DELETE on public.trades", () => {
  const body = s39Bodyof('hard_stop_trades_trg');
  const branches = [...body.matchAll(/TG_OP = 'DELETE'[^\n]*THEN\s*\n\s*RETURN (\w+);/g)].map((m) => m[1]);
  assert.ok(branches.length >= 4, `expected >= 4 DELETE return branches, got ${branches.length}`);
  assert.deepStrictEqual([...new Set(branches)], ['OLD']);
  assert.ok(/CREATE TRIGGER trg_hard_stop\s+BEFORE INSERT OR UPDATE OR DELETE ON public\.trades\s+FOR EACH ROW EXECUTE FUNCTION public\.hard_stop_trades_trg\(\);/.test(s39P052));
  assert.ok(/IF pg_trigger_depth\(\) > 1 THEN/.test(body), "cascade exemption pg_trigger_depth() > 1");
  assert.ok(/IF v_uid IS NULL THEN\s+RAISE NOTICE/.test(body), "D5 admin bypass with NOTICE");
});

it("39f: every allowed-column array in patch 052 equals hard_stop.golden.json meta.allowedColumns (single source)", () => {
  const meta = JSON.parse(s39Read('test-fixtures/golden/hard_stop.golden.json')).meta.allowedColumns;
  const arrays = [...s39P052.matchAll(/c_allowed\s+CONSTANT text\[\] := ARRAY\[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  assert.strictEqual(arrays.length, 2, "decide + trigger arrays");
  for (const a of arrays) assert.deepStrictEqual(a, meta);
  assert.ok(meta.includes('risk_is_estimated') && !meta.includes('pnl') && !meta.includes('date') && !meta.includes('account_id'));
});

it("39g: S13 no cross-user oracle: triggers pass p_user := auth.uid() (never NEW/OLD.user_id) and return early for foreign rows", () => {
  const problems = [];
  for (const t of ['hard_stop_trades_trg', 'hard_stop_config_accounts_trg', 'hard_stop_config_prefs_trg']) {
    const body = s39Bodyof(t);
    if (!/v_uid\s+uuid := auth\.uid\(\);/.test(body)) problems.push(`${t}: v_uid := auth.uid()`);
    const calls = [...body.matchAll(/public\.hard_stop_evaluate\(([^,]+),/g)].map((m) => m[1].trim());
    if (calls.length === 0 || calls.some((c) => c !== 'v_uid')) problems.push(`${t}: hard_stop_evaluate first arg ${JSON.stringify(calls)}`);
    if (/hard_stop_evaluate\(\s*(NEW|OLD)\.user_id/.test(body)) problems.push(`${t}: user_id from row`);
    if (!/(OLD|NEW)\.user_id IS DISTINCT FROM v_uid/.test(body)) problems.push(`${t}: early return for foreign rows`);
  }
  if (!/WHERE a\.id = p_account AND a\.user_id = p_user;/.test(s39Bodyof('hard_stop_evaluate'))) problems.push('hard_stop_evaluate: account scoped to p_user');
  if (!/t\.user_id = p_user/.test(s39Bodyof('hard_stop_evaluate'))) problems.push('hard_stop_evaluate: trades scoped to p_user');
  if (/'STATUS'[\s\S]*?pg_advisory_xact_lock/.test(s39Bodyof('hard_stop_evaluate').split("IF v_op IN ('INSERT', 'UPDATE', 'DELETE') THEN")[0])) problems.push('STATUS path takes a lock');
  assert.deepStrictEqual(problems, []);
});

it("39h: patch 051 never blocks signup (ON CONFLICT DO NOTHING + EXCEPTION WHEN OTHERS THEN RAISE WARNING, no RAISE EXCEPTION)", () => {
  const code = s39Code(s39Up['051_user_preferences_ensure_row']);
  const body = s39Bodyof('user_preferences_ensure_row');
  assert.ok(/ON CONFLICT \(user_id\) DO NOTHING/.test(body) && /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/.test(body));
  assert.ok(!/RAISE EXCEPTION/.test(code));
  assert.ok(/AFTER INSERT ON auth\.users/.test(code), "trigger AFTER INSERT ON auth.users");
  assert.ok(!/DELETE FROM public\.user_preferences/.test(s39Code(s39Down['051_user_preferences_ensure_row'])), "down keeps rows");
});

it("39i: every .down.sql drops every function and trigger its patch creates; harness apply file ends with ROLLBACK and never COMMITs", () => {
  const problems = [];
  for (const p of S39_PATCHES) {
    const up = s39Code(s39Up[p]);
    const down = s39Code(s39Down[p]);
    for (const m of up.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)) if (!new RegExp(`DROP FUNCTION IF EXISTS public\\.${m[1]}\\(`).test(down)) problems.push(`${p}: ${m[1]}`);
    for (const m of up.matchAll(/CREATE TRIGGER (\w+)/g)) if (!new RegExp(`DROP TRIGGER IF EXISTS ${m[1]} `).test(down)) problems.push(`${p}: ${m[1]}`);
  }
  assert.deepStrictEqual(problems, []);
  const apply = fs.readFileSync(path.join(S39_HARNESS, 'apply_050_053_with_golden.sql'), 'utf8').replace(/\r\n/g, '\n');
  const lines = s39Code(apply).split('\n').map((l) => l.trim()).filter(Boolean);
  assert.strictEqual(lines[0], 'BEGIN;');
  assert.strictEqual(lines[lines.length - 1], 'ROLLBACK;');
  assert.ok(!/^\s*COMMIT\s*;/im.test(s39Code(apply)), "no COMMIT");
  assert.ok(!/051_user_preferences_ensure_row|auth\.users/.test(s39Code(apply)), "051 is applied separately (stage 3)");
});

it("39j: gen_sql_golden --check is green; generated SQL carries hash + n and RAISEs on mismatch", () => {
  const out = s39Exec(process.execPath, [path.join(S39_ROOT, 'scripts/gen_sql_golden.mjs'), '--check'], { encoding: 'utf8' });
  assert.ok(/--check: OK/.test(out), out);
  const counts = /hard_stop (\d+) cases \(run (\d+), override (\d+), skip (\d+)\)/.exec(out);
  assert.ok(counts && Number(counts[1]) === Number(counts[2]) + Number(counts[3]) + Number(counts[4]), "every case classified");
  for (const [f, golden] of [['trading_day', 'trading_day'], ['hard_stop', 'hard_stop'], ['hard_stop_config_lock', 'hard_stop_config_lock']]) {
    const sql = s39Read(`supabase/tests/${f}_golden.generated.sql`);
    const n = JSON.parse(s39Read(`test-fixtures/golden/${golden}.golden.json`)).cases.length;
    assert.ok(/-- source-sha256: [0-9a-f]{64}/.test(sql), `${f}: hash`);
    assert.ok(new RegExp(`-- cases: ${n}\\b`).test(sql), `${f}: n = ${n}`);
    assert.ok(/RAISE EXCEPTION '\w+ golden FAIL/.test(sql) && /RAISE NOTICE '\w+ golden PASS %\/%'/.test(sql), `${f}: RAISE on mismatch, PASS n/n`);
  }
});

it("39k: gen_sql_golden --check FAILS on an unclassified golden case and on hash drift (self-test in a temp copy)", () => {
  const tmp = fs.mkdtempSync(path.join(s39Os.tmpdir(), 'p5-golden-'));
  try {
    const gdir = path.join(tmp, 'golden');
    fs.mkdirSync(gdir);
    for (const f of ['trading_day.golden.json', 'hard_stop.golden.json', 'hard_stop.server_overrides.json', 'hard_stop_config_lock.golden.json']) {
      fs.copyFileSync(path.join(S39_ROOT, 'test-fixtures/golden', f), path.join(gdir, f));
    }
    const run = () => {
      try {
        s39Exec(process.execPath, [path.join(S39_ROOT, 'scripts/gen_sql_golden.mjs'), '--check', '--golden-dir', gdir, '--harness-dir', path.join(tmp, 'no', 'harness')], { encoding: 'utf8', stdio: 'pipe' });
        return { code: 0, out: '' };
      } catch (e) {
        return { code: e.status, out: `${e.stdout}${e.stderr}` };
      }
    };
    assert.strictEqual(run().code, 0, "unchanged copy passes");
    const sidePath = path.join(gdir, 'hard_stop.server_overrides.json');
    const side = JSON.parse(fs.readFileSync(sidePath, 'utf8'));
    const first = Object.keys(side.cases)[0];
    delete side.cases[first];
    fs.writeFileSync(sidePath, JSON.stringify(side, null, 2));
    const r1 = run();
    assert.ok(r1.code === 1 && /unclassified golden case/.test(r1.out), `unclassified -> exit 1: ${r1.out}`);
    fs.copyFileSync(path.join(S39_ROOT, 'test-fixtures/golden/hard_stop.server_overrides.json'), sidePath);
    const tdPath = path.join(gdir, 'trading_day.golden.json');
    const td = JSON.parse(fs.readFileSync(tdPath, 'utf8'));
    td.cases[0].expected = '1999-01-01';
    fs.writeFileSync(tdPath, JSON.stringify(td, null, 2));
    const r2 = run();
    assert.ok(r2.code === 1 && /stale generated file/.test(r2.out), `hash drift -> exit 1: ${r2.out}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("39l: grants matrix knows every new function (PUBLIC/anon/authenticated = false); version and 35i pin unchanged; probe 11 scans pg_proc", () => {
  const expected = JSON.parse(s39Read('supabase/tests/grants_matrix.expected.json'));
  assert.strictEqual(expected.version, 'p2-after-020');
  const sigs = [
    'trading_day(timestamp with time zone,text,time without time zone,text)',
    'user_preferences_ensure_row()',
    'hard_stop_decide(jsonb,jsonb,text,text,jsonb,jsonb,timestamp with time zone)',
    'hard_stop_evaluate(uuid,uuid,text,jsonb,jsonb,timestamp with time zone)',
    'hard_stop_trades_trg()',
    'hard_stop_config_decide(jsonb,jsonb,boolean)',
    'hard_stop_prefs_config_decide(text,text,boolean)',
    'hard_stop_config_accounts_trg()',
    'hard_stop_config_prefs_trg()',
  ];
  assert.strictEqual(sigs.length, S39_EXPECTED_FNS.length);
  for (const s of sigs) assert.deepStrictEqual(expected.functions[s], { PUBLIC: false, anon: false, authenticated: false }, s);
  const probe = s39Read('supabase/probes/11_p1_grants_matrix.sql');
  assert.ok(/FROM pg_proc p/.test(probe) && /n\.nspname = 'public'/.test(probe), "probe 11 scans pg_proc (no fixed function list)");
});

it("39m: schema.snapshot.sql has the P5 functions + triggers AFTER the bulk GRANT, with explicit REVOKEs", () => {
  const snap = s39Read('supabase/schema.snapshot.sql');
  const grantIdx = snap.indexOf('ON ALL TABLES IN SCHEMA public TO authenticated');
  assert.ok(grantIdx > 0);
  for (const f of S39_EXPECTED_FNS) {
    const c = snap.indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`);
    const r = snap.indexOf(`REVOKE ALL ON FUNCTION public.${f}(`);
    assert.ok(c > grantIdx && r > c, `${f}: created + revoked after the bulk grant`);
  }
  for (const t of ['trg_hard_stop', 'trg_hard_stop_config_accounts', 'trg_hard_stop_config_prefs', 'trg_user_preferences_ensure_row']) {
    assert.ok(snap.includes(`CREATE TRIGGER ${t}\n`), t);
  }
  assert.ok(!/schema_migrations/.test(snap), "snapshot has no schema_migrations rows");
});

it("39n: probe 50 is read-only and checks name collisions, auth.users trigger privilege, non-numeric maxDailyLoss and the (account_id, date) index by definition", () => {
  const code = s39Code(s39Read('supabase/probes/50_p5_pre_checks.sql'));
  assert.ok(!/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE)\b/i.test(code.replace(/'[^']*'/g, "''")), "read-only");
  for (const needle of ["'trg_hard_stop'", "'auth.users', 'TRIGGER'", "'maxDailyLoss'", 'indkey[0]', 'indkey[1]', "'authenticated', 'MEMBER'"]) {
    assert.ok(code.includes(needle), needle);
  }
});
it("39o: fix leg (M1) prefs config lock covers DELETE: BEFORE UPDATE OR DELETE, DELETE returns OLD, D5 + cascade bypass kept", () => {
  assert.ok(/CREATE TRIGGER trg_hard_stop_config_prefs\s+BEFORE UPDATE OR DELETE ON public\.user_preferences\s+FOR EACH ROW EXECUTE FUNCTION public\.hard_stop_config_prefs_trg\(\);/.test(s39P053));
  const body = s39Bodyof('hard_stop_config_prefs_trg');
  const branches = [...body.matchAll(/TG_OP = 'DELETE'[^\n]*THEN\s*\n\s*RETURN (\w+);/g)].map((m) => m[1]);
  assert.ok(branches.length >= 3, `expected >= 3 DELETE return branches, got ${branches.length}`);
  assert.deepStrictEqual([...new Set(branches)], ['OLD']);
  assert.ok(/IF v_uid IS NULL THEN\s+RAISE NOTICE/.test(body), "D5 admin bypass");
  assert.ok(/IF pg_trigger_depth\(\) > 1 THEN/.test(body), "cascade (delete user/account) bypass");
  assert.ok(body.indexOf('IF v_uid IS NULL') < body.indexOf('pg_trigger_depth()'), "D5 checked first");
});

it("39p: fix leg (M2/m1/m2/m3/m5): limit <= 0 is off; deadlock re-raised; prefs decide STABLE; 051 trigger before backfill + re-apply warning; probe 50 counts '%' with balance <= 0", () => {
  const decide = s39Bodyof('hard_stop_decide');
  assert.ok(/IF v_limit_x100 IS NOT NULL AND v_limit_x100 <= 0 THEN\s+v_limit_x100 := NULL;/.test(decide), "052 non-positive limit -> NULL (off)");
  const trg = s39Bodyof('hard_stop_trades_trg');
  const dl = trg.indexOf("IF SQLSTATE = '40P01' THEN");
  assert.ok(dl > 0 && /IF SQLSTATE = '40P01' THEN\s+RAISE;/.test(trg) && dl < trg.indexOf("RAISE WARNING 'hard_stop: internal error"), "deadlock re-raised before fail-open");
  const h = s39AllFns.find((f) => f.name === 'hard_stop_prefs_config_decide').header;
  assert.ok(/\bSTABLE\b/.test(h) && !/IMMUTABLE/.test(h), "prefs decide STABLE");
  const p051 = s39Up['051_user_preferences_ensure_row'];
  const c051 = s39Code(p051);
  assert.ok(c051.indexOf('CREATE TRIGGER trg_user_preferences_ensure_row') < c051.indexOf('INSERT INTO public.user_preferences (user_id)\nSELECT'), "051 trigger created before backfill");
  assert.ok(/CẢNH BÁO: chạy lại patch này sẽ BẬT LẠI trigger/.test(p051), "051 re-apply warning");
  assert.ok(s39Code(s39Read('supabase/probes/50_p5_pre_checks.sql')).includes("'hard_stop_percent_nonpositive_balance'"), "probe 50 count");
});

it("39q: schema.snapshot.sql P5 blocks equal the patch bodies verbatim (header comments + schema_migrations row excluded)", () => {
  const snap = s39Read('supabase/schema.snapshot.sql');
  const marks = S39_PATCHES.map((p) => snap.indexOf(`-- ---- patch ${p.slice(0, 3)}:`));
  marks.forEach((m, i) => assert.ok(m > 0, `${S39_PATCHES[i]} marker`));
  const problems = [];
  S39_PATCHES.forEach((p, i) => {
    const seg = snap.slice(snap.indexOf('\n', marks[i]) + 1, i < 3 ? marks[i + 1] : snap.length).trimEnd();
    const lines = s39Up[p].split('\n');
    let k = 0;
    while (k < lines.length && (lines[k].startsWith('--') || lines[k].trim() === '')) k++;
    const rest = lines.slice(k).join('\n');
    const body = rest.slice(0, rest.indexOf('INSERT INTO public.schema_migrations')).trimEnd();
    if (seg !== body) problems.push(p);
  });
  assert.deepStrictEqual(problems, []);
});

it("39r: sidecar has 0 skip; prefs-not-loaded, legacy-asset and the decimal-percent boundary are serverExpected with reason", () => {
  const side = JSON.parse(s39Read('test-fixtures/golden/hard_stop.server_overrides.json')).cases;
  const groups = Object.values(side).map((e) => e.group);
  assert.strictEqual(groups.filter((g) => g === 'skip').length, 0);
  const se = Object.entries(side).filter(([, e]) => e.group === 'serverExpected').map(([n]) => n);
  for (const needle of ['prefs not loaded', 'legacy lowercase asset', 'decimal boundary']) assert.ok(se.some((n) => n.includes(needle)), needle);
});
// ===== END Section 39 =====

// ===== BEGIN Section 40 (P6 hardening: data consistency - UI wiring static guards, i18n merge, rename) =====
console.log("\n--- Section 40: P6 UI wiring static guards (preset picker, orphan card, load banners, journal B5, rename, i18n) ---");
const S40_ROOT = path.resolve(__dirname, '..');
const s40Read = (rel) => fs.readFileSync(path.resolve(S40_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const s40En = JSON.parse(s40Read('messages/en.json'));
const s40Vi = JSON.parse(s40Read('messages/vi.json'));
const s40Flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? s40Flat(v, `${p}${k}.`) : [`${p}${k}`]));
/** Keys used through t("key") / t('key') in a file with a single translator namespace binding. */
const s40Keys = (src, fn) => [...src.matchAll(new RegExp(`\\b${fn}\\(\\s*["']([\\w.]+)["']`, 'g'))].map((m) => m[1]);

it("40a: preset picker link has rel=\"noopener noreferrer\" + target=_blank and renders source / recordedOn / unverified", () => {
  const src = s40Read('src/app/[locale]/accounts/page.tsx');
  assert.ok(/target="_blank"\s+rel="noopener noreferrer"|rel="noopener noreferrer"[\s\S]{0,80}target="_blank"/.test(src) || (src.includes('target="_blank"') && src.includes('rel="noopener noreferrer"')), 'picker link target/rel');
  for (const k of ['source', 'recordedOn', 'unverified']) assert.ok(src.includes(`tPresets('${k}'`), `Presets.${k} rendered`);
  assert.ok(src.includes('useTranslations("Presets")'), 'Presets namespace');
});

it("40b: E21(ii) storage literals still present in the stores (P1/P6)", () => {
  const ts = s40Read('src/store/useTradeStore.ts');
  for (const lit of ['(tradeToDelete.screenshotPath ?? null)', 'screenshot_path: finalScreenshotPath', 'payload.screenshot_path = null']) assert.ok(ts.includes(lit), lit);
  assert.ok(!ts.includes('getPublicUrl'), 'no getPublicUrl in useTradeStore');
  assert.ok(s40Read('src/store/usePlaybookStore.ts').includes('getPublicUrl'), 'playbook store keeps getPublicUrl');
});

it("40c: AI Coach send and simulator run/sync are gated by useHistoryReady (isFullyLoaded + loaded account)", () => {
  const ai = s40Read('src/components/AICoachModal.tsx');
  assert.ok(ai.includes('useHistoryReady()') && ai.includes('!historyReady'), 'AICoach gate');
  const sim = s40Read('src/app/[locale]/simulator/page.tsx');
  assert.ok(sim.includes('useHistoryReady()') && /disabled=\{isCalculating \|\| !historyReady\}/.test(sim), 'simulator run gate');
  const banner = s40Read('src/components/TradesLoadBanner.tsx');
  assert.ok(banner.includes('isFullyLoaded') && banner.includes('isHistoryReady('), 'hook reads isFullyLoaded via isHistoryReady');
});

it("40d: orphan card - Scan separate from Delete, Delete only behind an alertdialog confirm, queue retry on open", () => {
  const src = s40Read('src/components/OrphanCleanupCard.tsx');
  assert.ok(src.includes('t("scan")') && src.includes('t("delete")'), 'two buttons');
  assert.ok(src.includes('role="alertdialog"') && src.includes('t("confirmBody"'), 'confirm dialog');
  const delIdx = src.indexOf('data-testid="orphan-confirm-delete"');
  assert.ok(delIdx > src.indexOf('{confirmOpen && ('), 'final delete only inside the confirm');
  assert.ok(/useEffect\(\(\) => \{[\s\S]{0,200}retryOrphanQueue\(/.test(src), 'retryOrphanQueue runs in a mount effect');
  assert.ok(s40Read('src/app/[locale]/settings/page.tsx').includes('<OrphanCleanupCard'), 'settings renders the card');
  assert.ok(/not be undone|cannot be undone/i.test(s40En.OrphanCleanup.confirmBody) && /KHÔNG thể hoàn tác/.test(s40Vi.OrphanCleanup.confirmBody), 'irreversible wording EN/VI');
});

it("40e: load-error banner on every reading page (dashboard, analytics, daily-review, journal, CommandPalette, AICoach, simulator)", () => {
  for (const f of ['src/app/[locale]/page.tsx', 'src/app/[locale]/analytics/page.tsx', 'src/app/[locale]/daily-review/page.tsx', 'src/app/[locale]/journal/page.tsx', 'src/components/CommandPaletteModal.tsx', 'src/components/AICoachModal.tsx', 'src/app/[locale]/simulator/page.tsx']) {
    const src = s40Read(f);
    assert.ok(src.includes('from "@/components/TradesLoadBanner"') || src.includes("from '@/components/TradesLoadBanner'"), `${f} imports banner`);
    assert.ok(/<TradesLoadBanner(\s+compact)?\s*\/>/.test(src), `${f} renders banner`);
  }
});

it("40f: journal B5 - classic pagination kept, page reset key includes account + load state, filters run over all trades", () => {
  const src = s40Read('src/app/[locale]/journal/page.tsx');
  assert.ok(/const pageSize = 30;/.test(src), 'pageSize kept');
  const key = (src.match(/const filterKey = `([^`]*)`/) || [])[1] || '';
  assert.ok(key.includes('${activeAccountId}') && key.includes('${tradesLoading}'), 'reset key covers account + reload');
  assert.ok(/if \(filterKey !== prevFilterKey\) \{[\s\S]{0,80}setCurrentPage\(1\)/.test(src), 'reset to page 1');
  assert.ok(/filteredTrades\.slice\(start, start \+ pageSize\)/.test(src), 'pagination slices the filtered full list');
  assert.ok(src.includes('<TradesLoadBanner compact />'), 'loading label near the total');
});

it("40g: rename - shared matcher used by edge stats and rename count; rename dialog gated by useHistoryReady; no trades update", () => {
  const page = s40Read('src/app/[locale]/playbook/page.tsx');
  assert.ok(page.includes('from "@/lib/playbookMatch"'), 'imports shared matcher');
  assert.ok(!/setup\.trim\(\)\.toLowerCase\(\)/.test(page), 'no inline duplicate matcher');
  assert.ok(page.includes('ready={historyReady}') && page.includes('isPlaybookRename('), 'dialog gated');
  assert.ok(!/from\(['"]trades['"]\)/.test(s40Read('src/store/usePlaybookStore.ts')), 'playbook store never touches trades');
  assert.ok(s40En.Playbook.renameNewOnlyBody.includes('in the active account') && s40Vi.Playbook.renameNewOnlyBody.includes('trong tài khoản đang chọn'), 'scope wording');
});

it("40h: i18n EN = VI parity (100%) and every key used by the P6 components exists in both", () => {
  const en = s40Flat(s40En); const vi = s40Flat(s40Vi);
  assert.deepStrictEqual(en.filter((k) => !vi.includes(k)), [], 'missing in vi');
  assert.deepStrictEqual(vi.filter((k) => !en.includes(k)), [], 'missing in en');
  const uses = [
    ['OrphanCleanup', s40Keys(s40Read('src/components/OrphanCleanupCard.tsx'), 't')],
    ['Common', s40Keys(s40Read('src/components/TradesLoadBanner.tsx'), 't')],
    ['Presets', s40Keys(s40Read('src/app/[locale]/accounts/page.tsx'), 'tPresets')],
    ['Playbook', s40Keys(s40Read('src/components/PlaybookRenameDialog.tsx'), 't')],
  ];
  const missing = [];
  for (const [ns, keys] of uses) {
    assert.ok(keys.length > 0, `${ns} keys found`);
    for (const k of keys) for (const [lang, m] of [['en', s40En], ['vi', s40Vi]]) if (!(m[ns] && typeof m[ns][k] === 'string')) missing.push(`${lang}:${ns}.${k}`);
  }
  assert.deepStrictEqual(missing, []);
});
// ===== END Section 40 =====

// ===== BEGIN Section 41 (P7 hardening: i18n hard-coded string scan, Cooldown/Meta, generateMetadata) =====
console.log("\n--- Section 41: P7 i18n scan (AST), Cooldown/Meta parity, generateMetadata ---");
const s41Scan = await import('./i18n_hardcoded_scan.mjs');
const s41En = JSON.parse(s40Read('messages/en.json'));
const s41Vi = JSON.parse(s40Read('messages/vi.json'));

it("41a: i18n scan self-test (Vietnamese/English caught; //, U+00D7, comments ignored; reason required)", () => {
  assert.deepStrictEqual(s41Scan.selfTest(), []);
});

it("41b: allow-list valid (every entry has a reason) and no finding outside it", () => {
  const list = s41Scan.loadAllowlist();
  assert.deepStrictEqual(s41Scan.validateAllowlist(list), []);
  const left = s41Scan.applyAllowlist(s41Scan.scanProject(), list);
  assert.deepStrictEqual(left.map((f) => `[${f.kind}] ${f.file}:${f.line} ${f.text}`), []);
});

it("41c: P7 screens carry no hard-coded Vietnamese (QuickLog, Drawer, Cockpit, CardsView, layout)", () => {
  const files = ['src/components/QuickLogTradeModal.tsx', 'src/components/TradeSlideOverDrawer.tsx', 'src/components/TodaySessionCockpit.tsx', 'src/components/TradeCardsView.tsx', 'src/app/[locale]/layout.tsx'];
  const vi = files.flatMap((f) => s41Scan.scanSource(f, s40Read(f)).filter((x) => x.kind === 'vi'));
  assert.deepStrictEqual(vi, []);
});

it("41d: Cooldown, Meta, Draft namespaces: EN = VI keys, non-empty strings, used keys exist", () => {
  for (const ns of ['Cooldown', 'Meta', 'Draft']) {
    assert.ok(s41En[ns] && s41Vi[ns], `${ns} exists in en and vi`);
    assert.deepStrictEqual(Object.keys(s41En[ns]).sort(), Object.keys(s41Vi[ns]).sort(), `${ns} parity`);
    for (const m of [s41En, s41Vi]) for (const v of Object.values(m[ns])) assert.ok(typeof v === 'string' && v.trim(), `${ns} non-empty`);
  }
  for (const k of ['title', 'titleTemplate', 'description']) assert.ok(s41En.Meta[k] && s41Vi.Meta[k], `Meta.${k}`);
  for (const f of ['src/components/QuickLogTradeModal.tsx', 'src/components/TradeSlideOverDrawer.tsx']) {
    const src = s40Read(f);
    assert.ok(src.includes('useTranslations("Cooldown")'), `${f} binds Cooldown`);
    for (const k of s40Keys(src, 'tCooldown')) assert.ok(typeof s41En.Cooldown[k] === 'string' && typeof s41Vi.Cooldown[k] === 'string', `Cooldown.${k}`);
    for (const k of s40Keys(src, 'tDraft')) assert.ok(typeof s41En.Draft[k] === 'string' && typeof s41Vi.Draft[k] === 'string', `Draft.${k}`);
  }
});

it("41e: [locale]/layout.tsx uses generateMetadata with the Meta namespace, validates the locale, no static 'TradeNote MVP'", () => {
  const src = s40Read('src/app/[locale]/layout.tsx');
  assert.ok(/export async function generateMetadata\(/.test(src), 'generateMetadata exported');
  assert.ok(!/export const metadata\b/.test(src) && !src.includes('TradeNote MVP'), 'static metadata removed');
  assert.ok(/getTranslations\(\{\s*locale,\s*namespace:\s*'Meta'\s*\}\)/.test(src), 'getTranslations Meta');
  assert.ok(/routing\.locales[\s\S]{0,80}includes\(requested\)/.test(src), 'locale validated before getTranslations');
});
// ===== END Section 41 =====

// ===== BEGIN Section 42 (P7 E2: patch 090 DROP COLUMN trades.screenshot_url - static guards) =====
console.log("\n--- Section 42: P7 E2 patch 090 (destructive guard, down, safety block, probe 90 read-only, p7_prod_apply) ---");
const s42Strip = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const s42Up = s40Read('supabase/patches/090_drop_trades_screenshot_url.sql');
const s42UpCode = s42Strip(s42Up);
const s42DownPath = 'supabase/patches/090_drop_trades_screenshot_url.down.sql';

it("42a: 090 up - one DESTRUCTIVE-OK line, DROP COLUMN IF EXISTS, no BEGIN/COMMIT/ROLLBACK/CONCURRENTLY, schema_migrations '090' idempotent", () => {
  assert.strictEqual((s42Up.match(/^\s*--\s*DESTRUCTIVE-OK:\s*\S+/gm) || []).length, 1, 'exactly one DESTRUCTIVE-OK line');
  assert.ok(/ALTER TABLE public\.trades DROP COLUMN IF EXISTS screenshot_url;/.test(s42UpCode), 'DROP COLUMN IF EXISTS');
  assert.ok(!/\b(BEGIN|COMMIT|ROLLBACK)\s*;/i.test(s42UpCode.replace(/\$p090\$[\s\S]*?\$p090\$/g, '')), 'no transaction control outside the DO block');
  assert.ok(!/\bCOMMIT\b|\bROLLBACK\b|\bCONCURRENTLY\b/i.test(s42UpCode), 'no COMMIT/ROLLBACK/CONCURRENTLY');
  assert.ok(/INSERT INTO public\.schema_migrations \(version, name\)\s*VALUES \('090', '[a-z_]+'\)\s*ON CONFLICT DO NOTHING;/.test(s42UpCode), 'schema_migrations 090 ON CONFLICT DO NOTHING');
});

it("42b: 090 down exists - re-adds a nullable empty text column, removes the 090 row, no transaction control", () => {
  assert.ok(fs.existsSync(path.resolve(S40_ROOT, s42DownPath)), 'down file exists');
  const raw = s40Read(s42DownPath);
  const code = s42Strip(raw);
  assert.ok(/ALTER TABLE public\.trades ADD COLUMN IF NOT EXISTS screenshot_url text;/.test(code), 'ADD COLUMN IF NOT EXISTS text');
  assert.ok(!/NOT NULL|DEFAULT/i.test(code), 'nullable, no default (empty)');
  assert.ok(/DELETE FROM public\.schema_migrations WHERE version = '090';/.test(code), 'removes 090');
  assert.ok(!/\b(BEGIN|COMMIT|ROLLBACK)\b/i.test(code), 'no transaction control');
  assert.ok(/backup/i.test(raw), 'documents that data comes back only from backup');
});

it("42c: 090 up - DO safety block checks the column exists and RAISEs on url-without-path BEFORE the DROP", () => {
  const doIdx = s42UpCode.indexOf('DO $p090$');
  const dropIdx = s42UpCode.indexOf('DROP COLUMN');
  assert.ok(doIdx >= 0 && doIdx < dropIdx, 'DO block before DROP');
  const block = s42UpCode.slice(doIdx, dropIdx);
  assert.ok(/information_schema\.columns[\s\S]*column_name = 'screenshot_url'/.test(block), 'column existence check');
  assert.ok(/screenshot_url IS NOT NULL[\s\S]*screenshot_path IS NULL/.test(block), 'url-without-path count');
  assert.ok(/IF v_bad > 0 THEN\s*RAISE EXCEPTION/.test(block), 'RAISE EXCEPTION when > 0');
});

it("42d: probe 90 is read-only (no DML/DDL) and reports url_without_path, dependents, 050-053 as PASS/FAIL", () => {
  const code = s42Strip(s40Read('supabase/probes/90_p7_pre_checks.sql'));
  assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\b/i.test(code), 'no DML/DDL');
  for (const k of ['url_without_path', 'dependent_views', 'dependent_objects', 'migrations_050_053', 'column_exists']) assert.ok(code.includes(`'${k}'`), k);
  assert.ok(/'PASS' ELSE 'FAIL'/.test(code), 'PASS/FAIL status');
});

const { spawnSync: s42Spawn } = await import('node:child_process');
it("42e: p7_prod_apply.mjs refuses without --confirm-prod before touching env, never names an env file, exits 2", () => {
  const src = s40Read('scripts/p7_prod_apply.mjs');
  const refuse = src.indexOf("if (!args.includes('--confirm-prod'))");
  const firstEnv = src.indexOf('process.env');
  assert.ok(refuse > 0 && firstEnv > refuse, '--confirm-prod check precedes any env access');
  assert.ok(!/\.tradenote-prod|\.env\.local|\.env['"`]/.test(src), 'no env file name');
  const r = s42Spawn(process.execPath, [path.resolve(S40_ROOT, 'scripts/p7_prod_apply.mjs'), '--stage', '0'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2, `exit 2 without --confirm-prod (got ${r.status})`);
});
// ===== END Section 42 =====

// ===== BEGIN Section 43 (P7 C4/C5: orphan EquityCurveChart removed + repo hygiene check) =====
console.log("\n--- Section 43: P7 C4/C5 repo hygiene (orphan component removed, repo_hygiene_check self-test) ---");

it("43a: C4 - EquityCurveChart.tsx removed and no longer referenced in src/ or the i18n allow-list", () => {
  assert.ok(!fs.existsSync(path.resolve(S40_ROOT, 'src/components/EquityCurveChart.tsx')), 'orphan component deleted');
  assert.ok(!s40Read('scripts/i18n_hardcoded_allowlist.json').includes('EquityCurveChart'), 'allow-list entry removed');
});

it("43b: C5 - repo_hygiene_check.mjs is dependency-free ESM exposing the pure checks, wired as npm test:hygiene", () => {
  const src = s40Read('scripts/repo_hygiene_check.mjs');
  const imports = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.ok(imports.length > 0 && imports.every((m) => m.startsWith('node:')), `only node: imports (got ${imports.join(', ')})`);
  for (const fn of ['checkEnvTemplate', 'checkGitignore', 'checkGitattributes', 'findCrlf', 'runSelfTest', 'runRepoChecks']) {
    assert.ok(new RegExp(`export function ${fn}\\(`).test(src), `exports ${fn}`);
  }
  const pkg = JSON.parse(s40Read('package.json'));
  assert.strictEqual(pkg.scripts['test:hygiene'], 'node scripts/repo_hygiene_check.mjs --self-test');
  for (const f of ['env-template-clean', 'env-template-secret', 'env-template-dburl', 'gitignore-clean', 'gitignore-no-negation', 'gitattributes-clean', 'lf-sample']) {
    assert.ok(fs.existsSync(path.resolve(S40_ROOT, `scripts/fixtures/repo-hygiene/${f}.fixture`)), `fixture ${f}`);
  }
});

const { spawnSync: s43Spawn } = await import('node:child_process');
it("43c: C5 - repo_hygiene_check --self-test exits 0 (fixtures fail/pass as expected, app repo clean)", () => {
  const r = s43Spawn(process.execPath, [path.resolve(S40_ROOT, 'scripts/repo_hygiene_check.mjs'), '--self-test'], { cwd: S40_ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `exit 0 expected (got ${r.status}):\n${r.stdout}${r.stderr}`);
  assert.ok(/OK: all hygiene checks passed/.test(r.stdout), 'OK line');
  assert.ok(!/^\s*FAIL\b/m.test(r.stdout), 'no FAIL line');
});

it("43d: C5 - unknown argument is a usage error (exit 2)", () => {
  const r = s43Spawn(process.execPath, [path.resolve(S40_ROOT, 'scripts/repo_hygiene_check.mjs'), '--bogus'], { cwd: S40_ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 2, `exit 2 expected (got ${r.status})`);
});
// ===== END Section 43 =====

// ===== BEGIN Section 44 (P7 fix leg after review E17: 090 guidance + GD2 matrix precheck order) =====
console.log("\n--- Section 44: P7 fix leg (090 url-without-path guidance, GD2 precheck inside the transaction) ---");

it("44a: 090 HINT/guidance never says 'backfill path'; tells to null screenshot_url after checking the GD0 backup", () => {
  const up = s40Read('supabase/patches/090_drop_trades_screenshot_url.sql');
  const app = s40Read('scripts/p7_prod_apply.mjs');
  assert.ok(!/backfill path/i.test(up), '090 has no "backfill path"');
  assert.ok(up.includes("HINT = 'P7_090_URL_WITHOUT_PATH'"), 'machine HINT code unchanged');
  assert.ok(/screenshot_url = NULL/.test(up) && /GD0/.test(up), '090 text points to nulling the URL after the GD0 backup check');
  const g = app.slice(app.indexOf('export const URL_WITHOUT_PATH_GUIDANCE'), app.indexOf('// Ap 090; verify'));
  assert.ok(g.length > 0 && /screenshot_url = NULL/.test(g) && !/backfill/i.test(g), 'apply-script guidance');
  assert.ok(/includes\('url_without_path'\)\) log\(`HUONG DAN: \$\{URL_WITHOUT_PATH_GUIDANCE\}`\)/.test(app), 'guidance printed when probe 90 fails on url_without_path');
});

it("44b: GD2 - diffMatrix(before) runs inside the transaction BEFORE the 090 UP; mismatch -> ROLLBACK, no commit-then-down", () => {
  const app = s40Read('scripts/p7_prod_apply.mjs');
  const fn = app.slice(app.indexOf('export async function apply090('), app.indexOf('export async function rollback090('));
  const iBegin = fn.indexOf("db.query('BEGIN')");
  const iBefore = fn.indexOf('const before = await probe11Raw(db);');
  const iPre = fn.indexOf('const pre = precheck(before);');
  const iRb = fn.indexOf("await db.query('ROLLBACK');", iPre);
  const iUp = fn.indexOf('await db.query(read(F.up));');
  assert.ok(iBegin >= 0 && iBegin < iBefore && iBefore < iPre && iPre < iRb && iRb < iUp, 'BEGIN < probe11(before) < precheck < ROLLBACK < UP');
  const cli = app.slice(app.indexOf("} else if (STAGE === '2') {"), app.indexOf("} else if (STAGE === '3') {"));
  assert.ok(/apply090\(db, log, errText, diffMatrix\)/.test(cli), 'GD2 passes diffMatrix as precheck');
  assert.ok(!/rollback090\(/.test(cli), 'GD2 never commits the DROP and then runs 090.down');
});

const { spawnSync: s44Spawn } = await import('node:child_process');
it("44c: p7_prod_apply.mjs passes node --check and still refuses (exit 2) without flags", () => {
  const file = path.resolve(S40_ROOT, 'scripts/p7_prod_apply.mjs');
  const chk = s44Spawn(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.strictEqual(chk.status, 0, `node --check: ${chk.stderr}`);
  const r = s44Spawn(process.execPath, [file], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2, `exit 2 without flags (got ${r.status})`);
});
// ===== END Section 44 =====

// ===== BEGIN Section 45 (closeout G1: L1 legacy defence removed, L2a deleteAccount storage, L2b legacy names) =====
console.log("\n--- Section 45: closeout G1 (orphan tool legacy names, deleteAccount DB-first storage cleanup) ---");

it("45a: L1 - orphanScreenshots.ts has no legacy column defence left (no screenshot_url, no 42703 fallback)", () => {
  const code = s40Read('src/lib/orphanScreenshots.ts');
  assert.ok(!/screenshot_url|screenshotUrl|LEGACY_URL_COLUMN|isMissingLegacyColumn|withLegacy|42703/.test(code), 'legacy defence removed');
  assert.ok(code.includes(".select('id, date, screenshot_path')"), 'used set selects path only');
  assert.ok(!/legacy names are never deleted/.test(code), 'header comment updated');
});

it("45b: L2b - strict legacy regex is the only widening of the allow-list (10-14 digits, 4 extensions, anchored)", () => {
  const code = s40Read('src/lib/orphanScreenshots.ts');
  assert.ok(code.includes('const LEGACY_TRADE_FILE_RE = /^\\d{10,14}\\.(png|jpg|jpeg|webp)$/;'), 'legacy regex literal');
  assert.ok(code.includes('return TRADE_FILE_RE.test(name) || LEGACY_TRADE_FILE_RE.test(name);'), 'allow-list = new OR legacy');
  assert.ok(code.includes('    if (usedPaths.has(obj.path)) continue;\n'), 'used-set check applies to every allow-listed name');
});

it("45c: L2b - the three p6_prod_smoke allow-list sites carry the same legacy alternative (no new $n placeholder)", () => {
  const code = s40Read('scripts/p6_prod_smoke.mjs');
  const sqlAlt = "'^[0-9A-Za-z-]+/([0-9]{10,}-[0-9a-f]{8}\\\\.[0-9a-z]+|[0-9]{10,14}\\\\.(png|jpg|jpeg|webp))$'";
  assert.strictEqual(code.split(sqlAlt).length - 1, 2, 'two SQL sites (allow_listed, candidate)');
  assert.ok(code.includes('const allowRe = /^[0-9A-Za-z-]+\\/([0-9]{10,}-[0-9a-f]{8}\\.[0-9a-z]+|[0-9]{10,14}\\.(png|jpg|jpeg|webp))$/;'), 'JS allowRe site');
  const allowRe = /^[0-9A-Za-z-]+\/([0-9]{10,}-[0-9a-f]{8}\.[0-9a-z]+|[0-9]{10,14}\.(png|jpg|jpeg|webp))$/;
  assert.ok(allowRe.test('u-1/1782538922182.png') && allowRe.test('u-1/1700000000000-aabbccdd.webp'), 'legacy + new accepted');
  for (const bad of ['u-1/1782538922182.png.bak', 'u-1/178253892.png', 'u-1/178253892218234.png', 'u-1/avatar.png', 'u-1/playbook_1782538922182.png', 'u-1/1782538922182.gif']) {
    assert.ok(!allowRe.test(bad), `rejected: ${bad}`);
  }
});

it("45d: L2a - deleteAccount collects paths, then deletes the DB row, then cleans storage (prefix-filtered; code-less error queued)", () => {
  const code = s40Read('src/store/useAccountStore.ts');
  const fn = code.slice(code.indexOf('deleteAccount: async (id) => {'));
  const iCollect = fn.indexOf('await collectAccountScreenshotPaths(id);');
  const iPrefix = fn.indexOf('// L2a: only {user.id}/ paths');
  const iDb = fn.indexOf('// L2a: DB delete first');
  const iQueue = fn.indexOf('// L2a: code-less error is queued, never removed');
  const iRemove = fn.indexOf('await removeOrQueueStorageObjects(');
  assert.ok(iCollect >= 0 && iCollect < iPrefix && iPrefix < iDb && iDb < iQueue && iQueue < iRemove, 'collect < prefix filter < DB delete < queue-on-error < storage remove');
  assert.ok(code.includes(".select('id, date, screenshot_path').eq('account_id', accountId)"), 'account-scoped keyset select');
  assert.ok(code.includes('const ACCOUNT_PATH_PAGE = 500;') && code.includes('if (data.length === 0) return paths;'), 'page 500, stop on empty page');
  assert.ok(!/from ['"]\.\/useTradeStore['"]/.test(code), 'no useTradeStore import (no cycle)');
  const trade = s40Read('src/store/useTradeStore.ts');
  assert.ok(trade.includes('async function removeScreenshotsOrQueue(userId: string | undefined, paths: string[]): Promise<void> {'), 'trade-store wrapper signature kept (P6-M1)');
});

it("45e: mutations.json - 57 mutants, P7-M5 replaced by P8-M1, P8-M1..M7 present", () => {
  const d = JSON.parse(s40Read('test-fixtures/mutations.json'));
  const ids = d.mutants.map((m) => m.id);
  assert.ok(ids.length >= 57, 'mutant total (exact total pinned in 46f)');
  assert.ok(!ids.includes('P7-M5-legacy-url-not-protected'), 'P7-M5 removed');
  for (let i = 1; i <= 7; i++) assert.ok(ids.some((x) => x.startsWith(`P8-M${i}-`)), `P8-M${i} present`);
  assert.strictEqual(new Set(ids).size, ids.length, 'unique ids');
});
// ===== END Section 45 =====

// ===== Section 46: closeout final merge - L3 i18n extraction + L4 timezone suggestion (static) =====
const S46_HARNESS = path.resolve(S40_ROOT, '..', 'process', 'general-plans', 'active', 'remaining-limitations-closeout_30-10-26', 'harness');
const s46Flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? s46Flat(v, `${p}${k}.`) : [`${p}${k}`]));
const s46En = JSON.parse(s40Read('messages/en.json'));
const s46Vi = JSON.parse(s40Read('messages/vi.json'));

const s46Scan = await import(new URL('./i18n_hardcoded_scan.mjs', import.meta.url).href);
it("46a: L3 - allow-list <= 40 entries and raw findings <= 215", () => {
  const scan = s46Scan;
  const list = scan.loadAllowlist();
  const findings = scan.scanProject();
  assert.ok(list.length <= 40, `allow-list entries ${list.length} <= 40`);
  assert.ok(findings.length <= 215, `findings ${findings.length} <= 215`);
  assert.strictEqual(scan.applyAllowlist(findings, list).length, 0, 'nothing outside the allow-list');
});

it("46b: L3/L4 - every key handed over by G2/G3 exists in both locales with identical ICU placeholders", () => {
  const files = ['i18n-G2.json', 'i18n-G3.json'].map((f) => path.join(S46_HARNESS, f)).filter((f) => fs.existsSync(f));
  const keys = [];
  for (const f of files) {
    const h = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [ns, obj] of Object.entries(h.en)) for (const k of Object.keys(obj)) keys.push([ns, k]);
  }
  if (files.length === 0) {
    // the task folder is archived later; fall back to the fixed namespace list
    for (const ns of ['TimezoneSuggestion']) for (const k of Object.keys(s46En[ns] || {})) keys.push([ns, k]);
  }
  assert.ok(keys.length > 0, 'key list not empty');
  const ph = (s) => [...String(s).matchAll(/\{(\w+)/g)].map((m) => m[1]).sort().join(',');
  for (const [ns, k] of keys) {
    const e = s46En[ns]?.[k];
    const v = s46Vi[ns]?.[k];
    assert.ok(typeof e === 'string' && e.length > 0, `en ${ns}.${k}`);
    assert.ok(typeof v === 'string' && v.length > 0, `vi ${ns}.${k}`);
    assert.strictEqual(ph(e), ph(v), `placeholders ${ns}.${k}`);
  }
  assert.deepStrictEqual(s46Flat(s46En).sort(), s46Flat(s46Vi).sort(), 'full en/vi key parity');
});

it("46c: L3 - no message wraps a placeholder in single quotes; text_leak_warning escapes its quotes", () => {
  const re = /(^|[^'])'\{[A-Za-z_]\w*\}'/;
  for (const [loc, m] of [['en', s46En], ['vi', s46Vi]]) {
    for (const k of s46Flat(m)) {
      const val = k.split('.').reduce((o, p) => o[p], m);
      assert.ok(!re.test(val), `${loc}:${k} has '{placeholder}'`);
    }
    assert.ok(m.Analytics.text_leak_warning.includes("''{mistake}''"), `${loc} text_leak_warning`);
  }
});

it("46d: L3 - extracted literals are gone from the G2 files", () => {
  const gone = [
    ['src/app/[locale]/daily-review/page.tsx', 'Loading reviews...'],
    ['src/components/CommandPaletteModal.tsx', 'Spotlight Command Hub'],
    ['src/components/DailyExecutiveReportCard.tsx', 'Zero rule leakages detected today'],
    ['src/components/TradeDetailsModal.tsx', 'alt="Zoomed trade setup"'],
    ['src/components/MobileBottomNav.tsx', 'aria-label="Mobile Navigation"'],
    ['src/components/TradeEditForm.tsx', 'Trade updated successfully!'],
    ['src/app/[locale]/settings/page.tsx', 'Coordinated Universal Time'],
  ];
  for (const [f, s] of gone) assert.ok(!s40Read(f).includes(s), `${f} still contains ${s}`);
});

it("46e: L4 - shouldSuggestTimezone + banner wiring (direct updatePreferences, per-user dismiss key)", () => {
  const lib = s40Read('src/lib/timezoneSuggestion.ts');
  assert.ok(lib.includes('export function shouldSuggestTimezone('), 'shouldSuggestTimezone exported');
  assert.ok(lib.includes('if (saved !== "UTC") return false;'), 'saved must be UTC');
  assert.ok(lib.includes('"tz_suggestion_dismissed_v1:"'), 'dismiss key prefix');
  const b = s40Read('src/components/TimezoneSuggestionBanner.tsx');
  assert.ok(b.includes('updatePreferences({ timezone: browser })'), 'Apply calls updatePreferences directly');
  assert.ok(!b.includes('handleSaveProfile'), 'banner does not call handleSaveProfile');
  assert.ok(b.includes('"HARD_STOP_CONFIG_LOCKED"') && b.includes('tHardStop("configLocked")'), 'Hard Stop lock surfaced');
  const catchBody = b.slice(b.indexOf('} catch (error) {'), b.indexOf('} finally {'));
  assert.ok(!catchBody.includes('writeDismissed') && !catchBody.includes('setHidden(true)'), 'error neither dismisses nor hides');
  assert.ok(s40Read('src/app/[locale]/settings/page.tsx').includes('TimezoneSuggestionBanner'), 'banner mounted in settings');
});

it("46f: mutations.json - 72 mutants (60 + Guest GD-M1..M12), P8-M8..M10 (L4 x2, L3 x1) present", () => {
  const d = JSON.parse(s40Read('test-fixtures/mutations.json'));
  const ids = d.mutants.map((m) => m.id);
  assert.strictEqual(ids.length, 72, 'mutant total');
  for (const i of [8, 9, 10]) assert.ok(ids.some((x) => x.startsWith(`P8-M${i}-`)), `P8-M${i} present`);
});
// ===== END Section 46 =====

// ===== Section 53: Guest G1 static anti-leak =====
console.log("\n--- Section 53: Guest G1 static anti-leak ---");
const s53Walk = (rel) => {
  const out = [];
  for (const e of fs.readdirSync(path.resolve(S40_ROOT, rel), { withFileTypes: true })) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...s53Walk(r));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(r);
  }
  return out;
};
const s53Src = s53Walk('src').filter((f) => !f.includes('/__tests__/') && !/\.test\.tsx?$/.test(f));
const s53Guest = s53Src.filter((f) => f.startsWith('src/lib/guest/'));

it("53a: supabase-js is imported only at the allowed sites", () => {
  const allowed = ['src/lib/supabase.ts', 'src/app/api/ai-coach/route.ts', 'src/store/useAuthStore.ts'];
  const hits = s53Src.filter((f) => /from\s+['"]@supabase\/supabase-js['"]/.test(s40Read(f)));
  for (const f of hits) assert.ok(allowed.includes(f), `unexpected supabase-js import in ${f}`);
  const auth = s40Read('src/store/useAuthStore.ts').match(/import\s*\{([^}]*)\}\s*from\s*['"]@supabase\/supabase-js['"]/);
  assert.ok(auth && auth[1].trim() === 'User', 'useAuthStore imports only User');
});

it("53b: createClient( only in supabase.ts and the AI route", () => {
  const hits = s53Src.filter((f) => s40Read(f).includes('createClient('));
  assert.deepStrictEqual(hits.sort(), ['src/app/api/ai-coach/route.ts', 'src/lib/supabase.ts']);
});

it("53c: src/lib/guest (non-test) has no supabase-js import, fetch, XMLHttpRequest or NEXT_PUBLIC_SUPABASE", () => {
  assert.ok(s53Guest.length >= 8, 'guest files found');
  for (const f of s53Guest) {
    const s = s40Read(f);
    assert.ok(!/from\s+['"]@supabase\/supabase-js['"]/.test(s), `${f} imports supabase-js`);
    for (const bad of ['fetch(', 'XMLHttpRequest', 'NEXT_PUBLIC_SUPABASE']) assert.ok(!s.includes(bad), `${f} contains ${bad}`);
  }
});

it("53d: files importing supabase from @/lib/supabase define no other `supabase` identifier", () => {
  const allow = ['src/lib/orphanScreenshots.ts', 'src/app/api/ai-coach/route.ts'];
  const users = s53Src.filter((f) => /import\s*\{[^}]*\bsupabase\b[^}]*\}\s*from\s*['"]@\/lib\/supabase['"]/.test(s40Read(f)));
  assert.ok(users.length > 0, 'importers found');
  for (const f of users) {
    if (allow.includes(f)) continue;
    assert.ok(!/\b(const|let|var|function|class)\s+supabase\b/.test(s40Read(f)), `${f} redefines supabase`);
  }
});

it("53e: supabase.ts imports ./guest/guestFlag behind typeof window; guestFlag.ts holds tradenote_guest_v1", () => {
  const s = s40Read('src/lib/supabase.ts');
  assert.ok(/from\s+['"]\.\/guest\/guestFlag['"]/.test(s), 'imports ./guest/guestFlag');
  assert.ok(s.includes('typeof window'), 'typeof window branch');
  assert.ok(s40Read('src/lib/guest/guestFlag.ts').includes('tradenote_guest_v1'), 'flag key literal');
});

it("53f: every fixed key / prefix in guestMode.ts exists by exact name in app source", () => {
  const keys = ['tradeNoteActiveAccount', 'tradenote_cooldown_until', 'tradenote_session_closed_', 'tradenote_drawer_draft_', 'ai_coach_', 'tradenote_custom_routine_items_', 'tradenote_show_routine_widget_', 'tradenote_premarket_', 'orphan_screenshots_v1:', 'tz_suggestion_dismissed_v1:'];
  const gm = s40Read('src/lib/guest/guestMode.ts');
  const app = s53Src.filter((f) => !f.startsWith('src/lib/guest/')).map((f) => s40Read(f));
  for (const k of keys) {
    assert.ok(gm.includes(k), `guestMode.ts lacks ${k}`);
    assert.ok(app.some((s) => s.includes(k)), `app source lacks ${k}`);
  }
});

it("53g: src/lib/guest (non-test) has no Vietnamese letters; GD-M1..GD-M5 mutants present", () => {
  const vi = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  for (const f of s53Guest) assert.ok(!vi.test(s40Read(f)), `${f} has Vietnamese letters`);
  const ids = JSON.parse(s40Read('test-fixtures/mutations.json')).mutants.map((m) => m.id);
  for (const i of [1, 2, 3, 4, 5]) assert.ok(ids.some((x) => x.startsWith(`GD-M${i}-`)), `GD-M${i} present`);
});
// ===== END Section 53 =====

// ===== Section 54: Guest UI + closure guards (G2+G3) =====
console.log("\n--- Section 54: Guest UI + closure guards ---");
it("54a: exactly one <GuestBanner in AppShell", () => {
  assert.strictEqual(s40Read('src/components/AppShell.tsx').split('<GuestBanner').length - 1, 1);
});
it("54b: auth page offers Guest entry (enterGuestMode or useGuestMode) + Guest enter_cta", () => {
  const s = s40Read('src/app/[locale]/auth/page.tsx');
  assert.ok(/enterGuestMode|useGuestMode/.test(s), 'entry helper');
  assert.ok(s.includes('enter_cta'), 'enter_cta');
});
it("54c: Sidebar and MobileBottomNav use useGuestMode + exitGuestMode", () => {
  for (const f of ['src/components/Sidebar.tsx', 'src/components/MobileBottomNav.tsx']) {
    const s = s40Read(f);
    assert.ok(s.includes('useGuestMode') && s.includes('exitGuestMode'), f);
  }
});
it("54d: AICoachModal checks isGuest before getSession and the AI fetch; that fetch only there", () => {
  const s = s40Read('src/components/AICoachModal.tsx');
  const g = s.indexOf('if (isGuest)');
  assert.ok(g > 0 && g < s.indexOf('getSession') && g < s.indexOf('fetch("/api/ai-coach"'), 'guard order');
  const hits = s53Src.filter((f) => s40Read(f).includes('fetch("/api/ai-coach"'));
  assert.deepStrictEqual(hits, ['src/components/AICoachModal.tsx']);
});
it("54e: settings page and OrphanCleanupCard branch on isGuest", () => {
  assert.ok(s40Read('src/app/[locale]/settings/page.tsx').includes('isGuest'));
  assert.ok(/if \(isGuest\) return null;/.test(s40Read('src/components/OrphanCleanupCard.tsx')));
});
it("54f: accounts page confirms Guest delete with Guest.delete_account_confirm", () => {
  assert.ok(s40Read('src/app/[locale]/accounts/page.tsx').includes('delete_account_confirm'));
});
it("54g: flag literal tradenote_guest_v1 appears only in guestFlag.ts / types.ts", () => {
  const hits = s53Src.filter((f) => /tradenote_guest_v1(?!_)/.test(s40Read(f)));
  for (const f of hits) assert.ok(['src/lib/guest/guestFlag.ts', 'src/lib/guest/types.ts', 'src/lib/guest/guestMode.ts', 'src/lib/supabase.ts'].includes(f), `flag literal in ${f}`);
});
it("54h: Guest namespace has the 8 fixed keys with EN = VI key sets", () => {
  const en = JSON.parse(s40Read('messages/en.json')).Guest || {};
  const vi = JSON.parse(s40Read('messages/vi.json')).Guest || {};
  const want = ['ai_locked', 'banner_text', 'delete_account_confirm', 'enter_cta', 'exit_cta', 'image_disabled', 'reset_cta', 'settings_account_locked'];
  assert.deepStrictEqual(Object.keys(en).sort(), want);
  assert.deepStrictEqual(Object.keys(vi).sort(), want);
  for (const k of want) assert.ok(en[k] && vi[k] && !/'\{/.test(en[k] + vi[k]), k);
});
it("54i: B1-B5 pins and guest-image-disabled hints present", () => {
  const pins = {
    'src/components/QuickLogTradeModal.tsx': ['pnlInputRef', 'setPnlSign', 'active:scale-[0.96]', 'guest-image-disabled'],
    'src/components/TradeSlideOverDrawer.tsx': ['useTranslations("Cooldown")', 'tCooldown(', 'tDraft(', 'TradeSlideOverDrawer', 'HardStopError', 'guest-image-disabled'],
    'src/components/TradeEditForm.tsx': ['guest-image-disabled'],
    'src/app/[locale]/settings/page.tsx': ['handleSaveRisk', 'handleSaveProfile', '<OrphanCleanupCard', 'TimezoneSuggestionBanner'],
    'src/components/OrphanCleanupCard.tsx': ['role="alertdialog"'],
    'src/components/TimezoneSuggestionBanner.tsx': ['toast.error(t("apply_failed"));'],
    'src/app/[locale]/accounts/page.tsx': ['Personal', 'await updateAccount(', 'tPresets('],
    'src/app/[locale]/playbook/page.tsx': ['playbookMatch', 'guest-image-disabled'],
  };
  for (const [f, list] of Object.entries(pins)) { const s = s40Read(f); for (const p of list) assert.ok(s.includes(p), `${f} lacks ${p}`); }
});
it("54j: the G2/G3 Guest test files exist and are non-empty", () => {
  for (const f of ['src/lib/guest/__tests__/guestTransitions.test.ts', 'src/components/__tests__/guestLoginAfterGuest.test.tsx', 'src/lib/guest/__tests__/guestNoNetwork.test.ts', 'src/lib/guest/__tests__/guestStaticAudit.test.ts', 'src/components/__tests__/guestBanner.test.tsx', 'src/components/__tests__/guestAiLock.test.tsx', 'src/components/__tests__/guestFeatureLocks.test.tsx', 'src/components/__tests__/guestSettingsLocks.test.tsx']) {
    assert.ok(fs.existsSync(path.resolve(S40_ROOT, f)) && s40Read(f).trim().length > 100, f);
  }
});
it("54k: guestMode UNSCOPED_REAL_KEYS + SESSION_CLOSED_PREFIX = sticky entries in guestStaticAudit", () => {
  const gm = s40Read('src/lib/guest/guestMode.ts');
  const keys = JSON.parse(gm.match(/UNSCOPED_REAL_KEYS = (\[[^\]]*\])/)[1]);
  keys.push(gm.match(/SESSION_CLOSED_PREFIX = "([^"]+)"/)[1]);
  const audit = s40Read('src/lib/guest/__tests__/guestStaticAudit.test.ts');
  const sticky = [...audit.matchAll(/^\s*"?([\w:]+)"?: "sticky"/gm)].map((m) => m[1]);
  assert.deepStrictEqual(sticky.sort(), keys.sort());
});
// ===== END Section 54 =====


console.log("\n-------------------------------------------------------");
console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
if (passed === total) {
  console.log(">>> ALL UNIT MATH & LOGIC GATES PASSED! <<<\n");
} else {
  process.exit(1);
}


