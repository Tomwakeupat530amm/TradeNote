-- Patch 000 - schema_migrations (Phase 00)
-- Bảng ghi lại patch nào đã áp lên DB. Idempotent: chạy lại nhiều lần không lỗi.
-- Áp tay trong Supabase Dashboard -> SQL Editor (xem supabase/README.md). Áp trên TEST trước.

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version    text PRIMARY KEY,
    name       text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now(),
    checksum   text
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- Snapshot có ALTER DEFAULT PRIVILEGES cấp quyền cho anon/authenticated trên MỌI bảng mới,
-- nên phải thu hồi tường minh: chỉ chủ DB / service_role được đọc ghi bảng này.
REVOKE ALL ON public.schema_migrations FROM anon, authenticated;

INSERT INTO public.schema_migrations (version, name)
VALUES ('000', 'schema_migrations')
ON CONFLICT (version) DO NOTHING;
