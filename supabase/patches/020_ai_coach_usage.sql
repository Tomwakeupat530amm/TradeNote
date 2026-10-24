-- Patch 020 - ai_coach_usage (Phase 02, A1): DB-backed, atomic AI Coach quota.
--
-- Mục đích: thay bộ giới hạn trong bộ nhớ (Map, mất khi restart, không chung giữa instance) bằng
-- hạn mức trong DB, nguyên tử, dùng chung mọi instance.
--   - Bảng public.ai_coach_usage (user_id, window_start, count): RLS bật, KHÔNG policy,
--     REVOKE ALL từ anon/authenticated -> chỉ hàm SECURITY DEFINER bên dưới đọc/ghi.
--   - Hàm public.consume_ai_quota(p_limit int, p_window_seconds int)
--       returns table(allowed boolean, retry_after int)
--     dùng auth.uid() (NULL -> từ chối), kẹp tham số, upsert MỘT câu (không SELECT rồi UPDATE).
--   - Cửa sổ CỐ ĐỊNH: window_start = floor(epoch(now()) / window) * window. Tại ranh giới cửa sổ
--     một user có thể dùng tối đa 2 x limit trong khoảng ngắn (known-gap chấp nhận, G3).
--   - Route gọi consume_ai_quota(5, 600) bằng JWT của user; lỗi/thiếu hàm -> route trả
--     AI_UNAVAILABLE (fail closed). => ÁP 020 TRÊN PROD TRƯỚC KHI DEPLOY ROUTE MỚI.
--
-- Idempotent. Đường lui: 020_ai_coach_usage.down.sql.
-- Thứ tự rollback (route fail closed, nên lùi DB trước sẽ làm AI Coach ngừng):
--   (1) revert route (git) và deploy, (2) chạy 020_ai_coach_usage.down.sql,
--   (3) chạy tay: delete from public.schema_migrations where version = '020';
-- Sau khi áp: chạy probes/11_p1_grants_matrix.sql, so với tests/grants_matrix.expected.json.
-- Probe lệch -> chạy 020_ai_coach_usage.down.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_coach_usage (
    user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    window_start timestamptz NOT NULL,
    count        integer     NOT NULL DEFAULT 0 CHECK (count >= 0),
    PRIMARY KEY (user_id, window_start)
);

ALTER TABLE public.ai_coach_usage ENABLE ROW LEVEL SECURITY;

-- Default privileges cấp CRUD cho authenticated (và có thể anon qua supabase_admin, known-gap)
-- trên mọi bảng mới -> thu hồi tường minh. Không tạo policy nào: truy cập trực tiếp bị chặn.
REVOKE ALL ON public.ai_coach_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_limit integer, p_window_seconds integer)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_uid          uuid := auth.uid();
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'consume_ai_quota: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'consume_ai_quota: p_limit out of range' USING ERRCODE = '22023';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'consume_ai_quota: p_window_seconds out of range' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  -- DESTRUCTIVE-OK: bounded cleanup of the caller's own expired quota rows inside consume_ai_quota
  DELETE FROM public.ai_coach_usage
  WHERE user_id = v_uid
    AND window_start < now() - interval '1 day';

  -- Một câu nguyên tử: dòng mới -> count = 1; dòng có sẵn -> +1 chỉ khi còn dưới hạn mức.
  INSERT INTO public.ai_coach_usage AS u (user_id, window_start, count)
  VALUES (v_uid, v_window_start, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET count = u.count + 1
  WHERE u.count < p_limit
  RETURNING u.count INTO v_count;

  IF v_count IS NOT NULL THEN
    allowed := true;
    retry_after := 0;
  ELSE
    allowed := false;
    retry_after := greatest(
      1,
      ceil(extract(epoch FROM (v_window_start + make_interval(secs => p_window_seconds) - now())))::integer
    );
  END IF;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(integer, integer) TO authenticated;

INSERT INTO public.schema_migrations (version, name)
VALUES ('020', 'ai_coach_usage')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Kiểm sau khi chạy:
SELECT version, name FROM public.schema_migrations WHERE version = '020';
