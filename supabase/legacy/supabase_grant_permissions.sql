-- LEGACY: thay bởi supabase/patches/*, chỉ để tham chiếu
-- ==============================================================================
-- TRADENOTE PRO: SUPABASE EXPLICIT TABLE GRANTS (OCTOBER 30 COMPLIANCE PATCH)
-- ==============================================================================
-- Hướng dẫn:
-- 1. Đăng nhập Supabase Dashboard -> chọn Project TradeNote của bạn.
-- 2. Vào menu SQL Editor (biểu tượng icon máy tính/terminal ở thanh bên trái).
-- 3. Tạo một New Query, dán toàn bộ nội dung file này vào và bấm RUN (hoặc Ctrl + Enter).
-- 4. Script này an toàn 100% (idempotent), không làm gián đoạn hay sửa đổi dữ liệu hiện tại.
-- ==============================================================================

-- 1. CẤP QUYỀN TƯỜNG MINH CHO TẤT CẢ CÁC BẢNG HIỆN CÓ CỦA TRADENOTE
-- ------------------------------------------------------------------------------
-- Role 'anon' (Khách / Chưa đăng nhập): Chỉ cấp quyền đọc SELECT (phục vụ public card / read-only)
GRANT SELECT ON public.accounts TO anon;
GRANT SELECT ON public.trades TO anon;
GRANT SELECT ON public.daily_reviews TO anon;
GRANT SELECT ON public.notifications TO anon;
GRANT SELECT ON public.user_preferences TO anon;
GRANT SELECT ON public.playbooks TO anon;
GRANT SELECT ON public.periodic_reviews TO anon;

-- Role 'authenticated' (Người dùng đã đăng nhập): Cấp đầy đủ quyền CRUD (chịu sự kiểm soát của RLS Policies)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playbooks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.periodic_reviews TO authenticated;

-- Role 'service_role' (Backend / Admin): Toàn quyền quản trị
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reviews TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playbooks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.periodic_reviews TO service_role;

-- 2. CẤP QUYỀN SỬ DỤNG CHO CÁC CHUỖI TỰ TĂNG (SEQUENCES NẾU CÓ)
-- ------------------------------------------------------------------------------
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 3. TỰ ĐỘNG GÁN QUYỀN CHO BẤT KỲ BẢNG NÀO TẠO MỚI TRONG TƯƠNG LAI (FUTURE-PROOF)
-- ------------------------------------------------------------------------------
-- Sau câu lệnh này, bất cứ khi nào bạn tạo bảng mới sau ngày 30/10, PostgreSQL sẽ tự động
-- cấp quyền cho anon, authenticated, service_role mà bạn không cần phải gõ GRANT thủ công!
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

-- Thông báo hoàn thành
DO $$
BEGIN
    RAISE NOTICE '>>> Supabase Explicit Grants Hardening applied successfully for TradeNote! <<<';
END $$;
