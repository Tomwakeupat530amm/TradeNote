-- Probe 30 - P3 estimated-risk counts (CHỈ ĐỌC). Chạy TRƯỚC và SAU 030/031.
-- Chạy được cả khi cột risk_is_estimated CHƯA tồn tại (trước 030): cờ được đọc qua
-- to_jsonb(t) ->> 'risk_is_estimated' (không tham chiếu tên cột -> không lỗi); khi cột thiếu,
-- flag_column_present = false và các cột est_* trả NULL (chỉ dùng invariants).
-- Không mốc thời gian (PROD trades không có created_at).
--
-- Kết quả: 1 dòng mỗi account_id + 1 dòng tổng (scope = 'TOTAL', account_id NULL).
-- Invariants (trước vs sau 030 phải BẰNG): total, risk_500, sum_pnl, sum_risk, sum_r.
-- Sau 031: est_true (TOTAL) = risk_500 (TOTAL); est_true_not_500 = 0 (hàng risk khác 500 giữ NULL).

WITH has_col AS (
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'risk_is_estimated'
  ) AS present
),
base AS (
  SELECT t.account_id,
         t.risk_amount,
         t.pnl,
         t.r_multiple,
         (to_jsonb(t) ->> 'risk_is_estimated')::boolean AS est
  FROM public.trades t
)
SELECT
  CASE WHEN GROUPING(b.account_id) = 1 THEN 'TOTAL' ELSE 'account' END AS scope,
  b.account_id,
  h.present AS flag_column_present,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE b.risk_amount = 500) AS risk_500,
  SUM(b.pnl) AS sum_pnl,
  SUM(b.risk_amount) AS sum_risk,
  SUM(b.r_multiple) AS sum_r,
  CASE WHEN h.present THEN COUNT(*) FILTER (WHERE b.est IS NULL) END AS est_null,
  CASE WHEN h.present THEN COUNT(*) FILTER (WHERE b.est IS TRUE) END AS est_true,
  CASE WHEN h.present THEN COUNT(*) FILTER (WHERE b.est IS FALSE) END AS est_false,
  CASE WHEN h.present
       THEN COUNT(*) FILTER (WHERE b.est IS TRUE AND b.risk_amount IS DISTINCT FROM 500) END AS est_true_not_500
FROM base b CROSS JOIN has_col h
GROUP BY ROLLUP (b.account_id), h.present
ORDER BY GROUPING(b.account_id), b.account_id;
