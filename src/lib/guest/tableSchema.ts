/**
 * Guest demo mode - column schema of the 7 app tables (phase G1, step S0-1).
 *
 * Mirrors `supabase/schema.snapshot.sql` and is the single source for defaults, column
 * kinds and constraints used by `fakeCore.ts`. Only constraints that exist in the snapshot
 * are declared (no CHECK on `accounts.type` or `trades.result`, because the SQL has none).
 * The `user_id -> auth.users` foreign keys are not modelled (there is no users table here).
 */
import type { ColumnSpec, TableSchemaMap } from "./types";

const UUID_PK: ColumnSpec = { kind: "uuid", notNull: true, default: { kind: "uuid" } };
const USER_ID: ColumnSpec = { kind: "uuid", notNull: true };
const CREATED_AT: ColumnSpec = { kind: "timestamptz", notNull: true, default: { kind: "now" } };
const OPTIONAL_TEXT: ColumnSpec = { kind: "text", notNull: false };
const RATING: ColumnSpec = { kind: "numeric", notNull: false, range: { min: 1, max: 5 } };

export const TABLE_SCHEMA: TableSchemaMap = {
  accounts: {
    columns: {
      id: UUID_PK,
      user_id: USER_ID,
      name: { kind: "text", notNull: true },
      type: { kind: "text", notNull: true },
      initial_balance: { kind: "numeric", notNull: true },
      rules: { kind: "json", notNull: true, default: { kind: "value", value: {} } },
      created_at: CREATED_AT,
    },
    unique: [["id", "user_id"]],
    foreignKeys: [],
  },
  trades: {
    columns: {
      id: UUID_PK,
      user_id: USER_ID,
      account_id: { kind: "uuid", notNull: true },
      asset: { kind: "text", notNull: true },
      lot_size: { kind: "numeric", notNull: true },
      pnl: { kind: "numeric", notNull: true },
      result: { kind: "text", notNull: true },
      setup: { kind: "text", notNull: true },
      confluences: { kind: "json", notNull: true, default: { kind: "value", value: [] } },
      emotion: { kind: "text", notNull: true },
      mistake: { kind: "text", notNull: true },
      notes: OPTIONAL_TEXT,
      screenshot_path: OPTIONAL_TEXT,
      date: { kind: "timestamptz", notNull: true, default: { kind: "now" } },
      risk_amount: { kind: "numeric", notNull: false },
      r_multiple: { kind: "numeric", notNull: false },
      session: OPTIONAL_TEXT,
      checklist_results: { kind: "json", notNull: false, default: { kind: "value", value: {} } },
      risk_is_estimated: { kind: "boolean", notNull: false },
    },
    unique: [],
    foreignKeys: [
      {
        columns: ["account_id", "user_id"],
        references: { table: "accounts", columns: ["id", "user_id"] },
        onDelete: "cascade",
      },
    ],
  },
  daily_reviews: {
    columns: {
      id: UUID_PK,
      user_id: USER_ID,
      date: { kind: "date", notNull: true, default: { kind: "today" } },
      pre_market_bias: OPTIONAL_TEXT,
      economic_news: OPTIONAL_TEXT,
      end_of_day_review: OPTIONAL_TEXT,
      mistakes_made: OPTIONAL_TEXT,
      lessons_learned: OPTIONAL_TEXT,
      rating: RATING,
      created_at: CREATED_AT,
    },
    unique: [["user_id", "date"]],
    foreignKeys: [],
  },
  notifications: {
    columns: {
      id: UUID_PK,
      user_id: USER_ID,
      title: { kind: "text", notNull: true },
      message: { kind: "text", notNull: true },
      type: { kind: "text", notNull: true },
      is_read: { kind: "boolean", notNull: true, default: { kind: "value", value: false } },
      created_at: CREATED_AT,
    },
    unique: [],
    foreignKeys: [],
  },
  user_preferences: {
    columns: {
      id: UUID_PK,
      user_id: USER_ID,
      display_name: OPTIONAL_TEXT,
      avatar_url: OPTIONAL_TEXT,
      timezone: { kind: "text", notNull: true, default: { kind: "value", value: "UTC" } },
      base_currency: { kind: "text", notNull: true, default: { kind: "value", value: "USD" } },
      psychology_tags: {
        kind: "json",
        notNull: true,
        default: { kind: "value", value: ["Calm", "FOMO", "Revenge", "Greedy", "Fearful"] },
      },
      mistake_tags: {
        kind: "json",
        notNull: true,
        default: {
          kind: "value",
          value: ["None", "Moved SL", "Early Entry", "Late Entry", "Overleveraged", "Forced Trade"],
        },
      },
      confluence_tags: {
        kind: "json",
        notNull: true,
        default: {
          kind: "value",
          value: ["Trendline", "Support/Resistance", "Fibonacci", "Moving Average", "RSI Divergence", "Order Block"],
        },
      },
      privacy_mode: { kind: "boolean", notNull: true, default: { kind: "value", value: false } },
      theme: { kind: "text", notNull: true, default: { kind: "value", value: "dark" } },
      created_at: CREATED_AT,
    },
    unique: [["user_id"]],
    foreignKeys: [],
  },
  playbooks: {
    columns: {
      id: UUID_PK,
      user_id: USER_ID,
      title: { kind: "text", notNull: true },
      description: OPTIONAL_TEXT,
      rules: { kind: "json", notNull: true, default: { kind: "value", value: [] } },
      image_url: OPTIONAL_TEXT,
      created_at: CREATED_AT,
    },
    unique: [],
    foreignKeys: [],
  },
  periodic_reviews: {
    columns: {
      id: UUID_PK,
      user_id: USER_ID,
      period_type: { kind: "text", notNull: true, oneOf: ["weekly", "monthly"] },
      start_date: { kind: "date", notNull: true },
      end_date: { kind: "date", notNull: true },
      performance_review: OPTIONAL_TEXT,
      emotional_state: OPTIONAL_TEXT,
      went_well: OPTIONAL_TEXT,
      needs_improvement: OPTIONAL_TEXT,
      rating: RATING,
      created_at: CREATED_AT,
    },
    unique: [["user_id", "period_type", "start_date"]],
    foreignKeys: [],
  },
};
