-- Patch 012 - screenshot_path_expand (Phase 01, B4) - bước "MỞ RỘNG"
-- Mục đích:
--   (1) Thêm cột trades.screenshot_path (nguồn đọc ưu tiên; screenshot_url giữ tới P7-cleanup).
--   (2) Backfill screenshot_path từ screenshot_url (CHỈ ghi metadata, KHÔNG di chuyển file).
--       Lấy phần sau '/object/public/trade-screenshots/' và bỏ query string. SQL không giải mã URL:
--       tên do client sinh chỉ gồm [0-9A-Za-z-/._]; assert bên dưới DỪNG nếu path nào chứa '%'
--       (probe 10 mục c2 phải = 0 trước khi chạy). playbooks.image_url KHÔNG thêm cột (client suy path).
--   (3) Policy storage bucket 'trade-screenshots' theo tiền tố thư mục = auth.uid():
--       SELECT (trade_screenshots_owner_select) / INSERT / UPDATE (có WITH CHECK) / DELETE.
--       Bucket VẪN public = true ở bước này nên URL public cũ còn đọc được (ảnh không mất).
--       SELECT owner cần cho createSignedUrls và upload upsert giữa 012 và 013.
--   (4) Bucket 'avatars': CHỈ siết UPDATE/DELETE theo tiền tố (thư mục mới `${uid}/...` HOẶC file cũ
--       dạng gốc `${uid}-*.ext`). Giữ SELECT public và GIỮ NGUYÊN INSERT avatars hiện hành
--       (siết INSERT nằm ở 013, sau khi client D8 đã lên PROD). Avatars hiện 0 object (baseline);
--       nhánh `name LIKE uid || '-%'` chỉ để phòng thủ.
--
-- Policy Postgres là PERMISSIVE cộng dồn (OR): policy cũ chỉ kiểm role sẽ vô hiệu hóa policy tiền tố,
-- nên patch DROP MỌI tên policy cũ của 2 bucket (tên repo = tên live theo baseline 11-10-26 mục 03).
-- TRƯỚC KHI CHẠY: chạy lại probe 10 mục g_storage_policies; nếu có tên policy LẠ (ngoài 8 tên dưới)
-- -> DỪNG, báo user (E2/E3). Khối kiểm cuối patch cũng RAISE EXCEPTION nếu còn policy lạ trên 2 bucket.
--
-- THỨ TỰ: 012 PHẢI áp trên PROD TRƯỚC khi deploy client mới (E17b). Idempotent.
-- Đường lui: 012_screenshot_path_expand.down.sql (không xóa cột screenshot_path).

BEGIN;

-- (1) Cột mới
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS screenshot_path text;

-- (2) Backfill metadata (chỉ dòng chưa có path)
UPDATE public.trades
SET screenshot_path = split_part(
      substring(screenshot_url FROM '/object/public/trade-screenshots/(.+)$'),
      '?', 1)
WHERE screenshot_path IS NULL
  AND screenshot_url IS NOT NULL
  AND screenshot_url ~ '/object/public/trade-screenshots/.+';

DO $$
DECLARE
  v_pct bigint;
  v_url bigint;
BEGIN
  SELECT count(*) INTO v_pct FROM public.trades WHERE screenshot_path ~ '%';
  IF v_pct > 0 THEN
    RAISE EXCEPTION '012 DỪNG: % dòng screenshot_path chứa ký tự mã hóa %%. Không tự giải mã - báo user.', v_pct;
  END IF;

  -- Client mới ghi screenshot_url = NULL, screenshot_path = <path>, nên so count(url) với count(path)
  -- là sai khi chạy lại. Kiểm đúng: dòng có URL khác rỗng mà path null/rỗng phải = 0.
  SELECT count(*) INTO v_url FROM public.trades
  WHERE screenshot_url IS NOT NULL AND screenshot_url <> ''
    AND (screenshot_path IS NULL OR screenshot_path = '');
  IF v_url > 0 THEN
    RAISE EXCEPTION '012 DỪNG: % dòng có screenshot_url nhưng thiếu screenshot_path. Có URL ngoài bucket (probe 10 mục c). Báo user.', v_url;
  END IF;
END $$;

-- (3) trade-screenshots: bỏ MỌI policy cũ, tạo policy tiền tố (tên mới, khác tên cũ)
DROP POLICY IF EXISTS "Anyone can view screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own screenshots" ON storage.objects;

DROP POLICY IF EXISTS trade_screenshots_owner_select ON storage.objects;
CREATE POLICY trade_screenshots_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS trade_screenshots_owner_insert ON storage.objects;
CREATE POLICY trade_screenshots_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS trade_screenshots_owner_update ON storage.objects;
CREATE POLICY trade_screenshots_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS trade_screenshots_owner_delete ON storage.objects;
CREATE POLICY trade_screenshots_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'trade-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

-- (4) avatars: chỉ UPDATE/DELETE. SELECT "Anyone can view avatars" và INSERT
--     "Authenticated users can upload avatars" GIỮ NGUYÊN (không DROP -> không có khoảng trống policy).
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;

DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR name LIKE auth.uid()::text || '-%'))
  WITH CHECK (bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR name LIKE auth.uid()::text || '-%'));

DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR name LIKE auth.uid()::text || '-%'));

-- (5) Khẳng định: trên storage.objects chỉ còn đúng các policy mong đợi (không policy lạ cộng dồn)
DO $$
DECLARE
  v_extra text;
BEGIN
  SELECT string_agg(policyname, ', ') INTO v_extra
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname NOT IN (
      'trade_screenshots_owner_select', 'trade_screenshots_owner_insert',
      'trade_screenshots_owner_update', 'trade_screenshots_owner_delete',
      'avatars_owner_update', 'avatars_owner_delete',
      'Anyone can view avatars', 'Authenticated users can upload avatars',
      -- avatars_owner_insert do 013 tạo: cho phép để chạy lại 012 sau 013 không bị dừng oan.
      'avatars_owner_insert');
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION '012 DỪNG: storage.objects còn policy lạ: %. Đối chiếu probe 10 g_storage_policies, báo user.', v_extra;
  END IF;
END $$;

INSERT INTO public.schema_migrations (version, name)
VALUES ('012', 'screenshot_path_expand')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Kiểm sau khi chạy (legacy-image-migration-count cho trades):
SELECT count(*) FILTER (WHERE screenshot_url IS NOT NULL AND screenshot_url <> '') AS with_url,
       count(*) FILTER (WHERE screenshot_path IS NOT NULL AND screenshot_path <> '') AS with_path
FROM public.trades;
