-- Down 031 - backfill_flag_estimated
-- Đưa cờ true về NULL (chưa phân loại). Không đổi risk_amount, r_multiple, pnl.
-- GIỚI HẠN: không phân biệt được cờ true do 031 gắn với cờ true do user xác nhận bằng tay
-- (mọi cờ true đều về NULL). Cờ false giữ nguyên.

BEGIN;

UPDATE public.trades
SET risk_is_estimated = NULL
WHERE risk_is_estimated = true;

DELETE FROM public.schema_migrations WHERE version = '031';

COMMIT;
