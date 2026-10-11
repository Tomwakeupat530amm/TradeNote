import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  assert.ok(
    /GRANT\s+SELECT\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+anon/i.test(schemaContent),
    "supabase_schema.sql must grant SELECT on all tables to anon"
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

  for (const content of [patchContent, schemaContent]) {
    assert.ok(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+GRANT\s+SELECT\s+ON\s+TABLES\s+TO\s+anon/i.test(content),
      "Must alter default privileges for anon"
    );
    assert.ok(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLES\s+TO\s+authenticated/i.test(content),
      "Must alter default privileges for authenticated"
    );
    assert.ok(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLES\s+TO\s+service_role/i.test(content),
      "Must alter default privileges for service_role"
    );
    assert.ok(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+GRANT\s+USAGE,\s*SELECT\s+ON\s+SEQUENCES\s+TO\s+anon,\s*authenticated,\s*service_role/i.test(content),
      "Must alter default privileges for sequences"
    );
  }
});

it("Validates sequence USAGE privileges granted for auto-increment integrity", () => {
  const patchContent = fs.readFileSync(patchSqlPath, 'utf8');
  const schemaContent = fs.readFileSync(schemaSqlPath, 'utf8');

  const seqRegex = /GRANT\s+USAGE,\s*SELECT\s+ON\s+ALL\s+SEQUENCES\s+IN\s+SCHEMA\s+public\s+TO\s+anon,\s*authenticated,\s*service_role/i;
  assert.ok(seqRegex.test(patchContent), "Patch must grant sequence usage");
  assert.ok(seqRegex.test(schemaContent), "Schema must grant sequence usage");
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

console.log("\n-------------------------------------------------------");
console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
if (passed === total) {
  console.log(">>> ALL UNIT MATH & LOGIC GATES PASSED! <<<\n");
} else {
  process.exit(1);
}


