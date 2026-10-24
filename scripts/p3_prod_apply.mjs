#!/usr/bin/env node
// p3_prod_apply.mjs - áp patch 030/031 (Phase 03, C3/C5) lên PROD có sao lưu, probe và rollback tự động.
//
// CHỈ chạy bởi execute agent C5 (hoặc user) sau khi cổng cục bộ xanh. Script này KHÔNG được chạy ở leg viết code.
//
// Biến môi trường (KHÔNG ghi secret ra file/log):
//   PROD_DB_URL      chuỗi kết nối Postgres PROD (bắt buộc)
//   PG_MODULE_PATH   đường dẫn tới package `pg` NGOÀI app (app không cài pg) (bắt buộc)
//   P3_BACKUP_DIR    thư mục sao lưu NGOÀI repo (hoặc cờ --backup-dir) (bắt buộc)
//
// Cờ:
//   --confirm-prod        BẮT BUỘC; thiếu -> không làm gì (exit 2)
//   --backup-dir <path>   thư mục sao lưu (ghi đè P3_BACKUP_DIR); phải nằm NGOÀI repo TradeNote
//   --out <path>          file evidence (mặc định harness/p3/d0-prod-apply.txt của program task folder)
//
// Các bước:
//   0. preflight: schema_migrations (000 phải có), probe 30 -> invariants trước
//   1. sao lưu trades (id, risk_amount, pnl, r_multiple [+ risk_is_estimated nếu cột đã có]) ra JSON ngoài repo
//   2. áp 030 -> probe 30 -> invariants PHẢI bằng trước (COUNT, COUNT 500, SUM pnl/risk/r)
//   3. áp 031 -> COUNT(cờ true) = COUNT(risk_amount = 500), est_true_not_500 = 0, invariants vẫn bằng
//   4. chạy lại 031 -> UPDATE 0 hàng; schema_migrations có 030 và 031
//   Assertion lệch -> rollback CHỈ những patch áp trong phiên này: 031.down rồi 030.down (C5(c)).
//   Mọi DROP/DELETE khác bị cấm; script không chạy SQL nào ngoài các file patch/probe ở trên + SELECT.
// Exit: 0 PASS; 1 FAIL (đã rollback); 2 từ chối chạy / thiếu điều kiện; 3 lỗi rollback (cần người xử lý).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_DIR, '..');
const SB_DIR = path.join(APP_DIR, 'supabase');
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  'process/general-plans/active/hardening-security-data-integrity_11-10-26/harness/p3/d0-prod-apply.txt',
);

const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const CONFIRM = args.includes('--confirm-prod');
const OUT_PATH = path.resolve(argVal('--out') || DEFAULT_OUT);
const BACKUP_DIR_RAW = argVal('--backup-dir') || process.env.P3_BACKUP_DIR || '';
const DB_URL = process.env.PROD_DB_URL || '';

// ---------------------------------------------------------------- output (redacted)

function redact(text) {
  let s = String(text);
  if (DB_URL && DB_URL.length >= 6) s = s.split(DB_URL).join('[REDACTED]');
  return s
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgres://[REDACTED]')
    .replace(/password=[^\s'"]+/gi, 'password=[REDACTED]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[JWT]');
}
const lines = [];
function log(line = '') {
  const safe = redact(line);
  lines.push(safe);
  console.log(safe);
}
function flush() {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
}
const errText = (e) => redact(e && e.message ? e.message : String(e)).slice(0, 300);

// ---------------------------------------------------------------- helpers

const readSql = (rel) => fs.readFileSync(path.join(SB_DIR, rel), 'utf8');
const PATCH = {
  up030: 'patches/030_risk_nullable_estimated.sql',
  down030: 'patches/030_risk_nullable_estimated.down.sql',
  up031: 'patches/031_backfill_flag_estimated.sql',
  down031: 'patches/031_backfill_flag_estimated.down.sql',
  probe30: 'probes/30_p3_estimated_counts.sql',
};
const INVARIANTS = ['total', 'risk_500', 'sum_pnl', 'sum_risk', 'sum_r'];

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function loadPg() {
  const spec = process.env.PG_MODULE_PATH;
  if (!spec) throw new Error('thiếu PG_MODULE_PATH');
  const target = fs.existsSync(spec) && fs.statSync(spec).isDirectory()
    ? pathToFileURL(path.join(spec, 'lib', 'index.js')).href
    : pathToFileURL(path.resolve(spec)).href;
  const mod = await import(target);
  return mod.default || mod;
}

async function probe(db, label) {
  const res = await db.query(readSql(PATCH.probe30));
  const total = res.rows.find((r) => r.scope === 'TOTAL');
  if (!total) throw new Error(`probe 30 (${label}) không có dòng TOTAL`);
  const perAccount = res.rows.filter((r) => r.scope === 'account');
  log(`## probe 30 ${label}: flag_column_present=${total.flag_column_present} accounts=${perAccount.length}`);
  const fmt = (r) =>
    `total=${r.total} risk_500=${r.risk_500} sum_pnl=${r.sum_pnl} sum_risk=${r.sum_risk} sum_r=${r.sum_r}` +
    ` est_null=${r.est_null} est_true=${r.est_true} est_false=${r.est_false} est_true_not_500=${r.est_true_not_500}`;
  log(`   TOTAL ${fmt(total)}`);
  perAccount.forEach((r, i) => log(`   account#${i + 1} ${fmt(r)}`)); // không in account_id
  return total;
}

function sameInvariants(a, b) {
  return INVARIANTS.filter((k) => String(a[k]) !== String(b[k])).map((k) => `${k}: ${a[k]} -> ${b[k]}`);
}

async function migrations(db) {
  const res = await db.query('SELECT version FROM public.schema_migrations ORDER BY version');
  return res.rows.map((r) => r.version);
}

// Chạy file patch nhiều câu; trả về rowCount của câu UPDATE (nếu có).
async function runPatch(db, rel) {
  const res = await db.query(readSql(rel));
  const list = Array.isArray(res) ? res : [res];
  const upd = list.find((r) => r && r.command === 'UPDATE');
  return upd ? upd.rowCount : null;
}

// ---------------------------------------------------------------- main

async function main() {
  log(`# p3_prod_apply - ${new Date().toISOString()}`);
  if (!CONFIRM) {
    log('REFUSED - thiếu --confirm-prod. Không làm gì.');
    return 2;
  }
  if (!DB_URL) {
    log('REFUSED - thiếu PROD_DB_URL.');
    return 2;
  }
  if (!BACKUP_DIR_RAW) {
    log('REFUSED - thiếu thư mục sao lưu (P3_BACKUP_DIR hoặc --backup-dir).');
    return 2;
  }
  const backupDir = path.resolve(BACKUP_DIR_RAW);
  if (isInside(backupDir, REPO_ROOT)) {
    log('REFUSED - thư mục sao lưu nằm TRONG repo; dữ liệu không được vào repo.');
    return 2;
  }
  for (const rel of Object.values(PATCH)) {
    if (!fs.existsSync(path.join(SB_DIR, rel))) {
      log(`REFUSED - thiếu file ${rel}`);
      return 2;
    }
  }

  const pg = await loadPg();
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  log('# kết nối DB: OK');

  const applied = { p030: false, p031: false };
  const failures = [];
  try {
    // 0. preflight
    const migBefore = await migrations(db);
    log(`## schema_migrations trước: ${migBefore.join(', ')}`);
    if (!migBefore.includes('000')) {
      log('REFUSED - schema_migrations chưa có 000.');
      await db.end();
      return 2;
    }
    const had030 = migBefore.includes('030');
    const had031 = migBefore.includes('031');
    const pre = await probe(db, 'trước 030');

    // 1. sao lưu (ngoài repo, không log dữ liệu)
    const cols = pre.flag_column_present
      ? 'id, risk_amount, pnl, r_multiple, risk_is_estimated'
      : 'id, risk_amount, pnl, r_multiple';
    const bk = await db.query(`SELECT ${cols} FROM public.trades ORDER BY id`);
    if (String(bk.rows.length) !== String(pre.total)) {
      throw new Error(`sao lưu ${bk.rows.length} hàng khác COUNT(*) ${pre.total}`);
    }
    fs.mkdirSync(backupDir, { recursive: true });
    const bkFile = path.join(backupDir, `trades_p3_backup_${Date.now()}.json`);
    fs.writeFileSync(bkFile, JSON.stringify({ columns: cols, rows: bk.rows }), 'utf8');
    log(`## sao lưu: ${bk.rows.length} hàng, cột (${cols}) -> [thư mục ngoài repo]/${path.basename(bkFile)}`);

    // 2. áp 030
    await runPatch(db, PATCH.up030);
    applied.p030 = !had030;
    log(`## áp 030: OK${had030 ? ' (đã có trước, idempotent)' : ''}`);
    const post030 = await probe(db, 'sau 030');
    const d030 = sameInvariants(pre, post030);
    if (d030.length) failures.push(`invariants lệch sau 030: ${d030.join('; ')}`);
    if (!post030.flag_column_present) failures.push('sau 030 vẫn chưa có cột risk_is_estimated');

    // 3. áp 031
    if (failures.length === 0) {
      const n031 = await runPatch(db, PATCH.up031);
      applied.p031 = !had031;
      log(`## áp 031: UPDATE ${n031} hàng${had031 ? ' (đã có trước, idempotent)' : ''}`);
      const post031 = await probe(db, 'sau 031');
      const d031 = sameInvariants(pre, post031);
      if (d031.length) failures.push(`invariants lệch sau 031: ${d031.join('; ')}`);
      if (String(post031.est_true) !== String(post031.risk_500)) {
        failures.push(`COUNT(cờ true)=${post031.est_true} khác COUNT(risk_amount=500)=${post031.risk_500}`);
      }
      if (String(post031.est_true_not_500) !== '0') {
        failures.push(`${post031.est_true_not_500} hàng risk khác 500 bị gắn cờ true`);
      }

      // 4. chạy lại 031 -> no-op
      if (failures.length === 0) {
        const again = await runPatch(db, PATCH.up031);
        log(`## chạy lại 031: UPDATE ${again} hàng`);
        if (again !== 0) failures.push(`chạy lại 031 cập nhật ${again} hàng (cần 0)`);
      }
    }

    const migAfter = await migrations(db);
    log(`## schema_migrations sau: ${migAfter.join(', ')}`);
    if (failures.length === 0 && !(migAfter.includes('030') && migAfter.includes('031'))) {
      failures.push('schema_migrations thiếu 030 hoặc 031');
    }
  } catch (e) {
    failures.push(`lỗi: ${errText(e)}`);
  }

  if (failures.length === 0) {
    log('RESULT: PASS - 030/031 đã áp; invariants bằng nhau; cờ đúng; chạy lại 031 no-op');
    await db.end();
    return 0;
  }

  for (const f of failures) log(`FAIL ${f}`);
  // Rollback do probe fail: CHỈ patch áp trong phiên này, thứ tự 031 -> 030.
  let rbCode = 1;
  try {
    if (applied.p031) {
      await runPatch(db, PATCH.down031);
      log('## rollback: 031.down OK');
    }
    if (applied.p030) {
      await runPatch(db, PATCH.down030);
      log('## rollback: 030.down OK');
    }
    if (!applied.p030 && !applied.p031) log('## rollback: không có patch nào áp trong phiên này');
    await probe(db, 'sau rollback');
  } catch (e) {
    log(`ROLLBACK-ERROR ${errText(e)} - cần người xử lý; bản sao lưu nằm ở thư mục ngoài repo`);
    rbCode = 3;
  }
  log('RESULT: FAIL - đã rollback (xem trên)');
  await db.end().catch(() => {});
  return rbCode;
}

let code;
try {
  code = await main();
} catch (e) {
  log(`ERROR ${errText(e)}`);
  code = 2;
}
flush();
process.exit(code);
