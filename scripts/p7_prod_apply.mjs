#!/usr/bin/env node
// p7_prod_apply.mjs - ap patch 090 (DROP COLUMN public.trades.screenshot_url; Phase 07, Step E2, ban P7b)
// len PROD theo giai doan, co sao luu, dry-run, hau kiem va rollback tu dong. Mau: scripts/p5_prod_apply.mjs.
//
// CHI CHAY khi du dieu kien D0 (harness/p7/prod-commands.txt): client P7a da trien khai + cua so rollout,
// backup ngoai repo, probe 90 url_without_path = 0. Phase 07 KHONG chay script nay voi --confirm-prod
// (nhanh B / Known-Gap INCONCLUSIVE); chi `node --check` + logic ap/go chay tren PGlite (harness/p7/local-pglite).
//
// Bien moi truong (CHI doc SAU khi co --confirm-prod; khong ghi secret ra file/log):
//   PROD_DB_URL, PG_MODULE_PATH, P7_BACKUP_DIR (hoac --backup-dir).
// Co: --confirm-prod (bat buoc) --stage 0|1|2|3 | --rollback ; --backup-dir <path NGOAI repo> ; --out <file>
//   GD0 sao luu (id, screenshot_url, screenshot_path cua trades -> JSON ngoai repo + sha256) + probe 90 + probe 11
//   GD1 dry-run trong BEGIN..ROLLBACK: up -> kiem cot mat -> down -> kiem cot rong tro lai -> up (idempotent)
//   GD2 sao luu lai + ap 090 trong giao dich (lock_timeout/statement_timeout), hau kiem TRUOC COMMIT
//       (cot mat, schema_migrations co 090, probe 11 khong doi va khop grants_matrix.expected.json);
//       loi -> ROLLBACK (cot giu nguyen).
//   GD3 hau kiem chi doc sau COMMIT (probe 90: column_exists=false, migration_090=1; probe 11 khop matrix).
//   --rollback  ap 090.down.sql trong giao dich (cot RONG tro lai; du lieu chi tu backup).
// Exit: 0 PASS; 1 FAIL (da ROLLBACK); 2 tu choi/thieu dieu kien; 3 loi rollback (can nguoi xu ly).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(APP_DIR, '..');
const SB = path.join(APP_DIR, 'supabase');
export const HARNESS_P7 = path.join(
  REPO_ROOT,
  'process/general-plans/active/hardening-security-data-integrity_11-10-26/harness/p7',
);

export const F = {
  up: 'patches/090_drop_trades_screenshot_url.sql',
  down: 'patches/090_drop_trades_screenshot_url.down.sql',
  probe90: 'probes/90_p7_pre_checks.sql',
  probe11: 'probes/11_p1_grants_matrix.sql',
  matrix: 'tests/grants_matrix.expected.json',
};
export const read = (rel) => fs.readFileSync(path.join(SB, rel), 'utf8');

export function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// ---------------------------------------------------------------- kiem tra DB (dung chung PROD va PGlite)

export async function columnExists(db) {
  const r = await db.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'screenshot_url') AS present`);
  return r.rows[0].present === true;
}

export async function columnShape(db) {
  const r = await db.query(`SELECT data_type, is_nullable,
      (SELECT count(*)::int FROM public.trades WHERE (to_jsonb(trades) ->> 'screenshot_url') IS NOT NULL) AS non_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'screenshot_url'`);
  return r.rows[0] || null;
}

export async function has090(db) {
  const r = await db.query("SELECT count(*)::int AS n FROM public.schema_migrations WHERE version = '090'");
  return r.rows[0].n === 1;
}

// Probe 90 -> { rows, failed } ; failed = cac check status FAIL.
export async function probe90(db) {
  const r = await db.query(read(F.probe90));
  return { rows: r.rows, failed: r.rows.filter((x) => x.status === 'FAIL').map((x) => x.check_name) };
}

const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]])) : v));

export async function probe11Raw(db) {
  const r = await db.query(read(F.probe11));
  return r.rows[0].matrix;
}

// So probe 11 voi grants_matrix.expected.json (sau P5 day du); tra danh sach khac biet.
export function diffMatrix(actual) {
  const exp = JSON.parse(read(F.matrix));
  delete exp._doc;
  const diffs = [];
  for (const sec of ['version', 'tables', 'functions', 'policies']) {
    if (canon(actual[sec]) !== canon(exp[sec])) diffs.push(`${sec} khac`);
  }
  return diffs;
}

// ---------------------------------------------------------------- buoc ap / go (khong tu BEGIN; nguoi goi boc)

export async function setTimeouts(db) {
  await db.query("SET LOCAL lock_timeout = '3s'");
  await db.query("SET LOCAL statement_timeout = '120s'");
}

// Dry-run: up -> cot mat -> down -> cot rong nullable -> up lai. Goi TRONG giao dich se ROLLBACK.
export async function dryRunSteps(db, log) {
  const fails = [];
  await db.query(read(F.up));
  const gone1 = !(await columnExists(db)) && (await has090(db));
  log(`   ${gone1 ? 'PASS' : 'FAIL'} up: cot mat + 090 trong schema_migrations`);
  if (!gone1) fails.push('dry-run up');
  await db.query(read(F.down));
  const shape = await columnShape(db);
  const back = shape && shape.is_nullable === 'YES' && shape.non_null === 0 && !(await has090(db));
  log(`   ${back ? 'PASS' : 'FAIL'} down: cot tro lai ${JSON.stringify(shape)} + 090 da xoa`);
  if (!back) fails.push('dry-run down');
  await db.query(read(F.up));
  await db.query(read(F.up));
  const gone2 = !(await columnExists(db)) && (await has090(db));
  log(`   ${gone2 ? 'PASS' : 'FAIL'} up lan 2 + lan 3 (idempotent)`);
  if (!gone2) fails.push('dry-run up idempotent');
  return fails;
}

// Huong dan khi probe 90 FAIL o url_without_path (review E17 MAJOR-1). Script KHONG tu sua du lieu.
export const URL_WITHOUT_PATH_GUIDANCE =
  'url_without_path > 0: client P7a go anh chi dat screenshot_path = NULL va giu screenshot_url cu. ' +
  'Doi chieu tung hang voi sao luu GD0; anh da bi chu y go -> nguoi van hanh dat screenshot_url = NULL ' +
  '(giao dich rieng, co bang chung) TRUOC GD2. KHONG gan lai path (file da bi xoa khoi Storage).';

// Ap 090; verify chay TRUOC COMMIT. Tra { fails }.
// precheck(before) (tuy chon, CLI truyen diffMatrix): chay TRONG giao dich, TRUOC cau UP; lech -> ROLLBACK,
// khong bao gio COMMIT DROP roi moi tu go (review E17 m3).
export async function apply090(db, log, errText = (e) => String(e && e.message ? e.message : e), precheck = null) {
  await db.query('BEGIN');
  try {
    await setTimeouts(db);
    const before = await probe11Raw(db);
    if (precheck) {
      const pre = precheck(before);
      log(`   probe 11 (truoc 090) khop matrix: ${pre.length === 0}`);
      if (pre.length) {
        await db.query('ROLLBACK');
        return { fails: pre.map((x) => `probe 11 ${x} (truoc 090, khong ap)`), matrixAfter: null };
      }
    }
    await db.query(read(F.up));
    const fails = [];
    if (await columnExists(db)) fails.push('cot screenshot_url van con');
    if (!(await has090(db))) fails.push('schema_migrations thieu 090');
    const after = await probe11Raw(db);
    const same = canon(before) === canon(after);
    log(`   probe 11 truoc/sau 090 giong nhau: ${same}`);
    if (!same) fails.push('probe 11 doi sau 090');
    if (fails.length) {
      await db.query('ROLLBACK');
      return { fails, matrixAfter: after };
    }
    await db.query('COMMIT');
    return { fails: [], matrixAfter: after };
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    return { fails: [`ap 090: ${errText(e)}`], matrixAfter: null };
  }
}

export async function rollback090(db, errText = (e) => String(e && e.message ? e.message : e)) {
  await db.query('BEGIN');
  try {
    await setTimeouts(db);
    await db.query(read(F.down));
    await db.query('COMMIT');
    return [];
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    return [`090.down: ${errText(e)}`];
  }
}

// ---------------------------------------------------------------- CLI (chi PROD, chi khi --confirm-prod)

async function main() {
  const args = process.argv.slice(2);
  const argVal = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  };
  const STAGE = args.includes('--rollback') ? 'rollback' : argVal('--stage');
  // Tu choi TRUOC khi doc bat ky bien moi truong nao.
  if (!args.includes('--confirm-prod')) {
    console.error('REFUSED - thieu --confirm-prod. Xem harness/p7/prod-commands.txt (dieu kien D0).');
    return 2;
  }
  if (!['0', '1', '2', '3', 'rollback'].includes(String(STAGE))) {
    console.error('REFUSED - --stage 0|1|2|3 | --rollback');
    return 2;
  }
  const smoke = await import('./p5_prod_smoke.mjs');
  const OUT = path.resolve(argVal('--out') || path.join(HARNESS_P7, `p7-gd${STAGE}-prod.txt`));
  const { log, flush, errText } = smoke.makeLogger(OUT);
  const done = (code) => { flush(); return code; };
  log(`# p7_prod_apply --stage ${STAGE} - ${new Date().toISOString()}`);
  if (!process.env.PROD_DB_URL) { log('REFUSED - thieu PROD_DB_URL.'); return done(2); }
  const BACKUP_RAW = argVal('--backup-dir') || process.env.P7_BACKUP_DIR || '';
  if (['0', '2'].includes(STAGE)) {
    if (!BACKUP_RAW) { log('REFUSED - thieu thu muc sao luu (P7_BACKUP_DIR / --backup-dir).'); return done(2); }
    if (isInside(path.resolve(BACKUP_RAW), REPO_ROOT)) { log('REFUSED - thu muc sao luu nam TRONG repo.'); return done(2); }
  }
  const pg = await smoke.loadPg();
  const db = await smoke.connect(pg);
  log('# ket noi DB: OK');

  const backup = async (label) => {
    const dir = path.resolve(BACKUP_RAW);
    fs.mkdirSync(dir, { recursive: true });
    const rows = (await db.query(`SELECT id, to_jsonb(t) ->> 'screenshot_url' AS screenshot_url, screenshot_path
      FROM public.trades t ORDER BY id`)).rows;
    const n = (await db.query('SELECT count(*)::int n FROM public.trades')).rows[0].n;
    if (rows.length !== n) throw new Error(`sao luu: ${rows.length} hang khac COUNT ${n}`);
    const body = JSON.stringify({ table: 'public.trades', columns: ['id', 'screenshot_url', 'screenshot_path'], rows });
    const file = path.join(dir, `p7_backup_${label}_${Date.now()}.json`);
    fs.writeFileSync(file, body, 'utf8');
    const sha = crypto.createHash('sha256').update(body).digest('hex');
    const withUrl = rows.filter((r) => r.screenshot_url).length;
    log(`## sao luu (${label}): rows=${n} with_url=${withUrl} sha256=${sha} -> [thu muc ngoai repo]/${path.basename(file)}`);
  };
  const logProbe90 = async () => {
    const p = await probe90(db);
    p.rows.forEach((r) => log(`   probe90 ${r.check_name}=${r.value} (expected ${r.expected}) ${r.status}`));
    return p.failed;
  };

  let fails = [];
  let code = 0;
  try {
    if (STAGE === '0') {
      await backup('gd0');
      const p0 = await logProbe90();
      fails.push(...p0.map((x) => `probe 90 ${x}`));
      if (p0.includes('url_without_path')) log(`HUONG DAN: ${URL_WITHOUT_PATH_GUIDANCE}`);
      const d = diffMatrix(await probe11Raw(db));
      log(`## probe 11 khop matrix: ${d.length === 0}`);
      fails.push(...d.map((x) => `probe 11 ${x}`));
    } else if (STAGE === '1') {
      await db.query('BEGIN');
      try {
        await setTimeouts(db);
        fails.push(...(await dryRunSteps(db, log)));
      } finally {
        await db.query('ROLLBACK');
      }
      const still = await columnExists(db);
      log(`## sau ROLLBACK: cot con = ${still}`);
      if (!still) fails.push('ROLLBACK khong khoi phuc cot');
    } else if (STAGE === '2') {
      await backup('gd2');
      const pre = await logProbe90();
      if (pre.length) {
        fails.push(...pre.map((x) => `probe 90 ${x} (khong ap)`));
        if (pre.includes('url_without_path')) log(`HUONG DAN: ${URL_WITHOUT_PATH_GUIDANCE}`);
      } else {
        // diffMatrix(before) chay trong giao dich truoc UP; lech -> ROLLBACK, khong COMMIT.
        const r = await apply090(db, log, errText, diffMatrix);
        fails.push(...r.fails);
        if (!r.fails.length) log('## 090 COMMIT; probe 11 truoc 090 khop matrix va khong doi sau 090');
      }
    } else if (STAGE === '3') {
      fails.push(...(await logProbe90()).map((x) => `probe 90 ${x}`));
      if (await columnExists(db)) fails.push('cot screenshot_url van con');
      if (!(await has090(db))) fails.push('schema_migrations thieu 090');
      const d = diffMatrix(await probe11Raw(db));
      log(`## probe 11 khop matrix: ${d.length === 0}`);
      fails.push(...d.map((x) => `probe 11 ${x}`));
    } else {
      const rb = await rollback090(db, errText);
      if (rb.length) { rb.forEach((x) => log(`ROLLBACK-ERROR ${x}`)); code = 3; }
      else log(`## 090.down: OK; cot = ${JSON.stringify(await columnShape(db))}; 090 trong schema_migrations = ${await has090(db)}`);
    }
  } catch (e) {
    fails.push(`loi: ${errText(e)}`);
  }
  await db.end().catch(() => {});
  if (code === 3) { log('RESULT: ROLLBACK-ERROR - can nguoi xu ly; sao luu o thu muc ngoai repo'); return done(3); }
  if (fails.length) {
    fails.forEach((f) => log(`FAIL ${f}`));
    log(`RESULT: FAIL - GD${STAGE}`);
    return done(1);
  }
  log(`RESULT: PASS - GD${STAGE}`);
  return done(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code;
  try {
    code = await main();
  } catch (e) {
    console.error(`ERROR ${String(e && e.message ? e.message : e).replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgres://[REDACTED]').slice(0, 300)}`);
    code = 2;
  }
  process.exit(code);
}
