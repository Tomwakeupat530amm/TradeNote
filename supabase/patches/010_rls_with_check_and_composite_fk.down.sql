-- Down 010 - rls_with_check_and_composite_fk
-- CẢNH BÁO: lùi patch này làm MẤT bảo vệ (trade có thể trỏ vào account của user khác; policy UPDATE
-- quay về USING-only). Chỉ dùng khi sự cố. Thứ tự lùi: 013 -> 012 -> 011 -> 010.
-- Sau khi chạy: delete from public.schema_migrations where version = '010';  (chạy tay)

BEGIN;

-- Bỏ composite FK TRƯỚC, rồi mới bỏ UNIQUE mà FK phụ thuộc.
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_account_user_fk;
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_id_user_id_key;

-- Policy UPDATE về dạng USING-only (như baseline).
DROP POLICY IF EXISTS "Users can update their own accounts" ON public.accounts;
CREATE POLICY "Users can update their own accounts" ON public.accounts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own trades" ON public.trades;
CREATE POLICY "Users can update their own trades" ON public.trades
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own daily reviews" ON public.daily_reviews;
CREATE POLICY "Users can update their own daily reviews" ON public.daily_reviews
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
CREATE POLICY "Users can update their own preferences" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own playbooks" ON public.playbooks;
CREATE POLICY "Users can update their own playbooks" ON public.playbooks
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own periodic reviews" ON public.periodic_reviews;
CREATE POLICY "Users can update their own periodic reviews" ON public.periodic_reviews
  FOR UPDATE USING (auth.uid() = user_id);

-- Không có INSERT schema_migrations trong file lui; gỡ dòng '010' bằng tay (xem README).
COMMIT;
