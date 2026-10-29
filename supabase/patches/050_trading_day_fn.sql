-- Patch 050 - trading_day_fn (Phase 05, A1, D-1).
--
-- public.trading_day(p_ts, p_tz, p_reset_time, p_reset_tz) -> date
--   Cùng quy ước với src/lib/tradingDay.ts (tradingDayKey): nhãn = ngày BẮT ĐẦU của phiên.
--   local := p_ts AT TIME ZONE <zone hiệu dụng>; day := local::date; nếu local::time < reset thì day - 1.
--   Zone hiệu dụng = zone HỢP LỆ đầu tiên trong chuỗi p_reset_tz -> p_tz -> 'UTC'; mỗi zone thử RIÊNG
--   bằng khối BEGIN ... EXCEPTION WHEN invalid_parameter_value; chuỗi rỗng/khoảng trắng = NULL.
--   p_reset_time NULL -> 00:00. resetTime dạng text hỏng được chuẩn hóa ở hard_stop_* (052), vì tham số
--   ở đây đã là kiểu time.
--
-- Nhãn: STABLE PARALLEL UNSAFE. KHÔNG IMMUTABLE (AT TIME ZONE <text> phụ thuộc bảng tz), KHÔNG STRICT
-- (STRICT biến tz NULL thành kết quả NULL = fail-open), KHÔNG PARALLEL SAFE (khối EXCEPTION = subtransaction).
-- Hàm thuần, SECURITY INVOKER, search_path rỗng; EXECUTE chỉ còn owner/service_role (REVOKE bên dưới).
--
-- Known-gap (D-1, KG2): viết tắt kiểu 'EST' Postgres chấp nhận còn Intl thì không.
-- Patch KHÔNG chứa lệnh giao dịch; trình áp (scripts/p5_prod_apply.mjs) bọc giao dịch.
-- Idempotent. Đường lui: 050_trading_day_fn.down.sql. Thứ tự gỡ: 053 -> 052 -> 051 -> 050.

CREATE OR REPLACE FUNCTION public.trading_day(
  p_ts timestamptz,
  p_tz text,
  p_reset_time time DEFAULT '00:00',
  p_reset_tz text DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
STABLE
PARALLEL UNSAFE
SET search_path = ''
AS $fn$
DECLARE
  v_candidates text[] := ARRAY[
    CASE WHEN p_reset_tz IS NULL OR btrim(p_reset_tz) = '' THEN NULL ELSE p_reset_tz END,
    CASE WHEN p_tz IS NULL OR btrim(p_tz) = '' THEN NULL ELSE p_tz END
  ];
  v_zone  text;
  v_local timestamp := NULL;
  v_reset time := coalesce(p_reset_time, time '00:00');
BEGIN
  IF p_ts IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_zone IN ARRAY v_candidates LOOP
    IF v_zone IS NOT NULL THEN
      BEGIN
        v_local := p_ts AT TIME ZONE v_zone;
      EXCEPTION WHEN invalid_parameter_value THEN
        v_local := NULL;
      END;
      EXIT WHEN v_local IS NOT NULL;
    END IF;
  END LOOP;

  IF v_local IS NULL THEN
    v_local := p_ts AT TIME ZONE 'UTC';
  END IF;

  IF v_local::time < v_reset THEN
    RETURN v_local::date - 1;
  END IF;
  RETURN v_local::date;
END;
$fn$;

REVOKE ALL ON FUNCTION public.trading_day(timestamptz, text, time, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.trading_day(timestamptz, text, time, text) IS
  'P5: ngày giao dịch (ngày bắt đầu phiên) theo zone hợp lệ đầu tiên resetTz -> tz -> UTC và giờ reset; khớp tradingDayKey (client).';

INSERT INTO public.schema_migrations (version, name)
VALUES ('050', 'trading_day_fn')
ON CONFLICT DO NOTHING;
