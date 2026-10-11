-- ==============================================================================
-- CHỈ ĐỌC. Không chạy trên production nếu chưa có backup.
-- ==============================================================================
-- Probe 00 - Chụp baseline schema thật (Phase 00, USER GATE 1)
--
-- Cách chạy:
--   1. Supabase Dashboard -> SQL Editor -> New query.
--   2. Dán TOÀN BỘ file này, bấm Run.
--   3. Kết quả là MỘT bảng gồm 2 cột (section, data). Bấm "Export" -> "Copy as JSON"
--      (hoặc CSV) và dán lại cho agent; agent ghi vào supabase/baseline/baseline_<ngày>.md.
--
-- File này chỉ gồm một câu SELECT duy nhất (các mục nối bằng UNION ALL) để SQL
-- Editor hiển thị đủ mọi mục trong một lần chạy. Không đọc/ghi dữ liệu người dùng,
-- chỉ đọc catalog + đếm số dòng. Không chứa secret.
--
-- Các mục:
--   01_rls_flags            pg_class.relrowsecurity / relforcerowsecurity cho 7 bảng
--   02_policies_public      pg_policies schema public
--   03_policies_storage     pg_policies schema storage
--   04_table_grants         information_schema.role_table_grants (schema public)
--   05_fn_get_account_stats pg_proc get_account_stats: prosecdef, proconfig, proacl, định nghĩa đầy đủ
--   06_storage_buckets      storage.buckets: public, file_size_limit, allowed_mime_types
--   07_default_acl          pg_default_acl
--   08_columns              cột thật của trades / accounts / user_preferences
--   09_trades_risk_500      số trades có risk_amount = 500 (null nếu cột không tồn tại)
--   10_storage_foreign_prefix  số object có thư mục đầu khác owner (theo bucket)
-- ==============================================================================

SELECT '01_rls_flags' AS section,
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', c.relname,
         'relrowsecurity', c.relrowsecurity,
         'relforcerowsecurity', c.relforcerowsecurity
       ) ORDER BY c.relname), '[]'::jsonb) AS data
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('accounts', 'trades', 'daily_reviews', 'notifications',
                    'user_preferences', 'playbooks', 'periodic_reviews')

UNION ALL

SELECT '02_policies_public',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', p.tablename,
         'policy', p.policyname,
         'permissive', p.permissive,
         'roles', p.roles,
         'cmd', p.cmd,
         'qual', p.qual,
         'with_check', p.with_check
       ) ORDER BY p.tablename, p.policyname), '[]'::jsonb)
FROM pg_policies p
WHERE p.schemaname = 'public'

UNION ALL

SELECT '03_policies_storage',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', p.tablename,
         'policy', p.policyname,
         'permissive', p.permissive,
         'roles', p.roles,
         'cmd', p.cmd,
         'qual', p.qual,
         'with_check', p.with_check
       ) ORDER BY p.tablename, p.policyname), '[]'::jsonb)
FROM pg_policies p
WHERE p.schemaname = 'storage'

UNION ALL

SELECT '04_table_grants',
       COALESCE(jsonb_agg(jsonb_build_object(
         'grantee', g.grantee,
         'table', g.table_name,
         'privilege', g.privilege_type,
         'grantable', g.is_grantable
       ) ORDER BY g.table_name, g.grantee, g.privilege_type), '[]'::jsonb)
FROM information_schema.role_table_grants g
WHERE g.table_schema = 'public'
  AND g.grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')

UNION ALL

SELECT '05_fn_get_account_stats',
       COALESCE(jsonb_agg(jsonb_build_object(
         'schema', n.nspname,
         'name', p.proname,
         'identity_args', pg_get_function_identity_arguments(p.oid),
         'returns', pg_get_function_result(p.oid),
         'language', l.lanname,
         'prosecdef', p.prosecdef,
         'provolatile', p.provolatile,
         'proconfig', p.proconfig,
         'proacl', p.proacl::text,
         'definition', pg_get_functiondef(p.oid)
       )), '[]'::jsonb)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE p.proname = 'get_account_stats'

UNION ALL

SELECT '06_storage_buckets',
       COALESCE(jsonb_agg(jsonb_build_object(
         'id', b.id,
         'name', b.name,
         'public', b.public,
         'file_size_limit', b.file_size_limit,
         'allowed_mime_types', b.allowed_mime_types
       ) ORDER BY b.id), '[]'::jsonb)
FROM storage.buckets b

UNION ALL

SELECT '07_default_acl',
       COALESCE(jsonb_agg(jsonb_build_object(
         'role', d.defaclrole::regrole::text,
         'schema', COALESCE(d.defaclnamespace::regnamespace::text, '(all)'),
         'objtype', d.defaclobjtype,
         'acl', d.defaclacl::text
       ) ORDER BY d.defaclrole::regrole::text, d.defaclobjtype), '[]'::jsonb)
FROM pg_default_acl d

UNION ALL

SELECT '08_columns',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', col.table_name,
         'pos', col.ordinal_position,
         'column', col.column_name,
         'type', col.data_type,
         'nullable', col.is_nullable,
         'default', col.column_default
       ) ORDER BY col.table_name, col.ordinal_position), '[]'::jsonb)
FROM information_schema.columns col
WHERE col.table_schema = 'public'
  AND col.table_name IN ('trades', 'accounts', 'user_preferences')

UNION ALL

-- to_jsonb(t) giúp câu lệnh không lỗi nếu cột risk_amount không tồn tại (khi đó đếm = 0
-- và has_risk_amount_column = false).
SELECT '09_trades_risk_500',
       jsonb_build_object(
         'has_risk_amount_column', EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'risk_amount'
         ),
         'total_trades', (SELECT count(*) FROM public.trades),
         'risk_amount_eq_500', (SELECT count(*) FROM public.trades t
                                WHERE (to_jsonb(t) ->> 'risk_amount')::numeric = 500),
         'risk_amount_null', (SELECT count(*) FROM public.trades t
                              WHERE (to_jsonb(t) ->> 'risk_amount') IS NULL)
       )

UNION ALL

-- Đối tượng có thư mục đầu tiên (phần trước dấu '/') khác owner. Avatar kiểu cũ
-- "<user_id>-<random>.<ext>" không có thư mục nên được đếm riêng (no_folder).
SELECT '10_storage_foreign_prefix',
       COALESCE(jsonb_agg(x ORDER BY x ->> 'bucket'), '[]'::jsonb)
FROM (
  SELECT jsonb_build_object(
           'bucket', o.bucket_id,
           'total_objects', count(*),
           'no_folder', count(*) FILTER (WHERE position('/' IN o.name) = 0),
           'prefix_not_owner', count(*) FILTER (
             WHERE position('/' IN o.name) > 0
               AND split_part(o.name, '/', 1) IS DISTINCT FROM
                   COALESCE(to_jsonb(o) ->> 'owner_id', to_jsonb(o) ->> 'owner')
           ),
           'owner_null', count(*) FILTER (
             WHERE COALESCE(to_jsonb(o) ->> 'owner_id', to_jsonb(o) ->> 'owner') IS NULL
           )
         ) AS x
  FROM storage.objects o
  GROUP BY o.bucket_id
) s;
