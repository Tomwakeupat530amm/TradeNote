-- Down 030 - risk_nullable_estimated
-- Chỉ bỏ cột cờ risk_is_estimated (mất cờ ước tính; KHÔNG đụng risk_amount, r_multiple, pnl).
-- KHÔNG khôi phục NOT NULL/DEFAULT 500 cho risk_amount (PROD vốn nullable, không default) và KHÔNG
-- xóa risk_amount/r_multiple/session/checklist_results (đã tồn tại trước 030 trên PROD).
-- Thứ tự: chạy 031_backfill_flag_estimated.down.sql TRƯỚC (nếu 031 đã áp).
-- Tự động CHỈ như rollback do probe 30 FAIL, cùng phiên áp, TRƯỚC khi push client (plan P3 C5(c));
-- mọi trường hợp khác phải hỏi user.

BEGIN;

ALTER TABLE public.trades DROP COLUMN IF EXISTS risk_is_estimated;

DELETE FROM public.schema_migrations WHERE version = '030';

COMMIT;
