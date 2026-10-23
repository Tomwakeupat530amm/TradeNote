-- Down 012 - screenshot_path_expand
-- CẢNH BÁO: lùi patch này bỏ kiểm tiền tố (user đăng nhập lại upload được vào thư mục người khác).
-- Chỉ dùng khi sự cố. Phải lùi 013 TRƯỚC (thứ tự 013 -> 012 -> 011 -> 010).
-- KHÔNG xóa cột trades.screenshot_path (dữ liệu metadata giữ nguyên; xóa cột thuộc P7 nếu cần).
-- LƯU Ý owner (PC1): policy UPDATE/DELETE khôi phục dưới đây dùng cột `owner` đúng theo baseline.
-- Trước khi dựa vào down, đối chiếu probe 10 mục c3_owner_null (owner IS NULL AND owner_id IS NOT NULL);
-- nếu > 0 thì các object đó sẽ không sửa/xóa được qua policy gốc.
-- Sau khi chạy: delete from public.schema_migrations where version = '012';  (chạy tay)

BEGIN;

-- trade-screenshots: bỏ 4 policy tiền tố, tạo lại 4 policy gốc (baseline 11-10-26 mục 03)
DROP POLICY IF EXISTS trade_screenshots_owner_select ON storage.objects;
DROP POLICY IF EXISTS trade_screenshots_owner_insert ON storage.objects;
DROP POLICY IF EXISTS trade_screenshots_owner_update ON storage.objects;
DROP POLICY IF EXISTS trade_screenshots_owner_delete ON storage.objects;

DROP POLICY IF EXISTS "Anyone can view screenshots" ON storage.objects;
CREATE POLICY "Anyone can view screenshots" ON storage.objects
  FOR SELECT USING (bucket_id = 'trade-screenshots');

DROP POLICY IF EXISTS "Authenticated users can upload screenshots" ON storage.objects;
CREATE POLICY "Authenticated users can upload screenshots" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'trade-screenshots' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update their own screenshots" ON storage.objects;
CREATE POLICY "Users can update their own screenshots" ON storage.objects
  FOR UPDATE USING (bucket_id = 'trade-screenshots' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete their own screenshots" ON storage.objects;
CREATE POLICY "Users can delete their own screenshots" ON storage.objects
  FOR DELETE USING (bucket_id = 'trade-screenshots' AND auth.uid() = owner);

-- avatars: khôi phục UPDATE/DELETE gốc (SELECT/INSERT avatars không bị 012 đổi)
DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;

DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
CREATE POLICY "Users can update their own avatars" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
CREATE POLICY "Users can delete their own avatars" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND auth.uid() = owner);

COMMIT;
