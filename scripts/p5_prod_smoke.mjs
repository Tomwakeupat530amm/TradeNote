#!/usr/bin/env node
// p5_prod_smoke.mjs - kịch bản smoke Hard Stop server (Phase 05, E7/E7b/E18) trên PROD bằng user thử cô lập.
//
// Dùng như THƯ VIỆN (p5_prod_apply.mjs import) và như CLI (EVL chạy lại, idempotent, tự dọn).
// Không có service_role / admin API (KG3): user thử tạo bằng SQL qua PROD_DB_URL; "phiên user" mô phỏng
// bằng SET LOCAL ROLE authenticated + request.jwt.claims (sub = uuid user thử); "bypass quản trị" = phiên
// owner không claims (auth.uid() IS NULL) hoặc SET LOCAL ROLE service_role.
//
// Chế độ an toàn:
//   - Bộ kịch bản 'trigger' / 'config' chạy TRONG MỘT giao dịch kết thúc bằng ROLLBACK (fixture tạo trong
//     giao dịch; mỗi kịch bản trong SAVEPOINT riêng rồi ROLLBACK TO SAVEPOINT) -> không để lại dữ liệu.
//   - 'concurrent' và 'signup' cần dữ liệu đã COMMIT: tạo user thử, chạy, xóa (cascade), rồi ĐẾM = 0.
//   - Không đụng hàng không thuộc user thử. Không in email/URL/secret (redact()).
//
// CLI:
//   PROD_DB_URL=... PG_MODULE_PATH=... node scripts/p5_prod_smoke.mjs --confirm-prod \
//       --suite trigger|config|concurrent|signup|all [--out <file>]
// Exit: 0 PASS; 1 FAIL; 2 từ chối chạy.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(APP_DIR, '..');
export const HARNESS_P5 = path.join(
  REPO_ROOT,
  'process/general-plans/active/hardening-security-data-integrity_11-10-26/harness/p5',
);
export const PROBE_EMAIL_DOMAIN = 'example.invalid';
export const PROBE_EMAIL_PREFIX = 'p5-probe-';

// ---------------------------------------------------------------- redact / log

export function makeLogger(outPath) {
  const DB_URL = process.env.PROD_DB_URL || '';
  const redact = (text) => {
    let s = String(text);
    if (DB_URL && DB_URL.length >= 6) s = s.split(DB_URL).join('[REDACTED]');
    return s
      .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgres://[REDACTED]')
      .replace(/password=[^\s'"]+/gi, 'password=[REDACTED]')
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[JWT]')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]');
  };
  const lines = [];
  const log = (line = '') => {
    const safe = redact(line);
    lines.push(safe);
    console.log(safe);
  };
  const flush = () => {
    if (!outPath) return;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  };
  const errText = (e) => redact(e && e.message ? e.message : String(e)).slice(0, 300);
  return { log, flush, redact, errText };
}

export async function loadPg() {
  const spec = process.env.PG_MODULE_PATH;
  if (!spec) throw new Error('thiếu PG_MODULE_PATH');
  const target = fs.existsSync(spec) && fs.statSync(spec).isDirectory()
    ? pathToFileURL(path.join(spec, 'lib', 'index.js')).href
    : pathToFileURL(path.resolve(spec)).href;
  const mod = await import(target);
  return mod.default || mod;
}

export async function connect(pg) {
  const db = new pg.Client({ connectionString: process.env.PROD_DB_URL });
  db.notices = [];
  db.on('notice', (n) => db.notices.push(n.message));
  // NOTICE/WARNING không phải lỗi; tránh pg in ra stderr
  await db.connect();
  return db;
}

export async function setTimeouts(db) {
  await db.query("SET LOCAL lock_timeout = '3s'");
  await db.query("SET LOCAL statement_timeout = '120s'");
}

// ---------------------------------------------------------------- user thử

export const uuid = () => crypto.randomUUID();

export async function hasPrefsTrigger(db) {
  const r = await db.query(
    "SELECT count(*)::int n FROM pg_trigger WHERE tgname = 'trg_user_preferences_ensure_row' AND NOT tgisinternal",
  );
  return r.rows[0].n > 0;
}

// Tạo user thử trong auth.users (không có admin API). Email ngẫu nhiên, KHÔNG in.
export async function createProbeUser(db, id = uuid()) {
  const email = `${PROBE_EMAIL_PREFIX}${id}@${PROBE_EMAIL_DOMAIN}`;
  await db.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at,
                             raw_app_meta_data, raw_user_meta_data)
     VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now(), now(),
             '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)`,
    [id, email],
  );
  return id;
}

export async function ensurePrefs(db, uid) {
  await db.query('INSERT INTO public.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [uid]);
}

export async function createAccount(db, uid, { name = 'p5-probe', balance = 10000, rules }) {
  const id = uuid();
  await db.query(
    'INSERT INTO public.accounts (id, user_id, name, type, initial_balance, rules) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
    [id, uid, name, 'Challenge', balance, JSON.stringify(rules)],
  );
  return id;
}

export async function createTrade(db, uid, acc, { pnl = -1, dateSql = 'now()', notes = null } = {}) {
  await db.query(
    `INSERT INTO public.trades (user_id, account_id, asset, lot_size, pnl, result, setup, emotion, mistake, date, notes)
     VALUES ($1,$2,'MNQ',1,$3,'Loss','p5-probe','Calm','None',${dateSql},$4)`,
    [uid, acc, pnl, notes],
  );
}

export const rules = (x = {}) => ({ enableHardStop: true, maxDailyLoss: 100, maxDailyLossType: '$', ...x });

// Đếm dấu vết user thử đã COMMIT (theo email mẫu + danh sách id của phiên).
export async function countResidue(db, ids = []) {
  const r = await db.query(
    `SELECT
       (SELECT count(*) FROM auth.users WHERE email LIKE $1 OR id = ANY($2::uuid[]))::int AS users,
       (SELECT count(*) FROM public.accounts WHERE user_id = ANY($2::uuid[])
          OR user_id IN (SELECT id FROM auth.users WHERE email LIKE $1))::int AS accounts,
       (SELECT count(*) FROM public.trades WHERE user_id = ANY($2::uuid[])
          OR user_id IN (SELECT id FROM auth.users WHERE email LIKE $1))::int AS trades,
       (SELECT count(*) FROM public.user_preferences WHERE user_id = ANY($2::uuid[])
          OR user_id IN (SELECT id FROM auth.users WHERE email LIKE $1))::int AS prefs`,
    [`${PROBE_EMAIL_PREFIX}%@${PROBE_EMAIL_DOMAIN}`, ids],
  );
  return r.rows[0];
}

// Xóa user thử đã commit (chỉ đúng id truyền vào VÀ email đúng mẫu thử) -> cascade.
export async function deleteProbeUsers(db, ids) {
  if (!ids.length) return 0;
  const r = await db.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[]) AND email LIKE $2', [
    ids,
    `${PROBE_EMAIL_PREFIX}%@${PROBE_EMAIL_DOMAIN}`,
  ]);
  return r.rowCount;
}

// ---------------------------------------------------------------- chạy một bước trong SAVEPOINT

let spSeq = 0;
// who: uuid (phiên user mô phỏng) | null (owner, auth.uid() NULL) | 'service_role'
export async function attempt(db, who, sql, params = [], afterSql = null) {
  const sp = `p5sp_${++spSeq}`;
  await db.query(`SAVEPOINT ${sp}`);
  let out;
  try {
    if (who === 'service_role') {
      await db.query('SET LOCAL ROLE service_role');
    } else if (who) {
      await db.query('SET LOCAL ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: who, role: 'authenticated' }),
      ]);
    }
    const r = await db.query(sql, params);
    out = { ok: true, rowCount: r.rowCount, rows: r.rows };
    if (afterSql) {
      await db.query('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claims', '', true)");
      const a = await db.query(afterSql.sql, afterSql.params || []);
      out.after = a.rows[0];
    }
  } catch (e) {
    out = { ok: false, code: e.code, hint: e.hint, detail: e.detail, msg: String(e.message).slice(0, 160) };
  }
  await db.query(`ROLLBACK TO SAVEPOINT ${sp}`);
  await db.query(`RELEASE SAVEPOINT ${sp}`);
  return out;
}

const blocked = (r, hint = 'HARD_STOP') => !r.ok && r.code === 'P0001' && r.hint === hint;
const brief = (r) =>
  JSON.stringify(r.ok ? { ok: true, rowCount: r.rowCount, after: r.after } : { ok: false, code: r.code, hint: r.hint, msg: r.msg });

// ---------------------------------------------------------------- fixture trong giao dịch

// Gọi bên trong BEGIN (caller ROLLBACK). Trả các id.
export async function buildFixture(db) {
  const f = { A: uuid(), B: uuid(), C: uuid(), D: uuid() };
  for (const u of [f.A, f.B, f.C, f.D]) {
    await createProbeUser(db, u);
    await ensurePrefs(db, u);
  }
  f.A1 = await createAccount(db, f.A, { name: 'p5-a1', rules: rules() });
  f.A2 = await createAccount(db, f.A, { name: 'p5-a2-pct', balance: 10000, rules: rules({ maxDailyLoss: 1, maxDailyLossType: '%' }) });
  f.B1 = await createAccount(db, f.B, { name: 'p5-b1', rules: rules() });
  f.C1 = await createAccount(db, f.C, { name: 'p5-c1-zero', balance: 0, rules: rules({ maxDailyLoss: 2, maxDailyLossType: '%' }) });
  f.C2 = await createAccount(db, f.C, { name: 'p5-c2-neg', balance: -5000, rules: rules({ maxDailyLoss: 2, maxDailyLossType: '%' }) });
  f.D1 = await createAccount(db, f.D, { name: 'p5-d1-off', rules: rules({ enableHardStop: false }) });
  // Owner (auth.uid() NULL) ghi fixture -> bypass D5, không bị chặn.
  await createTrade(db, f.A, f.A1, { pnl: -100, notes: 'p5-today' });
  await createTrade(db, f.A, f.A1, { pnl: -5, dateSql: "now() - interval '3 days'", notes: 'p5-past' });
  await createTrade(db, f.A, f.A2, { pnl: -100, notes: 'p5-a2-today' });
  await createTrade(db, f.B, f.B1, { pnl: -100, notes: 'p5-b-today' });
  await createTrade(db, f.C, f.C1, { pnl: -1000 });
  await createTrade(db, f.C, f.C2, { pnl: -1000 });
  await createTrade(db, f.D, f.D1, { pnl: -1000 });
  return f;
}

const insSql = (dateSql = 'now()') =>
  `INSERT INTO public.trades (user_id, account_id, asset, lot_size, pnl, result, setup, emotion, mistake, date)
   VALUES ($1,$2,'MNQ',1,-1,'Loss','p5-probe','Calm','None',${dateSql})`;

export function triggerScenarios(f) {
  return [
    { name: 'hardstop-server-direct-write: insert today blocked', who: f.A, sql: insSql(), params: [f.A, f.A1],
      ok: (r) => blocked(r) && (() => { try { const d = JSON.parse(r.detail); return Number(d.limit) === 100 && Number(d.lossToday) === 100; } catch { return false; } })() },
    { name: 'insert future date allowed (C9 known limit)', who: f.A, sql: insSql("now() + interval '3 days'"), params: [f.A, f.A1], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'insert backdated allowed', who: f.A, sql: insSql("now() - interval '5 days'"), params: [f.A, f.A1], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'update pnl on locked day blocked', who: f.A, sql: "UPDATE public.trades SET pnl = -1 WHERE user_id = $1 AND notes = 'p5-today'", params: [f.A], ok: (r) => blocked(r) },
    { name: 'update notes/tags allowed', who: f.A, sql: "UPDATE public.trades SET notes = 'p5-today', emotion = 'FOMO' WHERE user_id = $1 AND notes = 'p5-today'", params: [f.A], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'move date out of locked day blocked', who: f.A, sql: "UPDATE public.trades SET date = now() - interval '3 days' WHERE user_id = $1 AND notes = 'p5-today'", params: [f.A], ok: (r) => blocked(r) },
    { name: 'move past trade into locked day blocked', who: f.A, sql: "UPDATE public.trades SET date = now() WHERE user_id = $1 AND notes = 'p5-past'", params: [f.A], ok: (r) => blocked(r) },
    { name: 'past-day pnl edit allowed', who: f.A, sql: "UPDATE public.trades SET pnl = -6 WHERE user_id = $1 AND notes = 'p5-past'", params: [f.A], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'delete today blocked', who: f.A, sql: "DELETE FROM public.trades WHERE user_id = $1 AND notes = 'p5-today'", params: [f.A], ok: (r) => blocked(r) },
    { name: 'rowcount-delete-past-day', who: f.A, sql: "DELETE FROM public.trades WHERE user_id = $1 AND notes = 'p5-past'", params: [f.A],
      after: { sql: "SELECT count(*)::int n FROM public.trades WHERE user_id = $1 AND notes = 'p5-past'", params: [f.A] },
      ok: (r) => r.ok && r.rowCount === 1 && r.after && r.after.n === 0 },
    { name: 'trigger-no-cross-user-oracle', who: f.A, sql: insSql(), params: [f.B, f.B1],
      // Siết (review E17 minor 1): đúng SQLSTATE RLS WITH CHECK 42501 (quan sát trên PROD 29-10-26), không HINT
      // hard stop, và DETAIL không lộ số (lossToday/limit hay bất kỳ chữ số nào của user B).
      ok: (r) => !r.ok && r.code === '42501' && !r.hint && !/lossToday|limit|\d/.test(String(r.detail || '')) },
    { name: 'rpc-hard-stop-evaluate-denied', who: f.A, sql: "SELECT public.hard_stop_evaluate($1::uuid, $2::uuid, 'STATUS', NULL, NULL, now())", params: [f.B, f.B1], ok: (r) => !r.ok && r.code === '42501' },
    { name: 'rpc hard_stop_decide denied', who: f.A, sql: "SELECT public.hard_stop_decide('{}'::jsonb, '[]'::jsonb, 'UTC', NULL, NULL, NULL, now())", ok: (r) => !r.ok && r.code === '42501' },
    { name: 'rpc trading_day denied', who: f.A, sql: "SELECT public.trading_day(now(), 'UTC', NULL, NULL)", ok: (r) => !r.ok && r.code === '42501' },
    { name: 'service-role-bypass-allowed (owner, auth.uid() NULL)', who: null, sql: insSql(), params: [f.A, f.A1], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'service-role-bypass-allowed (SET ROLE service_role)', who: 'service_role', sql: insSql(), params: [f.A, f.A1], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'user-jwt-still-blocked', who: f.A, sql: insSql(), params: [f.A, f.A1], ok: (r) => blocked(r) },
    { name: 'hard stop off: insert allowed', who: f.D, sql: insSql(), params: [f.D, f.D1], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'limit-nonpositive (% x balance 0) -> no lock', who: f.C, sql: insSql(), params: [f.C, f.C1], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'limit-nonpositive (% x balance < 0) -> no lock', who: f.C, sql: insSql(), params: [f.C, f.C2], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'delete-account-cascade-allowed', who: f.A, sql: 'DELETE FROM public.accounts WHERE id = $1', params: [f.A1],
      after: { sql: 'SELECT count(*)::int n FROM public.trades WHERE account_id = $1', params: [f.A1] },
      ok: (r) => r.ok && r.rowCount === 1 && r.after && r.after.n === 0 },
  ];
}

export function configScenarios(f) {
  const upd = 'UPDATE public.accounts SET rules = $2::jsonb WHERE id = $1';
  const L = (r) => blocked(r, 'HARD_STOP_CONFIG_LOCKED');
  return [
    { name: 'config-lock-disable-hardstop-blocked', who: f.A, sql: upd, params: [f.A1, JSON.stringify(rules({ enableHardStop: false }))], ok: L },
    { name: 'config-lock-raise-limit-blocked', who: f.A, sql: upd, params: [f.A1, JSON.stringify(rules({ maxDailyLoss: 500 }))], ok: L },
    { name: 'config-lock-reset-change-blocked', who: f.A, sql: upd, params: [f.A1, JSON.stringify(rules({ resetTime: '17:00' }))], ok: L },
    { name: 'config-lock-clear-limit-blocked', who: f.A, sql: upd, params: [f.A1, JSON.stringify({ enableHardStop: true, maxDailyLossType: '$' })], ok: L },
    { name: 'config-lock-timezone-blocked', who: f.A, sql: "UPDATE public.user_preferences SET timezone = 'Asia/Ho_Chi_Minh' WHERE user_id = $1", params: [f.A], ok: L },
    { name: 'config-lock-prefs-delete-blocked', who: f.A, sql: 'DELETE FROM public.user_preferences WHERE user_id = $1', params: [f.A], ok: L },
    { name: 'config-lock-initial-balance-blocked (% raise)', who: f.A, sql: 'UPDATE public.accounts SET initial_balance = 20000 WHERE id = $1', params: [f.A2], ok: L },
    { name: 'config-lock-balance-to-zero-blocked (% limit removed)', who: f.A, sql: 'UPDATE public.accounts SET initial_balance = 0 WHERE id = $1', params: [f.A2], ok: L },
    { name: 'config-lock-tighten-allowed', who: f.A, sql: upd, params: [f.A1, JSON.stringify(rules({ maxDailyLoss: 50 }))], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'config-lock-balance-update-allowed (UPDATE name)', who: f.A, sql: "UPDATE public.accounts SET name = 'p5-renamed' WHERE id = $1", params: [f.A1], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'prefs other column allowed while locked', who: f.A, sql: "UPDATE public.user_preferences SET theme = 'light' WHERE user_id = $1", params: [f.A], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'config-lock-unlocked-allowed', who: f.D, sql: upd, params: [f.D1, JSON.stringify(rules({ enableHardStop: false, maxDailyLoss: 9999 }))], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'config change allowed for non-positive % limit (not locked)', who: f.C, sql: upd, params: [f.C2, JSON.stringify(rules({ enableHardStop: false }))], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'timezone change allowed when no account with a limit is locked', who: f.C, sql: "UPDATE public.user_preferences SET timezone = 'Asia/Ho_Chi_Minh' WHERE user_id = $1", params: [f.C], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'prefs delete of other user: RLS no-op, no oracle', who: f.B, sql: 'DELETE FROM public.user_preferences WHERE user_id = $1', params: [f.A], ok: (r) => r.ok && r.rowCount === 0 },
    { name: 'config-lock-service-role-bypass (owner)', who: null, sql: upd, params: [f.A1, JSON.stringify(rules({ enableHardStop: false }))], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'config-lock-service-role-bypass (SET ROLE service_role)', who: 'service_role', sql: upd, params: [f.A1, JSON.stringify(rules({ enableHardStop: false }))], ok: (r) => r.ok && r.rowCount === 1 },
    { name: 'cascade delete user while locked allowed', who: null, sql: 'DELETE FROM auth.users WHERE id = $1', params: [f.A],
      after: { sql: `SELECT (SELECT count(*) FROM public.user_preferences WHERE user_id = $1)::int
                       + (SELECT count(*) FROM public.accounts WHERE user_id = $1)::int
                       + (SELECT count(*) FROM public.trades WHERE user_id = $1)::int AS n`, params: [f.A] },
      ok: (r) => r.ok && r.rowCount === 1 && r.after && r.after.n === 0 },
  ];
}

// Chạy danh sách kịch bản trên fixture (đã trong giao dịch). Trả {pass, total, failed[]}.
export async function runScenarios(db, list, log, label = '') {
  let pass = 0;
  const failed = [];
  for (const s of list) {
    const r = await attempt(db, s.who, s.sql, s.params || [], s.after || null);
    const ok = !!s.ok(r);
    if (ok) pass += 1;
    else failed.push(s.name);
    if (log) log(`   ${ok ? 'PASS' : 'FAIL'} ${label}${s.name}${ok ? (r.ok ? '' : ` (sqlstate ${r.code})`) : ' -> ' + brief(r)}`);
  }
  return { pass, total: list.length, failed };
}

// Bộ trigger/config trong giao dịch ROLLBACK (không để lại dữ liệu).
export async function runInTxnSuite(db, suites, log) {
  await db.query('BEGIN');
  try {
    await setTimeouts(db);
    const f = await buildFixture(db);
    const res = { pass: 0, total: 0, failed: [] };
    for (const s of suites) {
      const list = s === 'trigger' ? triggerScenarios(f) : configScenarios(f);
      const r = await runScenarios(db, list, log, `[${s}] `);
      res.pass += r.pass;
      res.total += r.total;
      res.failed.push(...r.failed);
    }
    return res;
  } finally {
    await db.query('ROLLBACK');
  }
}

// hardstop-concurrent-insert: 2 phiên song song, cần dữ liệu đã COMMIT; resetTime cách now ~12h.
export async function runConcurrent(pg, db, log) {
  const E = uuid();
  const ids = [E];
  let outcome = { pass: false };
  try {
    const resetHour = (new Date().getUTCHours() + 12) % 24;
    const resetTime = `${String(resetHour).padStart(2, '0')}:00`;
    await db.query('BEGIN');
    await setTimeouts(db);
    await createProbeUser(db, E);
    await ensurePrefs(db, E);
    const acc = await createAccount(db, E, { name: 'p5-concurrent', rules: rules({ resetTime, resetTz: 'UTC' }) });
    await createTrade(db, E, acc, { pnl: -99 });
    await db.query('COMMIT');
    log(`   concurrent fixture committed (resetTime=${resetTime} UTC, loss 99 / limit 100)`);

    const c1 = await connect(pg);
    const c2 = await connect(pg);
    const one = async (c) => {
      try {
        await c.query('BEGIN');
        await setTimeouts(c);
        await c.query('SET LOCAL ROLE authenticated');
        await c.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: E, role: 'authenticated' })]);
        await c.query(
          `INSERT INTO public.trades (user_id, account_id, asset, lot_size, pnl, result, setup, emotion, mistake, date)
           VALUES ($1,$2,'MNQ',1,-5,'Loss','p5-probe','Calm','None',now())`,
          [E, acc],
        );
        await new Promise((r) => setTimeout(r, 300));
        await c.query('COMMIT');
        return { ok: true };
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        return { ok: false, code: e.code, hint: e.hint };
      }
    };
    const [r1, r2] = await Promise.all([one(c1), one(c2)]);
    await c1.end();
    await c2.end();
    const oks = [r1, r2].filter((r) => r.ok).length;
    const hs = [r1, r2].filter((r) => !r.ok && r.code === 'P0001' && r.hint === 'HARD_STOP').length;
    const n = await db.query('SELECT count(*)::int n FROM public.trades WHERE user_id = $1', [E]);
    outcome = { pass: oks === 1 && hs === 1 && n.rows[0].n === 2, oks, hardStops: hs, trades: n.rows[0].n };
    log(`   ${outcome.pass ? 'PASS' : 'FAIL'} hardstop-concurrent-insert -> ok=${oks} HARD_STOP=${hs} trades=${n.rows[0].n} (expect 1/1/2)`);
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    outcome = { pass: false, error: String(e.message).slice(0, 200) };
    log(`   FAIL hardstop-concurrent-insert -> ${outcome.error}`);
  } finally {
    const del = await deleteProbeUsers(db, ids);
    const left = await countResidue(db, ids);
    outcome.cleanup = left;
    log(`   cleanup concurrent: deleted users=${del}; residue ${JSON.stringify(left)}`);
    if (left.users + left.accounts + left.trades + left.prefs !== 0) outcome.pass = false;
  }
  return outcome;
}

// signup-creates-prefs: INSERT auth.users (đã commit) -> có dòng prefs -> xóa -> đếm 0.
export async function runSignup(db, log) {
  const U = uuid();
  let outcome = { pass: false };
  try {
    await db.query('BEGIN');
    await setTimeouts(db);
    await createProbeUser(db, U);
    await db.query('COMMIT');
    const r = await db.query("SELECT count(*)::int n, max(timezone) tz FROM public.user_preferences WHERE user_id = $1", [U]);
    outcome = { pass: r.rows[0].n === 1, prefs: r.rows[0].n, tz: r.rows[0].tz };
    log(`   ${outcome.pass ? 'PASS' : 'FAIL'} signup-creates-prefs -> prefs rows=${r.rows[0].n} tz=${r.rows[0].tz}`);
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    outcome = { pass: false, error: String(e.message).slice(0, 200) };
    log(`   FAIL signup-creates-prefs -> ${outcome.error}`);
  } finally {
    const del = await deleteProbeUsers(db, [U]);
    const left = await countResidue(db, [U]);
    outcome.cleanup = left;
    log(`   cleanup signup: deleted users=${del}; residue ${JSON.stringify(left)}`);
    if (left.users + left.accounts + left.trades + left.prefs !== 0) outcome.pass = false;
  }
  return outcome;
}

// ---------------------------------------------------------------- CLI

async function cli() {
  const args = process.argv.slice(2);
  const argVal = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  };
  const suite = argVal('--suite') || 'all';
  const out = path.resolve(argVal('--out') || path.join(HARNESS_P5, `smoke-${suite}.txt`));
  const { log, flush, errText } = makeLogger(out);
  log(`# p5_prod_smoke --suite ${suite} - ${new Date().toISOString()}`);
  if (!args.includes('--confirm-prod')) { log('REFUSED - thiếu --confirm-prod'); flush(); return 2; }
  if (!process.env.PROD_DB_URL) { log('REFUSED - thiếu PROD_DB_URL'); flush(); return 2; }
  let code = 0;
  try {
    const pg = await loadPg();
    const db = await connect(pg);
    const want = (s) => suite === 'all' || suite === s;
    const suites = ['trigger', 'config'].filter(want);
    if (suites.length) {
      const r = await runInTxnSuite(db, suites, log);
      log(`## in-txn ${suites.join('+')}: PASS ${r.pass}/${r.total} (ROLLBACK, không để lại dữ liệu)`);
      if (r.failed.length) code = 1;
    }
    if (want('concurrent')) { const r = await runConcurrent(pg, db, log); if (!r.pass) code = 1; }
    if (want('signup')) { const r = await runSignup(db, log); if (!r.pass) code = 1; }
    const left = await countResidue(db, []);
    log(`## residue (email mẫu thử): ${JSON.stringify(left)}`);
    if (left.users !== 0) code = 1;
    await db.end();
  } catch (e) {
    log(`ERROR ${errText(e)}`);
    code = 1;
  }
  log(`RESULT: ${code === 0 ? 'PASS' : 'FAIL'}`);
  flush();
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await cli());
}
