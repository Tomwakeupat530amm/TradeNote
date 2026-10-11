-- Patch 001 - capture_baseline_drift (Phase 00)
-- Mục đích: ĐƯA VÀO REPO định nghĩa thật của public.get_account_stats đang chạy trên PROD
-- (hàm tồn tại live nhưng chưa từng có trong repo - drift Q11). Patch này CHỈ GHI NHẬN baseline,
-- KHÔNG sửa bảo mật/logic. Mọi sửa đổi thuộc phase sau:
--   - P1 (patch 011): REVOKE EXECUTE khỏi PUBLIC/anon, GRANT cho authenticated; có thể đặt search_path.
--   - P3: app ngừng gọi RPC này (thay bằng tính cục bộ); hàm DB giữ nguyên.
--
-- Nguồn: probe 00 mục 05_fn_get_account_stats chạy trên PROD ngày 11-10-26 (pg_get_functiondef),
-- xem supabase/baseline/baseline_11-10-26.md. Thuộc tính live đã đối chiếu:
--   SECURITY INVOKER (prosecdef = false), VOLATILE, LANGUAGE plpgsql, RETURNS json,
--   proconfig = NULL (không đặt search_path),
--   proacl = {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}.
-- Thân hàm giữ NGUYÊN VĂN (kể cả chú thích và quirk profit_factor khi gross_loss = 0).
-- Khác biệt duy nhất: thân hàm live dùng xuống dòng CRLF; file này dùng LF (plpgsql coi là khoảng trắng,
-- không đổi hành vi).
--
-- Tác động khi áp lên PROD: không đổi hành vi. CREATE OR REPLACE giữ nguyên owner và quyền EXECUTE hiện có
-- (không GRANT/REVOKE ở đây). Idempotent: chạy lại nhiều lần không lỗi.
-- Thứ tự: áp SAU 000 (cần bảng public.schema_migrations). Áp tay trong SQL Editor, TEST trước (xem README).

CREATE OR REPLACE FUNCTION public.get_account_stats(p_account_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  total_pnl NUMERIC;
  win_rate NUMERIC;
  total_trades INT;
  wins INT;
  losses INT;
  profit_factor NUMERIC;
  gross_profit NUMERIC;
  gross_loss NUMERIC;
BEGIN
  -- Count totals
  SELECT COUNT(*) INTO total_trades FROM trades WHERE account_id = p_account_id;
  SELECT SUM(pnl) INTO total_pnl FROM trades WHERE account_id = p_account_id;
  SELECT COUNT(*) INTO wins FROM trades WHERE account_id = p_account_id AND pnl > 0;
  SELECT COUNT(*) INTO losses FROM trades WHERE account_id = p_account_id AND pnl < 0;
  
  -- Calculate Win Rate
  IF total_trades > 0 THEN
    win_rate := (wins::NUMERIC / total_trades) * 100;
  ELSE
    win_rate := 0;
  END IF;

  -- Calculate Profit Factor
  SELECT SUM(pnl) INTO gross_profit FROM trades WHERE account_id = p_account_id AND pnl > 0;
  SELECT SUM(ABS(pnl)) INTO gross_loss FROM trades WHERE account_id = p_account_id AND pnl < 0;
  
  IF gross_loss > 0 THEN
    profit_factor := gross_profit / gross_loss;
  ELSE
    profit_factor := gross_profit; -- Infinity technically, but returning the raw profit
  END IF;

  -- Return as JSON
  RETURN json_build_object(
    'total_trades', total_trades,
    'total_pnl', COALESCE(total_pnl, 0),
    'win_rate', ROUND(win_rate, 2),
    'wins', wins,
    'losses', losses,
    'profit_factor', ROUND(COALESCE(profit_factor, 0), 2)
  );
END;
$function$;

INSERT INTO public.schema_migrations (version, name)
VALUES ('001', 'capture_baseline_drift')
ON CONFLICT (version) DO NOTHING;
