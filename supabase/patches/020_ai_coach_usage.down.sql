-- Down 020 - ai_coach_usage
-- CẢNH BÁO: route /api/ai-coach mới FAIL CLOSED khi thiếu consume_ai_quota -> chạy file này
-- trước khi revert route sẽ làm AI Coach trả AI_UNAVAILABLE cho mọi user.
-- Thứ tự rollback: (1) revert route (git) và deploy, (2) chạy file này,
-- (3) chạy tay: delete from public.schema_migrations where version = '020';
-- Mất dữ liệu: chỉ bộ đếm hạn mức AI (không phải dữ liệu giao dịch).

BEGIN;

DROP FUNCTION IF EXISTS public.consume_ai_quota(integer, integer);
DROP TABLE IF EXISTS public.ai_coach_usage;

COMMIT;
