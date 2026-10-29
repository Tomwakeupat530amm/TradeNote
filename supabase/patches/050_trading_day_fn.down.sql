-- Down 050 - trading_day_fn
-- Gỡ SAU 053 -> 052 -> 051 (052/053 gọi trading_day; plpgsql không tạo phụ thuộc nên DROP sai thứ tự
-- không báo lỗi nhưng làm trigger hỏng). Không chứa lệnh giao dịch.

DROP FUNCTION IF EXISTS public.trading_day(timestamptz, text, time, text);

DELETE FROM public.schema_migrations WHERE version = '050';
