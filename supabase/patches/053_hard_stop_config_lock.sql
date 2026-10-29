-- Patch 053 - hard_stop_config_lock (Phase 05, C5; D6).
--
-- Chặn NỚI LỎNG cấu hình khi tài khoản đang bị khóa ở ngày giao dịch hiện tại (chống tự mở khóa).
-- Định nghĩa dùng chung D6 (P4 evaluateConfigChange dùng CÙNG văn bản):
--   effectiveLimit(rules, initial_balance) = NULL khi enableHardStop không phải boolean true HOẶC
--     maxDailyLoss thiếu / không phải số / <= 0; ngược lại '%' -> initial_balance * maxDailyLoss / 100,
--     còn lại maxDailyLoss. (Tính bằng hard_stop_decide của 052: status 'off' <=> effectiveLimit NULL.)
--   Account: NỚI LỎNG khi đang khóa (rules CŨ, initial_balance CŨ, timezone CŨ) VÀ một trong:
--     (a) effectiveLimit cũ khác NULL, mới NULL; (b) cả hai khác NULL và mới > cũ;
--     (c) resetTime hoặc resetTz đổi sau khi chuẩn hóa (vắng / JSON null / chuỗi rỗng -> NULL).
--   user_preferences: NỚI LỎNG khi timezone đổi (đã chuẩn hóa) HOẶC dòng bị DELETE, VÀ có account
--     (effectiveLimit khác NULL) đang khóa ở ngày giao dịch hiện tại (timezone CŨ).
--   Thắt chặt luôn được phép. Chỉ đổi cột khác (name, type, ...) không bao giờ bị đánh giá.
--
--   public.hard_stop_config_decide(p_old_account, p_new_account, p_locked) -> {allowed, code}   (thuần)
--   public.hard_stop_prefs_config_decide(p_old_tz, p_new_tz, p_any_locked_with_limit) -> {allowed, code} (thuần)
--   public.hard_stop_config_accounts_trg() / trg_hard_stop_config_accounts BEFORE UPDATE ON public.accounts
--   public.hard_stop_config_prefs_trg()    / trg_hard_stop_config_prefs    BEFORE UPDATE OR DELETE ON public.user_preferences
--     (DELETE dòng prefs khi đang khóa bị chặn: chặn vượt khóa timezone bằng DELETE rồi INSERT;
--      cascade xóa user/account (pg_trigger_depth() > 1) và bypass D5 vẫn cho qua).
-- "Đang khóa" đọc bằng public.hard_stop_evaluate(..., 'STATUS', ...) (052): đọc thuần, không lock, không RAISE.
-- Bypass D5 (auth.uid() IS NULL). Lỗi duy nhất: ERRCODE 'P0001', HINT 'HARD_STOP_CONFIG_LOCKED';
-- lỗi nội bộ -> RAISE WARNING + cho qua. Thông điệp client do P4 sở hữu.
--
-- Công tắc khẩn: ALTER TABLE public.accounts DISABLE TRIGGER trg_hard_stop_config_accounts;
--   ALTER TABLE public.user_preferences DISABLE TRIGGER trg_hard_stop_config_prefs;
-- CẢNH BÁO: chạy lại patch này sẽ BẬT LẠI trigger đã DISABLE.
-- Patch KHÔNG chứa lệnh giao dịch. Cần 050 + 052. Gỡ: 053 -> 052 -> 051 -> 050.

CREATE OR REPLACE FUNCTION public.hard_stop_config_decide(
  p_old_account jsonb,
  p_new_account jsonb,
  p_locked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
PARALLEL UNSAFE
SET search_path = ''
AS $fn$
DECLARE
  v_old_eval jsonb;
  v_new_eval jsonb;
  v_old_l    numeric;
  v_new_l    numeric;
  v_old_rules jsonb;
  v_new_rules jsonb;
  v_reset_changed boolean;
BEGIN
  IF NOT coalesce(p_locked, false) THEN
    RETURN jsonb_build_object('allowed', true, 'code', NULL);
  END IF;

  -- effectiveLimit = limit của hard_stop_decide khi status <> 'off' (một nguồn quy tắc cấu hình).
  v_old_eval := public.hard_stop_decide(p_old_account, '[]'::jsonb, 'UTC', NULL, NULL, NULL, now());
  v_new_eval := public.hard_stop_decide(p_new_account, '[]'::jsonb, 'UTC', NULL, NULL, NULL, now());
  IF v_old_eval->>'status' <> 'off' THEN
    v_old_l := (v_old_eval->>'limit')::numeric;
  END IF;
  IF v_new_eval->>'status' <> 'off' THEN
    v_new_l := (v_new_eval->>'limit')::numeric;
  END IF;

  v_old_rules := CASE WHEN jsonb_typeof(p_old_account->'rules') = 'object' THEN p_old_account->'rules' ELSE '{}'::jsonb END;
  v_new_rules := CASE WHEN jsonb_typeof(p_new_account->'rules') = 'object' THEN p_new_account->'rules' ELSE '{}'::jsonb END;
  -- normOpt: vắng / JSON null -> NULL; chuỗi -> trim; rỗng -> NULL.
  v_reset_changed :=
    nullif(btrim(CASE jsonb_typeof(v_old_rules->'resetTime') WHEN 'string' THEN v_old_rules->>'resetTime' WHEN 'null' THEN NULL ELSE (v_old_rules->'resetTime')::text END), '')
      IS DISTINCT FROM
    nullif(btrim(CASE jsonb_typeof(v_new_rules->'resetTime') WHEN 'string' THEN v_new_rules->>'resetTime' WHEN 'null' THEN NULL ELSE (v_new_rules->'resetTime')::text END), '')
    OR
    nullif(btrim(CASE jsonb_typeof(v_old_rules->'resetTz') WHEN 'string' THEN v_old_rules->>'resetTz' WHEN 'null' THEN NULL ELSE (v_old_rules->'resetTz')::text END), '')
      IS DISTINCT FROM
    nullif(btrim(CASE jsonb_typeof(v_new_rules->'resetTz') WHEN 'string' THEN v_new_rules->>'resetTz' WHEN 'null' THEN NULL ELSE (v_new_rules->'resetTz')::text END), '');

  IF (v_old_l IS NOT NULL AND v_new_l IS NULL)
     OR (v_old_l IS NOT NULL AND v_new_l IS NOT NULL AND v_new_l > v_old_l)
     OR v_reset_changed THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'HARD_STOP_CONFIG_LOCKED');
  END IF;
  RETURN jsonb_build_object('allowed', true, 'code', NULL);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hard_stop_prefs_config_decide(
  p_old_tz text,
  p_new_tz text,
  p_any_locked_with_limit boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
BEGIN
  IF nullif(btrim(p_new_tz), '') IS DISTINCT FROM nullif(btrim(p_old_tz), '')
     AND coalesce(p_any_locked_with_limit, false) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'HARD_STOP_CONFIG_LOCKED');
  END IF;
  RETURN jsonb_build_object('allowed', true, 'code', NULL);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hard_stop_config_accounts_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_status jsonb;
  v_dec    jsonb;
  v_hint   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE NOTICE 'hard_stop_config: admin bypass (auth.uid() IS NULL) on accounts';
    RETURN NEW;
  END IF;

  BEGIN
    -- (S13) hàng của user khác: để RLS từ chối, không đánh giá.
    IF OLD.user_id IS DISTINCT FROM v_uid OR NEW.user_id IS DISTINCT FROM v_uid THEN
      RETURN NEW;
    END IF;
    -- Early exit: chỉ rules / initial_balance mới được xét (name, type... luôn qua).
    IF NEW.rules IS NOT DISTINCT FROM OLD.rules AND NEW.initial_balance IS NOT DISTINCT FROM OLD.initial_balance THEN
      RETURN NEW;
    END IF;

    -- BEFORE UPDATE: bảng còn cấu hình CŨ -> STATUS đánh giá bằng rules/initial_balance/timezone CŨ.
    v_status := public.hard_stop_evaluate(v_uid, OLD.id, 'STATUS', NULL, NULL, now());
    IF v_status IS NULL OR v_status->>'status' IS DISTINCT FROM 'locked' THEN
      RETURN NEW;
    END IF;

    v_dec := public.hard_stop_config_decide(
      jsonb_build_object('id', OLD.id::text, 'initial_balance', OLD.initial_balance, 'rules', OLD.rules),
      jsonb_build_object('id', NEW.id::text, 'initial_balance', NEW.initial_balance, 'rules', NEW.rules),
      true
    );
    IF (v_dec->>'allowed') = 'false' THEN
      RAISE EXCEPTION 'HARD_STOP_CONFIG_LOCKED'
        USING ERRCODE = 'P0001',
              HINT = 'HARD_STOP_CONFIG_LOCKED',
              DETAIL = jsonb_build_object(
                'dayKey', v_status->'dayKey',
                'lossToday', v_status->'lossToday',
                'limit', v_status->'limit')::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLSTATE = 'P0001' AND v_hint = 'HARD_STOP_CONFIG_LOCKED' THEN
      RAISE;
    END IF;
    RAISE WARNING 'hard_stop_config: internal error, update allowed (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hard_stop_config_prefs_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_acc    uuid;
  v_status jsonb;
  v_locked jsonb;
  v_dec    jsonb;
  v_hint   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE NOTICE 'hard_stop_config: admin bypass (auth.uid() IS NULL) on user_preferences';
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  -- cascade (xóa user/account): không chặn.
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    IF TG_OP = 'DELETE' THEN
      IF OLD.user_id IS DISTINCT FROM v_uid THEN
        RETURN OLD;
      END IF;
    ELSE
      IF OLD.user_id IS DISTINCT FROM v_uid OR NEW.user_id IS DISTINCT FROM v_uid THEN
        RETURN NEW;
      END IF;
      -- Chỉ timezone (đã chuẩn hóa) được xét; cột khác luôn qua.
      IF nullif(btrim(NEW.timezone), '') IS NOT DISTINCT FROM nullif(btrim(OLD.timezone), '') THEN
        RETURN NEW;
      END IF;
    END IF;

    -- BEFORE UPDATE/DELETE: user_preferences còn timezone CŨ -> STATUS đánh giá theo timezone CŨ.
    FOR v_acc IN SELECT a.id FROM public.accounts a WHERE a.user_id = v_uid ORDER BY a.id LOOP
      v_status := public.hard_stop_evaluate(v_uid, v_acc, 'STATUS', NULL, NULL, now());
      -- status 'locked' chỉ có khi effectiveLimit khác NULL.
      IF v_status IS NOT NULL AND v_status->>'status' = 'locked' THEN
        v_locked := v_status;
        EXIT;
      END IF;
    END LOOP;

    IF TG_OP = 'DELETE' THEN
      -- DELETE dòng prefs = nới lỏng (lần INSERT sau sẽ mang timezone mới).
      v_dec := jsonb_build_object('allowed', v_locked IS NULL, 'code',
                 CASE WHEN v_locked IS NULL THEN NULL ELSE 'HARD_STOP_CONFIG_LOCKED' END);
    ELSE
      v_dec := public.hard_stop_prefs_config_decide(OLD.timezone, NEW.timezone, v_locked IS NOT NULL);
    END IF;
    IF (v_dec->>'allowed') = 'false' THEN
      RAISE EXCEPTION 'HARD_STOP_CONFIG_LOCKED'
        USING ERRCODE = 'P0001',
              HINT = 'HARD_STOP_CONFIG_LOCKED',
              DETAIL = jsonb_build_object(
                'dayKey', v_locked->'dayKey',
                'lossToday', v_locked->'lossToday',
                'limit', v_locked->'limit')::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLSTATE = 'P0001' AND v_hint = 'HARD_STOP_CONFIG_LOCKED' THEN
      RAISE;
    END IF;
    RAISE WARNING 'hard_stop_config: internal error, change allowed (%): %', SQLSTATE, SQLERRM;
  END;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.hard_stop_config_decide(jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hard_stop_prefs_config_decide(text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hard_stop_config_accounts_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hard_stop_config_prefs_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hard_stop_config_accounts ON public.accounts;
CREATE TRIGGER trg_hard_stop_config_accounts
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.hard_stop_config_accounts_trg();

DROP TRIGGER IF EXISTS trg_hard_stop_config_prefs ON public.user_preferences;
CREATE TRIGGER trg_hard_stop_config_prefs
  BEFORE UPDATE OR DELETE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.hard_stop_config_prefs_trg();

INSERT INTO public.schema_migrations (version, name)
VALUES ('053', 'hard_stop_config_lock')
ON CONFLICT DO NOTHING;
