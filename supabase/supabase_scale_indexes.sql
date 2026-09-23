-- ====================================================================
-- TRADENOTE PRO: DATABASE INDEXES FOR 1,000+ CONCURRENT USERS (SCALE)
-- ====================================================================
-- Chạy script này trong Supabase Dashboard -> SQL Editor để tối ưu hóa
-- tốc độ truy vấn từ O(N) quét bảng xuống O(log N) tìm kiếm chỉ mục (<5ms).

-- 1. CHỈ MỤC BẢNG TRADES (Trọng yếu nhất)
-- Tối ưu hóa truy vấn tải lịch sử lệnh theo tài khoản sắp xếp theo ngày
CREATE INDEX IF NOT EXISTS idx_trades_account_date 
ON public.trades (account_id, date DESC);

-- Tối ưu hóa kiểm tra quyền Row Level Security (RLS: auth.uid() = user_id)
CREATE INDEX IF NOT EXISTS idx_trades_user_id 
ON public.trades (user_id);

-- Tối ưu hóa bộ lọc lệnh theo kết quả (Win, Loss, Break Even)
CREATE INDEX IF NOT EXISTS idx_trades_account_result 
ON public.trades (account_id, result);

-- 2. CHỈ MỤC BẢNG ACCOUNTS
-- Tối ưu hóa tải danh sách tài khoản theo người dùng
CREATE INDEX IF NOT EXISTS idx_accounts_user_created 
ON public.accounts (user_id, created_at ASC);

-- 3. CHỈ MỤC BẢNG DAILY REVIEWS
-- Tối ưu hóa tra cứu nhật ký ngày và kiểm tra trùng lặp
CREATE INDEX IF NOT EXISTS idx_daily_reviews_user_date 
ON public.daily_reviews (user_id, date DESC);

-- 4. CHỈ MỤC BẢNG PLAYBOOKS
-- Tối ưu hóa tải sổ tay chiến lược theo người dùng
CREATE INDEX IF NOT EXISTS idx_playbooks_user_created 
ON public.playbooks (user_id, created_at ASC);

-- 5. CHỈ MỤC BẢNG NOTIFICATIONS
-- Tối ưu hóa tải thông báo chưa đọc của người dùng
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
ON public.notifications (user_id, is_read, created_at DESC);

-- 6. CHỈ MỤC BẢNG PERIODIC REVIEWS
-- Tối ưu hóa tải báo cáo đánh giá tuần / tháng
CREATE INDEX IF NOT EXISTS idx_periodic_reviews_user_period 
ON public.periodic_reviews (user_id, period_type, start_date DESC);

-- Bật thống kê lại cho PostgreSQL Query Planner tối ưu đường dẫn thực thi
ANALYZE public.trades;
ANALYZE public.accounts;
ANALYZE public.daily_reviews;
ANALYZE public.playbooks;
ANALYZE public.notifications;
