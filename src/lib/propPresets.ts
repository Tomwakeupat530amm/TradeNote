import { AccountRules } from "@/store/useAccountStore";

export interface PropFirmPreset {
  id: string;
  firmName: string;
  badgeColor: string;
  accountSize: number;
  label: string;
  rules: AccountRules;
}

export const PROP_FIRM_PRESETS: PropFirmPreset[] = [
  // --- TOPSTEP ---
  {
    id: "topstep-50k",
    firmName: "Topstep",
    badgeColor: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    accountSize: 50000,
    label: "Topstep 50k (EOD)",
    rules: {
      trailingMaxDrawdown: 2000,
      drawdownMode: "End of Day",
      maxDailyLoss: 1000,
      maxDailyLossType: "$",
      profitTarget: 3000,
      maxPositions: 5,
      consistencyPercent: 50,
      defaultRiskType: "$",
      defaultRiskValue: 150,
      riskBase: "drawdown",
      enableHardStop: true,
      dailyLossAlertThreshold: 80,
    }
  },
  {
    id: "topstep-100k",
    firmName: "Topstep",
    badgeColor: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    accountSize: 100000,
    label: "Topstep 100k (EOD)",
    rules: {
      trailingMaxDrawdown: 3000,
      drawdownMode: "End of Day",
      maxDailyLoss: 2000,
      maxDailyLossType: "$",
      profitTarget: 6000,
      maxPositions: 10,
      consistencyPercent: 50,
      defaultRiskType: "$",
      defaultRiskValue: 250,
      riskBase: "drawdown",
      enableHardStop: true,
      dailyLossAlertThreshold: 80,
    }
  },
  {
    id: "topstep-150k",
    firmName: "Topstep",
    badgeColor: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    accountSize: 150000,
    label: "Topstep 150k (EOD)",
    rules: {
      trailingMaxDrawdown: 4500,
      drawdownMode: "End of Day",
      maxDailyLoss: 3000,
      maxDailyLossType: "$",
      profitTarget: 9000,
      maxPositions: 15,
      consistencyPercent: 50,
      defaultRiskType: "$",
      defaultRiskValue: 350,
      riskBase: "drawdown",
      enableHardStop: true,
      dailyLossAlertThreshold: 80,
    }
  },

  // --- APEX TRADER FUNDING ---
  {
    id: "apex-50k",
    firmName: "Apex",
    badgeColor: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    accountSize: 50000,
    label: "Apex 50k (Intraday)",
    rules: {
      trailingMaxDrawdown: 2500,
      drawdownMode: "Intraday",
      profitTarget: 3000,
      maxPositions: 10,
      consistencyPercent: 30,
      defaultRiskType: "$",
      defaultRiskValue: 200,
      riskBase: "drawdown",
      enableHardStop: false,
    }
  },
  {
    id: "apex-100k",
    firmName: "Apex",
    badgeColor: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    accountSize: 100000,
    label: "Apex 100k (Intraday)",
    rules: {
      trailingMaxDrawdown: 3000,
      drawdownMode: "Intraday",
      profitTarget: 6000,
      maxPositions: 14,
      consistencyPercent: 30,
      defaultRiskType: "$",
      defaultRiskValue: 250,
      riskBase: "drawdown",
      enableHardStop: false,
    }
  },

  // --- FTMO ---
  {
    id: "ftmo-50k",
    firmName: "FTMO",
    badgeColor: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    accountSize: 50000,
    label: "FTMO 50k",
    rules: {
      trailingMaxDrawdown: 5000, // 10%
      drawdownMode: "End of Day",
      maxDailyLoss: 2500, // 5%
      maxDailyLossType: "$",
      profitTarget: 5000, // 10%
      maxPositions: 10,
      defaultRiskType: "%",
      defaultRiskValue: 1, // 1%
      riskBase: "balance",
      enableHardStop: true,
      dailyLossAlertThreshold: 80,
    }
  },
  {
    id: "ftmo-100k",
    firmName: "FTMO",
    badgeColor: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    accountSize: 100000,
    label: "FTMO 100k",
    rules: {
      trailingMaxDrawdown: 10000, // 10%
      drawdownMode: "End of Day",
      maxDailyLoss: 5000, // 5%
      maxDailyLossType: "$",
      profitTarget: 10000, // 10%
      maxPositions: 20,
      defaultRiskType: "%",
      defaultRiskValue: 1, // 1%
      riskBase: "balance",
      enableHardStop: true,
      dailyLossAlertThreshold: 80,
    }
  },

  // --- PERSONAL BROKER ---
  {
    id: "personal-standard",
    firmName: "Personal",
    badgeColor: "border-purple-500/40 bg-purple-500/10 text-purple-400",
    accountSize: 10000,
    label: "Personal Account",
    rules: {
      trailingMaxDrawdown: 2000,
      drawdownMode: "Intraday",
      maxDailyLoss: 500,
      maxDailyLossType: "$",
      defaultRiskType: "%",
      defaultRiskValue: 1,
      riskBase: "balance",
      enableHardStop: false,
    }
  }
];
