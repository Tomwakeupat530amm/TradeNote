-- Down 090 - drop_trades_screenshot_url
--
-- DESTRUCTIVE-OK: go dong ghi nhan 090 trong schema_migrations
--
-- Them lai cot public.trades.screenshot_url dang text NULLABLE va RONG (moi hang = NULL).
-- GIOI HAN: KHONG khoi phuc du lieu URL. Du lieu cu CHI lay lai tu backup ngoai repo (tao o buoc
-- backup cua scripts/p7_prod_apply.mjs, kiem sha256). URL suy ra tu screenshot_path (public URL cua
-- bucket) co the KHONG dung hoan toan voi gia tri cu (bucket da private tu 013, URL cu co the khac
-- host/query) -> khong tu suy ra trong file nay.
-- Khong BEGIN/COMMIT (nguoi goi boc giao dich). Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS screenshot_url text;

DELETE FROM public.schema_migrations WHERE version = '090';
