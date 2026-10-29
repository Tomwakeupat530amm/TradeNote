// P5 Step D: map server-side Hard Stop rejections (PostgREST error from trigger 052/053) to client errors.
// Contract: ERRCODE 'P0001' + HINT 'HARD_STOP' (trades writes) or HINT 'HARD_STOP_CONFIG_LOCKED'
// (loosening config while locked). DETAIL is JSON { dayKey, lossToday, limit } of the caller only.
import { HardStopError } from '@/lib/hardStop';

export interface ServerDbError {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
  details?: string | null;
}

export type ServerHardStopHint = 'HARD_STOP' | 'HARD_STOP_CONFIG_LOCKED';

/** Which Hard Stop contract (if any) a database error carries. Requires BOTH code P0001 and the hint. */
export function serverHardStopHint(error: ServerDbError | null | undefined): ServerHardStopHint | null {
  if (!error || error.code !== 'P0001') return null;
  if (error.hint === 'HARD_STOP') return 'HARD_STOP';
  if (error.hint === 'HARD_STOP_CONFIG_LOCKED') return 'HARD_STOP_CONFIG_LOCKED';
  return null;
}

const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Parse the trigger DETAIL JSON. Malformed / non-object / missing fields -> nulls (never throws). */
export function parseHardStopDetail(details: string | null | undefined): {
  dayKey: string | null;
  lossToday: number | null;
  limit: number | null;
} {
  const empty = { dayKey: null, lossToday: null, limit: null };
  if (typeof details !== 'string' || details.trim() === '') return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(details);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
  const o = parsed as Record<string, unknown>;
  return {
    dayKey: typeof o.dayKey === 'string' ? o.dayKey : null,
    lossToday: finiteOrNull(o.lossToday),
    limit: finiteOrNull(o.limit),
  };
}

/**
 * Trades writes: a server HARD_STOP rejection -> HardStopError('HARD_STOP') with parsed DETAIL.
 * Anything else (incl. HARD_STOP_CONFIG_LOCKED, which the caller passes through unchanged) -> null.
 */
export function toServerHardStopError(error: ServerDbError | null | undefined): HardStopError | null {
  if (serverHardStopHint(error) !== 'HARD_STOP') return null;
  return new HardStopError('HARD_STOP', parseHardStopDetail(error?.details));
}

/** Config writes (preferences): a server HARD_STOP_CONFIG_LOCKED rejection -> HardStopError; else null. */
export function toServerConfigLockedError(error: ServerDbError | null | undefined): HardStopError | null {
  if (serverHardStopHint(error) !== 'HARD_STOP_CONFIG_LOCKED') return null;
  return new HardStopError('HARD_STOP_CONFIG_LOCKED', parseHardStopDetail(error?.details));
}
