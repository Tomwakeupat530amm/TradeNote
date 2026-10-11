-- fixture: DROP TABLE KHÔNG kèm dòng miễn trừ -> phải exit != 0
DROP TABLE IF EXISTS public.fixture_c;
INSERT INTO public.schema_migrations (version, name) VALUES ('000', 'drop_c') ON CONFLICT (version) DO NOTHING;
