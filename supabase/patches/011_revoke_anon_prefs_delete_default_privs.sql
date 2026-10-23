-- Patch 011 - revoke_anon_prefs_delete_default_privs (Phase 01, B3)
-- Mục đích (baseline 11-10-26 R2/R3/R4/R1):
--   (1) Thu hồi MỌI quyền của anon trên bảng + sequence schema public (live: anon có đủ 7 quyền).
--       Đã grep src/**: mọi truy vấn dữ liệu đi qua phiên đăng nhập; trang /auth chỉ gọi supabase.auth.
--   (2) Thu hồi TRUNCATE, TRIGGER, REFERENCES của authenticated (giữ đúng SELECT/INSERT/UPDATE/DELETE).
--       service_role KHÔNG đổi.
--   (3) Default privileges của role đang chạy (postgres trong SQL Editor): bảng/sequence/hàm tạo mới
--       không còn cấp cho anon. Hàm: EXECUTE cho PUBLIC là default TOÀN CỤC (không theo schema), nên
--       "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ... FROM PUBLIC" là no-op; phải dùng dạng
--       toàn cục "ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC"
--       (không IN SCHEMA). Dù vậy, MỌI patch tạo hàm mới vẫn phải tự
--       REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon; (hàm có thể do role khác tạo).
--       KNOWN-GAP: default ACL của supabase_admin không sửa được bằng quyền Dashboard -> chạy lại
--       probe 11 sau mỗi lần tạo bảng (backlog default-privileges-supabase-admin).
--   (4) Hàm/RPC: REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon; GRANT lại cho
--       authenticated đúng các hàm app cần (danh sách cho phép bên dưới). get_account_stats là
--       SECURITY INVOKER (baseline: prosecdef = false) nên RLS vẫn áp theo người gọi; giữ GRANT cho
--       authenticated tới khi P3 gỡ fetchAccountStats. Đặt search_path = public (cố định).
--   (5) Policy DELETE cho user_preferences (USING auth.uid() = user_id).
--
-- AN TOÀN (E20/O-1): khối kiểm đầu patch DỪNG (RAISE EXCEPTION, không đổi gì) nếu schema public có hàm
-- không thuộc extension nằm NGOÀI danh sách cho phép. Khi đó: chạy probe 10 mục h_routines, quyết định
-- hàm nào authenticated cần: thêm vào v_grant (được GRANT EXECUTE TO authenticated); hàm chỉ cần
-- cho qua kiểm (không GRANT, vd hàm trigger/nội bộ) thêm vào v_tolerate; rồi chạy lại.
--
-- Idempotent. Không DISABLE ROW LEVEL SECURITY. Áp tay sau 010 (USER GATE 3).
-- Đường lui: 011_revoke_anon_prefs_delete_default_privs.down.sql.

BEGIN;

-- (0) Kiểm danh sách hàm trước khi REVOKE EXECUTE toàn schema
DO $$
DECLARE
  v_tolerate text[] := ARRAY[]::text[];            -- chỉ để qua kiểm, KHÔNG GRANT
  v_grant    text[] := ARRAY['get_account_stats'];  -- GRANT EXECUTE TO authenticated (giữ đồng bộ với khối (4))
  v_unknown text;
BEGIN
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
  INTO v_unknown
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
    AND NOT (p.proname = ANY (v_tolerate || v_grant))
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
    );
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION '011 DỪNG: hàm public ngoài danh sách cho phép: %. Xem probe 10 h_routines; hàm authenticated cần gọi -> thêm vào v_grant (CẢ khối (0) và (4)); hàm chỉ cần cho qua -> thêm vào v_tolerate (khối (0)); rồi chạy lại.', v_unknown;
  END IF;
END $$;

-- (1) anon: không quyền nào trên bảng/sequence public
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- (2) authenticated: bỏ TRUNCATE/TRIGGER/REFERENCES (TRUNCATE bỏ qua RLS)
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;

-- (3) Default privileges (role đang chạy)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
-- EXECUTE cho PUBLIC là default toàn cục -> phải revoke ở mức toàn cục (không IN SCHEMA).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- (4) Hàm/RPC
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

DO $$
DECLARE
  v_grant text[] := ARRAY['get_account_stats'];  -- phải trùng v_grant ở khối (0)
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (v_grant)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.get_account_stats(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.get_account_stats(uuid) SET search_path = public;
  END IF;
END $$;

-- (5) DELETE policy cho user_preferences
DROP POLICY IF EXISTS "Users can delete their own preferences" ON public.user_preferences;
CREATE POLICY "Users can delete their own preferences" ON public.user_preferences
  FOR DELETE USING (auth.uid() = user_id);

INSERT INTO public.schema_migrations (version, name)
VALUES ('011', 'revoke_anon_prefs_delete_default_privs')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Kiểm nhanh sau khi chạy (phải ra 0 dòng); kiểm đầy đủ bằng probe 11.
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon';
