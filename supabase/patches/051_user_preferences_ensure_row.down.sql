-- Down 051 - user_preferences_ensure_row
-- Gỡ trigger trên auth.users + hàm. KHÔNG xóa dòng user_preferences đã backfill/tạo (dữ liệu hợp lệ).
-- Thứ tự gỡ toàn phase: 053 -> 052 -> 051 -> 050. Không chứa lệnh giao dịch.

DROP TRIGGER IF EXISTS trg_user_preferences_ensure_row ON auth.users;
DROP FUNCTION IF EXISTS public.user_preferences_ensure_row();

DELETE FROM public.schema_migrations WHERE version = '051';
