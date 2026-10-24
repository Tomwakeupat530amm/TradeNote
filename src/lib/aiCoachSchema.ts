// Input contract for POST /api/ai-coach (Phase 02, A3).
//
// Validates the REAL payload built by `aggregateTradingHabits` (src/lib/aiCoachAggregator.ts)
// plus `locale`. There is no `trades[]` array and no free-text notes in this payload.
// Runtime imports: ONLY `zod` (the runner imports this file with Node type-stripping; the
// aggregator itself cannot be imported by Node because it imports `Trade` as a value).
import { z } from "zod";
import type { AggregatedTradingHabits } from "@/lib/aiCoachAggregator";

/** Hard cap on the raw request body, checked before JSON.parse. */
export const AI_COACH_MAX_BODY_BYTES = 64 * 1024;

/** Generous caps: real aggregator output must always pass. */
export const AI_COACH_LIMITS = {
  maxRecordKeys: 200,
  maxKeyLength: 128,
  maxAccountNameLength: 200,
  maxCount: 1_000_000,
  maxAbsAmount: 1_000_000_000_000,
  maxAbsR: 1_000_000,
} as const;

/** The only error codes the route may return. */
export const AI_COACH_ERROR_CODES = ["UNAUTHORIZED", "INVALID_INPUT", "RATE_LIMITED", "AI_UNAVAILABLE"] as const;
export type AiCoachErrorCode = (typeof AI_COACH_ERROR_CODES)[number];

const count = z.int().min(0).max(AI_COACH_LIMITS.maxCount);
const amount = z.number().finite().min(-AI_COACH_LIMITS.maxAbsAmount).max(AI_COACH_LIMITS.maxAbsAmount);
const percent = z.number().finite().min(0).max(100);

function boundedRecord<T extends z.ZodType>(value: T) {
  return z
    .record(z.string().max(AI_COACH_LIMITS.maxKeyLength), value)
    .refine((obj) => Object.keys(obj).length <= AI_COACH_LIMITS.maxRecordKeys, {
      message: "too many keys",
    });
}

export const aiCoachPayloadSchema = z.strictObject({
  accountName: z.string().max(AI_COACH_LIMITS.maxAccountNameLength).optional(),
  totalTrades: count,
  totalPnL: amount,
  winRate: percent,
  winsCount: count,
  lossesCount: count,
  averageR: z.number().finite().min(-AI_COACH_LIMITS.maxAbsR).max(AI_COACH_LIMITS.maxAbsR),
  sessionBreakdown: boundedRecord(z.strictObject({ trades: count, pnl: amount, winRate: percent })),
  mistakeCosts: boundedRecord(z.strictObject({ count, totalLoss: amount })),
  revengeStreakLoss: amount,
  revengeStreakCount: count,
  setupPerformance: boundedRecord(z.strictObject({ count, winRate: percent, pnl: amount })),
  assetPerformance: boundedRecord(z.strictObject({ count, winRate: percent, pnl: amount })),
  // P3 (D5) starts sending this; accepted now so P3 does not break the route.
  unratedForR: count.optional(),
  locale: z.enum(["en", "vi"]),
});

export type AiCoachPayload = z.infer<typeof aiCoachPayloadSchema>;

/** Compile-time guard: every aggregator output (plus locale) is a valid payload type. */
export type AggregatorFitsPayload = AggregatedTradingHabits & { locale: AiCoachPayload["locale"] } extends AiCoachPayload
  ? true
  : never;
/** tsc fails here if the aggregator shape drifts away from the schema. */
export const AGGREGATOR_FITS_PAYLOAD: AggregatorFitsPayload = true;

export function parseAiCoachPayload(input: unknown): { success: true; data: AiCoachPayload } | { success: false } {
  const result = aiCoachPayloadSchema.safeParse(input);
  return result.success ? { success: true, data: result.data } : { success: false };
}
