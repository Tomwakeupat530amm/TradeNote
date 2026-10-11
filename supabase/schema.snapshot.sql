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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
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
    date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
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
CREATE POLICY "Users can update their own accounts" ON public.accounts FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own accounts" ON public.accounts;
CREATE POLICY "Users can delete their own accounts" ON public.accounts FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own trades" ON public.trades;
CREATE POLICY "Users can view their own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own trades" ON public.trades;
CREATE POLICY "Users can insert their own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own trades" ON public.trades;
CREATE POLICY "Users can update their own trades" ON public.trades FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own trades" ON public.trades;
CREATE POLICY "Users can delete their own trades" ON public.trades FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own daily reviews" ON public.daily_reviews;
CREATE POLICY "Users can view their own daily reviews" ON public.daily_reviews FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own daily reviews" ON public.daily_reviews;
CREATE POLICY "Users can insert their own daily reviews" ON public.daily_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own daily reviews" ON public.daily_reviews;
CREATE POLICY "Users can update their own daily reviews" ON public.daily_reviews FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own daily reviews" ON public.daily_reviews;
CREATE POLICY "Users can delete their own daily reviews" ON public.daily_reviews FOR DELETE USING (auth.uid() = user_id);

-- SETUP STORAGE CHO SCREENSHOTS VÀ AVATARS
INSERT INTO storage.buckets (id, name, public) VALUES 
('trade-screenshots', 'trade-screenshots', true),
('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies: Screenshots
DROP POLICY IF EXISTS "Anyone can view screenshots" ON storage.objects;
CREATE POLICY "Anyone can view screenshots" ON storage.objects FOR SELECT USING (bucket_id = 'trade-screenshots');

DROP POLICY IF EXISTS "Authenticated users can upload screenshots" ON storage.objects;
CREATE POLICY "Authenticated users can upload screenshots" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'trade-screenshots' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update their own screenshots" ON storage.objects;
CREATE POLICY "Users can update their own screenshots" ON storage.objects FOR UPDATE USING (bucket_id = 'trade-screenshots' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete their own screenshots" ON storage.objects;
CREATE POLICY "Users can delete their own screenshots" ON storage.objects FOR DELETE USING (bucket_id = 'trade-screenshots' AND auth.uid() = owner);

-- Storage Policies: Avatars
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
CREATE POLICY "Users can update their own avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
CREATE POLICY "Users can delete their own avatars" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid() = owner);

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
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

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
CREATE POLICY "Users can update their own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);

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
CREATE POLICY "Users can update their own playbooks" ON public.playbooks FOR UPDATE USING (auth.uid() = user_id);

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
CREATE POLICY "Users can update their own periodic reviews" ON public.periodic_reviews FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own periodic reviews" ON public.periodic_reviews;
CREATE POLICY "Users can delete their own periodic reviews" ON public.periodic_reviews FOR DELETE USING (auth.uid() = user_id);

-- ====================================================================
-- EXPLICIT TABLE GRANTS (Required by Supabase PostgREST Data API from Oct 30)
-- ====================================================================
-- 1. Cấp quyền cho các bảng cốt lõi hiện có
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- Cấp quyền sử dụng cho chuỗi sequence (nếu có trường auto-increment)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 2. Tự động cấp quyền cho mọi bảng & sequence tạo mới trong tương lai
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

