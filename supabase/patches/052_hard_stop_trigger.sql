-- Patch 052 - hard_stop_trigger (Phase 05, C1/C1b; SPEC B1 phase 2).
--
-- Đưa luật Hard Stop xuống DB: chỉ NGÀY GIAO DỊCH HIỆN TẠI bị khóa (cùng quy tắc với src/lib/hardStop.ts).
--   public.hard_stop_decide(...)   hàm THUẦN (không đọc bảng): trả LUÔN object
--                                  {allowed, code, status, dayKey, lossToday, limit}; status off|ok|warn|locked.
--                                  Golden SQL (supabase/tests/hard_stop_golden.generated.sql) gọi trực tiếp.
--   public.hard_stop_evaluate(...) tải account + user_preferences + lệnh trong cửa sổ có giới hạn rồi gọi
--                                  hard_stop_decide. p_op = 'STATUS' (hoặc NULL) = ĐỌC THUẦN: không advisory
--                                  lock, không RAISE, không ghi (patch 053 dùng). VOLATILE có chủ đích: mỗi
--                                  câu lấy snapshot mới sau khi chờ advisory lock (READ COMMITTED).
--   public.hard_stop_trades_trg()  hàm trigger; trg_hard_stop BEFORE INSERT OR UPDATE OR DELETE ON public.trades.
--
-- Quy tắc cấu hình (D-2, D-3, D-1; MỘT quy tắc cho 052, 053 và P4):
--   maxDailyLoss chỉ nhận jsonb number > 0 (chuỗi, kể cả "1000" = chưa cấu hình = status 'off');
--   maxDailyLossType '%' -> initial_balance * maxDailyLoss / 100; so sánh bằng nhân chéo numeric;
--   limit tính ra <= 0 (vd. initial_balance <= 0) = chưa cấu hình = status 'off';
--   dailyLossAlertThreshold number > 0, ngược lại 80; resetTime trim + regex HH:MM (< 24) ngược lại 00:00;
--   resetTz chuỗi không rỗng; zone hiệu dụng = resetTz hợp lệ -> tz user hợp lệ -> UTC (trading_day, 050).
--
-- Thứ tự trong trigger (rẻ -> đắt): (1) auth.uid() IS NULL -> bypass quản trị (D5) + NOTICE;
--   (2) pg_trigger_depth() > 1 (cascade xóa account/user) hoặc account cha không còn -> cho qua;
--   user_id của OLD/NEW khác auth.uid() -> cho qua để RLS/FK tự từ chối (không oracle chéo user, S13);
--   (3) UPDATE chỉ đổi cột trong danh sách cho phép -> cho qua; (4) Hard Stop tắt / không có limit -> cho
--   qua TRƯỚC khi lấy lock; (5) OLD/NEW không thuộc ngày giao dịch hiện tại -> cho qua; (6) advisory lock
--   theo account; (7) tính lossToday (truy vấn có giới hạn ±2 ngày, dùng chỉ mục (account_id, date)).
-- Danh sách cột cho phép = test-fixtures/golden/hard_stop.golden.json meta.allowedColumns (Section 39 đối chiếu).
-- Lỗi hợp đồng DUY NHẤT: RAISE EXCEPTION 'HARD_STOP' USING ERRCODE = 'P0001', HINT = 'HARD_STOP',
--   DETAIL = json {dayKey, lossToday, limit} của CHÍNH user. Mọi lỗi nội bộ khác -> RAISE WARNING + cho qua,
--   TRỪ deadlock_detected (40P01) được re-raise.
-- Chỉ mục: KHÔNG tạo ở đây (patch cấm CONCURRENTLY); probe 50 kiểm theo định nghĩa (D-7).
--
-- Công tắc khẩn: ALTER TABLE public.trades DISABLE TRIGGER trg_hard_stop; (ENABLE để bật lại;
--   kiểm: SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_hard_stop').
-- CẢNH BÁO: chạy lại patch này (DROP TRIGGER IF EXISTS + CREATE TRIGGER) sẽ BẬT LẠI trigger đã DISABLE.
-- Patch KHÔNG chứa lệnh giao dịch. Cần 050. Thứ tự áp 050 -> 051 -> 052 -> 053; gỡ 053 -> 052 -> 051 -> 050.

CREATE OR REPLACE FUNCTION public.hard_stop_decide(
  p_account jsonb,
  p_trades jsonb,
  p_tz text,
  p_op text,
  p_old jsonb,
  p_new jsonb,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
PARALLEL UNSAFE
SET search_path = ''
AS $fn$
DECLARE
  c_allowed   CONSTANT text[] := ARRAY['notes', 'setup', 'confluences', 'emotion', 'mistake', 'checklist_results', 'screenshot_url', 'screenshot_path', 'risk_is_estimated'];
  v_rules     jsonb;
  v_acc_id    text := p_account->>'id';
  v_enforced  boolean;
  v_max       numeric;
  v_ib        numeric;
  v_limit_x100 numeric;
  v_limit     numeric;
  v_threshold numeric := 80;
  v_reset     time := time '00:00';
  v_reset_raw text;
  v_reset_tz  text;
  v_now       timestamptz := coalesce(p_now, now());
  v_day       date;
  v_trade     jsonb;
  v_ts        timestamptz;
  v_pnl       numeric;
  v_net       numeric := 0;
  v_loss      numeric;
  v_status    text;
  v_op        text := upper(coalesce(p_op, ''));
  v_old_key   date;
  v_new_key   date;
  v_allowed   boolean := true;
BEGIN
  v_rules := CASE WHEN jsonb_typeof(p_account->'rules') = 'object' THEN p_account->'rules' ELSE '{}'::jsonb END;
  v_enforced := coalesce(v_rules->'enableHardStop' = 'true'::jsonb, false);

  IF coalesce(CASE WHEN jsonb_typeof(v_rules->'maxDailyLoss') = 'number' THEN (v_rules->>'maxDailyLoss')::numeric > 0 END, false) THEN
    v_max := (v_rules->>'maxDailyLoss')::numeric;
  END IF;
  IF jsonb_typeof(p_account->'initial_balance') = 'number' THEN
    v_ib := (p_account->>'initial_balance')::numeric;
  END IF;
  IF v_max IS NOT NULL THEN
    IF v_rules->>'maxDailyLossType' = '%' THEN
      IF v_ib IS NOT NULL THEN
        v_limit_x100 := v_ib * v_max;
      END IF;
    ELSE
      v_limit_x100 := v_max * 100;
    END IF;
  END IF;
  -- limit không dương (vd. '%' với initial_balance <= 0) = chưa cấu hình = status 'off' (khớp client).
  IF v_limit_x100 IS NOT NULL AND v_limit_x100 <= 0 THEN
    v_limit_x100 := NULL;
  END IF;
  IF v_limit_x100 IS NOT NULL THEN
    v_limit := trim_scale(v_limit_x100 / 100);
  END IF;

  IF coalesce(CASE WHEN jsonb_typeof(v_rules->'dailyLossAlertThreshold') = 'number'
                   THEN (v_rules->>'dailyLossAlertThreshold')::numeric > 0 END, false) THEN
    v_threshold := (v_rules->>'dailyLossAlertThreshold')::numeric;
  END IF;

  IF jsonb_typeof(v_rules->'resetTime') = 'string' THEN
    v_reset_raw := btrim(v_rules->>'resetTime');
    IF v_reset_raw ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      v_reset := v_reset_raw::time;
    END IF;
  END IF;
  IF jsonb_typeof(v_rules->'resetTz') = 'string' AND btrim(v_rules->>'resetTz') <> '' THEN
    v_reset_tz := v_rules->>'resetTz';
  END IF;

  v_day := public.trading_day(v_now, p_tz, v_reset, v_reset_tz);

  FOR v_trade IN
    SELECT e.value
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_trades) = 'array' THEN p_trades ELSE '[]'::jsonb END) AS e(value)
  LOOP
    CONTINUE WHEN v_trade->>'account_id' IS DISTINCT FROM v_acc_id;
    BEGIN
      v_ts := (v_trade->>'date')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_ts := NULL;
    END;
    CONTINUE WHEN v_ts IS NULL;
    v_pnl := 0;
    IF jsonb_typeof(v_trade->'pnl') = 'number' THEN
      v_pnl := (v_trade->>'pnl')::numeric;
    ELSIF jsonb_typeof(v_trade->'pnl') = 'string' THEN
      BEGIN
        v_pnl := (v_trade->>'pnl')::numeric;
      EXCEPTION WHEN OTHERS THEN
        v_pnl := 0;
      END;
    END IF;
    IF public.trading_day(v_ts, p_tz, v_reset, v_reset_tz) = v_day THEN
      v_net := v_net + coalesce(v_pnl, 0);
    END IF;
  END LOOP;

  v_loss := greatest(0, -v_net);

  IF NOT v_enforced OR v_limit_x100 IS NULL THEN
    v_status := 'off';
  ELSIF v_loss * 100 >= v_limit_x100 THEN
    v_status := 'locked';
  ELSIF v_loss * 100 * 100 >= v_threshold * v_limit_x100 THEN
    v_status := 'warn';
  ELSE
    v_status := 'ok';
  END IF;

  IF v_status = 'locked' AND v_op IN ('INSERT', 'UPDATE', 'DELETE') THEN
    IF p_old IS NOT NULL AND p_old ? 'date' THEN
      BEGIN
        v_old_key := public.trading_day((p_old->>'date')::timestamptz, p_tz, v_reset, v_reset_tz);
      EXCEPTION WHEN OTHERS THEN
        v_old_key := NULL;
      END;
    END IF;
    IF p_new IS NOT NULL AND p_new ? 'date' THEN
      BEGIN
        v_new_key := public.trading_day((p_new->>'date')::timestamptz, p_tz, v_reset, v_reset_tz);
      EXCEPTION WHEN OTHERS THEN
        v_new_key := NULL;
      END;
    END IF;

    IF v_op = 'INSERT' THEN
      -- ngày thiếu/không đọc được = ngày hiện tại (DB default now())
      v_allowed := coalesce(v_new_key, v_day) <> v_day;
    ELSIF v_op = 'DELETE' THEN
      v_allowed := v_old_key IS DISTINCT FROM v_day;
    ELSE
      v_new_key := coalesce(v_new_key, v_old_key);
      IF v_old_key = v_day OR v_new_key = v_day THEN
        v_allowed := (coalesce(p_new, '{}'::jsonb) - c_allowed) IS NOT DISTINCT FROM (coalesce(p_old, '{}'::jsonb) - c_allowed);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'code', CASE WHEN v_allowed THEN NULL ELSE 'HARD_STOP' END,
    'status', v_status,
    'dayKey', to_char(v_day, 'YYYY-MM-DD'),
    'lossToday', v_loss,
    'limit', v_limit
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hard_stop_evaluate(
  p_user uuid,
  p_account uuid,
  p_op text,
  p_old jsonb,
  p_new jsonb,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_acc       record;
  v_acc_json  jsonb;
  v_tz        text;
  v_pre       jsonb;
  v_rules     jsonb;
  v_reset     time := time '00:00';
  v_reset_raw text;
  v_reset_tz  text;
  v_day       date;
  v_now       timestamptz := coalesce(p_now, now());
  v_op        text := upper(coalesce(p_op, 'STATUS'));
  v_old_key   date;
  v_new_key   date;
  v_trades    jsonb;
BEGIN
  IF p_user IS NULL OR p_account IS NULL THEN
    RETURN NULL;
  END IF;

  -- Chỉ account của CHÍNH p_user (p_user luôn = auth.uid() từ trigger); không thấy -> NULL, không RAISE.
  SELECT a.id, a.initial_balance, a.rules INTO v_acc
  FROM public.accounts a
  WHERE a.id = p_account AND a.user_id = p_user;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT p.timezone INTO v_tz FROM public.user_preferences p WHERE p.user_id = p_user;

  v_acc_json := jsonb_build_object('id', v_acc.id::text, 'initial_balance', v_acc.initial_balance, 'rules', v_acc.rules);

  -- (4) cấu hình: Hard Stop tắt hoặc không có limit -> 'off', thoát TRƯỚC khi lấy lock / tính tổng.
  v_pre := public.hard_stop_decide(v_acc_json, '[]'::jsonb, v_tz, NULL, NULL, NULL, v_now);
  IF v_pre->>'status' = 'off' THEN
    RETURN v_pre;
  END IF;
  v_day := (v_pre->>'dayKey')::date;

  v_rules := CASE WHEN jsonb_typeof(v_acc.rules) = 'object' THEN v_acc.rules ELSE '{}'::jsonb END;
  IF jsonb_typeof(v_rules->'resetTime') = 'string' THEN
    v_reset_raw := btrim(v_rules->>'resetTime');
    IF v_reset_raw ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      v_reset := v_reset_raw::time;
    END IF;
  END IF;
  IF jsonb_typeof(v_rules->'resetTz') = 'string' AND btrim(v_rules->>'resetTz') <> '' THEN
    v_reset_tz := v_rules->>'resetTz';
  END IF;

  IF v_op IN ('INSERT', 'UPDATE', 'DELETE') THEN
    -- (5) dòng không chạm ngày giao dịch hiện tại -> cho qua, không lock.
    IF p_old IS NOT NULL AND p_old ? 'date' THEN
      BEGIN
        v_old_key := public.trading_day((p_old->>'date')::timestamptz, v_tz, v_reset, v_reset_tz);
      EXCEPTION WHEN OTHERS THEN
        v_old_key := NULL;
      END;
    END IF;
    IF p_new IS NOT NULL AND p_new ? 'date' THEN
      BEGIN
        v_new_key := public.trading_day((p_new->>'date')::timestamptz, v_tz, v_reset, v_reset_tz);
      EXCEPTION WHEN OTHERS THEN
        v_new_key := NULL;
      END;
    END IF;
    IF v_op = 'INSERT' THEN
      v_new_key := coalesce(v_new_key, v_day);
    END IF;
    IF v_old_key IS DISTINCT FROM v_day AND v_new_key IS DISTINCT FROM v_day THEN
      RETURN v_pre;
    END IF;
    -- (6) tuần tự hóa ghi đồng thời trên cùng account (chỉ khi thật sự cần).
    PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text, 0));
  END IF;

  -- (7) tổng có giới hạn: dùng chỉ mục (account_id, date), vẫn khớp chính xác trading_day (ngày 23/25 giờ).
  SELECT coalesce(jsonb_agg(jsonb_build_object('account_id', t.account_id::text, 'pnl', t.pnl, 'date', t.date)), '[]'::jsonb)
  INTO v_trades
  FROM public.trades t
  WHERE t.account_id = p_account
    AND t.user_id = p_user
    AND t.date >= v_now - interval '2 days'
    AND t.date < v_now + interval '2 days'
    AND public.trading_day(t.date, v_tz, v_reset, v_reset_tz) = v_day;

  RETURN public.hard_stop_decide(
    v_acc_json, v_trades, v_tz,
    CASE WHEN v_op IN ('INSERT', 'UPDATE', 'DELETE') THEN v_op ELSE NULL END,
    p_old, p_new, v_now
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hard_stop_trades_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  c_allowed CONSTANT text[] := ARRAY['notes', 'setup', 'confluences', 'emotion', 'mistake', 'checklist_results', 'screenshot_url', 'screenshot_path', 'risk_is_estimated'];
  v_uid      uuid := auth.uid();
  v_old      jsonb;
  v_new      jsonb;
  v_accounts uuid[];
  v_acc      uuid;
  v_res      jsonb;
  v_hint     text;
BEGIN
  -- (1) D5: kết nối quản trị (SQL Editor, service_role, migration, backfill) không có sub -> bỏ qua.
  IF v_uid IS NULL THEN
    RAISE NOTICE 'hard_stop: admin bypass (auth.uid() IS NULL) on % %', TG_OP, TG_TABLE_NAME;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    -- (2) cascade xóa account/user (RI trigger ở độ sâu 1) hoặc account cha không còn.
    IF pg_trigger_depth() > 1 THEN
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;
    -- (S13) hàng không thuộc phiên hiện tại: để RLS/FK từ chối, không đánh giá (không oracle chéo user).
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.user_id IS DISTINCT FROM v_uid THEN
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.user_id IS DISTINCT FROM v_uid THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = OLD.account_id) THEN
      RETURN OLD;
    END IF;

    -- (3) UPDATE chỉ đổi cột cho phép (notes/tag/ảnh/cờ) -> luôn được.
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - c_allowed) IS NOT DISTINCT FROM (to_jsonb(OLD) - c_allowed) THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
      v_new := to_jsonb(NEW);
      v_accounts := ARRAY[NEW.account_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_old := to_jsonb(OLD);
      v_accounts := ARRAY[OLD.account_id];
    ELSE
      v_old := to_jsonb(OLD);
      v_new := to_jsonb(NEW);
      -- đổi account_id: đánh giá (và lock) cả hai account theo id tăng dần, tránh deadlock.
      SELECT array_agg(x ORDER BY x) INTO v_accounts
      FROM (SELECT DISTINCT unnest(ARRAY[OLD.account_id, NEW.account_id]) AS x) s;
    END IF;

    FOREACH v_acc IN ARRAY v_accounts LOOP
      -- p_user = auth.uid() (KHÔNG lấy từ NEW/OLD.user_id); DETAIL chỉ chứa số của CHÍNH user.
      v_res := public.hard_stop_evaluate(v_uid, v_acc, TG_OP, v_old, v_new, now());
      IF v_res IS NOT NULL AND (v_res->>'allowed') = 'false' THEN
        RAISE EXCEPTION 'HARD_STOP'
          USING ERRCODE = 'P0001',
                HINT = 'HARD_STOP',
                DETAIL = jsonb_build_object(
                  'dayKey', v_res->'dayKey',
                  'lossToday', v_res->'lossToday',
                  'limit', v_res->'limit')::text;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLSTATE = 'P0001' AND v_hint = 'HARD_STOP' THEN
      RAISE;
    END IF;
    -- deadlock_detected (40P01) KHÔNG fail-open: re-raise để giao dịch bị hủy và client thử lại.
    IF SQLSTATE = '40P01' THEN
      RAISE;
    END IF;
    -- fail-open có cảnh báo: lỗi nội bộ không được chặn ghi.
    RAISE WARNING 'hard_stop: internal error, write allowed (%): %', SQLSTATE, SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.hard_stop_decide(jsonb, jsonb, text, text, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hard_stop_evaluate(uuid, uuid, text, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hard_stop_trades_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hard_stop ON public.trades;
CREATE TRIGGER trg_hard_stop
  BEFORE INSERT OR UPDATE OR DELETE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.hard_stop_trades_trg();

INSERT INTO public.schema_migrations (version, name)
VALUES ('052', 'hard_stop_trigger')
ON CONFLICT DO NOTHING;
