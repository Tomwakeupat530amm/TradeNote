# Baseline schema PROD - 11-10-26

**TL;DR:** RLS bật đủ 7 bảng và policy khớp `schema.snapshot.sql`. Cột `accounts`/`trades`/`user_preferences` khớp snapshot + `legacy/supabase_patch_enhancements.sql` (không thiếu cột -> điều kiện "BLOCKED P1 vì lệch cột" KHÔNG xảy ra). Drift thật nằm ở **quyền**: `anon` và `authenticated` có ĐỦ 7 quyền (kể cả TRUNCATE) trên cả 7 bảng, default ACL cấp toàn quyền cho `anon`, `get_account_stats` (không có trong repo) cho PUBLIC/anon EXECUTE. Hàm là SECURITY INVOKER nên KHÔNG phải lỗ đọc chéo. Bucket ảnh public, INSERT không kiểm tiền tố. 104/131 trades có `risk_amount = 500`.

| Mục | Giá trị |
|---|---|
| Môi trường | PROD (Supabase project production của user) |
| Ngày chạy | 11-10-26 |
| Người chạy | user, SQL Editor, quyền chỉ-đọc |
| Probe | `supabase/probes/00_schema_snapshot_readonly.sql` (một câu SELECT, 10 mục) |
| Dữ liệu thô | `supabase/baseline/probe_prod_11-10-26.json` (sha256 `8ba275ab773c19b8f499563dd1992f3f8e0871d860bb06ed133043ffda043f70`) |
| Secret | Không có (đã quét: không JWT, không URL project, không email, không mật khẩu) |
| Patch đã áp lúc chụp | Chưa có patch đánh số nào (000/001 chưa áp; mục `schema_migrations` không nằm trong probe) |

**Nguồn gốc file JSON:** orchestrator chuẩn hóa từ kết quả user dán lại (mỗi mục `section` + `data`). Agent ghi lại nguyên dữ liệu đó, không thêm/bớt. Agent không có bản dán gốc để so byte-by-byte; nếu cần đối chiếu, chạy lại probe.

---

## 1. Kết quả theo mục probe

### 01 - RLS flags
7/7 bảng (`accounts`, `daily_reviews`, `notifications`, `periodic_reviews`, `playbooks`, `trades`, `user_preferences`): `relrowsecurity = true`, `relforcerowsecurity = false`.

### 02 - Policy schema `public` (27 policy)
- 6 bảng (`accounts`, `trades`, `daily_reviews`, `notifications`, `playbooks`, `periodic_reviews`): mỗi bảng 4 policy SELECT/INSERT/UPDATE/DELETE, tên `Users can <view|insert|update|delete> their own <bảng>`.
- `user_preferences`: 3 policy SELECT/INSERT/UPDATE, **không có DELETE**.
- Mọi policy: `PERMISSIVE`, roles `{public}`, biểu thức `(auth.uid() = user_id)`.
- SELECT/DELETE/UPDATE: `qual = (auth.uid() = user_id)`, `with_check = NULL`. INSERT: `with_check = (auth.uid() = user_id)`.
- **UPDATE không có WITH CHECK** (Postgres dùng lại `USING` để kiểm dòng mới).

### 03 - Policy schema `storage` (8 policy, bảng `storage.objects`)
| Policy | Lệnh | Biểu thức |
|---|---|---|
| Anyone can view avatars | SELECT | `bucket_id = 'avatars'` |
| Anyone can view screenshots | SELECT | `bucket_id = 'trade-screenshots'` |
| Authenticated users can upload avatars | INSERT (check) | `bucket_id = 'avatars' AND auth.role() = 'authenticated'` |
| Authenticated users can upload screenshots | INSERT (check) | `bucket_id = 'trade-screenshots' AND auth.role() = 'authenticated'` |
| Users can update their own avatars / screenshots | UPDATE | `bucket_id = ... AND auth.uid() = owner` (không WITH CHECK) |
| Users can delete their own avatars / screenshots | DELETE | `bucket_id = ... AND auth.uid() = owner` |

### 04 - Table grants (147 dòng)
`anon`, `authenticated`, `service_role` - MỖI role có ĐỦ 7 quyền `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` trên CẢ 7 bảng (3 x 7 x 7 = 147). `grantable = NO`.

### 05 - `public.get_account_stats(p_account_id uuid)`
| Thuộc tính | Giá trị live |
|---|---|
| returns / language | `json` / `plpgsql` |
| prosecdef | `false` (SECURITY INVOKER) |
| provolatile | `v` (VOLATILE) |
| proconfig | `NULL` (không đặt `search_path`) |
| proacl | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` -> PUBLIC (`=X`), anon, authenticated, service_role có EXECUTE |
| Định nghĩa | Nguyên văn trong `supabase/patches/001_capture_baseline_drift.sql` (thân live dùng CRLF; patch dùng LF) |

Thân hàm: đếm `total_trades`, `SUM(pnl)`, `wins` (pnl > 0), `losses` (pnl < 0) của `trades WHERE account_id = p_account_id` (bảng không ghi schema -> phụ thuộc `search_path`), `win_rate = wins / total_trades * 100`, `profit_factor = gross_profit / gross_loss` nếu `gross_loss > 0`, ngược lại `profit_factor = gross_profit`.

**Kết luận bảo mật:** INVOKER -> RLS của `trades` áp theo người gọi. User B gọi với `account_id` của A nhận 0 dòng (số 0), `anon` nhận 0. **Không phải lỗ đọc chéo** (nỗi lo "prosecdef = true" trong report P0 không xảy ra). Vấn đề còn lại: EXECUTE cho PUBLIC/anon (least privilege) và `search_path` không cố định (rủi ro thấp vì INVOKER).

**Quirk logic (ghi nhận, không sửa):** (1) không có lệnh thua -> `profit_factor` trả về TỔNG LÃI ($) thay vì vô cực/giới hạn; (2) `win_rate` tính cả lệnh hòa (pnl = 0) vào mẫu số; (3) app có công thức riêng -> hai nguồn số lệch nhau.

### 06 - Storage buckets
| id | public | file_size_limit | allowed_mime_types |
|---|---|---|---|
| avatars | true | NULL | NULL |
| trade-screenshots | true | NULL | NULL |

### 07 - Default ACL (24 dòng)
Quan trọng cho schema `public` (và `storage`):
| Người tạo (role) | Schema | Loại | ACL mặc định cho `anon` |
|---|---|---|---|
| postgres | public | bảng (r) | `arwdDxtm` (toàn quyền) |
| postgres | public | sequence (S) | `rwU` |
| postgres | public | function (f) | `X` (EXECUTE) |
| postgres | storage | r / S / f | `arwdDxtm` / `rwU` / `X` |
| supabase_admin | public | r / S / f | `arwdDxtm` / `rwU` / `X` |
`authenticated` và `service_role` có cùng mức. (Các dòng `graphql`, `graphql_public`, `realtime`, `extensions`, `auth` là mặc định nền tảng, xem JSON.)

### 08 - Cột thật (chỉ 3 bảng theo thiết kế probe B1)
- `accounts` (7): `id uuid`, `user_id uuid`, `name text`, `type text`, `initial_balance numeric`, `rules jsonb default '{}'`, `created_at timestamptz` - tất cả NOT NULL.
- `trades` (18): `id`, `user_id`, `account_id`, `asset`, `lot_size`, `pnl`, `result`, `setup`, `emotion`, `mistake` (NOT NULL), `notes` (null), `screenshot_url` (null), `date` (NOT NULL), `confluences jsonb default '[]'` (NOT NULL, vị trí 14), `risk_amount numeric` (null), `r_multiple numeric` (null), `session text` (null), `checklist_results jsonb default '{}'` (null). **Không có** `screenshot_path`, `direction`, `entry_price`, `exit_price`.
- `user_preferences` (12): `id`, `user_id`, `psychology_tags`, `mistake_tags`, `privacy_mode`, `theme`, `created_at`, `base_currency`, `timezone`, `display_name`, `avatar_url`, `confluence_tags`.

### 09 - `risk_amount`
`total_trades = 131`, `risk_amount_eq_500 = 104`, `risk_amount_null = 0`, cột tồn tại.

### 10 - Storage theo bucket
| bucket | total_objects | no_folder | prefix_not_owner | owner_null |
|---|---|---|---|---|
| trade-screenshots | 12 | 0 | 0 | 0 |
`avatars` không xuất hiện (GROUP BY bucket) -> 0 object.

---

## 2. Drift: PROD vs repo (`schema.snapshot.sql` + `legacy/*`)

| # | Hạng mục | Repo nói | PROD thực tế | Mức | Phase sở hữu |
|---|---|---|---|---|---|
| R1 | `get_account_stats` | Không có trong repo | Tồn tại, INVOKER, EXECUTE cho PUBLIC/anon | Drift chính (Q11) | **P0 patch 001** đưa vào repo (xong); P1 011 thu EXECUTE; P3 bỏ lời gọi app |
| R2 | Grant `anon` | Snapshot/legacy: `GRANT SELECT` | ĐỦ 7 quyền gồm INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES | Cao (least privilege) | P1 patch 011 |
| R3 | Grant `authenticated` | `SELECT, INSERT, UPDATE, DELETE` | Thêm TRUNCATE/TRIGGER/REFERENCES | Trung bình (TRUNCATE bỏ qua RLS; PostgREST không lộ TRUNCATE) | P1 - lưu ý: 011 như plan hiện chỉ REVOKE từ `anon`, cần cân nhắc REVOKE TRUNCATE/TRIGGER/REFERENCES từ `authenticated` |
| R4 | Default privileges | `ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES TO anon` | Default ACL của `postgres`/`supabase_admin` cho `anon` toàn quyền bảng, EXECUTE hàm, `rwU` sequence. Lệnh GRANT trong repo chỉ CỘNG thêm, không thu hồi mặc định nền tảng | Cao | P1 patch 011 |
| R5 | Cột `trades` | Snapshot 14 cột | 18 cột = snapshot + 4 cột `legacy/supabase_patch_enhancements.sql`; thứ tự cột khác (cột thêm sau bằng ALTER) | Không drift chức năng | - (TEST project phải áp legacy theo README) |
| R6 | Cột `accounts`, `user_preferences` | Snapshot | Khớp tên/kiểu/default; thứ tự cột khác | Không drift | - |
| R7 | Policy public | Snapshot | Khớp 27/27; UPDATE không WITH CHECK; prefs không DELETE | Khớp (lỗ có sẵn trong repo) | P1 patch 010 (WITH CHECK + composite FK), 011 (DELETE prefs) |
| R8 | Policy storage + bucket | Snapshot: public=true, INSERT chỉ kiểm role | Khớp; thêm: không `file_size_limit`, không `allowed_mime_types` | Khớp (lỗ có sẵn) | P1 patch 012 (tiền tố), 013 (private) |
| R9 | `risk_amount` | Legacy backfill `COALESCE(risk_amount, 500)` | 104/131 = 500, 0 null | Dữ liệu bẩn | P3 patch 030/031 (cờ ước tính). **Không tính lại lịch sử.** |
| R10 | `screenshot_path` | Chưa có | Chưa có | Như kỳ vọng | P1 patch 012 |

Điều kiện BLOCKED trong plan P0 ("`trades`/`accounts` lệch cột so với snapshot") **không xảy ra**: không thiếu cột nào.

## 3. Drift: PROD vs tài liệu `process/context/all-context.md` (P2 sửa, nhóm C1)

| Tài liệu khẳng định | Thực tế PROD |
|---|---|
| `anon` chỉ SELECT; `authenticated` CRUD theo RLS | `anon` và `authenticated` đều có đủ 7 quyền |
| `ALTER DEFAULT PRIVILEGES` bảo đảm bảng mới có quyền đúng | Default ACL cấp toàn quyền cho `anon` |
| `accounts` có `current_balance` | Không có cột này (7 cột) |
| `trades` lưu `direction`, giá entry/exit | Không có các cột này |
| `user_preferences` có layout preferences, notification thresholds | Không có cột tương ứng |
| "Enterprise-grade security" / October 30 compliance | Xem R2-R4, R7-R8 |

## 4. Giới hạn phủ của probe (known-gap)

- Cột của `daily_reviews`, `notifications`, `periodic_reviews`, `playbooks` không được chụp (B1 chỉ yêu cầu 3 bảng).
- Không chụp: constraint (PK/FK/UNIQUE/CHECK, vd `user_preferences.user_id UNIQUE`, `daily_reviews UNIQUE(user_id,date)`), index (không xác minh được `legacy/supabase_scale_indexes.sql` đã áp), trigger, hàm khác trong `public`, sự tồn tại `schema_migrations`.
- P1 probe `10_p1_pre_checks.sql` / `11_p1_grants_matrix.sql` nên bổ sung các mục trên trước khi viết 010 (đặc biệt constraint của `accounts` cho composite FK).
