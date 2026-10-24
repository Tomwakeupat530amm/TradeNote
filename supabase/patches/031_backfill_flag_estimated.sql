-- Patch 031 - backfill_flag_estimated (Phase 03, C2, D-4).
--
-- DESTRUCTIVE-OK: UPDATE chỉ ghi cờ risk_is_estimated = true cho lệnh cũ risk_amount = 500 (cờ NULL); không đổi risk_amount, r_multiple, pnl; lùi bằng 031.down.sql
--
-- Không mốc thời gian: PROD trades KHÔNG có created_at (baseline 11-10-26: 18 cột). Lệnh cũ có
-- risk_amount = 500 là giá trị mặc định cũ (COALESCE 500) -> gắn cờ "ước tính".
-- Idempotent: chỉ đụng hàng cờ NULL; hàng cờ false (client mới / user xác nhận) không bị đụng;
-- chạy lại cập nhật 0 hàng.
-- Yêu cầu: 030 đã áp (cột risk_is_estimated tồn tại).
-- Sau khi áp: probes/30_p3_estimated_counts.sql -> COUNT(cờ true) = COUNT(risk_amount = 500);
-- hàng risk khác 500 giữ NULL. Lệch -> 031.down.sql rồi 030.down.sql.

BEGIN;

UPDATE public.trades
SET risk_is_estimated = true
WHERE risk_amount = 500
  AND risk_is_estimated IS NULL;

INSERT INTO public.schema_migrations (version, name)
VALUES ('031', 'backfill_flag_estimated')
ON CONFLICT DO NOTHING;

COMMIT;
