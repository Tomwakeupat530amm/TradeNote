-- Patch 090 - drop_trades_screenshot_url (Phase 07, Step E2, D0/D0b; ban phat hanh P7b).
--
-- DESTRUCTIVE-OK: xoa cot cu public.trades.screenshot_url; client P7a da ngung doc/ghi cot nay (E1), anh doc qua screenshot_path (P1, patch 012); du lieu URL CHI khoi phuc tu backup ngoai repo
--
-- DIEU KIEN AP (D0, xem harness/p7/prod-commands.txt):
--   1. Client P7a (khong doc/ghi screenshot_url) da trien khai VA cua so rollout du dai (tab/bundle cu
--      con ghi `screenshot_url: null` se loi 42703 sau khi cot mat).
--   2. Backup ngoai repo (toi thieu id + screenshot_url, kem sha256).
--   3. probes/90_p7_pre_checks.sql: url_without_path = 0, khong doi tuong phu thuoc cot, 050-053 da ap.
-- Patch tu kiem dieu kien du lieu: con hang co screenshot_url khong rong ma screenshot_path rong/NULL
-- -> RAISE EXCEPTION, KHONG xoa cot (giao dich cua nguoi goi phai ROLLBACK).
-- Xu ly khi HINT P7_090_URL_WITHOUT_PATH: client P7a go anh chi dat screenshot_path = NULL (giu URL cu),
-- nen hang "url khong path" tao sau P7a thuong la anh da bi CHU Y go. Doi chieu tung hang voi sao luu GD0;
-- neu anh da go -> UPDATE dat screenshot_url = NULL truoc GD2. KHONG gan lai path (file da bi xoa khoi Storage).
--
-- Quy tac patch P5: KHONG BEGIN/COMMIT trong file; nguoi ap (scripts/p7_prod_apply.mjs) boc giao dich
-- voi lock_timeout/statement_timeout. Idempotent: chay lai khi cot da mat -> bo qua kiem, DROP IF EXISTS
-- no-op, INSERT schema_migrations ON CONFLICT DO NOTHING.
-- Trigger 052 doc cot theo TEN tu to_jsonb(NEW/OLD) (c_allowed con 'screenshot_url' = muc thua vo hai),
-- khong phu thuoc cung vao cot -> khong can sua 050-053.
-- Lui: 090_drop_trades_screenshot_url.down.sql (them lai cot RONG; du lieu chi tu backup).

DO $p090$
DECLARE
  v_has_col boolean;
  v_bad bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'screenshot_url'
  ) INTO v_has_col;

  IF NOT v_has_col THEN
    RAISE NOTICE '090: cot public.trades.screenshot_url khong ton tai -> bo qua kiem (idempotent)';
    RETURN;
  END IF;

  EXECUTE $q$
    SELECT count(*) FROM public.trades
    WHERE screenshot_url IS NOT NULL AND btrim(screenshot_url) <> ''
      AND (screenshot_path IS NULL OR btrim(screenshot_path) = '')
  $q$ INTO v_bad;

  IF v_bad > 0 THEN
    RAISE EXCEPTION '090 DUNG: % hang co screenshot_url nhung khong co screenshot_path (url_without_path > 0). Chay probe 90, doi chieu tung hang voi sao luu GD0; anh da bi chu y go (P7a) -> dat screenshot_url = NULL truoc GD2 (KHONG gan lai path: file da xoa).', v_bad
      USING ERRCODE = 'P0001', HINT = 'P7_090_URL_WITHOUT_PATH';
  END IF;
END
$p090$;

ALTER TABLE public.trades DROP COLUMN IF EXISTS screenshot_url;

INSERT INTO public.schema_migrations (version, name)
VALUES ('090', 'drop_screenshot_url')
ON CONFLICT DO NOTHING;
