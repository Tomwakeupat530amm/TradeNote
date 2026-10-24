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
    screenshot_url TEXT,
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
