-- Down 000 - gỡ bảng schema_migrations.
-- Chỉ dùng khi lùi TOÀN BỘ hệ thống patch (mọi patch > 000 phải được lùi trước).
DROP TABLE IF EXISTS public.schema_migrations;
