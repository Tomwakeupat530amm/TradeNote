-- ==============================================================================
-- CHỈ ĐỌC. Không chứa secret. Không in email / dữ liệu user (chỉ số đếm).
-- ==============================================================================
-- Probe 50 - Phase 05 pre-checks (C9, D-3, D-7; GĐ0 và GĐ6 của scripts/p5_prod_apply.mjs)
--
-- Kết quả: MỘT ô `p5` (jsonb) gồm:
--   schema_migrations          : các version đã áp (mong đợi trước P5: 000, 001, 010-013, 020, 030, 031)
--   name_collisions            : hàm/trigger trùng tên P5 đã tồn tại (trước GĐ1 mong đợi rỗng;
--                                sau GĐ6 mong đợi đủ 3 trigger, tgenabled = 'O')
--   privileges                 : quyền của current_user cho GĐ3 (trigger trên auth.users) và smoke
--                                (SET ROLE authenticated, INSERT/DELETE auth.users); thiếu -> CONTEXT_PARTIAL
--   auth_users_owner           : owner của auth.users (tạo trigger cần là owner hoặc có TRIGGER)
--   users_total / users_without_preferences : 0 thiếu -> backfill 051 là no-op (P5-AC4)
--   hard_stop_non_numeric_limit: số account bật Hard Stop (enableHardStop = true) mà maxDailyLoss KHÔNG phải
--                                jsonb number > 0 (D-3: server coi là 'off'; CHỈ ghi evidence + README,
--                                KHÔNG tự sửa dữ liệu user)
--   hard_stop_percent_nonpositive_balance: số account bật Hard Stop với maxDailyLossType '%' mà
--                                initial_balance <= 0 (limit tính ra <= 0 -> server coi là 'off', M2;
--                                CHỈ ghi evidence + README, KHÔNG tự sửa dữ liệu user)
--   trades_account_date_index  : chỉ mục trên public.trades có cột đầu account_id, cột hai date (kiểm theo
--                                ĐỊNH NGHĨA, không theo tên; không cần DESC). Rỗng -> tạo ở bước riêng
--                                NGOÀI transaction: CREATE INDEX CONCURRENTLY IF NOT EXISTS ... (D-7).
-- ==============================================================================

WITH
mig AS (
  SELECT COALESCE(jsonb_agg(version ORDER BY version), '[]'::jsonb) AS j
  FROM public.schema_migrations
),
fn_collisions AS (
  SELECT COALESCE(jsonb_agg(p.oid::regprocedure::text ORDER BY 1), '[]'::jsonb) AS j
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('trading_day', 'user_preferences_ensure_row', 'hard_stop_decide', 'hard_stop_evaluate',
                      'hard_stop_trades_trg', 'hard_stop_config_decide', 'hard_stop_prefs_config_decide',
                      'hard_stop_config_accounts_trg', 'hard_stop_config_prefs_trg')
),
trg_collisions AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'trigger', t.tgname,
           'table', c.relnamespace::regnamespace::text || '.' || c.relname,
           'tgenabled', t.tgenabled) ORDER BY t.tgname), '[]'::jsonb) AS j
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal
    AND t.tgname IN ('trg_hard_stop', 'trg_hard_stop_config_accounts', 'trg_hard_stop_config_prefs',
                     'trg_user_preferences_ensure_row')
),
privs AS (
  SELECT jsonb_build_object(
    'current_user', current_user,
    'member_authenticated', pg_has_role(current_user, 'authenticated', 'MEMBER'),
    'usage_authenticated', pg_has_role(current_user, 'authenticated', 'USAGE'),
    'member_supabase_auth_admin', CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin')
                                       THEN pg_has_role(current_user, 'supabase_auth_admin', 'MEMBER') END,
    'auth_users_insert', has_table_privilege(current_user, 'auth.users', 'INSERT'),
    'auth_users_delete', has_table_privilege(current_user, 'auth.users', 'DELETE'),
    'auth_users_trigger', has_table_privilege(current_user, 'auth.users', 'TRIGGER')
  ) AS j
),
owner AS (
  SELECT pg_get_userbyid(c.relowner) AS j
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'auth' AND c.relname = 'users'
),
users AS (
  SELECT
    (SELECT count(*) FROM auth.users) AS total,
    (SELECT count(*) FROM auth.users u
      WHERE NOT EXISTS (SELECT 1 FROM public.user_preferences p WHERE p.user_id = u.id)) AS without_prefs
),
nonnum AS (
  SELECT count(*) AS n
  FROM public.accounts a
  WHERE a.rules->'enableHardStop' = 'true'::jsonb
    AND NOT coalesce(CASE WHEN jsonb_typeof(a.rules->'maxDailyLoss') = 'number'
                      THEN (a.rules->>'maxDailyLoss')::numeric > 0 END, false)
),
pct_nonpos AS (
  SELECT count(*) AS n
  FROM public.accounts a
  WHERE a.rules->'enableHardStop' = 'true'::jsonb
    AND a.rules->>'maxDailyLossType' = '%'
    AND a.initial_balance <= 0
),
idx AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('index', ic.relname, 'definition', pg_get_indexdef(i.indexrelid))
                            ORDER BY ic.relname), '[]'::jsonb) AS j
  FROM pg_index i
  JOIN pg_class ic ON ic.oid = i.indexrelid
  WHERE i.indrelid = 'public.trades'::regclass
    AND i.indnatts >= 2
    AND (SELECT attname FROM pg_attribute WHERE attrelid = i.indrelid AND attnum = i.indkey[0]) = 'account_id'
    AND (SELECT attname FROM pg_attribute WHERE attrelid = i.indrelid AND attnum = i.indkey[1]) = 'date'
)
SELECT jsonb_build_object(
  'probe', '50_p5_pre_checks',
  'schema_migrations', (SELECT j FROM mig),
  'name_collisions', jsonb_build_object('functions', (SELECT j FROM fn_collisions), 'triggers', (SELECT j FROM trg_collisions)),
  'privileges', (SELECT j FROM privs),
  'auth_users_owner', (SELECT j FROM owner),
  'users_total', (SELECT total FROM users),
  'users_without_preferences', (SELECT without_prefs FROM users),
  'hard_stop_non_numeric_limit', (SELECT n FROM nonnum),
  'hard_stop_percent_nonpositive_balance', (SELECT n FROM pct_nonpos),
  'trades_account_date_index', (SELECT j FROM idx)
) AS p5;
