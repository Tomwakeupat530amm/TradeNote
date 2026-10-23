-- Patch 013 - bucket_private_contract (Phase 01, B5) - bước "THU HẸP"
--
-- ================================ ĐIỀU KIỆN CHẠY (USER GATE 4) ================================
-- CHỈ chạy trên PROD khi TẤT CẢ điều sau đã đúng:
--   1. 010, 011, 012 đã áp trên PROD (select * from public.schema_migrations order by version;).
--   2. Client mới ĐÃ deploy lên PROD: đọc ảnh bằng signed URL (screenshot_path + fallback), playbook
--      ảnh bằng signed URL (D6), avatar upload vào `${user.id}/...` (D8).
--   3. legacy-image-migration-count khớp 100% cho trades VÀ playbooks (probe 10 mục c/f + kiểm của 012).
--   4. User đã xác nhận ảnh Journal/Drawer/Playbook tải qua signed URL thật (fallback URL public tắt,
--      hoặc network tab thấy request `/object/sign/`), không chỉ "ảnh hiện".
-- Nếu một điều chưa đúng -> KHÔNG chạy. Sau 013, link ảnh public cũ chết (chủ đích); tab trình duyệt
-- cũ chưa tải lại sẽ hỏng ảnh -> thông báo user "tải lại trang".
-- ===============================================================================================
--
-- Mục đích:
--   (1) Bucket 'trade-screenshots' -> private (public = false).
--   (2) Khẳng định: không còn policy SELECT nào cho trade-screenshots ngoài trade_screenshots_owner_select
--       (tạo ở 012; 013 KHÔNG tạo thêm SELECT). upload upsert:true vẫn chạy nhờ SELECT/UPDATE owner của 012.
--   (3) Siết INSERT avatars: chỉ vào thư mục của chính user `(storage.foldername(name))[1] = auth.uid()`.
--       Avatar cũ dạng `${id}-*.ext` vẫn đọc public, sửa/xóa qua policy 012.
-- Idempotent. Đường lui: 013_bucket_private_contract.down.sql.

BEGIN;

-- (0) Tiền điều kiện kiểm được bằng SQL: 012 đã áp và SELECT owner tồn tại
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '012') THEN
    RAISE EXCEPTION '013 DỪNG: chưa áp 012 (schema_migrations không có version 012).';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'trade_screenshots_owner_select'
  ) THEN
    RAISE EXCEPTION '013 DỪNG: thiếu policy trade_screenshots_owner_select (012).';
  END IF;
END $$;

-- (1) Bucket private
UPDATE storage.buckets SET public = false WHERE id = 'trade-screenshots';

-- (2) Không còn SELECT rộng nào trên trade-screenshots
DROP POLICY IF EXISTS "Anyone can view screenshots" ON storage.objects;

DO $$
DECLARE
  v_extra text;
BEGIN
  SELECT string_agg(policyname, ', ') INTO v_extra
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND cmd IN ('SELECT', 'ALL')
    AND policyname <> 'trade_screenshots_owner_select'
    AND (qual IS NULL OR qual LIKE '%trade-screenshots%' OR qual NOT LIKE '%bucket_id%');
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION '013 DỪNG: còn policy SELECT có thể đọc trade-screenshots: %', v_extra;
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'trade-screenshots' AND public) THEN
    RAISE EXCEPTION '013 DỪNG: bucket trade-screenshots vẫn public.';
  END IF;
END $$;

-- (3) INSERT avatars theo thư mục của chính user
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
CREATE POLICY avatars_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

INSERT INTO public.schema_migrations (version, name)
VALUES ('013', 'bucket_private_contract')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Kiểm sau khi chạy:
SELECT id, public FROM storage.buckets ORDER BY id;
