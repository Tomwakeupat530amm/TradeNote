#!/usr/bin/env node
// ai_quota_prod_check.mjs - kiểm hạn mức AI Coach (patch 020) trên PROD bằng 2 user throwaway (Phase 02, A2).
//
// Vì sao có script này: harness chính thức (rls_two_user_harness.mjs) từ chối URL production và chưa có
// project TEST (GAP10). Script này làm theo quy trình P1: signup 2 user throwaway, xác nhận email bằng SQL,
// chạy kịch bản, rồi XÓA user (cascade) và assert không còn dòng ai_coach_usage nào của họ.
//
// CHỈ chạy SAU KHI patch 020 đã áp trên PROD. Không sửa schema, không đụng dữ liệu user thật.
//
// Biến môi trường (KHÔNG ghi secret ra file/log; mật khẩu user throwaway sinh lúc chạy):
//   PROD_DB_URL                     chuỗi kết nối Postgres (role có quyền trên auth.users, như P1)
//   NEXT_PUBLIC_SUPABASE_URL        URL project (hoặc lấy từ .env.local)
//   NEXT_PUBLIC_SUPABASE_ANON_KEY   anon key (hoặc lấy từ .env.local) - KHÔNG dùng service_role
//   PG_MODULE_PATH                  (tùy chọn) đường dẫn tới package `pg` ngoài app (app không cài pg)
//
// Cờ:
//   --confirm-prod   BẮT BUỘC; thiếu cờ -> không làm gì (exit 2)
//   --out <path>     ghi kết quả đã che secret ra file
//
// Kịch bản (mỗi dòng: PASS|FAIL <tên> - OK|VULNERABLE|INCONCLUSIVE (<chi tiết>)):
//   ai-quota-atomic   2 phiên song song của user A gọi consume_ai_quota quá hạn mức: đúng `limit` lần
//                     allowed=true, lần bị chặn có retry_after > 0, bộ đếm trong DB = limit
//   ai-quota-foreign  A, B, anon không SELECT được bảng; B không INSERT dòng của A; A không UPDATE bộ đếm;
//                     anon gọi RPC bị từ chối
//   ai-quota-cleanup  sau khi xóa 2 user: 0 dòng auth.users và 0 dòng ai_coach_usage của họ
// Rate limit email khi signup = INCONCLUSIVE (không bao giờ tính pass).
// Exit: 0 mọi kịch bản OK; 1 có VULNERABLE; 3 có INCONCLUSIVE/SKIPPED (không tính pass); 2 từ chối chạy.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm-prod');
const outIdx = args.indexOf('--out');
const OUT_PATH = outIdx >= 0 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : null;

const QUOTA_TEST_LIMIT = 3;
const QUOTA_TEST_CALLS = 8;

// ---------------------------------------------------------------- env + output

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const fileEnv = parseEnvFile(path.join(APP_DIR, '.env.local'));
const DB_URL = process.env.PROD_DB_URL || '';
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL || '';
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const secrets = [DB_URL, SB_ANON];
function redact(text) {
  let s = String(text);
  for (const sec of secrets) if (sec && sec.length >= 6) s = s.split(sec).join('[REDACTED]');
  return s.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgres://[REDACTED]').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[JWT]');
}

const lines = [];
function log(line = '') {
  const safe = redact(line);
  lines.push(safe);
  console.log(safe);
}
function flush() {
  if (!OUT_PATH) return;
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
}
function errText(error) {
  if (!error) return '';
  const code = error.code ? `[${error.code}] ` : '';
  return redact(`${code}${error.message || String(error)}`).slice(0, 200);
}

const results = [];
async function scenario(name, fn) {
  let status;
  let detail;
  try {
    ({ status, detail } = await fn());
  } catch (e) {
    status = 'INCONCLUSIVE';
    detail = `lỗi khi chạy: ${errText(e)}`;
  }
  const pass = status === 'OK';
  results.push({ name, status, pass });
  log(`${pass ? 'PASS' : 'FAIL'} ${name} - ${status}${detail ? ` (${detail})` : ''}`);
}

// ---------------------------------------------------------------- quota checks
// Cùng logic với scripts/rls_two_user_harness.mjs (giữ đồng bộ nếu sửa).

function pickQuotaWindow() {
  for (let i = 0; i < 50; i++) {
    const w = 3600 + Math.floor(Math.random() * (86400 - 3600));
    const now = Date.now() / 1000;
    const remaining = Math.floor(now / w) * w + w - now;
    if (remaining >= 120) return w;
  }
  return 86400;
}

async function quotaAtomicCheck(clients, db, userId) {
  const w = pickQuotaWindow();
  const calls = [];
  for (let i = 0; i < QUOTA_TEST_CALLS; i++) {
    const c = clients[i % clients.length];
    calls.push(c.rpc('consume_ai_quota', { p_limit: QUOTA_TEST_LIMIT, p_window_seconds: w }));
  }
  const res = await Promise.all(calls);
  const errs = res.filter((r) => r.error);
  if (errs.length > 0) {
    return { status: 'INCONCLUSIVE', detail: `${errs.length} lần gọi RPC lỗi (020 đã áp?): ${errText(errs[0].error)}` };
  }
  const rows = res.map((r) => (Array.isArray(r.data) ? r.data[0] : undefined));
  if (rows.some((row) => !row || typeof row.allowed !== 'boolean')) {
    return { status: 'INCONCLUSIVE', detail: 'RPC trả kết quả không đúng dạng table(allowed, retry_after)' };
  }
  const allowed = rows.filter((row) => row.allowed).length;
  const blocked = rows.filter((row) => !row.allowed);
  const badRetry = blocked.filter((row) => !(Number(row.retry_after) > 0)).length;
  const { rows: dbRows } = await db.query(
    `select coalesce(sum(count), 0)::int as total, count(*)::int as n
       from public.ai_coach_usage
      where user_id = $1
        and window_start = to_timestamp(floor(extract(epoch from now()) / $2) * $2)`,
    [userId, w],
  );
  const dbTotal = dbRows[0] ? dbRows[0].total : -1;
  const detail = `window ${w}s, ${QUOTA_TEST_CALLS} lần gọi song song trên ${clients.length} phiên, limit ${QUOTA_TEST_LIMIT}: allowed=${allowed}, blocked=${blocked.length}, retry_after<=0: ${badRetry}, bộ đếm DB=${dbTotal}`;
  if (allowed > QUOTA_TEST_LIMIT || dbTotal > QUOTA_TEST_LIMIT) return { status: 'VULNERABLE', detail: `vượt hạn mức - ${detail}` };
  if (allowed < QUOTA_TEST_LIMIT) return { status: 'INCONCLUSIVE', detail: `ít hơn hạn mức - ${detail}` };
  if (badRetry > 0) return { status: 'VULNERABLE', detail: `lần bị chặn thiếu retry_after - ${detail}` };
  if (dbTotal !== QUOTA_TEST_LIMIT) return { status: 'INCONCLUSIVE', detail: `bộ đếm DB khác limit - ${detail}` };
  return { status: 'OK', detail };
}

async function quotaForeignCheck({ A, B, anon, aId }) {
  const problems = [];
  for (const [label, client] of [['A', A], ['B', B], ['anon', anon]]) {
    const { data, error } = await client.from('ai_coach_usage').select('*').limit(1);
    if (!error) problems.push(`${label} SELECT trực tiếp được (${data ? data.length : 0} dòng)`);
  }
  {
    const { error } = await B.from('ai_coach_usage').insert({ user_id: aId, window_start: new Date().toISOString(), count: 0 });
    if (!error) problems.push('B INSERT trực tiếp được dòng của A');
  }
  {
    const { error } = await A.from('ai_coach_usage').update({ count: 0 }).eq('user_id', aId).select('user_id');
    if (!error) problems.push('A UPDATE trực tiếp được (đặt lại bộ đếm)');
  }
  {
    const { error } = await anon.rpc('consume_ai_quota', { p_limit: 5, p_window_seconds: 600 });
    if (!error) problems.push('anon gọi được consume_ai_quota');
  }
  if (problems.length > 0) return { status: 'VULNERABLE', detail: problems.join('; ') };
  return { status: 'OK', detail: 'bảng ai_coach_usage bị từ chối truy cập trực tiếp (A, B, anon); anon gọi RPC bị từ chối' };
}

// ---------------------------------------------------------------- main

async function loadPg() {
  const spec = process.env.PG_MODULE_PATH;
  const target = spec ? pathToFileURL(path.resolve(spec, fs.existsSync(path.join(spec, 'lib', 'index.js')) ? 'lib/index.js' : '')).href : 'pg';
  const mod = await import(target);
  return mod.default ?? mod;
}

function mkClient() {
  return createClient(SB_URL, SB_ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function main() {
  log(`# ai_quota_prod_check - ${new Date().toISOString()}`);
  if (!CONFIRM) {
    log('REFUSED - thiếu cờ --confirm-prod. Script này chạy trên PROD (tạo rồi xóa 2 user throwaway).');
    return 2;
  }
  const missing = [];
  if (!DB_URL) missing.push('PROD_DB_URL');
  if (!SB_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!SB_ANON) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (missing.length > 0) {
    log(`SKIPPED - thiếu biến: ${missing.join(', ')} (SKIPPED không tính pass)`);
    return 3;
  }

  let pg;
  try {
    pg = await loadPg();
  } catch (e) {
    log(`SKIPPED - không tải được package pg (đặt PG_MODULE_PATH tới pg ngoài app): ${errText(e)}`);
    return 3;
  }
  const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  log(`# project host: ${new URL(SB_URL).host}`);

  const tag = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const users = [
    { label: 'A', email: `tn-ai-quota-${tag}-a@mailinator.com`, password: crypto.randomBytes(18).toString('base64url') },
    { label: 'B', email: `tn-ai-quota-${tag}-b@mailinator.com`, password: crypto.randomBytes(18).toString('base64url') },
  ];
  for (const u of users) secrets.push(u.password);
  const createdIds = [];

  try {
    for (const u of users) {
      const c = mkClient();
      const { data, error } = await c.auth.signUp({ email: u.email, password: u.password });
      if (error) {
        const rate = /rate limit|too many|429/i.test(`${error.message} ${error.status}`);
        log(`# signup ${u.label} lỗi${rate ? ' (rate limit email)' : ''}: ${errText(error)}`);
        results.push({ name: 'signup', status: 'INCONCLUSIVE', pass: false });
        return 3;
      }
      if (!data.user || !data.user.id) {
        log(`# signup ${u.label}: không có user id (email đã tồn tại?) - INCONCLUSIVE`);
        results.push({ name: 'signup', status: 'INCONCLUSIVE', pass: false });
        return 3;
      }
      u.id = data.user.id;
      createdIds.push(u.id);
      await db.query('update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1', [u.id]);
    }
    log('# signup + xác nhận email bằng SQL (2 user throwaway): OK');

    const signIn = async (u) => {
      const c = mkClient();
      const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
      if (error) throw new Error(`đăng nhập ${u.label} thất bại: ${errText(error)}`);
      return c;
    };
    const A = await signIn(users[0]);
    const A2 = await signIn(users[0]);
    const B = await signIn(users[1]);
    const anon = mkClient();

    await scenario('ai-quota-atomic', () => quotaAtomicCheck([A, A2], db, users[0].id));
    await scenario('ai-quota-foreign', () => quotaForeignCheck({ A, B, anon, aId: users[0].id }));
  } finally {
    if (createdIds.length > 0) {
      await scenario('ai-quota-cleanup', async () => {
        await db.query('delete from auth.users where id = any($1::uuid[])', [createdIds]);
        const { rows: u } = await db.query('select count(*)::int as n from auth.users where id = any($1::uuid[])', [createdIds]);
        const { rows: q } = await db.query('select count(*)::int as n from public.ai_coach_usage where user_id = any($1::uuid[])', [createdIds]);
        const detail = `auth.users còn ${u[0].n}, ai_coach_usage còn ${q[0].n} (sau khi xóa ${createdIds.length} user)`;
        return { status: u[0].n === 0 && q[0].n === 0 ? 'OK' : 'VULNERABLE', detail };
      });
    }
    await db.end().catch(() => undefined);
  }

  const failed = results.filter((r) => !r.pass);
  log(`TOTAL: ${results.length} | PASS: ${results.length - failed.length} | FAIL: ${failed.length}`);
  if (failed.some((r) => r.status === 'VULNERABLE')) return 1;
  return failed.length > 0 ? 3 : 0;
}

main()
  .then((code) => {
    flush();
    process.exit(code);
  })
  .catch((e) => {
    log(`ERROR - ${errText(e)}`);
    flush();
    process.exit(1);
  });
