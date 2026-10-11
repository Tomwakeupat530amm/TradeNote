-- fixture: patch hợp lệ
CREATE TABLE IF NOT EXISTS public.fixture_a (id int);
INSERT INTO public.schema_migrations (version, name) VALUES ('000', 'init') ON CONFLICT (version) DO NOTHING;
