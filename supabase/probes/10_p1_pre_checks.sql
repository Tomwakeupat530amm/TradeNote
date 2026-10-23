-- ==============================================================================
-- CHỈ ĐỌC. Không ghi dữ liệu, không đổi quyền. Không chứa secret.
-- ==============================================================================
-- Probe 10 - Pre-check Phase 01 (USER GATE 1) - chạy TRƯỚC 010; chạy lại mục g NGAY TRƯỚC 012.
--
-- Cách chạy: SQL Editor -> dán TOÀN BỘ -> Run. Kết quả là MỘT bảng (section, data).
-- Export -> Copy as JSON, dán lại cho agent (ghi vào phase report P1).
--
-- Quyết định theo kết quả:
--   A0_migrations: has_schema_migrations=false -> áp 000 rồi 001 trước 010;
--                  có '000' nhưng thiếu '001' -> đối chiếu h_routines.definition của get_account_stats
--                  với patches/001 rồi mới áp 001 (khác -> DỪNG, báo user); có cả hai -> bỏ qua.
--   a  > 0 -> KHÔNG tự sửa; patch sửa dữ liệu riêng (-- DESTRUCTIVE-OK) do user duyệt; 010 sẽ bỏ qua VALIDATE.
--   b  > 0 hoặc e > 0 -> DỪNG trước 012, user chọn phương án (copy sang tiền tố đúng / giữ SELECT chuyển tiếp).
--   c  > 0 -> 012 sẽ RAISE (dòng có url mà thiếu path); c2 > 0 -> BLOCKED (không tự giải mã %);
--   c4 > 0 ('#') -> báo user trước 012; c5 > 0 (path dùng chung) -> báo user (GC có thể làm vỡ ảnh).
--   c6 > 0 -> 012.down.sql (policy theo `owner`) không phủ các object đó; ghi nhận trước khi dựa vào down.
--   f  > 0 -> playbook có ảnh ngoài tiền tố/ngoài bucket -> báo user trước 013.
--   g  có tên policy NGOÀI 8 tên baseline -> DỪNG (E2/E3), báo user.
--   h  có hàm public (không thuộc extension) ngoài get_account_stats -> thêm vào v_grant (app cần gọi) hoặc v_tolerate (chỉ cho qua) của 011.
-- Baseline 11-10-26 đã biết: trade-screenshots 12 object, 0 ngoài tiền tố; avatars 0 object.
-- ==============================================================================

-- A0. Trạng thái migration (không lỗi khi bảng chưa tồn tại: truy vấn chạy qua chuỗi lúc thực thi)
SELECT 'A0_migrations' AS section,
       jsonb_build_object(
         'has_schema_migrations', to_regclass('public.schema_migrations') IS NOT NULL,
         'rows', CASE WHEN to_regclass('public.schema_migrations') IS NOT NULL
                      THEN query_to_xml(
                             'select version, name, applied_at from public.schema_migrations order by version',
                             true, false, '')::text
                      ELSE NULL END
       ) AS data

UNION ALL
-- a. trade gắn account của user khác (tiền đề VALIDATE composite FK)
SELECT 'a_trade_account_owner_mismatch',
       jsonb_build_object('n', count(*))
FROM public.trades t
JOIN public.accounts a ON a.id = t.account_id
WHERE a.user_id <> t.user_id

UNION ALL
-- a2. trade trỏ account không tồn tại
SELECT 'a2_trade_orphan_account', jsonb_build_object('n', count(*))
FROM public.trades t
LEFT JOIN public.accounts a ON a.id = t.account_id
WHERE a.id IS NULL

UNION ALL
-- b. object trade-screenshots có thư mục đầu khác owner_id (và khác trades.user_id tham chiếu tới nó)
SELECT 'b_screenshots_prefix_not_owner',
       jsonb_build_object(
         'n_prefix_ne_owner', count(*) FILTER (
            WHERE split_part(o.name, '/', 1) IS DISTINCT FROM
                  COALESCE(to_jsonb(o) ->> 'owner_id', to_jsonb(o) ->> 'owner')),
         'n_prefix_ne_trade_user', count(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM public.trades t
              WHERE t.screenshot_url LIKE '%/trade-screenshots/' || o.name || '%'
                AND split_part(o.name, '/', 1) <> t.user_id::text)),
         'total', count(*))
FROM storage.objects o
WHERE o.bucket_id = 'trade-screenshots'

UNION ALL
-- c. screenshot_url không khớp pattern URL public của bucket; c2. có ký tự mã hóa '%'
SELECT 'c_screenshot_url_patterns',
       jsonb_build_object(
         'with_url', count(*) FILTER (WHERE screenshot_url IS NOT NULL AND screenshot_url <> ''),
         'c_not_public_pattern', count(*) FILTER (
            WHERE screenshot_url IS NOT NULL AND screenshot_url <> ''
              AND screenshot_url !~ '/object/public/trade-screenshots/.+'),
         'c2_has_percent', count(*) FILTER (WHERE screenshot_url ~ '%'),
         'c3_prefix_ne_user', count(*) FILTER (
            WHERE screenshot_url ~ '/object/public/trade-screenshots/.+'
              AND split_part(substring(screenshot_url FROM '/object/public/trade-screenshots/(.+)$'), '/', 1)
                  <> user_id::text),
         -- c4: ký tự '#' (fragment) trong URL -> path backfill sẽ sai; >0 -> báo user trước 012
         'c4_has_hash', count(*) FILTER (WHERE screenshot_url ~ '#'),
         -- c5 (N3): path dùng chung giữa nhiều trade = count(*) - count(distinct path); >0 -> GC xóa
         -- file của trade này có thể làm vỡ ảnh trade kia. (Tính từ URL vì cột screenshot_path có
         -- thể chưa tồn tại trước 012; sau 012 tương đương count(*) - count(distinct screenshot_path).)
         'c5_shared_path', count(split_part(substring(screenshot_url FROM '/object/public/trade-screenshots/(.+)$'), '?', 1))
                           - count(DISTINCT split_part(substring(screenshot_url FROM '/object/public/trade-screenshots/(.+)$'), '?', 1)))
FROM public.trades

UNION ALL
-- c6 (PC1): object có owner NULL nhưng owner_id có giá trị -> policy gốc dùng `owner` (012.down.sql)
-- không áp được cho các object đó. Đối chiếu số này trước khi dựa vào 012.down.sql.
-- Tương đương: select count(*) from storage.objects where owner is null and owner_id is not null
-- (viết qua to_jsonb để không lỗi khi phiên bản storage thiếu một trong hai cột).
SELECT 'c6_owner_null_owner_id_set',
       jsonb_build_object('n', count(*) FILTER (
         WHERE to_jsonb(o) ->> 'owner' IS NULL AND to_jsonb(o) ->> 'owner_id' IS NOT NULL))
FROM storage.objects o

UNION ALL
-- d. bảng lõi có cột user_id nullable hoặc thiếu
SELECT 'd_user_id_not_null',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', tb.t,
         'user_id_is_nullable', c.is_nullable) ORDER BY tb.t), '[]'::jsonb)
FROM (VALUES ('accounts'), ('trades'), ('daily_reviews'), ('notifications'),
             ('user_preferences'), ('playbooks'), ('periodic_reviews')) AS tb(t)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = tb.t AND c.column_name = 'user_id'

UNION ALL
-- e. object không có owner_id hoặc không có thư mục (cả 2 bucket)
SELECT 'e_storage_no_owner_or_folder',
       COALESCE(jsonb_agg(jsonb_build_object(
         'bucket', x.bucket_id, 'total', x.total, 'owner_null', x.owner_null, 'no_folder', x.no_folder,
         'avatar_legacy_root', x.avatar_legacy_root)), '[]'::jsonb)
FROM (
  SELECT o.bucket_id,
         count(*) AS total,
         count(*) FILTER (WHERE COALESCE(to_jsonb(o) ->> 'owner_id', to_jsonb(o) ->> 'owner') IS NULL) AS owner_null,
         count(*) FILTER (WHERE position('/' IN o.name) = 0) AS no_folder,
         count(*) FILTER (WHERE o.bucket_id = 'avatars' AND position('/' IN o.name) = 0) AS avatar_legacy_root
  FROM storage.objects o
  WHERE o.bucket_id IN ('trade-screenshots', 'avatars')
  GROUP BY o.bucket_id
) x

UNION ALL
-- f. playbooks.image_url ngoài pattern URL public hoặc ngoài thư mục {user_id}/
SELECT 'f_playbook_image_url',
       jsonb_build_object(
         'with_url', count(*) FILTER (WHERE image_url IS NOT NULL AND image_url <> ''),
         'not_public_pattern', count(*) FILTER (
            WHERE image_url IS NOT NULL AND image_url <> ''
              AND image_url !~ '/object/public/trade-screenshots/.+'),
         'prefix_ne_user', count(*) FILTER (
            WHERE image_url ~ '/object/public/trade-screenshots/.+'
              AND split_part(substring(image_url FROM '/object/public/trade-screenshots/(.+)$'), '/', 1)
                  <> user_id::text),
         'has_percent', count(*) FILTER (WHERE image_url ~ '%'))
FROM public.playbooks

UNION ALL
-- g. policy schema storage (tên live; chạy lại NGAY TRƯỚC 012)
SELECT 'g_storage_policies',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', tablename, 'policy', policyname, 'cmd', cmd, 'roles', roles,
         'qual', qual, 'with_check', with_check) ORDER BY tablename, policyname), '[]'::jsonb)
FROM pg_policies
WHERE schemaname = 'storage'

UNION ALL
-- h. hàm schema public: INVOKER/DEFINER, ACL (ai có EXECUTE), thuộc extension hay không, định nghĩa
SELECT 'h_routines',
       COALESCE(jsonb_agg(jsonb_build_object(
         'signature', p.oid::regprocedure::text,
         'prosecdef', p.prosecdef,
         'proconfig', p.proconfig,
         'proacl', p.proacl::text,
         'extension_member', EXISTS (
            SELECT 1 FROM pg_depend d
            WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'),
         'definition', CASE WHEN p.prokind IN ('f', 'p') THEN pg_get_functiondef(p.oid) END
       ) ORDER BY p.proname), '[]'::jsonb)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'

UNION ALL
-- h2. hàm dùng trong column default / trigger / policy của schema public (E20)
SELECT 'h2_function_dependencies',
       jsonb_build_object(
         'column_defaults', (
           SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                    'table', c.relname, 'column', a.attname,
                    'default', pg_get_expr(ad.adbin, ad.adrelid))), '[]'::jsonb)
           FROM pg_attrdef ad
           JOIN pg_class c ON c.oid = ad.adrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
           WHERE n.nspname = 'public'),
         'triggers', (
           SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'table', c.relname, 'trigger', tg.tgname, 'function', tg.tgfoid::regprocedure::text)), '[]'::jsonb)
           FROM pg_trigger tg
           JOIN pg_class c ON c.oid = tg.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND NOT tg.tgisinternal),
         'policies_public', (
           SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'table', tablename, 'policy', policyname, 'cmd', cmd,
                    'qual', qual, 'with_check', with_check) ORDER BY tablename, policyname), '[]'::jsonb)
           FROM pg_policies WHERE schemaname = 'public'))

UNION ALL
-- i. default privileges hiện hữu
SELECT 'i_default_acl',
       COALESCE(jsonb_agg(jsonb_build_object(
         'role', pg_get_userbyid(d.defaclrole),
         'schema', COALESCE(n.nspname, '(all)'),
         'objtype', d.defaclobjtype,
         'acl', d.defaclacl::text) ORDER BY 1), '[]'::jsonb)
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace

UNION ALL
-- j. known-gap P0: constraint / index / trigger / cột (7 bảng lõi; đặc biệt accounts cho composite FK)
SELECT 'j_constraints',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', c.relname, 'name', con.conname, 'type', con.contype,
         'validated', con.convalidated, 'def', pg_get_constraintdef(con.oid)) ORDER BY c.relname, con.conname), '[]'::jsonb)
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('accounts', 'trades', 'daily_reviews', 'notifications',
                    'user_preferences', 'playbooks', 'periodic_reviews')

UNION ALL
SELECT 'j_indexes',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', tablename, 'index', indexname, 'def', indexdef) ORDER BY tablename, indexname), '[]'::jsonb)
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('accounts', 'trades', 'daily_reviews', 'notifications',
                    'user_preferences', 'playbooks', 'periodic_reviews')

UNION ALL
SELECT 'j_columns_other_tables',
       COALESCE(jsonb_agg(jsonb_build_object(
         'table', table_name, 'column', column_name, 'type', data_type,
         'nullable', is_nullable, 'default', column_default) ORDER BY table_name, ordinal_position), '[]'::jsonb)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('daily_reviews', 'notifications', 'periodic_reviews', 'playbooks');
