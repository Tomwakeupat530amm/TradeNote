# supabase/ - nguồn SQL duy nhất của TradeNote

Mọi SQL của dự án nằm ở thư mục này. Repo gốc `TradeNote/` không còn file `.sql` nào.

| Đường dẫn | Vai trò |
|---|---|
| `schema.snapshot.sql` | Bản cài mới (fresh install) cho project trống. KHÔNG dùng để nâng cấp DB đang chạy. |
| `patches/NNN_name.sql` + `.down.sql` | Patch đánh số, idempotent, có đường lui. Đây là cách DUY NHẤT để đổi DB đang chạy. |
| `probes/*.sql` | SQL chỉ-đọc để chạy trong SQL Editor (baseline, đếm dữ liệu bẩn). |
| `baseline/baseline_<ngày>.md` | Kết quả probe user dán lại (không chứa secret). |
| `tests/` | Dữ liệu/kỳ vọng cho kiểm thử SQL (P1/P5 thêm). |
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
- Bảng mới: snapshot có `ALTER DEFAULT PRIVILEGES` cấp quyền cho `anon`/`authenticated`, nên patch tạo bảng nội bộ phải `REVOKE` tường minh (xem 000).
- Kiểm lint: `npm run lint:sql`; tự kiểm lint: `node scripts/sql_patch_lint.mjs --self-test`.

## Thứ tự patch dự kiến

| Số | Phase | Nội dung |
|---|---|---|
| 000 | P0 | `schema_migrations` |
| 001 | P0 | `capture_baseline_drift` - định nghĩa thật của `get_account_stats` lấy từ probe 00 (chờ USER GATE 1) |
| 010-013 | P1 | RLS WITH CHECK + composite FK, thu hồi `anon` + DELETE preferences, storage theo tiền tố + `screenshot_path`, bucket private |
| 020 | P2 | `ai_coach_usage` |
| 030, 031 | P3 | `risk_nullable_estimated`, `backfill_flag_estimated` |
| 050, 051 (+052, 053 theo plan P5) | P5 | `trading_day_fn`, `user_preferences_ensure_row`, hard stop trigger |
| 060 | P6 | `list_orphan_screenshots` (có điều kiện) |
| 090 | P7 | `drop_screenshot_url` - DESTRUCTIVE, chỉ chạy khi user đồng ý |

## Project TEST (cho harness 2 user)

1. Tạo một Supabase project MỚI (không phải production).
2. SQL Editor: chạy `schema.snapshot.sql`, rồi `legacy/supabase_patch_enhancements.sql`, `legacy/supabase_scale_indexes.sql`, `legacy/supabase_grant_permissions.sql` (mô phỏng DB hiện tại).
3. Authentication -> Users -> Add user: tạo user A và user B (email + mật khẩu, auto-confirm).
4. Sao chép `.env.test.example` thành `.env.test.local`, điền URL + anon key của project TEST và thông tin A, B. KHÔNG dùng `service_role`.
5. `npm run test:rls -- --expect-red` để ghi baseline (trên DB cũ kỳ vọng VULNERABLE).

Harness từ chối chạy nếu `TEST_SUPABASE_URL` trùng URL production trong `.env.local`.
