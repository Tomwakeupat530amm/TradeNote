"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { Trade } from "@/store/useTradeStore";

interface EquityCurveChartProps {
  trades: Trade[];
  initialBalance: number;
}

interface ChartDataPoint {
  date: string;
  balance: number;
  fullDate: string;
  pnl: number;
  symbol?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartDataPoint;
  }>;
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload;
    return (
      <div className="bg-gray-900 border border-white/10 p-4 rounded-xl shadow-xl">
        <p className="text-white font-semibold">{dataPoint.fullDate}</p>
        {dataPoint.symbol && <p className="text-gray-400 text-sm mb-2">{dataPoint.symbol}</p>}
        <div className="flex justify-between items-center gap-4">
          <span className="text-sm text-gray-400">Balance:</span>
          <span className="text-white font-bold">${dataPoint.balance.toLocaleString()}</span>
        </div>
        {dataPoint.pnl !== 0 && (
           <div className="flex justify-between items-center gap-4">
            <span className="text-sm text-gray-400">PnL:</span>
            <span className={`font-bold ${dataPoint.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {dataPoint.pnl >= 0 ? "+" : "-"}${Math.abs(dataPoint.pnl).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export function EquityCurveChart({ trades, initialBalance }: EquityCurveChartProps) {
  const data = useMemo(() => {
    // Sort trades chronologically
    const sortedTrades = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const chartData = sortedTrades.reduce((acc, trade) => {
      const lastBalance = acc.length > 0 ? acc[acc.length - 1].balance : initialBalance;
      const newBalance = lastBalance + trade.pnl;
      acc.push({
        date: format(new Date(trade.date), "MMM dd"),
        balance: newBalance,
        fullDate: format(new Date(trade.date), "MMM dd, yyyy HH:mm"),
        pnl: trade.pnl,
        symbol: trade.asset
      });
      return acc;
    }, [] as ChartDataPoint[]);

    // If no trades, just show initial balance line
    if (chartData.length === 0) {
      return [{ date: format(new Date(), "MMM dd"), balance: initialBalance, fullDate: "No trades", pnl: 0 }];
    }

    // Add starting point
    const firstTradeDate = new Date(sortedTrades[0].date);
    firstTradeDate.setDate(firstTradeDate.getDate() - 1); // One day before first trade
    const startPoint = {
      date: format(firstTradeDate, "MMM dd"),
      balance: initialBalance,
      fullDate: "Initial Balance",
      pnl: 0,
      symbol: "Deposit"
    };

    return [startPoint, ...chartData];
  }, [trades, initialBalance]);

  return (
    <div className="w-full h-full min-h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis 
            dataKey="date" 
            stroke="#9ca3af" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false} 
            minTickGap={30}
          />
          <YAxis 
            stroke="#9ca3af" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false} 
            tickFormatter={(value) => `$${value}`}
            domain={['auto', 'auto']}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area 
            type="monotone" 
            dataKey="balance" 
            stroke="#3b82f6" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorBalance)" 
            isAnimationActive={true}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
