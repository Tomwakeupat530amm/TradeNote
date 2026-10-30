-- ==============================================================================
-- CHI DOC. Khong chua secret. Khong in du lieu user (chi so dem).
-- ==============================================================================
-- Probe 90 - Phase 07 pre-checks cho patch 090 (DROP COLUMN public.trades.screenshot_url).
-- Chay TRUOC moi lan ap 090 (D0, X8) va sau khi ap (hau kiem: column_exists = false).
--
-- Ket qua: bang (check_name, value, expected, status PASS|FAIL|INFO).
--   column_exists            : cot con ton tai? (truoc ap: true = INFO; sau ap: false)
--   with_url / with_path / both : so hang (INFO)
--   url_without_path         : screenshot_url khong rong VA screenshot_path rong/NULL -> PHAI = 0
--   dependent_views          : view/matview dung cot (information_schema.view_column_usage) -> PHAI = 0
--   dependent_objects        : pg_depend tro toi cot (index/constraint/rule/default...) -> PHAI = 0
--   functions_text_reference : ham trong schema public co chuoi 'screenshot_url' trong dinh nghia
--                              (INFO: 052 chi co ten cot trong mang c_allowed cua hard_stop_decide va hard_stop_trades_trg, doc theo TEN tu to_jsonb -> khong phu thuoc cung;
--                              danh sach ten duoc in de nguoi duyet doi chieu)
--   migrations_050_053       : schema_migrations co du 050, 051, 052, 053 -> PHAI = 4
--   migration_090            : 090 da ghi? (INFO; truoc ap 0, sau ap 1)
-- Doc cot qua to_jsonb(t) ->> 'screenshot_url' nen probe chay duoc ca khi cot da mat.
-- ==============================================================================

WITH
col AS (
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'screenshot_url'
  ) AS present
),
rows_ AS (
  SELECT NULLIF(btrim(to_jsonb(t) ->> 'screenshot_url'), '') AS u,
         NULLIF(btrim(t.screenshot_path), '') AS p
  FROM public.trades t
),
cnt AS (
  SELECT count(*) FILTER (WHERE u IS NOT NULL)                  AS with_url,
         count(*) FILTER (WHERE p IS NOT NULL)                  AS with_path,
         count(*) FILTER (WHERE u IS NOT NULL AND p IS NOT NULL) AS both_,
         count(*) FILTER (WHERE u IS NOT NULL AND p IS NULL)     AS url_without_path
  FROM rows_
),
views_ AS (
  SELECT count(*) AS n
  FROM information_schema.view_column_usage
  WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'screenshot_url'
),
deps AS (
  SELECT count(*) AS n
  FROM pg_depend d
  JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
  WHERE d.refclassid = 'pg_class'::regclass
    AND d.refobjid = 'public.trades'::regclass
    AND a.attname = 'screenshot_url'
    AND d.deptype <> 'i'
),
fns AS (
  SELECT count(*) AS n,
         COALESCE(string_agg(p.proname, ',' ORDER BY p.proname), '') AS names
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ILIKE '%screenshot_url%'
),
mig AS (
  SELECT count(*) FILTER (WHERE version IN ('050', '051', '052', '053')) AS p5,
         count(*) FILTER (WHERE version = '090') AS v090
  FROM public.schema_migrations
)
SELECT check_name, value, expected, status FROM (
  SELECT 1 AS ord, 'column_exists' AS check_name, (SELECT present FROM col)::text AS value,
         'true truoc ap / false sau ap' AS expected, 'INFO' AS status
  UNION ALL SELECT 2, 'with_url', (SELECT with_url FROM cnt)::text, '-', 'INFO'
  UNION ALL SELECT 3, 'with_path', (SELECT with_path FROM cnt)::text, '-', 'INFO'
  UNION ALL SELECT 4, 'both', (SELECT both_ FROM cnt)::text, '-', 'INFO'
  UNION ALL SELECT 5, 'url_without_path', (SELECT url_without_path FROM cnt)::text, '0',
         CASE WHEN (SELECT url_without_path FROM cnt) = 0 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 6, 'dependent_views', (SELECT n FROM views_)::text, '0',
         CASE WHEN (SELECT n FROM views_) = 0 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 7, 'dependent_objects', (SELECT n FROM deps)::text, '0',
         CASE WHEN (SELECT n FROM deps) = 0 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 8, 'functions_text_reference', (SELECT n FROM fns)::text || ' [' || (SELECT names FROM fns) || ']',
         'chi 2 ham cua 052 (hard_stop_decide, hard_stop_trades_trg: mang c_allowed, doc theo ten, vo hai)', 'INFO'
  UNION ALL SELECT 9, 'migrations_050_053', (SELECT p5 FROM mig)::text, '4',
         CASE WHEN (SELECT p5 FROM mig) = 4 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 10, 'migration_090', (SELECT v090 FROM mig)::text, '0 truoc ap / 1 sau ap', 'INFO'
) x
ORDER BY ord;
