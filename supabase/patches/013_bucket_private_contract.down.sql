-- Down 013 - bucket_private_contract
-- CẢNH BÁO: lùi patch này đặt lại bucket trade-screenshots PUBLIC -> mọi người có link public đọc
-- được ảnh (URL /object/public/ không qua RLS). Chỉ dùng khi sự cố (vd client signed URL hỏng).
-- KHÔNG tạo lại policy "Anyone can view screenshots" (012 đã DROP; trạng thái sau 012 không có nó).
-- Khôi phục INSERT avatars về trạng thái sau 012 ("Authenticated users can upload avatars").
-- Sau khi chạy: delete from public.schema_migrations where version = '013';  (chạy tay)

BEGIN;

UPDATE storage.buckets SET public = true WHERE id = 'trade-screenshots';

DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

COMMIT;
