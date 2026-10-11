-- Down 001 - capture_baseline_drift: BASELINE KHÔNG LÙI.
-- Patch 001 chỉ đưa định nghĩa SẴN CÓ trên PROD của public.get_account_stats vào repo; nó không tạo
-- đối tượng mới, không đổi quyền, không đổi hành vi. Vì vậy không có gì để lùi.
-- KHÔNG DROP FUNCTION public.get_account_stats ở đây: hàm đã tồn tại trước 001 và app (fetchAccountStats)
-- vẫn gọi tới khi P3 gỡ lời gọi RPC.
-- Để gỡ dấu vết patch (chạy tay nếu thật sự cần, xem supabase/README.md):
--   delete from public.schema_migrations where version = '001';
SELECT 1; -- no-op có chủ đích
