-- fixture: patch hợp lệ thứ hai
ALTER TABLE public.fixture_a ADD COLUMN IF NOT EXISTS note text;
INSERT INTO public.schema_migrations (version, name) VALUES ('001', 'add_note') ON CONFLICT (version) DO NOTHING;
