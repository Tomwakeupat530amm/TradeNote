-- ==============================================================================
-- CHỈ ĐỌC. Không chạy trên production nếu chưa có backup.
-- ==============================================================================
-- Probe 01 - Mẫu đếm dữ liệu "bẩn" trước khi áp patch (tạo ở P0, dùng lại ở P1/P3)
--
-- Mục đích: trước mỗi patch siết ràng buộc (vd composite FK ở P1, chuẩn hóa risk ở P3),
-- chạy probe này để biết có bao nhiêu dòng sẽ vi phạm. Patch chỉ VALIDATE/siết khi
-- số đếm tương ứng = 0, hoặc khi user đã quyết định cách xử lý bằng văn bản.
--
-- Cách chạy: SQL Editor -> dán toàn bộ -> Run. Một bảng (check, count) duy nhất.
-- Phase sau có thể sao chép file này thành probe riêng (vd 11_*.sql) và thêm dòng
-- UNION ALL mới; KHÔNG sửa ý nghĩa các dòng có sẵn.
-- Các cột có thể chưa tồn tại được đọc qua to_jsonb(...) để câu lệnh không lỗi.
-- ==============================================================================

-- (a) trade thuộc account của user khác (tiền đề VALIDATE composite FK ở P1)
SELECT 'a_trade_account_owner_mismatch' AS check_name, count(*) AS n
FROM public.trades t
JOIN public.accounts a ON a.id = t.account_id
WHERE a.user_id <> t.user_id

UNION ALL
-- (b) trade trỏ tới account không tồn tại
SELECT 'b_trade_orphan_account', count(*)
FROM public.trades t
LEFT JOIN public.accounts a ON a.id = t.account_id
WHERE a.id IS NULL

UNION ALL
-- (c) trade có risk_amount = 500 (giá trị mặc định do legacy patch_enhancements điền)
SELECT 'c_trade_risk_amount_eq_500', count(*)
FROM public.trades t
WHERE (to_jsonb(t) ->> 'risk_amount')::numeric = 500

UNION ALL
-- (d) trade có risk_amount null hoặc <= 0
SELECT 'd_trade_risk_amount_null_or_nonpositive', count(*)
FROM public.trades t
WHERE (to_jsonb(t) ->> 'risk_amount') IS NULL
   OR (to_jsonb(t) ->> 'risk_amount')::numeric <= 0

UNION ALL
-- (e) trade có r_multiple null
SELECT 'e_trade_r_multiple_null', count(*)
FROM public.trades t
WHERE (to_jsonb(t) ->> 'r_multiple') IS NULL

UNION ALL
-- (f) user có nhiều hơn 1 dòng user_preferences (vi phạm giả định UNIQUE)
SELECT 'f_user_preferences_duplicate_users', count(*)
FROM (
  SELECT user_id FROM public.user_preferences GROUP BY user_id HAVING count(*) > 1
) d

UNION ALL
-- (g) ảnh trade-screenshots có thư mục đầu khác owner
SELECT 'g_screenshots_prefix_not_owner', count(*)
FROM storage.objects o
WHERE o.bucket_id = 'trade-screenshots'
  AND split_part(o.name, '/', 1) IS DISTINCT FROM
      COALESCE(to_jsonb(o) ->> 'owner_id', to_jsonb(o) ->> 'owner')

UNION ALL
-- (h) trade có screenshot_url nhưng không trỏ vào bucket trade-screenshots
SELECT 'h_trade_screenshot_url_foreign_host', count(*)
FROM public.trades t
WHERE t.screenshot_url IS NOT NULL
  AND t.screenshot_url <> ''
  AND t.screenshot_url NOT LIKE '%/storage/v1/object/public/trade-screenshots/%';
