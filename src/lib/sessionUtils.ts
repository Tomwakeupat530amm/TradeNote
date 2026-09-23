/**
 * Utility to automatically detect trading session based on trade timestamp.
 * Standard Market Sessions (in UTC):
 * - Asian Session: 00:00 - 08:00 UTC (Tokyo, Sydney)
 * - London Session: 08:00 - 13:00 UTC (Europe open)
 * - London-NY Overlap: 13:00 - 16:00 UTC (Peak volatility)
 * - New York Session: 16:00 - 21:00 UTC (US session)
 * - Late US / Off-hours: 21:00 - 24:00 UTC
 */

export type TradingSession = 'Asian' | 'London' | 'New York' | 'London-NY Overlap';

export const SESSIONS: TradingSession[] = ['Asian', 'London', 'London-NY Overlap', 'New York'];

export function detectSession(dateInput: Date | string): TradingSession {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) {
    return 'New York'; // Default fallback
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
    // 21:00 - 24:00 UTC: Transition into Asian session
    return 'Asian';
  }
}

export function getSessionBadgeColor(session: TradingSession | string): string {
  switch (session) {
    case 'London':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    case 'London-NY Overlap':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    case 'New York':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    case 'Asian':
    default:
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  }
}
