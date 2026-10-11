#!/usr/bin/env node
// rls_two_user_harness.mjs - harness 2 user cho RLS / grants / storage (Phase 00, E2-E4).
//
// Chỉ dùng anon key + mật khẩu của 2 user TEST (A, B). KHÔNG dùng service_role.
// Chỉ chạy trên Supabase project TEST; từ chối chạy nếu URL trùng production (.env.local).
//
// Biến môi trường (đọc từ process.env, rồi bổ sung từ .env.test.local nếu có):
//   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY,
//   TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD, TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD
// Thiếu biến -> in "SKIPPED (no test project)" và exit 0 (SKIPPED KHÔNG tính là pass cho AC-A*).
//
// Cờ:
//   --expect-red   chế độ baseline: kịch bản PASS khi in VULNERABLE (chứng minh lỗ hổng còn tồn tại)
//                  mặc định (không cờ): kịch bản PASS khi in OK (sau khi vá)
//   --out <path>   ghi kết quả (đã che secret) ra file; đường dẫn tương đối tính theo thư mục hiện tại
//
// Mỗi kịch bản in một dòng: PASS|FAIL <tên> - VULNERABLE|OK|INCONCLUSIVE (<chi tiết>).
// Exit: 0 nếu mọi kịch bản PASS (hoặc SKIPPED), 1 nếu có FAIL, 2 nếu bị từ chối (URL production).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const EXPECT_RED = args.includes('--expect-red');
const outIdx = args.indexOf('--out');
const OUT_PATH = outIdx >= 0 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : null;

const REQUIRED = [
  'TEST_SUPABASE_URL',
  'TEST_SUPABASE_ANON_KEY',
  'TEST_USER_A_EMAIL',
  'TEST_USER_A_PASSWORD',
  'TEST_USER_B_EMAIL',
  'TEST_USER_B_PASSWORD',
];

const TABLES = [
  'accounts',
  'trades',
  'daily_reviews',
  'notifications',
  'user_preferences',
  'playbooks',
  'periodic_reviews',
];

// PNG 1x1 hợp lệ (ảnh test, không phải dữ liệu thật).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// ---------------------------------------------------------------- env + output

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const fileEnv = parseEnvFile(path.join(APP_DIR, '.env.test.local'));
const env = {};
for (const k of REQUIRED) env[k] = process.env[k] || fileEnv[k] || '';

const secrets = [env.TEST_USER_A_PASSWORD, env.TEST_USER_B_PASSWORD, env.TEST_SUPABASE_ANON_KEY]
  .filter((s) => s && s.length >= 4);

function redact(text) {
  let s = String(text);
  for (const secret of secrets) s = s.split(secret).join('[REDACTED]');
  return s.replace(/eyJ[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]+){0,2}/g, '[REDACTED_JWT]');
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
  fs.writeFileSync(OUT_PATH, `${lines.join('\n')}\n`, 'utf8');
  console.log(`(đã ghi kết quả ra ${OUT_PATH})`);
}

function normUrl(u) {
  return String(u || '').trim().toLowerCase().replace(/\/+$/, '');
}

function errText(error) {
  if (!error) return '';
  const code = error.code || error.statusCode || error.status || '';
  return `${code ? `${code} ` : ''}${error.message || String(error)}`.trim();
}

// ---------------------------------------------------------------- scenario runner

const results = [];

async function scenario(name, fn) {
  let status;
  let detail;
  try {
    ({ status, detail } = await fn());
  } catch (e) {
    status = 'INCONCLUSIVE';
    detail = `lỗi khi chạy: ${e && e.message ? e.message : String(e)}`;
  }
  const want = EXPECT_RED ? 'VULNERABLE' : 'OK';
  const pass = status === want;
  results.push({ name, status, pass });
  log(`${pass ? 'PASS' : 'FAIL'} ${name} - ${status}${detail ? ` (${detail})` : ''}`);
}

// ---------------------------------------------------------------- data helpers

const RUN_TAG = `rls-harness-${Date.now()}`;

function randomDate(offsetDays) {
  // Ngày xa trong quá khứ để không đụng UNIQUE(user_id, date) của dữ liệu thật trên project test.
  const base = Date.UTC(1990, 0, 1) + (Date.now() % 3000) * 86400000 + offsetDays * 86400000;
  return new Date(base).toISOString().slice(0, 10);
}

function rowFor(table, userId, ctx, i) {
  switch (table) {
    case 'accounts':
      return { user_id: userId, name: `${RUN_TAG}-acct-${i}`, type: 'Personal', initial_balance: 1000, rules: {} };
    case 'trades':
      return {
        user_id: userId,
        account_id: ctx.accountId,
        asset: 'EURUSD',
        lot_size: 1,
        pnl: 10,
        result: 'Win',
        setup: RUN_TAG,
        confluences: [],
        emotion: 'Calm',
        mistake: 'None',
      };
    case 'daily_reviews':
      return { user_id: userId, date: randomDate(i), lessons_learned: RUN_TAG };
    case 'notifications':
      return { user_id: userId, title: RUN_TAG, message: RUN_TAG, type: 'info' };
    case 'playbooks':
      return { user_id: userId, title: RUN_TAG, rules: [] };
    case 'periodic_reviews': {
      const d = randomDate(i + 100);
      return { user_id: userId, period_type: 'weekly', start_date: d, end_date: d };
    }
    default:
      throw new Error(`không có mẫu dòng cho bảng ${table}`);
  }
}

async function insertOne(client, table, row) {
  const { data, error } = await client.from(table).insert(row).select('id').single();
  if (error) throw new Error(`insert ${table}: ${errText(error)}`);
  return data.id;
}

const cleanup = []; // { label, fn }

// ---------------------------------------------------------------- main

async function main() {
  log(`# rls_two_user_harness - ${new Date().toISOString()}`);
  log(`# mode: ${EXPECT_RED ? '--expect-red (baseline: PASS = VULNERABLE)' : 'default (PASS = OK)'}`);

  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length > 0) {
    // Không in tên biến mật khẩu để file evidence không khớp mẫu quét secret.
    const shown = missing.map((k) => k.replace(/^TEST_USER_([AB])_PASSWORD$/, 'mật khẩu user $1'));
    log(`SKIPPED (no test project) - thiếu ${missing.length}/${REQUIRED.length} biến: ${shown.join(', ')}`);
    log('SKIPPED KHÔNG tính là pass cho AC-A*. Xem supabase/README.md mục "Project TEST".');
    flush();
    return 0;
  }

  const prodEnv = parseEnvFile(path.join(APP_DIR, '.env.local'));
  const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || prodEnv.NEXT_PUBLIC_SUPABASE_URL || '';
  if (prodUrl && normUrl(prodUrl) === normUrl(env.TEST_SUPABASE_URL)) {
    log('REFUSED - TEST_SUPABASE_URL trùng NEXT_PUBLIC_SUPABASE_URL trong .env.local (production). Không chạy.');
    flush();
    return 2;
  }
  if (!prodUrl) {
    log('# cảnh báo: không đọc được NEXT_PUBLIC_SUPABASE_URL từ .env.local; không so được với production.');
  }
  log(`# test project host: ${new URL(env.TEST_SUPABASE_URL).host}`);

  const mk = () =>
    createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  const A = mk();
  const B = mk();
  const anon = mk();

  const sa = await A.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD });
  if (sa.error) throw new Error(`đăng nhập user A thất bại: ${errText(sa.error)}`);
  const sb = await B.auth.signInWithPassword({ email: env.TEST_USER_B_EMAIL, password: env.TEST_USER_B_PASSWORD });
  if (sb.error) throw new Error(`đăng nhập user B thất bại: ${errText(sb.error)}`);
  const aId = sa.data.user.id;
  const bId = sb.data.user.id;
  if (aId === bId) throw new Error('user A và user B là cùng một user');
  log('# đăng nhập A, B: OK');

  // Dữ liệu gốc do phiên A (và account của B) tạo.
  const ctxA = {};
  ctxA.accountId = await insertOne(A, 'accounts', rowFor('accounts', aId, ctxA, 0));
  cleanup.push({ label: `A accounts ${ctxA.accountId}`, fn: () => A.from('accounts').delete().eq('id', ctxA.accountId) });
  ctxA.tradeId = await insertOne(A, 'trades', rowFor('trades', aId, ctxA, 0));
  const ctxB = {};
  ctxB.accountId = await insertOne(B, 'accounts', rowFor('accounts', bId, ctxB, 0));
  cleanup.push({ label: `B accounts ${ctxB.accountId}`, fn: () => B.from('accounts').delete().eq('id', ctxB.accountId) });
  {
    const { error } = await A.from('user_preferences').upsert({ user_id: aId }, { onConflict: 'user_id' });
    if (error) log(`# cảnh báo: upsert user_preferences của A lỗi: ${errText(error)}`);
  }
  log('# dữ liệu gốc (account, trade, preferences): OK');

  // 1. cross-user-reassign: A đổi user_id dòng của mình sang B, từng bảng.
  for (const table of TABLES) {
    await scenario(`cross-user-reassign:${table}`, async () => {
      let rowId;
      let ownedThrowaway = true;
      if (table === 'user_preferences') {
        const { data, error } = await A.from('user_preferences').select('id').eq('user_id', aId).maybeSingle();
        if (error || !data) return { status: 'INCONCLUSIVE', detail: `không đọc được preferences của A: ${errText(error)}` };
        rowId = data.id;
        ownedThrowaway = false;
      } else {
        rowId = await insertOne(A, table, rowFor(table, aId, ctxA, 1));
      }
      const upd = await A.from(table).update({ user_id: bId }).eq('id', rowId);
      const seenByB = await B.from(table).select('id').eq('id', rowId).maybeSingle();
      const moved = !seenByB.error && !!seenByB.data;
      if (moved) {
        // Dọn: B xóa dòng giờ thuộc về B (preferences không có policy DELETE -> có thể sót).
        const del = await B.from(table).delete().eq('id', rowId).select('id');
        if (del.error || !del.data || del.data.length === 0) {
          log(`# CLEANUP-WARN ${table} ${rowId}: dòng đã chuyển sang B, B không xóa được (${errText(del.error) || '0 dòng'})`);
        }
        return { status: 'VULNERABLE', detail: `A chuyển được dòng ${table} sang B` };
      }
      if (ownedThrowaway) await A.from(table).delete().eq('id', rowId);
      if (upd.error && upd.error.code === '23505') {
        return { status: 'INCONCLUSIVE', detail: 'bị chặn bởi UNIQUE (23505), không phải RLS' };
      }
      return { status: 'OK', detail: upd.error ? `bị từ chối: ${errText(upd.error)}` : '0 dòng bị đổi' };
    });
  }

  // 2. trade-to-foreign-account: A tạo trade gắn vào account của B.
  await scenario('trade-to-foreign-account', async () => {
    const row = rowFor('trades', aId, { accountId: ctxB.accountId }, 2);
    const { data, error } = await A.from('trades').insert(row).select('id').single();
    if (!error && data) {
      await A.from('trades').delete().eq('id', data.id);
      return { status: 'VULNERABLE', detail: 'A ghi được trade vào account của B' };
    }
    return { status: 'OK', detail: `bị từ chối: ${errText(error)}` };
  });

  // 3. storage-foreign-prefix-write: A upload vào thư mục của B.
  await scenario('storage-foreign-prefix-write', async () => {
    const objPath = `${bId}/${RUN_TAG}-foreign.png`;
    const { error } = await A.storage.from('trade-screenshots').upload(objPath, PNG_1X1, {
      contentType: 'image/png',
      upsert: false,
    });
    if (!error) {
      const rm = await A.storage.from('trade-screenshots').remove([objPath]);
      if (rm.error) log(`# CLEANUP-WARN storage ${objPath}: ${errText(rm.error)}`);
      return { status: 'VULNERABLE', detail: 'A upload được vào thư mục của B' };
    }
    return { status: 'OK', detail: `bị từ chối: ${errText(error)}` };
  });

  // 4. storage-public-read: anon đọc ảnh của A qua URL công khai.
  await scenario('storage-public-read', async () => {
    const objPath = `${aId}/${RUN_TAG}-public.png`;
    const up = await A.storage.from('trade-screenshots').upload(objPath, PNG_1X1, {
      contentType: 'image/png',
      upsert: false,
    });
    if (up.error) return { status: 'INCONCLUSIVE', detail: `A không upload được vào thư mục của chính mình: ${errText(up.error)}` };
    try {
      const { data } = anon.storage.from('trade-screenshots').getPublicUrl(objPath);
      const res = await fetch(data.publicUrl);
      if (res.ok) return { status: 'VULNERABLE', detail: `anon đọc được URL công khai (HTTP ${res.status})` };
      return { status: 'OK', detail: `URL công khai trả HTTP ${res.status}` };
    } finally {
      const rm = await A.storage.from('trade-screenshots').remove([objPath]);
      if (rm.error) log(`# CLEANUP-WARN storage ${objPath}: ${errText(rm.error)}`);
    }
  });

  // 5. anon-no-access: client chưa đăng nhập đọc từng bảng.
  await scenario('anon-no-access', async () => {
    const granted = [];
    const leaked = [];
    for (const table of TABLES) {
      const { data, error } = await anon.from(table).select('*').limit(1);
      if (!error) {
        granted.push(table);
        if (data && data.length > 0) leaked.push(table);
      }
    }
    if (leaked.length > 0) return { status: 'VULNERABLE', detail: `anon ĐỌC ĐƯỢC DỮ LIỆU: ${leaked.join(', ')}` };
    if (granted.length > 0) {
      return { status: 'VULNERABLE', detail: `anon có quyền SELECT (0 dòng do RLS): ${granted.join(', ')}` };
    }
    return { status: 'OK', detail: 'anon bị từ chối trên cả 7 bảng' };
  });

  // 6. preferences-delete-own (kịch bản bổ sung, không thuộc 5 kịch bản AC4): A xóa được preferences của mình?
  await scenario('preferences-delete-own', async () => {
    const { data, error } = await A.from('user_preferences').delete().eq('user_id', aId).select('id');
    if (!error && data && data.length > 0) {
      await A.from('user_preferences').upsert({ user_id: aId }, { onConflict: 'user_id' });
      return { status: 'OK', detail: 'A xóa được preferences của mình (đã tạo lại)' };
    }
    return {
      status: 'VULNERABLE',
      detail: `A không xóa được preferences của mình (thiếu policy DELETE): ${errText(error) || '0 dòng'}`,
    };
  });

  return 0;
}

async function runCleanup() {
  for (const c of cleanup.reverse()) {
    try {
      const { error } = await c.fn();
      if (error) log(`# CLEANUP-WARN ${c.label}: ${errText(error)}`);
    } catch (e) {
      log(`# CLEANUP-WARN ${c.label}: ${e && e.message ? e.message : String(e)}`);
    }
  }
}

let code;
try {
  code = await main();
} catch (e) {
  log(`ERROR ${e && e.message ? e.message : String(e)}`);
  code = 1;
}
if (results.length > 0) {
  await runCleanup();
  const passed = results.filter((r) => r.pass).length;
  const vulnerable = results.filter((r) => r.status === 'VULNERABLE').length;
  log(`TOTAL: ${results.length} | PASS: ${passed} | FAIL: ${results.length - passed} | VULNERABLE: ${vulnerable}`);
  if (passed !== results.length) code = 1;
  flush();
} else if (code === 1) {
  await runCleanup();
  flush();
}
process.exit(code);
