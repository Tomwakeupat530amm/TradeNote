-- Patch 051 - user_preferences_ensure_row (Phase 05, B1).
--
-- Mục đích: mọi user luôn có một dòng public.user_preferences (ranh giới ngày giao dịch đọc timezone ở đó).
--   (a) Backfill (chạy SAU khi tạo trigger ở (b)): tạo dòng mặc định cho user chưa có (timezone 'UTC' = default cột, NOT NULL DEFAULT 'UTC').
--   (b) Hàm + trigger AFTER INSERT ON auth.users tạo dòng mặc định cho user mới.
--       Hàm KHÔNG BAO GIỜ ném lỗi (trigger lỗi trên auth.users = không ai đăng ký được):
--       INSERT ... ON CONFLICT (user_id) DO NOTHING + EXCEPTION WHEN OTHERS THEN RAISE WARNING.
-- Known-gap KG8: dòng do trigger tạo bắt đầu ở 'UTC' (trước initialTimeZone() của client) cho tới khi
-- user đổi múi giờ trong Cài đặt.
--
-- Áp RIÊNG ở giai đoạn 3 (scripts/p5_prod_apply.mjs) vì đụng auth.users; thiếu quyền tạo trigger trên
-- auth.users -> CONTEXT_PARTIAL cho 051, phase vẫn tiếp tục (client fetchPreferences vẫn tạo dòng).
-- CẢNH BÁO: chạy lại patch này sẽ BẬT LẠI trigger trg_user_preferences_ensure_row nếu đã DISABLE.
-- Patch KHÔNG chứa lệnh giao dịch. Idempotent. Đường lui: 051_user_preferences_ensure_row.down.sql
-- (gỡ trigger + hàm, GIỮ các dòng đã tạo).

CREATE OR REPLACE FUNCTION public.user_preferences_ensure_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  BEGIN
    INSERT INTO public.user_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'user_preferences_ensure_row: could not create preferences row (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.user_preferences_ensure_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_user_preferences_ensure_row ON auth.users;
CREATE TRIGGER trg_user_preferences_ensure_row
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.user_preferences_ensure_row();

-- (m2) Backfill SAU khi tạo trigger: user đăng ký trong lúc áp patch không bị lọt.
INSERT INTO public.user_preferences (user_id)
SELECT u.id
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_preferences p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.schema_migrations (version, name)
VALUES ('051', 'user_preferences_ensure_row')
ON CONFLICT DO NOTHING;
