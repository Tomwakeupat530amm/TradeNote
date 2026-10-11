-- fixture: patch THIẾU .down.sql -> phải exit != 0
CREATE TABLE IF NOT EXISTS public.fixture_b (id int);
INSERT INTO public.schema_migrations (version, name) VALUES ('000', 'no_down') ON CONFLICT (version) DO NOTHING;
