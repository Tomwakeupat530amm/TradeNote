/**
 * Position Size & Risk Calculator specialized for MNQ Futures and Spot Gold (XAUUSD).
 */

export interface MNQCalculationInput {
  balance: number;
  riskType: 'percent' | 'fixed';
  riskValue: number; // e.g. 1 for 1%, or 300 for $300
  stopLossPoints: number; // e.g. 15.25 points
}

export interface MNQCalculationResult {
  contracts: number;
  dollarRisk: number;
  actualRisk: number;
  pointValue: number;
  recommendation: string;
}

export interface GoldCalculationInput {
  balance: number;
  riskType: 'percent' | 'fixed';
  riskValue: number;
  stopLossDistance: number; // e.g. $5.00 price distance
}

export interface GoldCalculationResult {
  lotSize: number;
  dollarRisk: number;
  actualRisk: number;
  recommendation: string;
}

/**
 * Calculate MNQ (Micro E-mini Nasdaq-100 Futures) contracts
 * Specification: $2.00 per 1.0 Index Point ($0.50 per 0.25 tick)
 */
export function calculateMNQPosition(input: MNQCalculationInput, locale: string = "en"): MNQCalculationResult {
  const isVi = locale === "vi";
  const dollarRisk = input.riskType === 'percent'
    ? input.balance * (input.riskValue / 100)
    : input.riskValue;

  if (input.stopLossPoints <= 0 || dollarRisk <= 0) {
    return {
      contracts: 0,
      dollarRisk: 0,
      actualRisk: 0,
      pointValue: 2,
      recommendation: isVi ? "Vui lòng nhập Stop Loss hợp lệ (> 0 points)" : "Please enter a valid Stop Loss (> 0 points)"
    };
  }

  // Contract calculation: Math.floor(dollarRisk / (SL_points * $2))
  const rawContracts = dollarRisk / (input.stopLossPoints * 2);
  const contracts = Math.floor(rawContracts);
  const actualRisk = Number((contracts * input.stopLossPoints * 2).toFixed(2));

  let recommendation = isVi
    ? `Đi ${contracts} Hợp đồng MNQ để giữ rủi ro trong khoảng $${dollarRisk.toFixed(0)}`
    : `Execute ${contracts} MNQ contracts to keep risk near $${dollarRisk.toFixed(0)}`;
  if (contracts === 0) {
    recommendation = isVi
      ? `Rủi ro $${dollarRisk.toFixed(0)} quá nhỏ so với SL ${input.stopLossPoints} pts (Tối thiểu 1 HĐ = $${(input.stopLossPoints * 2).toFixed(0)})`
      : `Risk $${dollarRisk.toFixed(0)} is too small for SL ${input.stopLossPoints} pts (Min 1 contract = $${(input.stopLossPoints * 2).toFixed(0)})`;
  }

  return {
    contracts,
    dollarRisk: Number(dollarRisk.toFixed(2)),
    actualRisk,
    pointValue: 2,
    recommendation
  };
}

/**
 * Calculate Gold (XAUUSD) Lot size
 * Specification: 1 Standard Lot = 100 oz ($1.00 move in gold = $100 per lot, $1 per 0.01 lot)
 */
export function calculateGoldPosition(input: GoldCalculationInput, locale: string = "en"): GoldCalculationResult {
  const isVi = locale === "vi";
  const dollarRisk = input.riskType === 'percent'
    ? input.balance * (input.riskValue / 100)
    : input.riskValue;

  if (input.stopLossDistance <= 0 || dollarRisk <= 0) {
    return {
      lotSize: 0,
      dollarRisk: 0,
      actualRisk: 0,
      recommendation: isVi ? "Vui lòng nhập khoảng cách Stop Loss hợp lệ (> $0.00)" : "Please enter a valid Stop Loss distance (> $0.00)"
    };
  }

  // Lot calculation: dollarRisk / (SL_distance * 100)
  const rawLot = dollarRisk / (input.stopLossDistance * 100);
  // Round down to 2 decimals for broker step size 0.01
  const lotSize = Math.max(0, Math.floor(rawLot * 100) / 100);
  const actualRisk = Number((lotSize * input.stopLossDistance * 100).toFixed(2));

  let recommendation = isVi
    ? `Đi ${lotSize.toFixed(2)} Lot Vàng (XAUUSD)`
    : `Execute ${lotSize.toFixed(2)} Gold (XAUUSD) Lots`;
  if (lotSize < 0.01) {
    recommendation = isVi
      ? `Rủi ro $${dollarRisk.toFixed(0)} quá nhỏ cho SL $${input.stopLossDistance} (Tối thiểu 0.01 lot = $${(input.stopLossDistance * 1).toFixed(2)})`
      : `Risk $${dollarRisk.toFixed(0)} is too small for SL $${input.stopLossDistance} (Min 0.01 lot = $${(input.stopLossDistance * 1).toFixed(2)})`;
  }

  return {
    lotSize,
    dollarRisk: Number(dollarRisk.toFixed(2)),
    actualRisk,
    recommendation
  };
}

export type FuturesSymbol = 'MNQ' | 'NQ' | 'MES' | 'ES';

export const FUTURES_POINT_VALUES: Record<FuturesSymbol, number> = {
  MNQ: 2,   // $0.50 / tick (0.25 pt) -> $2.00 / point
  NQ: 20,   // $5.00 / tick (0.25 pt) -> $20.00 / point
  MES: 5,   // $1.25 / tick (0.25 pt) -> $5.00 / point
  ES: 50,   // $12.50 / tick (0.25 pt) -> $50.00 / point
};

/**
 * Generalized calculation for any Futures index contract (MNQ, NQ, MES, ES)
 */
export function calculateFuturesPosition(
  symbol: FuturesSymbol,
  input: MNQCalculationInput,
  locale: string = "en"
): MNQCalculationResult {
  const isVi = locale === "vi";
  const pointValue = FUTURES_POINT_VALUES[symbol] || 2;
  const dollarRisk = input.riskType === 'percent'
    ? input.balance * (input.riskValue / 100)
    : input.riskValue;

  if (input.stopLossPoints <= 0 || dollarRisk <= 0) {
    return {
      contracts: 0,
      dollarRisk: 0,
      actualRisk: 0,
      pointValue,
      recommendation: isVi ? "Vui lòng nhập Stop Loss hợp lệ (> 0 points)" : "Please enter a valid Stop Loss (> 0 points)"
    };
  }

  const rawContracts = dollarRisk / (input.stopLossPoints * pointValue);
  const contracts = Math.floor(rawContracts);
  const actualRisk = Number((contracts * input.stopLossPoints * pointValue).toFixed(2));

  let recommendation = isVi
    ? `Đi ${contracts} Hợp đồng ${symbol} để giữ rủi ro trong khoảng $${dollarRisk.toFixed(0)}`
    : `Execute ${contracts} ${symbol} contracts to keep risk near $${dollarRisk.toFixed(0)}`;
  if (contracts === 0) {
    recommendation = isVi
      ? `Rủi ro $${dollarRisk.toFixed(0)} quá nhỏ so với SL ${input.stopLossPoints} pts (Tối thiểu 1 HĐ = $${(input.stopLossPoints * pointValue).toFixed(0)})`
      : `Risk $${dollarRisk.toFixed(0)} is too small for SL ${input.stopLossPoints} pts (Min 1 contract = $${(input.stopLossPoints * pointValue).toFixed(0)})`;
  }

  return {
    contracts,
    dollarRisk: Number(dollarRisk.toFixed(2)),
    actualRisk,
    pointValue,
    recommendation
  };
}

export interface ForexCalculationInput {
  balance: number;
  riskType: 'percent' | 'fixed';
  riskValue: number;
  stopLossPips: number; // e.g. 20 pips
  pipValuePerLot?: number; // default $10 for EURUSD / GBPUSD standard lot
}

export interface ForexCalculationResult {
  lotSize: number;
  dollarRisk: number;
  actualRisk: number;
  recommendation: string;
}

/**
 * Calculate Forex Majors (EURUSD, GBPUSD) lot size
 * Specification: Standard lot = 100,000 units ($10 per pip), 0.01 lot = $0.10 per pip
 */
export function calculateForexPosition(input: ForexCalculationInput, locale: string = "en"): ForexCalculationResult {
  const isVi = locale === "vi";
  const pipValue = input.pipValuePerLot || 10;
  const dollarRisk = input.riskType === 'percent'
    ? input.balance * (input.riskValue / 100)
    : input.riskValue;

  if (input.stopLossPips <= 0 || dollarRisk <= 0) {
    return {
      lotSize: 0,
      dollarRisk: 0,
      actualRisk: 0,
      recommendation: isVi ? "Vui lòng nhập khoảng cách Stop Loss hợp lệ (> 0 pips)" : "Please enter a valid Stop Loss distance (> 0 pips)"
    };
  }

  const rawLot = dollarRisk / (input.stopLossPips * pipValue);
  const lotSize = Math.max(0, Math.floor(rawLot * 100) / 100);
  const actualRisk = Number((lotSize * input.stopLossPips * pipValue).toFixed(2));

  let recommendation = isVi
    ? `Đi ${lotSize.toFixed(2)} Lot Forex (${input.stopLossPips} pips SL)`
    : `Execute ${lotSize.toFixed(2)} Forex Lots (${input.stopLossPips} pips SL)`;
  if (lotSize < 0.01) {
    recommendation = isVi
      ? `Rủi ro $${dollarRisk.toFixed(0)} quá nhỏ cho SL ${input.stopLossPips} pips (Tối thiểu 0.01 lot = $${(input.stopLossPips * 0.1).toFixed(2)})`
      : `Risk $${dollarRisk.toFixed(0)} is too small for SL ${input.stopLossPips} pips (Min 0.01 lot = $${(input.stopLossPips * 0.1).toFixed(2)})`;
  }

  return {
    lotSize,
    dollarRisk: Number(dollarRisk.toFixed(2)),
    actualRisk,
    recommendation
  };
}

