-- fixture: patch phá hủy CÓ đánh dấu DESTRUCTIVE-OK -> phải exit 0
-- DESTRUCTIVE-OK: fixture kiểm cơ chế miễn trừ
DROP TABLE IF EXISTS public.fixture_old;
INSERT INTO public.schema_migrations (version, name) VALUES ('000', 'drop_old') ON CONFLICT (version) DO NOTHING;
