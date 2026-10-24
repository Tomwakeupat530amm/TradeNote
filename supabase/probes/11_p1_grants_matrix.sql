-- ==============================================================================
-- CHỈ ĐỌC. Không chứa secret.
-- ==============================================================================
-- Probe 11 - Ma trận quyền thực tế (Phase 01, grants-matrix-audit, AC-A5 / P1-AC9)
--
-- Chạy SAU 011 (và lại sau mỗi lần tạo bảng mới - bù known-gap default privileges supabase_admin).
-- P2 (020): thêm bảng ai_coach_usage + hàm consume_ai_quota(integer,integer); version = p2-after-020.
-- Cách chạy: SQL Editor -> dán toàn bộ -> Run. Kết quả: MỘT ô `matrix` (jsonb). Copy ô đó, so với
-- supabase/tests/grants_matrix.expected.json (bỏ qua khóa "_doc"); dán cả hai vào phase report.
--
-- Cấu trúc JSON xuất ra (giống file expected):
-- {
--   "version": "p2-after-020",
--   "tables": { "<bảng>": { "anon": [..], "authenticated": [..], "service_role": [..] } },
--        // mỗi mảng = quyền có thật, sắp A-Z, trong {DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE}
--   "functions": { "<chữ ký>": { "PUBLIC": bool, "anon": bool, "authenticated": bool } },
--        // chỉ hàm không thuộc extension; PUBLIC = có mục ACL cho PUBLIC (hoặc ACL NULL = mặc định PUBLIC)
--   "policies": {
--     "user_preferences": [lệnh có policy, A-Z],
--     "update_policies_with_check": [bảng có MỌI policy UPDATE kèm WITH CHECK, A-Z]
--   }
-- }
-- Khớp = cùng nội dung. Bất kỳ quyền nào của anon, hoặc TRUNCATE/TRIGGER/REFERENCES của authenticated = FAIL.
-- ==============================================================================

WITH tbl AS (
  SELECT unnest(ARRAY['accounts', 'daily_reviews', 'notifications', 'periodic_reviews',
                      'playbooks', 'trades', 'user_preferences', 'schema_migrations',
                      'ai_coach_usage']) AS t
),
rl AS (
  SELECT unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r
),
pv AS (
  SELECT unnest(ARRAY['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']) AS p
),
cells AS (
  SELECT tbl.t, rl.r,
         COALESCE(
           jsonb_agg(pv.p ORDER BY pv.p) FILTER (
             -- to_regclass trả NULL khi bảng chưa có -> has_table_privilege trả NULL (không lỗi)
             WHERE has_table_privilege(rl.r, to_regclass('public.' || tbl.t), pv.p)),
           '[]'::jsonb) AS privs
  FROM tbl CROSS JOIN rl CROSS JOIN pv
  GROUP BY tbl.t, rl.r
),
tables_json AS (
  SELECT jsonb_object_agg(t, roles) AS j
  FROM (SELECT t, jsonb_object_agg(r, privs) AS roles FROM cells GROUP BY t) x
),
fns AS (
  SELECT p.oid, p.oid::regprocedure::text AS sig, p.proacl
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
),
functions_json AS (
  SELECT COALESCE(jsonb_object_agg(
           regexp_replace(sig, '^public\.', ''),
           jsonb_build_object(
             'PUBLIC', proacl IS NULL OR EXISTS (
                SELECT 1 FROM aclexplode(proacl) e WHERE e.grantee = 0 AND e.privilege_type = 'EXECUTE'),
             'anon', has_function_privilege('anon', oid, 'EXECUTE'),
             'authenticated', has_function_privilege('authenticated', oid, 'EXECUTE'))),
         '{}'::jsonb) AS j
  FROM fns
),
prefs_json AS (
  SELECT COALESCE(jsonb_agg(DISTINCT cmd ORDER BY cmd), '[]'::jsonb) AS j
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'user_preferences'
),
upd_json AS (
  SELECT COALESCE(jsonb_agg(tablename ORDER BY tablename), '[]'::jsonb) AS j
  FROM (
    SELECT tablename
    FROM pg_policies
    WHERE schemaname = 'public' AND cmd IN ('UPDATE', 'ALL')
      AND tablename IN ('accounts', 'daily_reviews', 'notifications', 'periodic_reviews',
                        'playbooks', 'trades', 'user_preferences')
    GROUP BY tablename
    HAVING bool_and(with_check IS NOT NULL)
  ) u
)
SELECT jsonb_build_object(
         'version', 'p2-after-020',
         'tables', (SELECT j FROM tables_json),
         'functions', (SELECT j FROM functions_json),
         'policies', jsonb_build_object(
           'user_preferences', (SELECT j FROM prefs_json),
           'update_policies_with_check', (SELECT j FROM upd_json))
       ) AS matrix;
