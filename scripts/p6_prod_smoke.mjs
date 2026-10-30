#!/usr/bin/env node
// p6_prod_smoke.mjs - Phase 06 Hybrid PROD smoke with ONE isolated throwaway user (self-cleaning).
//
// Suites (P6 plan B1/B6, validate-contract E6/E7):
//   probe   read-only: pg_indexes of public.trades + EXPLAIN of the keyset query inside BEGIN..ROLLBACK.
//   storage isolated user: 3 objects (in use / orphan / avatar-like) -> SHIPPED src/lib/orphanScreenshots.ts
//           scan + delete with minAgeMs=0, only inside the test user's prefix.
//   seed    isolated user: seed 2500 trades (tag seed-p6, own account, Hard Stop OFF), keyset load timing
//           (Node-side), max_rows inferred from one REST response, count(DB) == loaded length; raise to 5000 if fast.
//   dryrun  read-only SQL emulation of the orphan algorithm on REAL data (deletes nothing).
//   all     probe + storage + seed + dryrun.
// The user is created by signUp; on rate limit / no session it is a confirmed user created by SQL
// (extensions.crypt, empty-string token columns) + signInWithPassword. No JWT -> INCONCLUSIVE (never PASS).
// Storage objects are removed through the API BEFORE the user is deleted (storage.objects does not cascade).
// No service key. Secrets/emails/host are redacted in every line written.
//
// CLI: PROD_DB_URL=... PG_MODULE_PATH=... node scripts/p6_prod_smoke.mjs --confirm-prod --suite all [--out file]
// Exit: 0 PASS (or PASS with INCONCLUSIVE parts listed), 1 FAIL / residual != 0, 2 refused.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { seedCountVerdict } from './p6_seed_count.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_DIR, '..');
const HARNESS_P6 = path.join(REPO_ROOT, 'process/general-plans/active/hardening-security-data-integrity_11-10-26/harness/p6');
// RFC 2606 reserved, never deliverable: no mail can leave. GoTrue rejects it at signUp
// (email_address_invalid, PROD 30-10-26) so the SQL-created confirmed user below is the
// expected main path; do not switch to a deliverable domain (it would send real mail).
const EMAIL_DOMAIN = 'example.invalid';
const EMAIL_PREFIX = 'p6-probe-';
const BUCKET = 'trade-screenshots';
const SEED_TAG = 'seed-p6';
const PAGE = 500; // same page size as fetchTrades (TRADES_PAGE_SIZE)
const LOAD_BUDGET_MS = 2000;

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm-prod');
const argVal = (k, d) => (args.indexOf(k) >= 0 && args[args.indexOf(k) + 1] ? args[args.indexOf(k) + 1] : d);
const SUITE = argVal('--suite', 'all');
const OUT = path.resolve(argVal('--out', path.join(HARNESS_P6, 'p6-prod-smoke.txt')));

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
let SB_HOST = '';
try { SB_HOST = SB_URL ? new URL(SB_URL).host : ''; } catch { SB_HOST = ''; }

// ---------------------------------------------------------------- redacting logger
const secrets = [DB_URL, SB_ANON, SB_URL, SB_HOST].filter((s) => s && s.length >= 6);
const userIds = [];
function redact(text) {
  let s = String(text);
  for (const sec of secrets) s = s.split(sec).join('[REDACTED]');
  userIds.forEach((id, i) => { s = s.split(id).join(`[USER${i + 1}]`); });
  return s
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgres://[REDACTED]')
    .replace(/https?:\/\/[\w.-]+\.supabase\.co/gi, 'https://[REDACTED]')
    .replace(/password=[^\s'"]+/gi, 'password=[REDACTED]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[JWT]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]');
}
const lines = [];
const log = (l = '') => { const s = redact(l); lines.push(s); console.log(s); };
// Evidence is APPENDED as a new timestamped block (never overwritten); refused runs never flush.
let written = 0;
const flush = () => {
  if (written >= lines.length) return;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const sep = written === 0 && fs.existsSync(OUT) && fs.statSync(OUT).size > 0 ? '\n' : '';
  fs.appendFileSync(OUT, sep + lines.slice(written).join('\n') + '\n', 'utf8');
  written = lines.length;
};
const errText = (e) => redact(e && e.message ? e.message : String(e)).slice(0, 300);
const results = [];
const record = (status, id, msg) => { results.push({ status, id }); log(`${status} ${id} - ${msg}`); };

async function loadPg() {
  const spec = process.env.PG_MODULE_PATH;
  if (!spec) throw new Error('missing PG_MODULE_PATH');
  const target = fs.existsSync(spec) && fs.statSync(spec).isDirectory()
    ? pathToFileURL(path.join(spec, 'lib', 'index.js')).href
    : pathToFileURL(path.resolve(spec)).href;
  const mod = await import(target);
  return mod.default || mod;
}
const mkClient = () => createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

// ---------------------------------------------------------------- B1 probe (read-only)
async function suiteProbe(db) {
  const idx = await db.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='trades' ORDER BY indexname");
  log(`pg_indexes(public.trades): ${idx.rows.length}`);
  for (const r of idx.rows) log(`  ${r.indexname}: ${r.indexdef}`);
  const leading = idx.rows.some((r) => /\(\s*account_id\s*,\s*date\b/i.test(r.indexdef));
  const total = (await db.query('SELECT count(*)::int n FROM public.trades')).rows[0].n;
  log(`trades total rows (PROD): ${total}`);
  await db.query('BEGIN READ ONLY');
  try {
    const acc = (await db.query('SELECT account_id, count(*)::int n FROM public.trades GROUP BY 1 ORDER BY 2 DESC LIMIT 1')).rows[0];
    const accId = acc ? acc.account_id : crypto.randomUUID();
    const plan1 = await db.query(
      `EXPLAIN SELECT * FROM public.trades WHERE account_id = $1 ORDER BY date DESC, id DESC LIMIT ${PAGE}`, [accId]);
    // Real account id must not reach the evidence file (redact() only knows probe user ids).
    const mask = (line) => String(line).split(String(accId)).join('[ACCOUNT_ID]');
    log('EXPLAIN keyset first page (largest account):');
    for (const r of plan1.rows) log(`  ${mask(r['QUERY PLAN'])}`);
    const plan2 = await db.query(
      `EXPLAIN SELECT * FROM public.trades WHERE account_id = $1 AND (date < now() OR (date = now() AND id < $2))
       ORDER BY date DESC, id DESC LIMIT ${PAGE}`, [accId, crypto.randomUUID()]);
    log('EXPLAIN keyset next page:');
    for (const r of plan2.rows) log(`  ${mask(r['QUERY PLAN'])}`);
    log(`largest account rows: ${acc ? acc.n : 0}`);
  } finally {
    await db.query('ROLLBACK');
  }
  record('PASS', 'b1-probe', `index leading (account_id, date): ${leading ? 'yes' : 'no'}; read-only, ROLLBACK`);
  return { leading };
}

// ---------------------------------------------------------------- isolated user
async function tokenColumns(db) {
  const want = ['confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new', 'email_change_token_current',
    'reauthentication_token', 'phone_change', 'phone_change_token'];
  const r = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='auth' AND table_name='users'");
  const have = new Set(r.rows.map((x) => x.column_name));
  return want.filter((c) => have.has(c));
}

async function createSqlUser(db, id, email, password) {
  const toks = await tokenColumns(db);
  const cols = ['id', 'instance_id', 'aud', 'role', 'email', 'encrypted_password', 'email_confirmed_at', 'created_at', 'updated_at',
    'raw_app_meta_data', 'raw_user_meta_data', ...toks];
  // Every parameter carries an explicit cast: node-pg sends untyped params, and a $n that Postgres must
  // infer from two different contexts fails with "inconsistent types deduced for parameter $n" (B6 run
  // 30-10-26). Keep $1::uuid / $2::text / $3::text explicit on every occurrence.
  const vals = ['$1::uuid', "'00000000-0000-0000-0000-000000000000'", "'authenticated'", "'authenticated'", '$2::text',
    "extensions.crypt($3::text, extensions.gen_salt('bf'))", 'now()', 'now()', 'now()',
    `'{"provider":"email","providers":["email"]}'::jsonb`, "'{}'::jsonb", ...toks.map(() => "''")];
  await db.query(`INSERT INTO auth.users (${cols.join(',')}) VALUES (${vals.join(',')})`, [id, email, password]);
  await db.query(
    `INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
     VALUES (gen_random_uuid(), $1::uuid, $1::text, jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true), 'email', now(), now(), now())`,
    [id, email]);
}

async function getUser(db) {
  const password = crypto.randomBytes(18).toString('base64url') + 'aA1!';
  const sb = mkClient();
  let email = `${EMAIL_PREFIX}${crypto.randomUUID()}@${EMAIL_DOMAIN}`;
  let uid = null;
  let via = 'signUp';
  const su = await sb.auth.signUp({ email, password });
  if (!su.error && su.data?.user?.id) {
    uid = su.data.user.id;
    userIds.push(uid);
    if (su.data.session) return { sb, uid, via };
    // signed up but unconfirmed: confirm by SQL then sign in
    await db.query('UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1::uuid AND email LIKE $2::text', [uid, `${EMAIL_PREFIX}%@${EMAIL_DOMAIN}`]);
    via = 'signUp+sql-confirm';
  } else {
    log(`signUp failed (${su.error?.code || su.error?.status || 'no user'}): ${errText(su.error)} -> SQL-created confirmed user`);
    uid = crypto.randomUUID();
    email = `${EMAIL_PREFIX}${uid}@${EMAIL_DOMAIN}`;
    userIds.push(uid);
    await createSqlUser(db, uid, email, password);
    via = 'sql-user';
  }
  const si = await sb.auth.signInWithPassword({ email, password });
  if (si.error || !si.data?.session) {
    log(`signInWithPassword failed: ${errText(si.error)}`);
    return { sb: null, uid, via };
  }
  return { sb, uid, via };
}

// ---------------------------------------------------------------- storage suite (shipped lib)
async function suiteStorage(sb, uid, accountId, lib, pathFromLegacyUrl) {
  const bucket = sb.storage.from(BUCKET);
  const t = Date.now();
  const used = `${uid}/${t}-aaaaaaaa.webp`;
  const orphan = `${uid}/${t + 1}-bbbbbbbb.webp`;
  const avatar = `${uid}/avatar.png`;
  const bytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
  for (const p of [used, orphan, avatar]) {
    const up = await bucket.upload(p, bytes, { contentType: p.endsWith('.png') ? 'image/png' : 'image/webp', upsert: false });
    if (up.error) throw new Error(`upload failed: ${errText(up.error)}`);
  }
  const ins = await sb.from('trades').insert([{ user_id: uid, account_id: accountId, asset: 'MNQ', lot_size: 1, pnl: 1, result: 'Win',
    setup: SEED_TAG, emotion: 'Calm', mistake: 'None', notes: 'p6 storage smoke', screenshot_path: used }]);
  if (ins.error) throw new Error(`trade insert failed: ${errText(ins.error)}`);
  const opts = { client: sb, userId: uid, now: Date.now() + 1000, mapLegacyUrl: pathFromLegacyUrl, minAgeMs: 0 };
  const scan = await lib.scanOrphans(opts);
  log(`scan: listed=${scan.listedCount} candidates=${JSON.stringify(scan.candidates)}`);
  const okScan = scan.candidates.length === 1 && scan.candidates[0] === orphan;
  record(okScan ? 'PASS' : 'FAIL', 'b6-storage-scan', 'only the orphan is a candidate (in-use and avatar-like kept)');
  const del = await lib.deleteOrphans({ ...opts, now: Date.now() + 1000, paths: scan.candidates });
  log(`delete: deleted=${JSON.stringify(del.deleted)} failed=${JSON.stringify(del.failedPaths)}`);
  const after = await lib.listUserObjects(sb, uid);
  const names = after.map((o) => o.path).sort();
  const okDel = del.deleted.length === 1 && del.deleted[0] === orphan && names.includes(used) && names.includes(avatar) && !names.includes(orphan);
  record(okDel ? 'PASS' : 'FAIL', 'b6-storage-delete', `after delete: ${JSON.stringify(names)}`);
  return [used, avatar, orphan];
}

// ---------------------------------------------------------------- seed + load suite
async function seedTrades(sb, uid, accountId, from, n) {
  const base = Date.parse('2025-01-01T00:00:00Z');
  for (let i = from; i < from + n; i += PAGE) {
    const rows = [];
    for (let j = i; j < Math.min(i + PAGE, from + n); j++) {
      // groups of 5 share the same timestamp (tie-break on id), microsecond precision
      const ts = new Date(base + Math.floor(j / 5) * 3600_000).toISOString().replace('Z', '123+00:00');
      rows.push({ user_id: uid, account_id: accountId, asset: 'MNQ', lot_size: 1, pnl: (j % 3) - 1, result: 'Win',
        setup: SEED_TAG, emotion: 'Calm', mistake: 'None', notes: SEED_TAG, date: ts });
    }
    const r = await sb.from('trades').insert(rows);
    if (r.error) throw new Error(`seed insert failed at ${i}: ${errText(r.error)}`);
  }
}

/** Mirrors useTradeStore.fetchTrades keyset (date desc, id desc, raw cursor, stop on empty page). */
async function keysetLoad(sb, accountId) {
  const t0 = performance.now();
  const ids = new Set();
  let cursor = null;
  let pages = 0;
  for (;;) {
    let q = sb.from('trades').select('*').eq('account_id', accountId);
    if (cursor) q = q.or(`date.lt."${cursor.date}",and(date.eq."${cursor.date}",id.lt.${cursor.id})`);
    const { data, error } = await q.order('date', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
    pages++;
    if (error) throw new Error(`keyset page failed: ${errText(error)}`);
    if (data.length === 0) break;
    for (const r of data) ids.add(r.id);
    const last = data[data.length - 1];
    const next = { date: String(last.date), id: String(last.id) };
    if (cursor && cursor.date === next.date && cursor.id === next.id) throw new Error('cursor stalled');
    cursor = next;
    if (pages > 1000) throw new Error('page cap');
  }
  return { ms: Math.round(performance.now() - t0), count: ids.size, pages };
}

async function suiteSeed(db, sb, uid, accountId) {
  let total = 2500;
  const countRows = async () =>
    (await db.query('SELECT count(*)::int n FROM public.trades WHERE account_id = $1', [accountId])).rows[0].n;
  let baseline = await countRows();
  await seedTrades(sb, uid, accountId, 0, total);
  const probe = await sb.from('trades').select('id').eq('account_id', accountId).limit(total);
  const returned = probe.data ? probe.data.length : -1;
  log(`max_rows probe: requested limit ${total}, REST returned ${returned} -> max_rows ${returned < total ? `= ${returned}` : `>= ${total}`}`);
  let load = await keysetLoad(sb, accountId);
  let dbCount = await countRows();
  log(`load ${total}: ${load.ms} ms Node-side, pages=${load.pages}, loaded=${load.count}, count(DB)=${dbCount}`);
  let v = seedCountVerdict({ baseline, seeded: 2500, loaded: load.count, dbCount });
  record(v.status, 'b6-seed-2500-count', v.detail);
  record(load.ms <= LOAD_BUDGET_MS ? 'PASS' : 'WARN', 'b6-seed-2500-time', `${load.ms} ms (budget ${LOAD_BUDGET_MS} ms, Node-side, excludes React render)`);
  if (load.ms <= LOAD_BUDGET_MS / 2) {
    baseline = await countRows();
    await seedTrades(sb, uid, accountId, total, 2500);
    total = 5000;
    load = await keysetLoad(sb, accountId);
    dbCount = await countRows();
    log(`load ${total}: ${load.ms} ms Node-side, pages=${load.pages}, loaded=${load.count}, count(DB)=${dbCount}`);
    v = seedCountVerdict({ baseline, seeded: 2500, loaded: load.count, dbCount });
    record(v.status, 'b6-seed-5000-count', v.detail);
    record(load.ms <= LOAD_BUDGET_MS ? 'PASS' : 'WARN', 'b6-seed-5000-time', `${load.ms} ms (Node-side)`);
  }
  return { maxRows: returned < 2500 ? returned : '>=2500', ms: load.ms, total };
}

// ---------------------------------------------------------------- dry-run on REAL data (read-only)
async function suiteDryrun(db) {
  await db.query('BEGIN READ ONLY');
  try {
    const r = await db.query(
      `WITH objs AS (
         SELECT o.name, o.created_at, split_part(o.name, '/', 1) AS owner_dir
         FROM storage.objects o WHERE o.bucket_id = $1
       ), used AS (
         SELECT screenshot_path AS p FROM public.trades WHERE screenshot_path IS NOT NULL
         UNION SELECT regexp_replace(image_url, '^.*/${BUCKET}/', '') FROM public.playbooks WHERE image_url IS NOT NULL
       )
       SELECT o.name, o.created_at, o.owner_dir,
              (o.name ~ '^[0-9A-Za-z-]+/([0-9]{10,}-[0-9a-f]{8}\\.[0-9a-z]+|[0-9]{10,14}\\.(png|jpg|jpeg|webp))$') AS allow_listed,
              EXISTS (SELECT 1 FROM used u WHERE u.p = o.name) AS in_use,
              (o.created_at < now() - interval '24 hours') AS old_enough,
              ((o.name ~ '^[0-9A-Za-z-]+/([0-9]{10,}-[0-9a-f]{8}\\.[0-9a-z]+|[0-9]{10,14}\\.(png|jpg|jpeg|webp))$')
                AND NOT EXISTS (SELECT 1 FROM used u WHERE u.p = o.name)
                AND o.created_at < now() - interval '24 hours') AS candidate
       FROM objs o
       WHERE o.owner_dir NOT IN (SELECT id::text FROM auth.users WHERE email LIKE $2)
       ORDER BY o.name`,
      [BUCKET, `${EMAIL_PREFIX}%@${EMAIL_DOMAIN}`]);
    const owners = new Map();
    const alias = (d) => { if (!owners.has(d)) owners.set(d, `owner${owners.size + 1}`); return owners.get(d); };
    // E17 MINOR-5: the SQL `candidate` flag is cross-checked against an INDEPENDENT used set (separate
    // query, JS-side legacy mapping) and the JS allow-list, so a wrong SQL candidate can actually FAIL.
    const usedRows = await db.query(
      `SELECT screenshot_path AS p, NULL AS u FROM public.trades
        WHERE screenshot_path IS NOT NULL
       UNION ALL SELECT NULL, image_url FROM public.playbooks WHERE image_url IS NOT NULL`);
    const marker = `/${BUCKET}/`;
    const usedSet = new Set();
    for (const row of usedRows.rows) {
      if (row.p) usedSet.add(String(row.p));
      if (row.u) { const i = String(row.u).indexOf(marker); usedSet.add(i >= 0 ? String(row.u).slice(i + marker.length) : String(row.u)); }
    }
    const allowRe = /^[0-9A-Za-z-]+\/([0-9]{10,}-[0-9a-f]{8}\.[0-9a-z]+|[0-9]{10,14}\.(png|jpg|jpeg|webp))$/;
    let candidates = 0;
    let badCandidates = 0;
    log(`dry-run: ${r.rows.length} object(s) in bucket (real users, read-only); independent used set=${usedSet.size}`);
    for (const o of r.rows) {
      const cand = o.candidate === true;
      if (cand) {
        candidates++;
        if (usedSet.has(o.name) || !allowRe.test(o.name)) badCandidates++;
      }
      const file = o.name.slice(o.owner_dir.length + 1);
      log(`  ${alias(o.owner_dir)}/${file} allow=${o.allow_listed} in_use=${o.in_use} old=${o.old_enough} -> ${cand ? 'CANDIDATE (not deleted)' : 'keep'}`);
    }
    record(badCandidates === 0 ? 'PASS' : 'FAIL', 'b6-dryrun-real',
      `${candidates} candidate(s), 0 deletions, candidates in independent used set or off allow-list=${badCandidates}`);
  } finally {
    await db.query('ROLLBACK');
  }
}

// ---------------------------------------------------------------- residual + cleanup
async function residual(db, uid) {
  const r = await db.query(
    `SELECT (SELECT count(*) FROM auth.users WHERE id = $1::uuid OR email LIKE $2::text)::int AS users,
            (SELECT count(*) FROM public.accounts WHERE user_id = $1::uuid)::int AS accounts,
            (SELECT count(*) FROM public.trades WHERE user_id = $1::uuid)::int AS trades,
            (SELECT count(*) FROM public.user_preferences WHERE user_id = $1::uuid)::int AS prefs,
            (SELECT count(*) FROM storage.objects WHERE bucket_id = $3::text AND name LIKE $1::uuid::text || '/%')::int AS objects`,
    [uid, `${EMAIL_PREFIX}%@${EMAIL_DOMAIN}`, BUCKET]);
  return r.rows[0];
}

async function main() {
  log(`# p6_prod_smoke - ${new Date().toISOString()} - suite=${SUITE}`);
  if (!CONFIRM) { log('REFUSED - missing --confirm-prod (runs on PROD with an isolated throwaway user).'); return 2; }
  const missing = [];
  if (!DB_URL) missing.push('PROD_DB_URL');
  if (['storage', 'seed', 'all'].includes(SUITE)) {
    if (!SB_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!SB_ANON) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  if (missing.length) { log(`REFUSED - missing env: ${missing.join(', ')}`); return 2; }

  const pg = await loadPg();
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  await db.query("SET statement_timeout = '120s'");
  let uid = null;
  let sb = null;
  let sbOwner = null;
  let sbClient = null;
  let objectPaths = [];
  let exit = 0;
  try {
    if (SUITE === 'probe' || SUITE === 'all') await suiteProbe(db);
    if (SUITE === 'dryrun' || SUITE === 'all') await suiteDryrun(db);
    if (['storage', 'seed', 'all'].includes(SUITE)) {
      const u = await getUser(db);
      uid = u.uid;
      sb = u.sb;
      sbOwner = uid;
      sbClient = sb;
      log(`isolated user via ${u.via}: ${uid ? '[USER1]' : 'none'}`);
      if (!sb) {
        record('INCONCLUSIVE', 'b6-user-jwt', 'no user session; storage/seed suites not run (Known-Gap, never PASS)');
      } else {
        const acc = await sb.from('accounts').insert([{ user_id: uid, name: SEED_TAG, type: 'Personal', initial_balance: 100000,
          rules: { enableHardStop: false } }]).select('id').single();
        if (acc.error) throw new Error(`account insert failed: ${errText(acc.error)}`);
        const accountId = acc.data.id;
        if (SUITE === 'storage' || SUITE === 'all') {
          const lib = await import(pathToFileURL(path.join(APP_DIR, 'src/lib/orphanScreenshots.ts')).href);
          const { pathFromLegacyUrl } = await import(pathToFileURL(path.join(APP_DIR, 'src/lib/screenshotStorage.ts')).href);
          objectPaths = await suiteStorage(sb, uid, accountId, lib, pathFromLegacyUrl);
        }
        if (SUITE === 'seed' || SUITE === 'all') {
          const s = await suiteSeed(db, sb, uid, accountId);
          log(`summary: max_rows=${s.maxRows}, load_ms=${s.ms} for ${s.total} trades (Node-side)`);
        }
        const delAcc = await sb.from('accounts').delete().eq('id', accountId);
        const left = (await db.query('SELECT count(*)::int n FROM public.trades WHERE account_id = $1', [accountId])).rows[0].n;
        record(!delAcc.error && left === 0 ? 'PASS' : 'FAIL', 'b6-account-cascade',
          `delete account via REST (Hard Stop OFF, P5 trigger present): ${delAcc.error ? errText(delAcc.error) : 'ok'}; trades left=${left}`);
      }
    }
  } catch (e) {
    exit = 1;
    record('FAIL', 'b6-run', errText(e));
  } finally {
    // E17 MINOR-5: clean every id recorded by getUser (pushed right after signUp/SQL create), even when
    // getUser() threw before returning and `uid` stayed null.
    for (const cid of [...new Set([...userIds, uid].filter(Boolean))]) {
      const uid = cid;
      const sb = cid === sbOwner ? sbClient : null;
      try {
        if (sb) {
          const listed = await sb.storage.from(BUCKET).list(uid, { limit: 100, offset: 0 });
          const all = [...new Set([...objectPaths, ...((listed.data || []).filter((o) => o.id !== null).map((o) => `${uid}/${o.name}`))])];
          if (all.length) {
            const rm = await sb.storage.from(BUCKET).remove(all);
            log(`cleanup storage via API: ${all.length} path(s), error=${rm.error ? errText(rm.error) : 'none'}`);
          }
          await sb.auth.signOut();
        }
        const d = await db.query('DELETE FROM auth.users WHERE id = $1::uuid AND email LIKE $2::text', [uid, `${EMAIL_PREFIX}%@${EMAIL_DOMAIN}`]);
        log(`cleanup user: deleted ${d.rowCount}`);
      } catch (e) {
        log(`cleanup error: ${errText(e)}`);
      }
      const res = await residual(db, uid);
      const sum = Object.values(res).reduce((a, b) => a + Number(b), 0);
      record(sum === 0 ? 'PASS' : 'FAIL', 'b6-residual', `residual ${JSON.stringify(res)} (must be all 0)`);
      if (sum !== 0) exit = 1;
    }
    await db.end();
  }
  if (results.some((r) => r.status === 'FAIL')) exit = 1;
  const inc = results.filter((r) => r.status === 'INCONCLUSIVE').map((r) => r.id);
  log(`RESULT: ${exit === 0 ? 'PASS' : 'FAIL'}${inc.length ? ` (INCONCLUSIVE: ${inc.join(', ')})` : ''} | ${results.map((r) => `${r.id}=${r.status}`).join(' ')}`);
  flush();
  return exit;
}

main().then((c) => process.exit(c), (e) => { log(`FATAL ${errText(e)}`); flush(); process.exit(1); });
