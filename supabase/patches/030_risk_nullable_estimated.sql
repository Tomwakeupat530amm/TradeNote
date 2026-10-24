-- Patch 030 - risk_nullable_estimated (Phase 03, C1, D-3).
--
-- Mục đích: chuẩn hóa cột rủi ro của public.trades và thêm cờ "ước tính".
--   - ADD COLUMN IF NOT EXISTS risk_amount numeric, r_multiple numeric, session text,
--     checklist_results jsonb DEFAULT '{}' (PROD đã có cả 4 theo baseline 11-10-26 mục 08 -> no-op;
--     project mới từ schema.snapshot.sql cũ thì được bổ sung).
--   - risk_amount: DROP NOT NULL / DROP DEFAULT có guard information_schema (PROD đã nullable,
--     không default -> no-op). Không còn mặc định 500 ở tầng DB.
--   - risk_is_estimated boolean NULLABLE, KHÔNG default: NULL = chưa phân loại; true = gắn bởi 031
--     (risk_amount = 500 cũ); false = client mới ghi (rủi ro thật).
--
-- KHÔNG đổi giá trị risk_amount, r_multiple, pnl. KHÔNG chạy lại legacy/supabase_patch_enhancements.sql
-- (COALESCE risk_amount 500).
-- Idempotent. Đường lui: 030_risk_nullable_estimated.down.sql.
-- Sau khi áp: chạy probes/30_p3_estimated_counts.sql; invariants (COUNT, COUNT 500, SUM pnl/risk/r)
-- phải BẰNG trước khi áp. Lệch -> chạy 030_risk_nullable_estimated.down.sql.

BEGIN;

ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS risk_amount numeric;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS r_multiple numeric;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS session text;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS checklist_results jsonb DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trades'
      AND column_name = 'risk_amount' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.trades ALTER COLUMN risk_amount DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trades'
      AND column_name = 'risk_amount' AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE public.trades ALTER COLUMN risk_amount DROP DEFAULT;
  END IF;
END
$$;

ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS risk_is_estimated boolean;

COMMENT ON COLUMN public.trades.risk_is_estimated IS
  'P3: NULL = chưa phân loại; true = risk_amount 500 cũ (ước tính, patch 031); false = rủi ro thật (client mới).';

INSERT INTO public.schema_migrations (version, name)
VALUES ('030', 'risk_nullable_estimated')
ON CONFLICT DO NOTHING;

COMMIT;
