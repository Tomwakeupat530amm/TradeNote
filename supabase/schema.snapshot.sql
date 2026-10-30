-- ==============================================================================
-- FRESH INSTALL SNAPSHOT: chỉ dùng để cài mới project trống. KHÔNG dùng để nâng cấp DB đang chạy.
-- Nâng cấp DB hiện có: áp các patch đánh số trong supabase/patches/ (xem supabase/README.md).
-- ==============================================================================
-- CREATE TABLES

-- Bảng Accounts (Quản lý tài khoản quỹ)
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    initial_balance NUMERIC NOT NULL,
    rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT accounts_id_user_id_key UNIQUE (id, user_id) -- P1 (patch 010): đích composite FK
);

-- Bảng Trades (Lịch sử giao dịch)
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    asset TEXT NOT NULL,
    lot_size NUMERIC NOT NULL,
    pnl NUMERIC NOT NULL,
    result TEXT NOT NULL,
    setup TEXT NOT NULL,
    confluences JSONB NOT NULL DEFAULT '[]'::jsonb,
    emotion TEXT NOT NULL,
    mistake TEXT NOT NULL,
    notes TEXT,
    -- P7 (patch 090): cột screenshot_url đã DROP (áp PROD 30-10-26)
    screenshot_path TEXT, -- P1 (patch 012): đường dẫn trong bucket private, nguồn đọc ưu tiên
    date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- P3 (patch 030): cột rủi ro nullable, KHÔNG default 500; không có created_at (khớp PROD)
    risk_amount NUMERIC,
    r_multiple NUMERIC,
    session TEXT,
    checklist_results JSONB DEFAULT '{}'::jsonb,
    risk_is_estimated BOOLEAN, -- NULL = chưa phân loại; true = 500 cũ (031); false = rủi ro thật
    -- P1 (patch 010): trade chỉ được trỏ vào account của CHÍNH user đó
    CONSTRAINT trades_account_user_fk FOREIGN KEY (account_id, user_id)
        REFERENCES public.accounts (id, user_id) ON DELETE CASCADE
);

-- Bảng Daily Reviews (Nhật ký hàng ngày)
CREATE TABLE IF NOT EXISTS public.daily_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    pre_market_bias TEXT,
    economic_news TEXT,
    end_of_day_review TEXT,
    mistakes_made TEXT,
    lessons_learned TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, date) -- Mỗi người dùng chỉ có 1 bài đánh giá mỗi ngày
);

-- ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reviews ENABLE ROW LEVEL SECURITY;

-- CREATE POLICIES (Chỉ cho phép người dùng xem/sửa dữ liệu của chính họ)
DROP POLICY IF EXISTS "Users can view their own accounts" ON public.accounts;
CREATE POLICY "Users can view their own accounts" ON public.accounts FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own accounts" ON public.accounts;
CREATE POLICY "Users can insert their own accounts" ON public.accounts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own accounts" ON public.accounts;
CREATE POLICY "Users can update their own accounts" ON public.accounts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own accounts" ON public.accounts;
CREATE POLICY "Users can delete their own accounts" ON public.accounts FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own trades" ON public.trades;
CREATE POLICY "Users can view their own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own trades" ON public.trades;
CREATE POLICY "Users can insert their own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own trades" ON public.trades;
CREATE POLICY "Users can update their own trades" ON public.trades FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own trades" ON public.trades;
CREATE POLICY "Users can delete their own trades" ON public.trades FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own daily reviews" ON public.daily_reviews;
CREATE POLICY "Users can view their own daily reviews" ON public.daily_reviews FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own daily reviews" ON public.daily_reviews;
CREATE POLICY "Users can insert their own daily reviews" ON public.daily_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own daily reviews" ON public.daily_reviews;
CREATE POLICY "Users can update their own daily reviews" ON public.daily_reviews FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own daily reviews" ON public.daily_reviews;
CREATE POLICY "Users can delete their own daily reviews" ON public.daily_reviews FOR DELETE USING (auth.uid() = user_id);

-- SETUP STORAGE CHO SCREENSHOTS VÀ AVATARS
-- P1: trade-screenshots PRIVATE (patch 013; client đọc bằng signed URL), avatars public để đọc.
INSERT INTO storage.buckets (id, name, public) VALUES 
('trade-screenshots', 'trade-screenshots', false),
('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies: Screenshots (P1 patch 012/013) - chỉ thư mục đầu = auth.uid()
DROP POLICY IF EXISTS "Anyone can view screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own screenshots" ON storage.objects;

DROP POLICY IF EXISTS trade_screenshots_owner_select ON storage.objects;
CREATE POLICY trade_screenshots_owner_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS trade_screenshots_owner_insert ON storage.objects;
CREATE POLICY trade_screenshots_owner_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS trade_screenshots_owner_update ON storage.objects;
CREATE POLICY trade_screenshots_owner_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS trade_screenshots_owner_delete ON storage.objects;
CREATE POLICY trade_screenshots_owner_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage Policies: Avatars (đọc public; ghi theo thư mục của chính user; file cũ `${uid}-*.ext` sửa/xóa được)
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
CREATE POLICY avatars_owner_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR name LIKE auth.uid()::text || '-%'))
  WITH CHECK (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR name LIKE auth.uid()::text || '-%'));

DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR name LIKE auth.uid()::text || '-%'));

-- Bảng Notifications (Thông báo cho người dùng)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- e.g., 'warning', 'info', 'error'
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own notifications" ON public.notifications;
CREATE POLICY "Users can insert their own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- Bảng User Preferences (Tùy chỉnh của người dùng: Tags, Giao diện...)
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    base_currency TEXT NOT NULL DEFAULT 'USD',
    psychology_tags JSONB NOT NULL DEFAULT '["Calm", "FOMO", "Revenge", "Greedy", "Fearful"]'::jsonb,
    mistake_tags JSONB NOT NULL DEFAULT '["None", "Moved SL", "Early Entry", "Late Entry", "Overleveraged", "Forced Trade"]'::jsonb,
    confluence_tags JSONB NOT NULL DEFAULT '["Trendline", "Support/Resistance", "Fibonacci", "Moving Average", "RSI Divergence", "Order Block"]'::jsonb,
    privacy_mode BOOLEAN NOT NULL DEFAULT false,
    theme TEXT NOT NULL DEFAULT 'dark',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_preferences;
CREATE POLICY "Users can view their own preferences" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.user_preferences;
CREATE POLICY "Users can insert their own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
CREATE POLICY "Users can update their own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own preferences" ON public.user_preferences;
CREATE POLICY "Users can delete their own preferences" ON public.user_preferences FOR DELETE USING (auth.uid() = user_id);

-- Bảng Playbooks (Sổ tay chiến lược)
CREATE TABLE IF NOT EXISTS public.playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own playbooks" ON public.playbooks;
CREATE POLICY "Users can view their own playbooks" ON public.playbooks FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own playbooks" ON public.playbooks;
CREATE POLICY "Users can insert their own playbooks" ON public.playbooks FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own playbooks" ON public.playbooks;
CREATE POLICY "Users can update their own playbooks" ON public.playbooks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own playbooks" ON public.playbooks;
CREATE POLICY "Users can delete their own playbooks" ON public.playbooks FOR DELETE USING (auth.uid() = user_id);

-- Bảng Periodic Reviews (Nhật ký hàng tuần/hàng tháng)
CREATE TABLE IF NOT EXISTS public.periodic_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    performance_review TEXT,
    emotional_state TEXT,
    went_well TEXT,
    needs_improvement TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, period_type, start_date)
);

ALTER TABLE public.periodic_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own periodic reviews" ON public.periodic_reviews;
CREATE POLICY "Users can view their own periodic reviews" ON public.periodic_reviews FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own periodic reviews" ON public.periodic_reviews;
CREATE POLICY "Users can insert their own periodic reviews" ON public.periodic_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own periodic reviews" ON public.periodic_reviews;
CREATE POLICY "Users can update their own periodic reviews" ON public.periodic_reviews FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own periodic reviews" ON public.periodic_reviews;
CREATE POLICY "Users can delete their own periodic reviews" ON public.periodic_reviews FOR DELETE USING (auth.uid() = user_id);

-- ====================================================================
-- EXPLICIT TABLE GRANTS (Required by Supabase PostgREST Data API from Oct 30)
-- P1 (patch 011): least privilege - role anon KHÔNG có quyền nào trên bảng/sequence/hàm schema public.
-- ====================================================================
-- 0. Thu hồi mặc định nền tảng (Supabase cấp sẵn toàn quyền cho anon)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

-- 1. Cấp quyền cho các bảng cốt lõi hiện có (authenticated: đúng CRUD, RLS quyết định dòng)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Cấp quyền sử dụng cho chuỗi sequence (nếu có trường auto-increment)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- 2. Tự động cấp quyền cho mọi bảng & sequence tạo mới trong tương lai
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
-- EXECUTE cho PUBLIC là default toàn cục (IN SCHEMA là no-op) -> revoke toàn cục cho role postgres.
-- Patch tạo hàm mới vẫn phải tự REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

-- Ghi chú: hàm public.get_account_stats (nếu cài, xem patches/001 + 011) chỉ GRANT EXECUTE cho authenticated.

-- ====================================================================
-- AI COACH QUOTA (patch 020, Phase 02) - bảng thứ 8 + RPC nguyên tử.
-- Đặt SAU khối GRANT ở trên để REVOKE tường minh có hiệu lực trên bản cài mới.
-- Chỉ hàm SECURITY DEFINER consume_ai_quota đọc/ghi bảng; EXECUTE chỉ cho authenticated.
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.ai_coach_usage (
    user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    window_start timestamptz NOT NULL,
    count        integer     NOT NULL DEFAULT 0 CHECK (count >= 0),
    PRIMARY KEY (user_id, window_start)
);

ALTER TABLE public.ai_coach_usage ENABLE ROW LEVEL SECURITY;

-- Default privileges cấp CRUD cho authenticated (và có thể anon qua supabase_admin, known-gap)
-- trên mọi bảng mới -> thu hồi tường minh. Không tạo policy nào: truy cập trực tiếp bị chặn.
REVOKE ALL ON public.ai_coach_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_limit integer, p_window_seconds integer)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_uid          uuid := auth.uid();
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'consume_ai_quota: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'consume_ai_quota: p_limit out of range' USING ERRCODE = '22023';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'consume_ai_quota: p_window_seconds out of range' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  -- DESTRUCTIVE-OK: bounded cleanup of the caller's own expired quota rows inside consume_ai_quota
  DELETE FROM public.ai_coach_usage
  WHERE user_id = v_uid
    AND window_start < now() - interval '1 day';

  -- Một câu nguyên tử: dòng mới -> count = 1; dòng có sẵn -> +1 chỉ khi còn dưới hạn mức.
  INSERT INTO public.ai_coach_usage AS u (user_id, window_start, count)
  VALUES (v_uid, v_window_start, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET count = u.count + 1
  WHERE u.count < p_limit
  RETURNING u.count INTO v_count;

  IF v_count IS NOT NULL THEN
    allowed := true;
    retry_after := 0;
  ELSE
    allowed := false;
    retry_after := greatest(
      1,
      ceil(extract(epoch FROM (v_window_start + make_interval(secs => p_window_seconds) - now())))::integer
    );
  END IF;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(integer, integer) TO authenticated;

-- ====================================================================
-- HARD STOP SERVER (patches 050-053, Phase 05).
-- Đặt SAU khối GRANT ở trên để REVOKE ALL ON FUNCTION tường minh có hiệu lực trên bản cài mới.
-- Mọi hàm: SET search_path = '' + REVOKE ALL FROM PUBLIC, anon, authenticated (không gọi được qua /rpc).
-- Công tắc khẩn: ALTER TABLE public.trades DISABLE TRIGGER trg_hard_stop; (tương tự
-- trg_hard_stop_config_accounts / trg_hard_stop_config_prefs). Xem supabase/README.md.
-- ====================================================================
-- ---- patch 050: public.trading_day (ngày giao dịch, khớp tradingDayKey client) ----
CREATE OR REPLACE FUNCTION public.trading_day(
  p_ts timestamptz,
  p_tz text,
  p_reset_time time DEFAULT '00:00',
  p_reset_tz text DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
STABLE
PARALLEL UNSAFE
SET search_path = ''
AS $fn$
DECLARE
  v_candidates text[] := ARRAY[
    CASE WHEN p_reset_tz IS NULL OR btrim(p_reset_tz) = '' THEN NULL ELSE p_reset_tz END,
    CASE WHEN p_tz IS NULL OR btrim(p_tz) = '' THEN NULL ELSE p_tz END
  ];
  v_zone  text;
  v_local timestamp := NULL;
  v_reset time := coalesce(p_reset_time, time '00:00');
BEGIN
  IF p_ts IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_zone IN ARRAY v_candidates LOOP
    IF v_zone IS NOT NULL THEN
      BEGIN
        v_local := p_ts AT TIME ZONE v_zone;
      EXCEPTION WHEN invalid_parameter_value THEN
        v_local := NULL;
      END;
      EXIT WHEN v_local IS NOT NULL;
    END IF;
  END LOOP;

  IF v_local IS NULL THEN
    v_local := p_ts AT TIME ZONE 'UTC';
  END IF;

  IF v_local::time < v_reset THEN
    RETURN v_local::date - 1;
  END IF;
  RETURN v_local::date;
END;
$fn$;

REVOKE ALL ON FUNCTION public.trading_day(timestamptz, text, time, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.trading_day(timestamptz, text, time, text) IS
  'P5: ngày giao dịch (ngày bắt đầu phiên) theo zone hợp lệ đầu tiên resetTz -> tz -> UTC và giờ reset; khớp tradingDayKey (client).';

-- ---- patch 051: user_preferences luôn có dòng (backfill + trigger AFTER INSERT ON auth.users) ----
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

-- ---- patch 052: Hard Stop server (hard_stop_decide / hard_stop_evaluate / trg_hard_stop) ----
CREATE OR REPLACE FUNCTION public.hard_stop_decide(
  p_account jsonb,
  p_trades jsonb,
  p_tz text,
  p_op text,
  p_old jsonb,
  p_new jsonb,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
PARALLEL UNSAFE
SET search_path = ''
AS $fn$
DECLARE
  c_allowed   CONSTANT text[] := ARRAY['notes', 'setup', 'confluences', 'emotion', 'mistake', 'checklist_results', 'screenshot_url', 'screenshot_path', 'risk_is_estimated'];
  v_rules     jsonb;
  v_acc_id    text := p_account->>'id';
  v_enforced  boolean;
  v_max       numeric;
  v_ib        numeric;
  v_limit_x100 numeric;
  v_limit     numeric;
  v_threshold numeric := 80;
  v_reset     time := time '00:00';
  v_reset_raw text;
  v_reset_tz  text;
  v_now       timestamptz := coalesce(p_now, now());
  v_day       date;
  v_trade     jsonb;
  v_ts        timestamptz;
  v_pnl       numeric;
  v_net       numeric := 0;
  v_loss      numeric;
  v_status    text;
  v_op        text := upper(coalesce(p_op, ''));
  v_old_key   date;
  v_new_key   date;
  v_allowed   boolean := true;
BEGIN
  v_rules := CASE WHEN jsonb_typeof(p_account->'rules') = 'object' THEN p_account->'rules' ELSE '{}'::jsonb END;
  v_enforced := coalesce(v_rules->'enableHardStop' = 'true'::jsonb, false);

  IF coalesce(CASE WHEN jsonb_typeof(v_rules->'maxDailyLoss') = 'number' THEN (v_rules->>'maxDailyLoss')::numeric > 0 END, false) THEN
    v_max := (v_rules->>'maxDailyLoss')::numeric;
  END IF;
  IF jsonb_typeof(p_account->'initial_balance') = 'number' THEN
    v_ib := (p_account->>'initial_balance')::numeric;
  END IF;
  IF v_max IS NOT NULL THEN
    IF v_rules->>'maxDailyLossType' = '%' THEN
      IF v_ib IS NOT NULL THEN
        v_limit_x100 := v_ib * v_max;
      END IF;
    ELSE
      v_limit_x100 := v_max * 100;
    END IF;
  END IF;
  -- limit không dương (vd. '%' với initial_balance <= 0) = chưa cấu hình = status 'off' (khớp client).
  IF v_limit_x100 IS NOT NULL AND v_limit_x100 <= 0 THEN
    v_limit_x100 := NULL;
  END IF;
  IF v_limit_x100 IS NOT NULL THEN
    v_limit := trim_scale(v_limit_x100 / 100);
  END IF;

  IF coalesce(CASE WHEN jsonb_typeof(v_rules->'dailyLossAlertThreshold') = 'number'
                   THEN (v_rules->>'dailyLossAlertThreshold')::numeric > 0 END, false) THEN
    v_threshold := (v_rules->>'dailyLossAlertThreshold')::numeric;
  END IF;

  IF jsonb_typeof(v_rules->'resetTime') = 'string' THEN
    v_reset_raw := btrim(v_rules->>'resetTime');
    IF v_reset_raw ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      v_reset := v_reset_raw::time;
    END IF;
  END IF;
  IF jsonb_typeof(v_rules->'resetTz') = 'string' AND btrim(v_rules->>'resetTz') <> '' THEN
    v_reset_tz := v_rules->>'resetTz';
  END IF;

  v_day := public.trading_day(v_now, p_tz, v_reset, v_reset_tz);

  FOR v_trade IN
    SELECT e.value
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_trades) = 'array' THEN p_trades ELSE '[]'::jsonb END) AS e(value)
  LOOP
    CONTINUE WHEN v_trade->>'account_id' IS DISTINCT FROM v_acc_id;
    BEGIN
      v_ts := (v_trade->>'date')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_ts := NULL;
    END;
    CONTINUE WHEN v_ts IS NULL;
    v_pnl := 0;
    IF jsonb_typeof(v_trade->'pnl') = 'number' THEN
      v_pnl := (v_trade->>'pnl')::numeric;
    ELSIF jsonb_typeof(v_trade->'pnl') = 'string' THEN
      BEGIN
        v_pnl := (v_trade->>'pnl')::numeric;
      EXCEPTION WHEN OTHERS THEN
        v_pnl := 0;
      END;
    END IF;
    IF public.trading_day(v_ts, p_tz, v_reset, v_reset_tz) = v_day THEN
      v_net := v_net + coalesce(v_pnl, 0);
    END IF;
  END LOOP;

  v_loss := greatest(0, -v_net);

  IF NOT v_enforced OR v_limit_x100 IS NULL THEN
    v_status := 'off';
  ELSIF v_loss * 100 >= v_limit_x100 THEN
    v_status := 'locked';
  ELSIF v_loss * 100 * 100 >= v_threshold * v_limit_x100 THEN
    v_status := 'warn';
  ELSE
    v_status := 'ok';
  END IF;

  IF v_status = 'locked' AND v_op IN ('INSERT', 'UPDATE', 'DELETE') THEN
    IF p_old IS NOT NULL AND p_old ? 'date' THEN
      BEGIN
        v_old_key := public.trading_day((p_old->>'date')::timestamptz, p_tz, v_reset, v_reset_tz);
      EXCEPTION WHEN OTHERS THEN
        v_old_key := NULL;
      END;
    END IF;
    IF p_new IS NOT NULL AND p_new ? 'date' THEN
      BEGIN
        v_new_key := public.trading_day((p_new->>'date')::timestamptz, p_tz, v_reset, v_reset_tz);
      EXCEPTION WHEN OTHERS THEN
        v_new_key := NULL;
      END;
    END IF;

    IF v_op = 'INSERT' THEN
      -- ngày thiếu/không đọc được = ngày hiện tại (DB default now())
      v_allowed := coalesce(v_new_key, v_day) <> v_day;
    ELSIF v_op = 'DELETE' THEN
      v_allowed := v_old_key IS DISTINCT FROM v_day;
    ELSE
      v_new_key := coalesce(v_new_key, v_old_key);
      IF v_old_key = v_day OR v_new_key = v_day THEN
        v_allowed := (coalesce(p_new, '{}'::jsonb) - c_allowed) IS NOT DISTINCT FROM (coalesce(p_old, '{}'::jsonb) - c_allowed);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'code', CASE WHEN v_allowed THEN NULL ELSE 'HARD_STOP' END,
    'status', v_status,
    'dayKey', to_char(v_day, 'YYYY-MM-DD'),
    'lossToday', v_loss,
    'limit', v_limit
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hard_stop_evaluate(
  p_user uuid,
  p_account uuid,
  p_op text,
  p_old jsonb,
  p_new jsonb,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_acc       record;
  v_acc_json  jsonb;
  v_tz        text;
  v_pre       jsonb;
  v_rules     jsonb;
  v_reset     time := time '00:00';
  v_reset_raw text;
  v_reset_tz  text;
  v_day       date;
  v_now       timestamptz := coalesce(p_now, now());
  v_op        text := upper(coalesce(p_op, 'STATUS'));
  v_old_key   date;
  v_new_key   date;
  v_trades    jsonb;
BEGIN
  IF p_user IS NULL OR p_account IS NULL THEN
    RETURN NULL;
  END IF;

  -- Chỉ account của CHÍNH p_user (p_user luôn = auth.uid() từ trigger); không thấy -> NULL, không RAISE.
  SELECT a.id, a.initial_balance, a.rules INTO v_acc
  FROM public.accounts a
  WHERE a.id = p_account AND a.user_id = p_user;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT p.timezone INTO v_tz FROM public.user_preferences p WHERE p.user_id = p_user;

  v_acc_json := jsonb_build_object('id', v_acc.id::text, 'initial_balance', v_acc.initial_balance, 'rules', v_acc.rules);

  -- (4) cấu hình: Hard Stop tắt hoặc không có limit -> 'off', thoát TRƯỚC khi lấy lock / tính tổng.
  v_pre := public.hard_stop_decide(v_acc_json, '[]'::jsonb, v_tz, NULL, NULL, NULL, v_now);
  IF v_pre->>'status' = 'off' THEN
    RETURN v_pre;
  END IF;
  v_day := (v_pre->>'dayKey')::date;

  v_rules := CASE WHEN jsonb_typeof(v_acc.rules) = 'object' THEN v_acc.rules ELSE '{}'::jsonb END;
  IF jsonb_typeof(v_rules->'resetTime') = 'string' THEN
    v_reset_raw := btrim(v_rules->>'resetTime');
    IF v_reset_raw ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      v_reset := v_reset_raw::time;
    END IF;
  END IF;
  IF jsonb_typeof(v_rules->'resetTz') = 'string' AND btrim(v_rules->>'resetTz') <> '' THEN
    v_reset_tz := v_rules->>'resetTz';
  END IF;

  IF v_op IN ('INSERT', 'UPDATE', 'DELETE') THEN
    -- (5) dòng không chạm ngày giao dịch hiện tại -> cho qua, không lock.
    IF p_old IS NOT NULL AND p_old ? 'date' THEN
      BEGIN
        v_old_key := public.trading_day((p_old->>'date')::timestamptz, v_tz, v_reset, v_reset_tz);
      EXCEPTION WHEN OTHERS THEN
        v_old_key := NULL;
      END;
    END IF;
    IF p_new IS NOT NULL AND p_new ? 'date' THEN
      BEGIN
        v_new_key := public.trading_day((p_new->>'date')::timestamptz, v_tz, v_reset, v_reset_tz);
      EXCEPTION WHEN OTHERS THEN
        v_new_key := NULL;
      END;
    END IF;
    IF v_op = 'INSERT' THEN
      v_new_key := coalesce(v_new_key, v_day);
    END IF;
    IF v_old_key IS DISTINCT FROM v_day AND v_new_key IS DISTINCT FROM v_day THEN
      RETURN v_pre;
    END IF;
    -- (6) tuần tự hóa ghi đồng thời trên cùng account (chỉ khi thật sự cần).
    PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text, 0));
  END IF;

  -- (7) tổng có giới hạn: dùng chỉ mục (account_id, date), vẫn khớp chính xác trading_day (ngày 23/25 giờ).
  SELECT coalesce(jsonb_agg(jsonb_build_object('account_id', t.account_id::text, 'pnl', t.pnl, 'date', t.date)), '[]'::jsonb)
  INTO v_trades
  FROM public.trades t
  WHERE t.account_id = p_account
    AND t.user_id = p_user
    AND t.date >= v_now - interval '2 days'
    AND t.date < v_now + interval '2 days'
    AND public.trading_day(t.date, v_tz, v_reset, v_reset_tz) = v_day;

  RETURN public.hard_stop_decide(
    v_acc_json, v_trades, v_tz,
    CASE WHEN v_op IN ('INSERT', 'UPDATE', 'DELETE') THEN v_op ELSE NULL END,
    p_old, p_new, v_now
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hard_stop_trades_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  c_allowed CONSTANT text[] := ARRAY['notes', 'setup', 'confluences', 'emotion', 'mistake', 'checklist_results', 'screenshot_url', 'screenshot_path', 'risk_is_estimated'];
  v_uid      uuid := auth.uid();
  v_old      jsonb;
  v_new      jsonb;
  v_accounts uuid[];
  v_acc      uuid;
  v_res      jsonb;
  v_hint     text;
BEGIN
  -- (1) D5: kết nối quản trị (SQL Editor, service_role, migration, backfill) không có sub -> bỏ qua.
  IF v_uid IS NULL THEN
    RAISE NOTICE 'hard_stop: admin bypass (auth.uid() IS NULL) on % %', TG_OP, TG_TABLE_NAME;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    -- (2) cascade xóa account/user (RI trigger ở độ sâu 1) hoặc account cha không còn.
    IF pg_trigger_depth() > 1 THEN
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;
    -- (S13) hàng không thuộc phiên hiện tại: để RLS/FK từ chối, không đánh giá (không oracle chéo user).
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.user_id IS DISTINCT FROM v_uid THEN
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.user_id IS DISTINCT FROM v_uid THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = OLD.account_id) THEN
      RETURN OLD;
    END IF;

    -- (3) UPDATE chỉ đổi cột cho phép (notes/tag/ảnh/cờ) -> luôn được.
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - c_allowed) IS NOT DISTINCT FROM (to_jsonb(OLD) - c_allowed) THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
      v_new := to_jsonb(NEW);
      v_accounts := ARRAY[NEW.account_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_old := to_jsonb(OLD);
      v_accounts := ARRAY[OLD.account_id];
    ELSE
      v_old := to_jsonb(OLD);
      v_new := to_jsonb(NEW);
      -- đổi account_id: đánh giá (và lock) cả hai account theo id tăng dần, tránh deadlock.
      SELECT array_agg(x ORDER BY x) INTO v_accounts
      FROM (SELECT DISTINCT unnest(ARRAY[OLD.account_id, NEW.account_id]) AS x) s;
    END IF;

    FOREACH v_acc IN ARRAY v_accounts LOOP
      -- p_user = auth.uid() (KHÔNG lấy từ NEW/OLD.user_id); DETAIL chỉ chứa số của CHÍNH user.
      v_res := public.hard_stop_evaluate(v_uid, v_acc, TG_OP, v_old, v_new, now());
      IF v_res IS NOT NULL AND (v_res->>'allowed') = 'false' THEN
        RAISE EXCEPTION 'HARD_STOP'
          USING ERRCODE = 'P0001',
                HINT = 'HARD_STOP',
                DETAIL = jsonb_build_object(
                  'dayKey', v_res->'dayKey',
                  'lossToday', v_res->'lossToday',
                  'limit', v_res->'limit')::text;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLSTATE = 'P0001' AND v_hint = 'HARD_STOP' THEN
      RAISE;
    END IF;
    -- deadlock_detected (40P01) KHÔNG fail-open: re-raise để giao dịch bị hủy và client thử lại.
    IF SQLSTATE = '40P01' THEN
      RAISE;
    END IF;
    -- fail-open có cảnh báo: lỗi nội bộ không được chặn ghi.
    RAISE WARNING 'hard_stop: internal error, write allowed (%): %', SQLSTATE, SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.hard_stop_decide(jsonb, jsonb, text, text, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hard_stop_evaluate(uuid, uuid, text, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hard_stop_trades_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hard_stop ON public.trades;
CREATE TRIGGER trg_hard_stop
  BEFORE INSERT OR UPDATE OR DELETE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.hard_stop_trades_trg();

-- ---- patch 053: khóa nới lỏng cấu hình khi đang khóa (D6) ----
CREATE OR REPLACE FUNCTION public.hard_stop_config_decide(
  p_old_account jsonb,
  p_new_account jsonb,
  p_locked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
PARALLEL UNSAFE
SET search_path = ''
AS $fn$
DECLARE
  v_old_eval jsonb;
  v_new_eval jsonb;
  v_old_l    numeric;
  v_new_l    numeric;
  v_old_rules jsonb;
  v_new_rules jsonb;
  v_reset_changed boolean;
BEGIN
  IF NOT coalesce(p_locked, false) THEN
    RETURN jsonb_build_object('allowed', true, 'code', NULL);
  END IF;

  -- effectiveLimit = limit của hard_stop_decide khi status <> 'off' (một nguồn quy tắc cấu hình).
  v_old_eval := public.hard_stop_decide(p_old_account, '[]'::jsonb, 'UTC', NULL, NULL, NULL, now());
  v_new_eval := public.hard_stop_decide(p_new_account, '[]'::jsonb, 'UTC', NULL, NULL, NULL, now());
  IF v_old_eval->>'status' <> 'off' THEN
    v_old_l := (v_old_eval->>'limit')::numeric;
  END IF;
  IF v_new_eval->>'status' <> 'off' THEN
    v_new_l := (v_new_eval->>'limit')::numeric;
  END IF;

  v_old_rules := CASE WHEN jsonb_typeof(p_old_account->'rules') = 'object' THEN p_old_account->'rules' ELSE '{}'::jsonb END;
  v_new_rules := CASE WHEN jsonb_typeof(p_new_account->'rules') = 'object' THEN p_new_account->'rules' ELSE '{}'::jsonb END;
  -- normOpt: vắng / JSON null -> NULL; chuỗi -> trim; rỗng -> NULL.
  v_reset_changed :=
    nullif(btrim(CASE jsonb_typeof(v_old_rules->'resetTime') WHEN 'string' THEN v_old_rules->>'resetTime' WHEN 'null' THEN NULL ELSE (v_old_rules->'resetTime')::text END), '')
      IS DISTINCT FROM
    nullif(btrim(CASE jsonb_typeof(v_new_rules->'resetTime') WHEN 'string' THEN v_new_rules->>'resetTime' WHEN 'null' THEN NULL ELSE (v_new_rules->'resetTime')::text END), '')
    OR
    nullif(btrim(CASE jsonb_typeof(v_old_rules->'resetTz') WHEN 'string' THEN v_old_rules->>'resetTz' WHEN 'null' THEN NULL ELSE (v_old_rules->'resetTz')::text END), '')
      IS DISTINCT FROM
    nullif(btrim(CASE jsonb_typeof(v_new_rules->'resetTz') WHEN 'string' THEN v_new_rules->>'resetTz' WHEN 'null' THEN NULL ELSE (v_new_rules->'resetTz')::text END), '');

  IF (v_old_l IS NOT NULL AND v_new_l IS NULL)
     OR (v_old_l IS NOT NULL AND v_new_l IS NOT NULL AND v_new_l > v_old_l)
     OR v_reset_changed THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'HARD_STOP_CONFIG_LOCKED');
  END IF;
  RETURN jsonb_build_object('allowed', true, 'code', NULL);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hard_stop_prefs_config_decide(
  p_old_tz text,
  p_new_tz text,
  p_any_locked_with_limit boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
  IF nullif(btrim(p_new_tz), '') IS DISTINCT FROM nullif(btrim(p_old_tz), '')
     AND coalesce(p_any_locked_with_limit, false) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'HARD_STOP_CONFIG_LOCKED');
  END IF;
  RETURN jsonb_build_object('allowed', true, 'code', NULL);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hard_stop_config_accounts_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_status jsonb;
  v_dec    jsonb;
  v_hint   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE NOTICE 'hard_stop_config: admin bypass (auth.uid() IS NULL) on accounts';
    RETURN NEW;
  END IF;

  BEGIN
    -- (S13) hàng của user khác: để RLS từ chối, không đánh giá.
    IF OLD.user_id IS DISTINCT FROM v_uid OR NEW.user_id IS DISTINCT FROM v_uid THEN
      RETURN NEW;
    END IF;
    -- Early exit: chỉ rules / initial_balance mới được xét (name, type... luôn qua).
    IF NEW.rules IS NOT DISTINCT FROM OLD.rules AND NEW.initial_balance IS NOT DISTINCT FROM OLD.initial_balance THEN
      RETURN NEW;
    END IF;

    -- BEFORE UPDATE: bảng còn cấu hình CŨ -> STATUS đánh giá bằng rules/initial_balance/timezone CŨ.
    v_status := public.hard_stop_evaluate(v_uid, OLD.id, 'STATUS', NULL, NULL, now());
    IF v_status IS NULL OR v_status->>'status' IS DISTINCT FROM 'locked' THEN
      RETURN NEW;
    END IF;

    v_dec := public.hard_stop_config_decide(
      jsonb_build_object('id', OLD.id::text, 'initial_balance', OLD.initial_balance, 'rules', OLD.rules),
      jsonb_build_object('id', NEW.id::text, 'initial_balance', NEW.initial_balance, 'rules', NEW.rules),
      true
    );
    IF (v_dec->>'allowed') = 'false' THEN
      RAISE EXCEPTION 'HARD_STOP_CONFIG_LOCKED'
        USING ERRCODE = 'P0001',
              HINT = 'HARD_STOP_CONFIG_LOCKED',
              DETAIL = jsonb_build_object(
                'dayKey', v_status->'dayKey',
                'lossToday', v_status->'lossToday',
                'limit', v_status->'limit')::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLSTATE = 'P0001' AND v_hint = 'HARD_STOP_CONFIG_LOCKED' THEN
      RAISE;
    END IF;
    RAISE WARNING 'hard_stop_config: internal error, update allowed (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hard_stop_config_prefs_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_acc    uuid;
  v_status jsonb;
  v_locked jsonb;
  v_dec    jsonb;
  v_hint   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE NOTICE 'hard_stop_config: admin bypass (auth.uid() IS NULL) on user_preferences';
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  -- cascade (xóa user/account): không chặn.
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    IF TG_OP = 'DELETE' THEN
      IF OLD.user_id IS DISTINCT FROM v_uid THEN
        RETURN OLD;
      END IF;
    ELSE
      IF OLD.user_id IS DISTINCT FROM v_uid OR NEW.user_id IS DISTINCT FROM v_uid THEN
        RETURN NEW;
      END IF;
      -- Chỉ timezone (đã chuẩn hóa) được xét; cột khác luôn qua.
      IF nullif(btrim(NEW.timezone), '') IS NOT DISTINCT FROM nullif(btrim(OLD.timezone), '') THEN
        RETURN NEW;
      END IF;
    END IF;

    -- BEFORE UPDATE/DELETE: user_preferences còn timezone CŨ -> STATUS đánh giá theo timezone CŨ.
    FOR v_acc IN SELECT a.id FROM public.accounts a WHERE a.user_id = v_uid ORDER BY a.id LOOP
      v_status := public.hard_stop_evaluate(v_uid, v_acc, 'STATUS', NULL, NULL, now());
      -- status 'locked' chỉ có khi effectiveLimit khác NULL.
      IF v_status IS NOT NULL AND v_status->>'status' = 'locked' THEN
        v_locked := v_status;
        EXIT;
      END IF;
    END LOOP;

    IF TG_OP = 'DELETE' THEN
      -- DELETE dòng prefs = nới lỏng (lần INSERT sau sẽ mang timezone mới).
      v_dec := jsonb_build_object('allowed', v_locked IS NULL, 'code',
                 CASE WHEN v_locked IS NULL THEN NULL ELSE 'HARD_STOP_CONFIG_LOCKED' END);
    ELSE
      v_dec := public.hard_stop_prefs_config_decide(OLD.timezone, NEW.timezone, v_locked IS NOT NULL);
    END IF;
    IF (v_dec->>'allowed') = 'false' THEN
      RAISE EXCEPTION 'HARD_STOP_CONFIG_LOCKED'
        USING ERRCODE = 'P0001',
              HINT = 'HARD_STOP_CONFIG_LOCKED',
              DETAIL = jsonb_build_object(
                'dayKey', v_locked->'dayKey',
                'lossToday', v_locked->'lossToday',
                'limit', v_locked->'limit')::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLSTATE = 'P0001' AND v_hint = 'HARD_STOP_CONFIG_LOCKED' THEN
      RAISE;
    END IF;
    RAISE WARNING 'hard_stop_config: internal error, change allowed (%): %', SQLSTATE, SQLERRM;
  END;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.hard_stop_config_decide(jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hard_stop_prefs_config_decide(text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hard_stop_config_accounts_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hard_stop_config_prefs_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hard_stop_config_accounts ON public.accounts;
CREATE TRIGGER trg_hard_stop_config_accounts
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.hard_stop_config_accounts_trg();

DROP TRIGGER IF EXISTS trg_hard_stop_config_prefs ON public.user_preferences;
CREATE TRIGGER trg_hard_stop_config_prefs
  BEFORE UPDATE OR DELETE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.hard_stop_config_prefs_trg();
