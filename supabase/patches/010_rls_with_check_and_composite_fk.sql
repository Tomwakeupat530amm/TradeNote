-- Patch 010 - rls_with_check_and_composite_fk (Phase 01, B1)
-- Mục đích:
--   (1) Viết lại MỌI policy UPDATE của 7 bảng lõi với WITH CHECK (auth.uid() = user_id) tường minh
--       (phòng thủ chiều sâu: khi thiếu WITH CHECK, Postgres dùng lại USING để kiểm dòng mới).
--   (2) UNIQUE (id, user_id) trên accounts + composite FK trades(account_id, user_id) -> accounts(id, user_id)
--       để một trade KHÔNG thể trỏ vào account của user khác.
-- Composite FK thêm NOT VALID: kiểm mọi INSERT và mọi UPDATE đổi account_id/user_id từ nay; dữ liệu cũ
-- chưa bị kiểm cho tới khi VALIDATE. UPDATE các cột khác không kích hoạt kiểm FK.
-- VALIDATE CONSTRAINT nằm ở khối cuối, CHỈ chạy khi số trade "lệch chủ" = 0 (probe 10 mục a);
-- nếu > 0 khối này bỏ qua VALIDATE và báo NOTICE (không lỗi) - user duyệt cách sửa dữ liệu rồi chạy tay:
--   ALTER TABLE public.trades VALIDATE CONSTRAINT trades_account_user_fk;
-- GIỮ NGUYÊN FK đơn cũ trades_account_id_fkey (không DROP).
-- Không DISABLE/ENABLE ROW LEVEL SECURITY. Idempotent: chạy lại nhiều lần không lỗi.
-- Thứ tự: sau 000 (và 001 nếu probe A0 báo chưa áp). Áp tay trong SQL Editor (USER GATE 3).
-- Đường lui: 010_rls_with_check_and_composite_fk.down.sql.

BEGIN;

-- (1) Policy UPDATE có WITH CHECK (cùng tên policy hiện hành, xem baseline 11-10-26 mục 02)
DROP POLICY IF EXISTS "Users can update their own accounts" ON public.accounts;
CREATE POLICY "Users can update their own accounts" ON public.accounts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own trades" ON public.trades;
CREATE POLICY "Users can update their own trades" ON public.trades
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own daily reviews" ON public.daily_reviews;
CREATE POLICY "Users can update their own daily reviews" ON public.daily_reviews
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
CREATE POLICY "Users can update their own preferences" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own playbooks" ON public.playbooks;
CREATE POLICY "Users can update their own playbooks" ON public.playbooks
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own periodic reviews" ON public.periodic_reviews;
CREATE POLICY "Users can update their own periodic reviews" ON public.periodic_reviews
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- (2) UNIQUE (id, user_id) trên accounts (đích của composite FK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounts_id_user_id_key' AND conrelid = 'public.accounts'::regclass
  ) THEN
    ALTER TABLE public.accounts ADD CONSTRAINT accounts_id_user_id_key UNIQUE (id, user_id);
  END IF;
END $$;

-- (3) Composite FK, NOT VALID (không quét dữ liệu cũ, không khóa lâu)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trades_account_user_fk' AND conrelid = 'public.trades'::regclass
  ) THEN
    ALTER TABLE public.trades
      ADD CONSTRAINT trades_account_user_fk
      FOREIGN KEY (account_id, user_id) REFERENCES public.accounts (id, user_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

INSERT INTO public.schema_migrations (version, name)
VALUES ('010', 'rls_with_check_and_composite_fk')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- (4) VALIDATE có điều kiện (giao dịch riêng: nếu lỗi, phần trên vẫn giữ)
DO $$
DECLARE
  v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.trades t
  JOIN public.accounts a ON a.id = t.account_id
  WHERE a.user_id <> t.user_id;

  IF v_bad = 0 THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'trades_account_user_fk' AND conrelid = 'public.trades'::regclass AND NOT convalidated
    ) THEN
      ALTER TABLE public.trades VALIDATE CONSTRAINT trades_account_user_fk;
    END IF;
  ELSE
    RAISE NOTICE 'trades_account_user_fk: % trade lệch chủ -> KHÔNG VALIDATE. Báo user, xử lý dữ liệu rồi chạy tay VALIDATE.', v_bad;
  END IF;
END $$;

-- Kiểm sau khi chạy (kết quả hiển thị trong SQL Editor):
SELECT conname, convalidated
FROM pg_constraint
WHERE conname IN ('accounts_id_user_id_key', 'trades_account_user_fk');
