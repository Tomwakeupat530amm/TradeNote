-- Down 011 - revoke_anon_prefs_delete_default_privs
-- CẢNH BÁO: lùi patch này MỞ LẠI quyền cho anon (về trạng thái snapshot cũ: SELECT bảng, USAGE/SELECT
-- sequence, EXECUTE hàm cho PUBLIC/anon), cấp lại TRUNCATE/TRIGGER/REFERENCES cho authenticated và bỏ
-- policy DELETE preferences. Chỉ dùng khi sự cố. Thứ tự lùi: 013 -> 012 -> 011 -> 010.
-- Lưu ý: baseline live có anon đủ 7 quyền; file lui chỉ khôi phục mức của snapshot cũ (SELECT), không
-- cấp lại INSERT/UPDATE/DELETE/TRUNCATE cho anon (không có lý do nghiệp vụ nào cần).
-- Lưu ý (S7): down cũng KHÔNG thu hẹp lại được quyền trên public.schema_migrations về đúng mức 000:
-- các GRANT ... ON ALL TABLES bên dưới làm rộng quyền schema_migrations (anon SELECT, authenticated
-- TRUNCATE/TRIGGER/REFERENCES) so với 000 -> probe 11 sẽ báo lệch; đây là chủ đích (chỉ dùng khi sự cố).
-- Sau khi chạy: delete from public.schema_migrations where version = '011';  (chạy tay)

BEGIN;

DROP POLICY IF EXISTS "Users can delete their own preferences" ON public.user_preferences;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
-- Đối xứng với 011: khôi phục default toàn cục EXECUTE cho PUBLIC của role postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC, anon;

DO $$
BEGIN
  IF to_regprocedure('public.get_account_stats(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.get_account_stats(uuid) RESET search_path;
  END IF;
END $$;

COMMIT;
