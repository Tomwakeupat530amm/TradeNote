# supabase/ - nguồn SQL duy nhất của TradeNote

Mọi SQL của dự án nằm ở thư mục này. Repo gốc `TradeNote/` không còn file `.sql` nào.

| Đường dẫn | Vai trò |
|---|---|
| `schema.snapshot.sql` | Bản cài mới (fresh install) cho project trống. KHÔNG dùng để nâng cấp DB đang chạy. |
| `patches/NNN_name.sql` + `.down.sql` | Patch đánh số, idempotent, có đường lui. Đây là cách DUY NHẤT để đổi DB đang chạy. |
| `probes/*.sql` | SQL chỉ-đọc để chạy trong SQL Editor (baseline, đếm dữ liệu bẩn). |
| `baseline/baseline_<ngày>.md` (+ `probe_<env>_<ngày>.json`) | Kết quả probe user dán lại (không chứa secret) + dữ liệu thô. |
| `tests/` | Dữ liệu/kỳ vọng cho kiểm thử SQL. `tests/grants_matrix.expected.json` = ma trận quyền kỳ vọng sau 011 (so với probe 11). |
| `legacy/*.sql` | 3 file SQL cũ, chỉ để tham chiếu. Không chạy lại. |
| `seeds/mock_data.sql` | Dữ liệu mẫu (chuyển từ repo gốc). Chỉ dùng cho project TEST/local. |

## Quy trình áp patch (6 bước, áp tay trong Supabase Dashboard)

1. **Backup** - Dashboard -> Database -> Backups (hoặc `pg_dump`) trước khi đổi bất cứ gì trên PROD.
2. **Probe** - chạy `probes/00_schema_snapshot_readonly.sql` (và probe pre-check của patch, nếu có); lưu kết quả vào `baseline/`.
3. **Áp trên TEST** - mở SQL Editor của project TEST, dán patch theo đúng thứ tự số, Run. Chạy lại lần 2 để chắc chắn idempotent.
4. **Chạy harness** - `npm run test:rls` (biến môi trường trong `.env.test.local`, mẫu ở `.env.test.example`). Mọi kịch bản phải OK.
5. **Áp PROD thủ công** - chỉ sau bước 1-4 xanh và user đồng ý; dán đúng file đã áp trên TEST.
6. **Ghi `schema_migrations`** - mỗi patch tự `INSERT ... ON CONFLICT DO NOTHING`; kiểm lại bằng `select * from public.schema_migrations order by version;`.

Lùi: chạy `NNN_name.down.sql` theo thứ tự số GIẢM DẦN, rồi `delete from public.schema_migrations where version = 'NNN';` (chạy tay, không nằm trong patch).

## Quy tắc patch (ép bằng `npm run lint:sql`)

- Tên `NNN_name.sql` + `NNN_name.down.sql` (`name` = chữ thường, số, `_`); số không trùng.
- Mỗi patch có `INSERT INTO public.schema_migrations (version, name) VALUES ('NNN', ...) ON CONFLICT DO NOTHING`.
- Cấm `DROP TABLE` / `DROP COLUMN` / `DELETE FROM` trong patch (ngoài `.down.sql`) trừ khi có dòng `-- DESTRUCTIVE-OK: <lý do>` và user đã đồng ý.
- Idempotent: `IF NOT EXISTS`, `DROP POLICY IF EXISTS` trước `CREATE POLICY`, khối `DO $$ ... $$` khi cần điều kiện.
- Không `DISABLE ROW LEVEL SECURITY` trong bất kỳ patch nào.
- Bảng mới: từ P1 (011) snapshot không cấp gì cho `anon`, nhưng default ACL của `supabase_admin` vẫn có thể cấp (known-gap) và `authenticated` có CRUD mặc định; patch tạo bảng nội bộ phải `REVOKE` tường minh (xem 000) và chạy lại `probes/11_p1_grants_matrix.sql`.
- Kiểm lint: `npm run lint:sql`; tự kiểm lint: `node scripts/sql_patch_lint.mjs --self-test`.

## Thứ tự patch dự kiến

| Số | Phase | Nội dung |
|---|---|---|
| 000 | P0 | `schema_migrations` |
| 001 | P0 | `capture_baseline_drift` - định nghĩa thật của `get_account_stats` lấy từ probe 00 PROD 11-10-26 (`baseline/baseline_11-10-26.md`); chỉ ghi nhận, không đổi hành vi; `.down.sql` = baseline không lùi |
| 010-013 | P1 | RLS WITH CHECK + composite FK, thu hồi `anon` + DELETE preferences, storage theo tiền tố + `screenshot_path`, bucket private |
| 020 | P2 | `ai_coach_usage` |
| 030, 031 | P3 | `risk_nullable_estimated`, `backfill_flag_estimated` |
| 050, 051 (+052, 053 theo plan P5) | P5 | `trading_day_fn`, `user_preferences_ensure_row`, hard stop trigger |
| 060 | P6 | `list_orphan_screenshots` (có điều kiện) |
| 090 | P7 | `drop_screenshot_url` - DESTRUCTIVE, chỉ chạy khi user đồng ý |

## Phase 01 (010-013): thứ tự áp trên PROD (chưa có project TEST -> USER GATE tường minh)

| Bước | Việc | Ghi chú |
|---|---|---|
| 1 | Backup + chạy `probes/10_p1_pre_checks.sql` | A0 quyết định có cần 000/001; mục a/b/c/c2/e/f/g/h phải đạt trước khi đi tiếp |
| 2 | `000` -> `001` (CHỈ nếu A0 báo chưa áp) | Trước 001: đối chiếu định nghĩa live `get_account_stats` (mục h) với `patches/001`; khác -> dừng |
| 3 | `010_rls_with_check_and_composite_fk` | Tự VALIDATE composite FK khi mục a = 0; sau đó chạy khối (1)(2) của `probes/12_p1_manual_acceptance.sql` |
| 4 | `011_revoke_anon_prefs_delete_default_privs` | Tự dừng nếu có hàm public ngoài danh sách cho phép; sau đó chạy `probes/11` (so `tests/grants_matrix.expected.json`) + probe 12 khối (3)(4) |
| 5 | Chạy lại probe 10 mục g, rồi `012_screenshot_path_expand` | Tự dừng nếu path có `%`, đếm url <> path, hoặc còn policy storage lạ; sau đó probe 12 khối (5) |
| 6 | Deploy client (signed URL, playbook D6, avatar D8) | KHÔNG deploy trước bước 5 |
| 7 | `013_bucket_private_contract` | CHỈ khi: client bước 6 đã lên PROD, đếm ảnh 100% (trades + playbooks), user thấy request `/object/sign/` (USER GATE 4). Link public cũ chết (chủ đích); tab cũ cần tải lại |

Probe 12 chạy TỪNG khối `DO $$`; mỗi khối kết thúc `RAISE EXCEPTION 'RESULT: ...'` (cố ý, để rollback dữ liệu thử). Lùi: 013 -> 012 -> 011 -> 010.

## Phase 02 (020): hạn mức AI Coach trong DB

- Bảng thứ 8 `public.ai_coach_usage (user_id, window_start, count)`: RLS bật, KHÔNG policy, `REVOKE ALL` từ `anon`/`authenticated`; chỉ hàm `SECURITY DEFINER` `public.consume_ai_quota(p_limit int, p_window_seconds int) returns table(allowed boolean, retry_after int)` đọc/ghi (EXECUTE chỉ cho `authenticated`, `search_path` cố định, `auth.uid()` NULL -> từ chối, kẹp `p_limit` 1..100, `p_window_seconds` 1..86400).
- Cửa sổ CỐ ĐỊNH: `window_start = floor(epoch(now()) / window) * window`; upsert nguyên tử một câu `INSERT ... ON CONFLICT DO UPDATE ... WHERE count < p_limit`. Ở ranh giới cửa sổ có thể dùng tới 2 x limit (known-gap chấp nhận). Mỗi lần gọi dọn dòng > 1 ngày của chính user đó.
- Route `/api/ai-coach` gọi `consume_ai_quota(5, 600)` bằng JWT của user và FAIL CLOSED (lỗi/thiếu hàm -> `AI_UNAVAILABLE`).

| Bước | Việc | Ghi chú |
|---|---|---|
| 1 | Backup + áp `020_ai_coach_usage.sql` trên PROD (pg client ngoài app, credential từ env) | TRƯỚC khi deploy route mới |
| 2 | `probes/11_p1_grants_matrix.sql` so `tests/grants_matrix.expected.json` (version `p2-after-020`, bỏ `_doc`) | Lệch -> chạy `020_ai_coach_usage.down.sql` |
| 3 | `node scripts/ai_quota_prod_check.mjs --confirm-prod` (env `PROD_DB_URL`, `PG_MODULE_PATH`) | 2 user throwaway, tự xóa; kịch bản `ai-quota-atomic`, `ai-quota-foreign`, `ai-quota-cleanup` |
| 4 | Deploy route | Sau bước 1-3 |

Lùi (route fail closed, nên thứ tự quan trọng): (1) revert route (git) và deploy, (2) `020_ai_coach_usage.down.sql`, (3) `delete from public.schema_migrations where version = '020';`.

## Phase 03 (030, 031): cờ rủi ro ước tính

- `030_risk_nullable_estimated`: idempotent; `ADD COLUMN IF NOT EXISTS` cho `risk_amount numeric`, `r_multiple numeric`, `session text`, `checklist_results jsonb DEFAULT '{}'`; `risk_amount` DROP NOT NULL / DROP DEFAULT có guard (no-op trên PROD: đã nullable, không default); thêm `risk_is_estimated boolean` NULLABLE, KHÔNG default (NULL = chưa phân loại, true = 500 cũ, false = rủi ro thật do client mới ghi). Không đổi dữ liệu. Down: `DROP COLUMN risk_is_estimated` + xóa dòng `schema_migrations` 030.
- `031_backfill_flag_estimated`: KHÔNG mốc thời gian (PROD `trades` không có `created_at`); `UPDATE ... SET risk_is_estimated = true WHERE risk_amount = 500 AND risk_is_estimated IS NULL` - idempotent, chạy lại cập nhật 0 hàng, hàng cờ false không bị đụng. Down: mọi cờ true -> NULL (GIỚI HẠN: không phân biệt cờ true do user xác nhận tay) + xóa dòng 030/031 tương ứng.
- Probe `probes/30_p3_estimated_counts.sql` (chỉ đọc): chạy được TRƯỚC 030 (đọc cờ qua `to_jsonb(t)`); theo account + TOTAL: invariants `total`, `risk_500`, `sum_pnl`, `sum_risk`, `sum_r` và `est_null/true/false`, `est_true_not_500`.
- Áp PROD: `node scripts/p3_prod_apply.mjs --confirm-prod --backup-dir <ngoài repo>` (env `PROD_DB_URL`, `PG_MODULE_PATH`): preflight -> sao lưu (id, risk_amount, pnl, r_multiple [+ cờ nếu đã có]) ra JSON NGOÀI repo -> 030 -> probe (invariants phải bằng) -> 031 -> cờ true = số lệnh 500, chạy lại 031 = 0 hàng -> evidence đã che secret `harness/p3/d0-prod-apply.txt`. Lệch -> tự rollback 031.down rồi 030.down (chỉ patch áp trong phiên). Client mới KHÔNG push trước khi 030 áp.
- Harness `npm run test:rls` có kịch bản `backfill-flag-migration` (cần TEST project đã áp 030; không có -> SKIPPED, residual `backfill-flag-migration-test-project`).
- KHÔNG chạy lại `legacy/supabase_patch_enhancements.sql` (COALESCE risk_amount 500).

## Phase 05 (050-053): Hard Stop phía server

ĐÃ ÁP TRÊN PROD 29-10-26 (`schema_migrations` có 050, 051, 052, 053) bằng `scripts/p5_prod_apply.mjs --stage 0..6`
(evidence đã che secret: `process/.../hardening-security-data-integrity_11-10-26/harness/p5/gd*-prod.txt`).

- `050_trading_day_fn`: `public.trading_day(timestamptz, text, time, text)` - ngày giao dịch (cùng quy ước `src/lib/tradingDay.ts`).
- `051_user_preferences_ensure_row`: trigger `trg_user_preferences_ensure_row` AFTER INSERT ON `auth.users` tạo dòng `user_preferences` (timezone `'UTC'`, KG8: user mới bắt đầu ở UTC cho tới khi đổi trong Cài đặt) + backfill. Hàm không bao giờ chặn đăng ký (`RAISE WARNING`). Lúc áp: 0 user thiếu dòng (backfill no-op).
- `052_hard_stop_trigger`: `trg_hard_stop` BEFORE INSERT/UPDATE/DELETE ON `public.trades`; chặn ghi vào NGÀY GIAO DỊCH HIỆN TẠI khi đã khóa (`P0001`, HINT `HARD_STOP`, DETAIL JSON `dayKey/lossToday/limit`). Notes/tag/ảnh vẫn sửa được.
- `053_hard_stop_config_lock`: `trg_hard_stop_config_accounts` (accounts) + `trg_hard_stop_config_prefs` (user_preferences, UPDATE/DELETE): nới lỏng cấu hình khi đang khóa -> `HARD_STOP_CONFIG_LOCKED`.
- Mọi hàm: `SET search_path = ''`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated` (không gọi được qua RPC). Chỉ mục `(account_id, date)` đã có sẵn (`idx_trades_account_date`) -> không tạo thêm.
- Thứ tự áp: 050 -> 051 -> 052 -> 053. Thứ tự gỡ: **053 -> 052 -> 051 -> 050** (plpgsql không tạo phụ thuộc nên gỡ sai thứ tự không báo lỗi nhưng làm trigger hỏng). Gỡ toàn bộ tự động: `node scripts/p5_prod_apply.mjs --confirm-prod --rollback-all` (DISABLE trigger trước rồi `.down.sql`).
- Smoke lại (idempotent, tự dọn, user thử `p5-probe-*@example.invalid`): `node scripts/p5_prod_smoke.mjs --confirm-prod --suite all` (env `PROD_DB_URL`, `PG_MODULE_PATH`).

### Công tắc khẩn (không cần gỡ patch)

`DISABLE/ENABLE TRIGGER` cần quyền **owner của bảng** -> chạy bằng role `postgres` trong SQL Editor. Đặt `lock_timeout` trước để không treo sau một giao dịch dài đang giữ khóa bảng.

```sql
SET lock_timeout = '3s';
ALTER TABLE public.trades DISABLE TRIGGER trg_hard_stop;
ALTER TABLE public.accounts DISABLE TRIGGER trg_hard_stop_config_accounts;
ALTER TABLE public.user_preferences DISABLE TRIGGER trg_hard_stop_config_prefs;
-- bật lại (cùng tên):
ALTER TABLE public.trades ENABLE TRIGGER trg_hard_stop;
ALTER TABLE public.accounts ENABLE TRIGGER trg_hard_stop_config_accounts;
ALTER TABLE public.user_preferences ENABLE TRIGGER trg_hard_stop_config_prefs;
-- Kiểm tra:
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgname IN ('trg_hard_stop','trg_hard_stop_config_accounts','trg_hard_stop_config_prefs','trg_user_preferences_ensure_row');
-- 'O' = bật, 'D' = tắt
```

Tắt `trg_user_preferences_ensure_row` (051): `auth.users` thuộc `supabase_auth_admin`, nên `postgres` KHÔNG DISABLE được (`42501 must be owner of table users`, diễn tập PROD 29-10-26). Cách tắt: `DROP TRIGGER IF EXISTS trg_user_preferences_ensure_row ON auth.users;` hoặc chạy `patches/051_user_preferences_ensure_row.down.sql`. Bật lại: chạy lại patch 051. Diễn tập công tắc khẩn trong giao dịch tự ROLLBACK: `node scripts/p5_prod_apply.mjs --confirm-prod --rehearse-disable`.

Hành vi theo loại lỗi: lỗi chờ khóa `lock_not_available` (`55P03`) bên trong hàm trigger bị bắt bởi khối fail-open -> **cho ghi** (`RAISE WARNING`); `statement_timeout` (`57014`, hủy câu lệnh) **không** fail-open -> câu lệnh ghi bị hủy (fail-closed).

CẢNH BÁO: chạy lại patch 051/052/053 (DROP TRIGGER IF EXISTS + CREATE TRIGGER) sẽ BẬT LẠI trigger đang DISABLE.

### Giới hạn đã biết

- Bypass quản trị (D5): khi `auth.uid() IS NULL` (SQL Editor, `service_role`, migration/backfill) trigger bỏ qua và `RAISE NOTICE` (ồn log). Lộ `service_role` key là sự cố riêng.
- C9: lệnh ghi bù ngày quá khứ / ngày tương lai không bị chặn (chỉ ngày giao dịch hiện tại bị khóa).
- Client cũ (chưa có ánh xạ P5) nhận lỗi `P0001` thô.
- Tạo account MỚI khi account khác đang khóa không bị chặn.
- Xóa account đang khóa cascade xóa luôn lệnh của ngày khóa (P5-AC5, chủ đích); xóa user cũng cascade được.
- DELETE dòng `user_preferences` khi có account (có limit) đang khóa bị chặn.
- Fail-open khi lỗi nội bộ (`RAISE WARNING`, cho ghi); riêng deadlock `40P01` ở 052 được re-raise. 053 vẫn fail-open.
- `maxDailyLoss` chỉ nhận số JSON > 0 (chuỗi = chưa cấu hình, D-3); `%` với `initial_balance <= 0` = chưa cấu hình. Probe 50 lúc áp: `hard_stop_non_numeric_limit = 0`, `hard_stop_percent_nonpositive_balance = 0` (không sửa dữ liệu user).
- Biên `%` thập phân: client float vs server numeric có thể khác đúng tại biên (ca sidecar `serverExpected`, KG1).
- Múi giờ: PG POSIX tz vs `Intl` (KG2); viết tắt kiểu `EST` Postgres nhận còn `Intl` không (D-1). JS `trim` vs SQL `btrim` khác với tab/khoảng trắng Unicode.
- Không kiểm qua HTTP PostgREST/GoTrue (KG3): smoke mô phỏng phiên bằng `SET LOCAL ROLE authenticated` + `request.jwt.claims`.
- P5 KHÔNG áp patch 090 (DROP COLUMN, thuộc P7). Điều kiện tiên quyết cho P7: backup đầy đủ + mọi hàng có ảnh đã có `screenshot_path`.

## Phase 07 (090): bỏ cột `trades.screenshot_url` - ĐÃ VIẾT, CHƯA ÁP TRÊN PROD

- Trạng thái (29-10-26): `patches/090_drop_trades_screenshot_url.sql` (+ `.down.sql`), probe 90 và `scripts/p7_prod_apply.mjs` đã có; PROD vẫn ở `schema_migrations` = 000, 001, 010-013, 020, 030, 031, 050-053. Chưa áp vì K1 INCONCLUSIVE (hook chặn đọc env PROD trong phiên agent).
- Client đã ngừng đọc/ghi `screenshot_url` (chỉ dùng `screenshot_path`), nên áp 090 sau khi bản client mới đã deploy; áp trước thì client cũ lỗi.
- Patch có guard phá hủy (dừng nếu còn hàng có url mà thiếu path) và cần backup đầy đủ trước khi chạy.
- Điều kiện áp, cửa sổ rollout và lệnh chính xác: `process/general-plans/active/hardening-security-data-integrity_11-10-26/harness/p7/prod-commands.txt`. Bằng chứng cục bộ (PGlite 31/31): `harness/p7/local-pglite-verification.txt`.

## Project TEST (cho harness 2 user)

1. Tạo một Supabase project MỚI (không phải production).
2. SQL Editor: chạy `schema.snapshot.sql`, rồi `legacy/supabase_patch_enhancements.sql`, `legacy/supabase_scale_indexes.sql`, `legacy/supabase_grant_permissions.sql` (mô phỏng DB hiện tại).
3. Authentication -> Users -> Add user: tạo user A và user B (email + mật khẩu, auto-confirm).
4. Sao chép `.env.test.example` thành `.env.test.local`, điền URL + anon key của project TEST và thông tin A, B. KHÔNG dùng `service_role`.
5. `npm run test:rls -- --expect-red` để ghi baseline (trên DB cũ kỳ vọng VULNERABLE).

Harness từ chối chạy nếu `TEST_SUPABASE_URL` trùng URL production trong `.env.local`.
