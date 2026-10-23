-- ==============================================================================
-- Probe 12 - Diễn tập nghiệm thu thủ công Phase 01 (Hybrid, USER GATE) - KHÔNG ĐỂ LẠI DỮ LIỆU
-- ==============================================================================
-- Vì chưa có project TEST, user chạy tay file này trong SQL Editor trên PROD SAU khi áp patch tương ứng.
--
-- CÁCH CHẠY (đọc kỹ):
--   1. Lấy 2 uid thật: select id, email from auth.users order by created_at limit 5;
--      Thay MỌI '<UID_A>' và '<UID_B>' trong khối định chạy bằng 2 uid KHÁC nhau (Ctrl+H).
--      Quên thay -> khối báo lỗi cú pháp uuid, không chạy gì.
--   2. Chạy TỪNG KHỐI một (bôi đen từ dòng `DO $$` tới `$$;` của khối rồi Run). Không chạy cả file một lần:
--      mỗi khối KẾT THÚC bằng RAISE EXCEPTION 'RESULT: ...' nên cả lần chạy dừng ở khối đầu tiên.
--   3. Đọc dòng lỗi "RESULT: <test>=PASS|FAIL|INCONCLUSIVE; ..." -> dán vào phase report.
--      Đây KHÔNG phải lỗi thật: exception là cách cố ý để ROLLBACK toàn bộ dữ liệu thử.
--   Nếu thông báo KHÔNG bắt đầu bằng "RESULT:" -> khối gặp lỗi ngoài dự kiến, ghi lại và báo agent.
--
-- An toàn: không có COMMIT. Mọi INSERT/UPDATE/DELETE thử nằm trong khối DO và bị rollback bởi
-- RAISE EXCEPTION cuối khối. Mỗi khối chạy dưới role authenticated với JWT claims giả lập
-- (set_config('request.jwt.claims', ..., true) - chỉ sống trong giao dịch).
--
-- Khối và patch cần có trước:
--   (1) cross-user-reassign      sau 010
--   (2) trade-to-foreign-account sau 010
--   (3) rpc                      sau 011
--   (4) preferences-delete       sau 011
--   (5) storage-prefix           sau 012
-- Pass chung: không có FAIL; INCONCLUSIVE phải kèm kiểm tay thay thế (xem plan P1 Step C5).
-- ==============================================================================


-- ---------------------------------------------------------------- (1) cross-user-reassign (sau 010)
DO $$
DECLARE
  v_a uuid := '<UID_A>';
  v_b uuid := '<UID_B>';
  v_acc uuid;
  v_id uuid;
  v_n int;
  v_res text := '';
  v_tbl text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  INSERT INTO public.accounts (user_id, name, type, initial_balance, rules)
  VALUES (v_a, 'p1-probe-acct', 'Personal', 1000, '{}'::jsonb) RETURNING id INTO v_acc;

  FOREACH v_tbl IN ARRAY ARRAY['accounts', 'trades', 'daily_reviews', 'notifications',
                               'user_preferences', 'playbooks', 'periodic_reviews'] LOOP
    v_id := NULL;
    CASE v_tbl
      WHEN 'accounts' THEN
        v_id := v_acc;
      WHEN 'trades' THEN
        INSERT INTO public.trades (user_id, account_id, asset, lot_size, pnl, result, setup, confluences, emotion, mistake)
        VALUES (v_a, v_acc, 'EURUSD', 1, 10, 'Win', 'p1-probe', '[]'::jsonb, 'Calm', 'None') RETURNING id INTO v_id;
      WHEN 'daily_reviews' THEN
        INSERT INTO public.daily_reviews (user_id, date, lessons_learned)
        VALUES (v_a, DATE '1900-01-01', 'p1-probe') RETURNING id INTO v_id;
      WHEN 'notifications' THEN
        INSERT INTO public.notifications (user_id, title, message, type)
        VALUES (v_a, 'p1-probe', 'p1-probe', 'info') RETURNING id INTO v_id;
      WHEN 'user_preferences' THEN
        INSERT INTO public.user_preferences (user_id) VALUES (v_a) ON CONFLICT (user_id) DO NOTHING;
        SELECT id INTO v_id FROM public.user_preferences WHERE user_id = v_a;
      WHEN 'playbooks' THEN
        INSERT INTO public.playbooks (user_id, title, rules)
        VALUES (v_a, 'p1-probe', '[]'::jsonb) RETURNING id INTO v_id;
      WHEN 'periodic_reviews' THEN
        INSERT INTO public.periodic_reviews (user_id, period_type, start_date, end_date)
        VALUES (v_a, 'weekly', DATE '1900-01-01', DATE '1900-01-07') RETURNING id INTO v_id;
    END CASE;

    IF v_id IS NULL THEN
      v_res := v_res || format('cross-user-reassign:%s=INCONCLUSIVE(không tạo được dòng); ', v_tbl);
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format('UPDATE public.%I SET user_id = $1 WHERE id = $2', v_tbl) USING v_b, v_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        v_res := v_res || format('cross-user-reassign:%s=PASS(0 dòng); ', v_tbl);
      ELSE
        v_res := v_res || format('cross-user-reassign:%s=FAIL(%s dòng đổi chủ); ', v_tbl, v_n);
      END IF;
    EXCEPTION
      WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN
        v_res := v_res || format('cross-user-reassign:%s=PASS(%s); ', v_tbl, SQLSTATE);
      WHEN unique_violation THEN
        v_res := v_res || format('cross-user-reassign:%s=INCONCLUSIVE(UNIQUE %s); ', v_tbl, SQLSTATE);
    END;
  END LOOP;

  RAISE EXCEPTION 'RESULT: %', v_res;
END $$;


-- ---------------------------------------------------------------- (2) trade-to-foreign-account (sau 010)
DO $$
DECLARE
  v_a uuid := '<UID_A>';
  v_b uuid := '<UID_B>';
  v_acc_a uuid;
  v_acc_b uuid;
  v_trade uuid;
  v_n int;
  v_res text := '';
BEGIN
  SET LOCAL ROLE authenticated;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  INSERT INTO public.accounts (user_id, name, type, initial_balance, rules)
  VALUES (v_b, 'p1-probe-acct-b', 'Personal', 1000, '{}'::jsonb) RETURNING id INTO v_acc_b;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  INSERT INTO public.accounts (user_id, name, type, initial_balance, rules)
  VALUES (v_a, 'p1-probe-acct-a', 'Personal', 1000, '{}'::jsonb) RETURNING id INTO v_acc_a;

  -- 2a. INSERT trade của A vào account của B -> phải bị từ chối
  BEGIN
    INSERT INTO public.trades (user_id, account_id, asset, lot_size, pnl, result, setup, confluences, emotion, mistake)
    VALUES (v_a, v_acc_b, 'EURUSD', 1, 10, 'Win', 'p1-probe', '[]'::jsonb, 'Calm', 'None');
    v_res := v_res || 'insert-foreign=FAIL(chèn được); ';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN
    v_res := v_res || format('insert-foreign=PASS(%s); ', SQLSTATE);
  END;

  -- 2b. INSERT trade vào account của chính A -> phải thành công
  BEGIN
    INSERT INTO public.trades (user_id, account_id, asset, lot_size, pnl, result, setup, confluences, emotion, mistake)
    VALUES (v_a, v_acc_a, 'EURUSD', 1, 10, 'Win', 'p1-probe', '[]'::jsonb, 'Calm', 'None') RETURNING id INTO v_trade;
    v_res := v_res || 'insert-own=PASS; ';
  EXCEPTION WHEN OTHERS THEN
    v_res := v_res || format('insert-own=FAIL(%s %s); ', SQLSTATE, SQLERRM);
  END;

  -- 2c. UPDATE account_id sang account của B -> phải bị từ chối
  IF v_trade IS NULL THEN
    v_res := v_res || 'update-foreign=INCONCLUSIVE(không có trade của A); ';
  ELSE
    BEGIN
      UPDATE public.trades SET account_id = v_acc_b WHERE id = v_trade;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        v_res := v_res || 'update-foreign=PASS(0 dòng); ';
      ELSE
        v_res := v_res || 'update-foreign=FAIL(đổi được account); ';
      END IF;
    EXCEPTION WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN
      v_res := v_res || format('update-foreign=PASS(%s); ', SQLSTATE);
    END;
  END IF;

  RAISE EXCEPTION 'RESULT: trade-to-foreign-account: %', v_res;
END $$;


-- ---------------------------------------------------------------- (3) rpc get_account_stats (sau 011)
DO $$
DECLARE
  v_a uuid := '<UID_A>';
  v_b uuid := '<UID_B>';
  v_acc_b uuid;
  v_stats json;
  v_res text := '';
BEGIN
  SET LOCAL ROLE authenticated;

  -- B có 1 account + 1 trade (để "rỗng" có nghĩa)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  INSERT INTO public.accounts (user_id, name, type, initial_balance, rules)
  VALUES (v_b, 'p1-probe-acct-b', 'Personal', 1000, '{}'::jsonb) RETURNING id INTO v_acc_b;
  INSERT INTO public.trades (user_id, account_id, asset, lot_size, pnl, result, setup, confluences, emotion, mistake)
  VALUES (v_b, v_acc_b, 'EURUSD', 1, 10, 'Win', 'p1-probe', '[]'::jsonb, 'Calm', 'None');

  -- 3a. A gọi với account của B -> total_trades = 0 hoặc lỗi
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  BEGIN
    v_stats := public.get_account_stats(v_acc_b);
    IF COALESCE((v_stats ->> 'total_trades')::int, 0) = 0 THEN
      v_res := v_res || 'rpc-foreign-account=PASS(0 trade); ';
    ELSE
      v_res := v_res || format('rpc-foreign-account=FAIL(%s); ', v_stats::text);
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    v_res := v_res || 'rpc-foreign-account=PASS(42501); ';
  END;

  -- 3b. anon gọi RPC -> permission denied
  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  BEGIN
    v_stats := public.get_account_stats(v_acc_b);
    v_res := v_res || 'rpc-anon-denied=FAIL(anon gọi được); ';
  EXCEPTION WHEN insufficient_privilege THEN
    v_res := v_res || 'rpc-anon-denied=PASS(42501); ';
  END;

  -- 3c. anon đọc bảng -> permission denied
  BEGIN
    PERFORM 1 FROM public.trades LIMIT 1;
    v_res := v_res || 'anon-select-trades=FAIL(anon có SELECT); ';
  EXCEPTION WHEN insufficient_privilege THEN
    v_res := v_res || 'anon-select-trades=PASS(42501); ';
  END;

  RAISE EXCEPTION 'RESULT: rpc: %', v_res;
END $$;


-- ---------------------------------------------------------------- (4) preferences-delete (sau 011)
DO $$
DECLARE
  v_a uuid := '<UID_A>';
  v_b uuid := '<UID_B>';
  v_n int;
  v_res text := '';
BEGIN
  SET LOCAL ROLE authenticated;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  INSERT INTO public.user_preferences (user_id) VALUES (v_b) ON CONFLICT (user_id) DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  INSERT INTO public.user_preferences (user_id) VALUES (v_a) ON CONFLICT (user_id) DO NOTHING;

  -- 4a. A xóa preferences của B -> 0 dòng
  BEGIN
    EXECUTE 'DELETE FROM public.user_preferences WHERE user_id = $1' USING v_b;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_res := v_res || CASE WHEN v_n = 0 THEN 'preferences-delete-foreign=PASS(0 dòng); '
                           ELSE format('preferences-delete-foreign=FAIL(%s dòng); ', v_n) END;
  EXCEPTION WHEN insufficient_privilege THEN
    v_res := v_res || 'preferences-delete-foreign=PASS(42501); ';
  END;

  -- 4b. A xóa preferences của A -> 1 dòng
  BEGIN
    EXECUTE 'DELETE FROM public.user_preferences WHERE user_id = $1' USING v_a;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_res := v_res || CASE WHEN v_n = 1 THEN 'preferences-delete-own=PASS(1 dòng); '
                           ELSE format('preferences-delete-own=FAIL(%s dòng); ', v_n) END;
  EXCEPTION WHEN insufficient_privilege THEN
    v_res := v_res || 'preferences-delete-own=FAIL(42501); ';
  END;

  RAISE EXCEPTION 'RESULT: %', v_res;
END $$;


-- ---------------------------------------------------------------- (5) storage-prefix (sau 012)
-- Ghi trực tiếp storage.objects (chỉ metadata, KHÔNG tạo file thật; rollback cuối khối).
-- Nếu trigger/quyền của schema storage chặn INSERT trực tiếp vì lý do khác RLS -> INCONCLUSIVE,
-- dùng kiểm tay 2 tài khoản (plan P1 Step C5, AC-A3).
DO $$
DECLARE
  v_a uuid := '<UID_A>';
  v_b uuid := '<UID_B>';
  v_res text := '';
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  -- 5a. A ghi vào thư mục của B -> bị từ chối bởi RLS.
  --     5a PASS CHỈ HỢP LỆ KHI 5b = PASS (chứng minh A ghi được khi đúng tiền tố, nên từ chối ở 5a
  --     là do policy tiền tố chứ không phải do chặn ghi toàn bộ).
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('trade-screenshots', v_b::text || '/p1-probe.png', v_a::text);
    v_res := v_res || 'storage-foreign-prefix-write=FAIL(chèn được); ';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      -- Chỉ PASS khi bị RLS chặn; 42501 vì thiếu GRANT bảng (không phải policy) -> INCONCLUSIVE.
      IF SQLERRM ILIKE '%row-level security%' THEN
        v_res := v_res || format('storage-foreign-prefix-write=PASS(%s RLS); ', SQLSTATE);
      ELSE
        v_res := v_res || format('storage-foreign-prefix-write=INCONCLUSIVE(%s %s); ', SQLSTATE, SQLERRM);
      END IF;
    WHEN OTHERS THEN
      v_res := v_res || format('storage-foreign-prefix-write=INCONCLUSIVE(%s %s); ', SQLSTATE, SQLERRM);
  END;

  -- 5b. A ghi vào thư mục của chính mình -> thành công (rồi rollback)
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('trade-screenshots', v_a::text || '/p1-probe.png', v_a::text);
    v_res := v_res || 'storage-own-prefix-write=PASS; ';
  EXCEPTION WHEN OTHERS THEN
    v_res := v_res || format('storage-own-prefix-write=INCONCLUSIVE(%s %s); ', SQLSTATE, SQLERRM);
  END;

  -- 5c. B đọc object của A -> không thấy
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  BEGIN
    IF EXISTS (SELECT 1 FROM storage.objects
               WHERE bucket_id = 'trade-screenshots' AND name LIKE v_a::text || '/%') THEN
      v_res := v_res || 'storage-foreign-read=FAIL(B thấy object của A); ';
    ELSE
      v_res := v_res || 'storage-foreign-read=PASS(0 dòng); ';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_res := v_res || format('storage-foreign-read=INCONCLUSIVE(%s); ', SQLSTATE);
  END;

  RAISE EXCEPTION 'RESULT: %', v_res;
END $$;
