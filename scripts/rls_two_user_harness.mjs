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
//   --stage <s>    giai đoạn patch trên project TEST (Phase 01): pre-012 | after-012 | after-013 (mặc định).
//                  Kỳ vọng theo giai đoạn: storage-public-read và avatar-foreign-prefix-write là VULNERABLE
//                  CHỦ ĐÍCH trước 013 (bucket còn public / INSERT avatars chưa siết); kịch bản gắn
//                  "-after-012"/"-after-013" chỉ chạy từ giai đoạn đó (ngược lại in NOT-RUN, không tính pass).
//                  --expect-red bỏ qua --stage (baseline DB cũ) và không chạy kịch bản gắn giai đoạn.
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
const STAGES = ['pre-012', 'after-012', 'after-013'];
const stageIdx = args.indexOf('--stage');
const STAGE = stageIdx >= 0 && args[stageIdx + 1] ? args[stageIdx + 1] : 'after-013';
if (!STAGES.includes(STAGE)) {
  console.error(`--stage không hợp lệ: ${STAGE} (cần ${STAGES.join(' | ')})`);
  process.exit(2);
}
const stageAtLeast = (s) => !EXPECT_RED && STAGES.indexOf(STAGE) >= STAGES.indexOf(s);

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

// opts.want: trạng thái mong đợi riêng (ghi đè mặc định); opts.minStage: chỉ chạy từ giai đoạn này.
async function scenario(name, fn, opts = {}) {
  if (opts.minStage && !stageAtLeast(opts.minStage)) {
    results.push({ name, status: 'NOT-RUN', pass: false, notRun: true });
    log(`NOT-RUN ${name} - cần --stage ${opts.minStage} trở lên (không tính pass)`);
    return;
  }
  let status;
  let detail;
  try {
    ({ status, detail } = await fn());
  } catch (e) {
    status = 'INCONCLUSIVE';
    detail = `lỗi khi chạy: ${e && e.message ? e.message : String(e)}`;
  }
  const want = EXPECT_RED ? 'VULNERABLE' : opts.want || 'OK';
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
  log(`# mode: ${EXPECT_RED ? '--expect-red (baseline: PASS = VULNERABLE)' : `default (PASS = OK), stage ${STAGE}`}`);

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
    // Nhánh UPDATE: trade hợp lệ của A, đổi account_id sang account của B.
    const upd = await A.from('trades').update({ account_id: ctxB.accountId }).eq('id', ctxA.tradeId).select('id');
    if (!upd.error && upd.data && upd.data.length > 0) {
      await A.from('trades').update({ account_id: ctxA.accountId }).eq('id', ctxA.tradeId);
      return { status: 'VULNERABLE', detail: 'insert bị chặn nhưng A đổi được account_id sang account của B' };
    }
    return { status: 'OK', detail: `insert bị từ chối: ${errText(error)}; update: ${errText(upd.error) || '0 dòng'}` };
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
  }, { want: STAGE === 'after-013' ? 'OK' : 'VULNERABLE' }); // trước 013 bucket còn public: VULNERABLE là chủ đích

  // 4b. storage-foreign-authenticated-read: B (đã đăng nhập) tải trực tiếp object của A (bị từ chối từ 012).
  await scenario('storage-foreign-authenticated-read-after-012', async () => {
    const objPath = `${aId}/${RUN_TAG}-private.png`;
    const up = await A.storage.from('trade-screenshots').upload(objPath, PNG_1X1, { contentType: 'image/png', upsert: false });
    if (up.error) return { status: 'INCONCLUSIVE', detail: `A không upload được: ${errText(up.error)}` };
    try {
      const dl = await B.storage.from('trade-screenshots').download(objPath);
      if (!dl.error && dl.data) return { status: 'VULNERABLE', detail: 'B tải được object của A qua API có xác thực' };
      return { status: 'OK', detail: `bị từ chối: ${errText(dl.error)}` };
    } finally {
      const rm = await A.storage.from('trade-screenshots').remove([objPath]);
      if (rm.error) log(`# CLEANUP-WARN storage ${objPath}: ${errText(rm.error)}`);
    }
  }, { minStage: 'after-012' });

  // 4c. signed-url-create-own-after-012: A ký được file của mình; B ký file của A bị từ chối.
  await scenario('signed-url-create-own-after-012', async () => {
    const objPath = `${aId}/${RUN_TAG}-sign.png`;
    const up = await A.storage.from('trade-screenshots').upload(objPath, PNG_1X1, { contentType: 'image/png', upsert: false });
    if (up.error) return { status: 'INCONCLUSIVE', detail: `A không upload được: ${errText(up.error)}` };
    try {
      const own = await A.storage.from('trade-screenshots').createSignedUrls([objPath], 60);
      const ownUrl = own.data && own.data[0] && own.data[0].signedUrl;
      if (own.error || !ownUrl) return { status: 'VULNERABLE', detail: `A không ký được file của mình: ${errText(own.error) || (own.data && own.data[0] && own.data[0].error)}` };
      const ownRes = await fetch(ownUrl);
      if (!ownRes.ok) return { status: 'VULNERABLE', detail: `signed URL của A trả HTTP ${ownRes.status}` };
      const foreign = await B.storage.from('trade-screenshots').createSignedUrl(objPath, 60);
      if (!foreign.error && foreign.data && foreign.data.signedUrl) {
        return { status: 'VULNERABLE', detail: 'B tạo được signed URL cho file của A' };
      }
      return { status: 'OK', detail: `A ký OK (HTTP ${ownRes.status}); B bị từ chối: ${errText(foreign.error)}` };
    } finally {
      const rm = await A.storage.from('trade-screenshots').remove([objPath]);
      if (rm.error) log(`# CLEANUP-WARN storage ${objPath}: ${errText(rm.error)}`);
    }
  }, { minStage: 'after-012' });

  // 4d. signed-url-expiry: URL TTL 2 giây không dùng được sau khi hết hạn.
  await scenario('signed-url-expiry', async () => {
    const objPath = `${aId}/${RUN_TAG}-expiry.png`;
    const up = await A.storage.from('trade-screenshots').upload(objPath, PNG_1X1, { contentType: 'image/png', upsert: false });
    if (up.error) return { status: 'INCONCLUSIVE', detail: `A không upload được: ${errText(up.error)}` };
    try {
      const signed = await A.storage.from('trade-screenshots').createSignedUrl(objPath, 2);
      if (signed.error || !signed.data) return { status: 'INCONCLUSIVE', detail: `không ký được: ${errText(signed.error)}` };
      await new Promise((r) => setTimeout(r, 4000));
      const res = await fetch(signed.data.signedUrl);
      if (res.ok) return { status: 'VULNERABLE', detail: `signed URL còn dùng được sau khi hết hạn (HTTP ${res.status})` };
      return { status: 'OK', detail: `hết hạn -> HTTP ${res.status}` };
    } finally {
      const rm = await A.storage.from('trade-screenshots').remove([objPath]);
      if (rm.error) log(`# CLEANUP-WARN storage ${objPath}: ${errText(rm.error)}`);
    }
  }, { minStage: 'after-012' });

  // 4e. upload-upsert-own-after-013: upload upsert:true 2 lần vào thư mục của chính A (cần SELECT+UPDATE owner).
  await scenario('upload-upsert-own-after-013', async () => {
    const objPath = `${aId}/${RUN_TAG}-upsert.png`;
    try {
      for (const round of [1, 2]) {
        const up = await A.storage.from('trade-screenshots').upload(objPath, PNG_1X1, { contentType: 'image/png', upsert: true });
        if (up.error) return { status: 'VULNERABLE', detail: `upsert lần ${round} lỗi: ${errText(up.error)}` };
      }
      return { status: 'OK', detail: 'upsert 2 lần OK trên bucket private' };
    } finally {
      const rm = await A.storage.from('trade-screenshots').remove([objPath]);
      if (rm.error) log(`# CLEANUP-WARN storage ${objPath}: ${errText(rm.error)}`);
    }
  }, { minStage: 'after-013' });

  // 4f. avatar-upload-own-prefix: A upload avatar vào `${aId}/...`.
  await scenario('avatar-upload-own-prefix', async () => {
    const objPath = `${aId}/${RUN_TAG}-avatar.png`;
    const up = await A.storage.from('avatars').upload(objPath, PNG_1X1, { contentType: 'image/png', upsert: false });
    if (up.error) return { status: 'VULNERABLE', detail: `A không upload được avatar vào thư mục của mình: ${errText(up.error)}` };
    const rm = await A.storage.from('avatars').remove([objPath]);
    if (rm.error) log(`# CLEANUP-WARN avatars ${objPath}: ${errText(rm.error)}`);
    return { status: 'OK', detail: 'upload + xóa avatar của chính A OK' };
  });

  // 4g. avatar-foreign-prefix-write: A upload vào thư mục avatar của B (bị chặn từ 013).
  await scenario('avatar-foreign-prefix-write', async () => {
    const objPath = `${bId}/${RUN_TAG}-avatar-foreign.png`;
    const up = await A.storage.from('avatars').upload(objPath, PNG_1X1, { contentType: 'image/png', upsert: false });
    if (!up.error) {
      const rm = await A.storage.from('avatars').remove([objPath]);
      if (rm.error) log(`# CLEANUP-WARN avatars ${objPath}: ${errText(rm.error)}`);
      return { status: 'VULNERABLE', detail: 'A upload được vào thư mục avatar của B' };
    }
    return { status: 'OK', detail: `bị từ chối: ${errText(up.error)}` };
  }, { want: STAGE === 'after-013' ? 'OK' : 'VULNERABLE' }); // INSERT avatars chỉ siết ở 013

  // 4h. avatar-insert-new-prefix-after-013: chỉ dạng thư mục mới; dạng gốc cũ `${id}-x.png` bị từ chối.
  await scenario('avatar-insert-new-prefix-after-013', async () => {
    const legacy = `${aId}-${RUN_TAG}.png`;
    const up = await A.storage.from('avatars').upload(legacy, PNG_1X1, { contentType: 'image/png', upsert: false });
    if (!up.error) {
      const rm = await A.storage.from('avatars').remove([legacy]);
      if (rm.error) log(`# CLEANUP-WARN avatars ${legacy}: ${errText(rm.error)}`);
      return { status: 'VULNERABLE', detail: 'INSERT avatar dạng gốc cũ vẫn được chấp nhận' };
    }
    return { status: 'OK', detail: `dạng cũ bị từ chối: ${errText(up.error)}` };
  }, { minStage: 'after-013' });

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
    const wrote = [];
    for (const table of TABLES) {
      const row = table === 'user_preferences' ? { user_id: aId } : rowFor(table, aId, ctxA, 9);
      const { data, error } = await anon.from(table).insert(row).select('id');
      if (!error && data && data.length > 0) {
        wrote.push(table);
        await A.from(table).delete().eq('id', data[0].id);
      }
    }
    if (wrote.length > 0) return { status: 'VULNERABLE', detail: `anon GHI ĐƯỢC: ${wrote.join(', ')}` };
    return { status: 'OK', detail: 'anon bị từ chối đọc và ghi trên cả 7 bảng' };
  });

  // 5b. rpc-anon-denied: anon gọi get_account_stats.
  await scenario('rpc-anon-denied', async () => {
    const { error } = await anon.rpc('get_account_stats', { p_account_id: ctxA.accountId });
    if (!error) return { status: 'VULNERABLE', detail: 'anon gọi được get_account_stats' };
    return { status: 'OK', detail: `bị từ chối: ${errText(error)}` };
  });

  // 5c. rpc-foreign-account: B gọi với account của A -> rỗng (0 trade) hoặc lỗi.
  await scenario('rpc-foreign-account', async () => {
    const { data, error } = await B.rpc('get_account_stats', { p_account_id: ctxA.accountId });
    if (error) return { status: 'OK', detail: `bị từ chối: ${errText(error)}` };
    const n = data && typeof data === 'object' ? Number(data.total_trades || 0) : 0;
    if (n > 0) return { status: 'VULNERABLE', detail: `B thấy ${n} trade của A qua RPC` };
    return { status: 'OK', detail: 'B nhận 0 trade' };
  });

  // 5d. preferences-delete-foreign: A xóa preferences của B -> 0 dòng.
  await scenario('preferences-delete-foreign', async () => {
    const { error: upErr } = await B.from('user_preferences').upsert({ user_id: bId }, { onConflict: 'user_id' });
    if (upErr) return { status: 'INCONCLUSIVE', detail: `không tạo được preferences của B: ${errText(upErr)}` };
    const { data, error } = await A.from('user_preferences').delete().eq('user_id', bId).select('id');
    if (!error && data && data.length > 0) {
      await B.from('user_preferences').upsert({ user_id: bId }, { onConflict: 'user_id' });
      return { status: 'VULNERABLE', detail: 'A xóa được preferences của B' };
    }
    return { status: 'OK', detail: error ? `bị từ chối: ${errText(error)}` : '0 dòng' };
  });

  // 7. ai-quota-atomic (P2, patch 020): 2 phiên song song của A gọi consume_ai_quota vượt hạn mức;
  //    đúng `limit` lần allowed=true, lần bị chặn có retry_after > 0. Không chạy ở --expect-red (DB cũ chưa có RPC).
  await scenario('ai-quota-atomic', async () => {
    const A2 = mk();
    const s2 = await A2.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD });
    if (s2.error) return { status: 'INCONCLUSIVE', detail: `không mở được phiên thứ 2 của A: ${errText(s2.error)}` };
    return quotaAtomicCheck([A, A2]);
  }, { minStage: 'pre-012' });

  // 8. ai-quota-foreign (P2): truy cập trực tiếp bảng ai_coach_usage bị từ chối (A, B), anon gọi RPC bị từ chối.
  await scenario('ai-quota-foreign', async () => quotaForeignCheck({ A, B, anon, aId }), { minStage: 'pre-012' });

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

// ---------------------------------------------------------------- AI quota (P2, patch 020)
// Cùng logic với scripts/ai_quota_prod_check.mjs (giữ đồng bộ nếu sửa).

const QUOTA_TEST_LIMIT = 3;
const QUOTA_TEST_CALLS = 8;

// Chọn cửa sổ lạ (giây) để không đụng bộ đếm của lần chạy trước; còn >= 120 s trong cửa sổ.
function pickQuotaWindow() {
  for (let i = 0; i < 50; i++) {
    const w = 3600 + Math.floor(Math.random() * (86400 - 3600));
    const now = Date.now() / 1000;
    const remaining = Math.floor(now / w) * w + w - now;
    if (remaining >= 120) return w;
  }
  return 86400;
}

async function quotaAtomicCheck(clients) {
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
  const detail = `window ${w}s, ${QUOTA_TEST_CALLS} lần gọi song song trên ${clients.length} phiên, limit ${QUOTA_TEST_LIMIT}: allowed=${allowed}, blocked=${blocked.length}, retry_after<=0: ${badRetry}`;
  if (allowed > QUOTA_TEST_LIMIT) return { status: 'VULNERABLE', detail: `vượt hạn mức - ${detail}` };
  if (allowed < QUOTA_TEST_LIMIT) return { status: 'INCONCLUSIVE', detail: `ít hơn hạn mức (cửa sổ đã có bộ đếm cũ?) - ${detail}` };
  if (badRetry > 0) return { status: 'VULNERABLE', detail: `lần bị chặn thiếu retry_after - ${detail}` };
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
  const ran = results.filter((r) => !r.notRun);
  const passed = ran.filter((r) => r.pass).length;
  const vulnerable = ran.filter((r) => r.status === 'VULNERABLE').length;
  const notRun = results.length - ran.length;
  log(`TOTAL: ${ran.length} | PASS: ${passed} | FAIL: ${ran.length - passed} | VULNERABLE: ${vulnerable} | NOT-RUN: ${notRun}`);
  if (passed !== ran.length) code = 1;
  flush();
} else if (code === 1) {
  await runCleanup();
  flush();
}
process.exit(code);
