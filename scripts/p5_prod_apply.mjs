#!/usr/bin/env node
// p5_prod_apply.mjs - áp patch 050 -> 051 -> 052 -> 053 (Phase 05, Step E) lên PROD theo giai đoạn GĐ0-GĐ6,
// có sao lưu, dry-run, golden, smoke và rollback tự động. Tổng quát hóa từ scripts/p3_prod_apply.mjs.
//
// Biến môi trường (KHÔNG ghi secret ra file/log): PROD_DB_URL, PG_MODULE_PATH, P5_BACKUP_DIR (hoặc --backup-dir).
// Cờ: --confirm-prod (bắt buộc) --stage <0..6> | --rollback-all | --rehearse-disable ; --backup-dir <path NGOÀI repo> ; --out <file>
//   --rehearse-disable: diễn tập công tắc khẩn TRONG BEGIN..ROLLBACK (DISABLE 4 trigger, chứng minh ghi lọt, ROLLBACK,
//   kiểm tgenabled='O' + dư lượng = 0). Không để lại thay đổi nào.
//
//   GĐ0 sao lưu + preflight chỉ-đọc + probe 11 baseline + probe 50 (+ tạo chỉ mục CONCURRENTLY nếu thiếu, D-7)
//   GĐ1 dry-run trong BEGIN..ROLLBACK: 050,051,052,053 + 3 golden + kịch bản trong-txn + đột biến (phải bị giết)
//       + down 053..050 (kiểm pg_proc/pg_trigger sạch) + up lại + golden; sau ROLLBACK kiểm sạch
//   GĐ2 áp 050 + golden trading_day (trong cùng giao dịch, COMMIT chỉ khi PASS) + probe 11
//   GĐ3 áp 051 (+ backfill) + đếm prefs = users + probe đăng ký (user thử commit + dọn)
//   GĐ4 áp 052 + golden hard_stop + smoke trigger + concurrent
//   GĐ5 áp 053 + golden config_lock + smoke config-lock-*
//   GĐ6 đóng: probe 11 khớp matrix, prefs = users, schema_migrations 050-053, tgenabled, RPC từ chối, dư lượng = 0
// Lỗi ở GĐ2-5: DISABLE TRIGGER (IF EXISTS) rồi .down.sql theo thứ tự 053, 052, 051, 050 cho các patch đã có.
// Script chỉ chạy: file patch/probe/golden của repo, SELECT, và DML trên user thử (email p5-probe-*@example.invalid).
// Exit: 0 PASS; 1 FAIL (đã rollback); 2 từ chối/thiếu điều kiện; 3 lỗi rollback (cần người xử lý).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  APP_DIR, REPO_ROOT, HARNESS_P5, makeLogger, loadPg, connect, setTimeouts,
  buildFixture, triggerScenarios, configScenarios, runScenarios, runInTxnSuite, runConcurrent, runSignup,
  countResidue, attempt,
} from './p5_prod_smoke.mjs';
import { fileURLToPath } from 'node:url';

const SB = path.join(APP_DIR, 'supabase');
const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const STAGE = args.includes('--rollback-all') ? 'rollback' : args.includes('--rehearse-disable') ? 'rehearse' : argVal('--stage');
const OUT = path.resolve(argVal('--out') || path.join(HARNESS_P5, STAGE === 'rehearse' ? 'rehearse-disable-prod.txt' : `gd${STAGE}-prod.txt`));
const BACKUP_RAW = argVal('--backup-dir') || process.env.P5_BACKUP_DIR || '';
const { log, flush, errText } = makeLogger(OUT);

const F = {
  up: {
    '050': 'patches/050_trading_day_fn.sql',
    '051': 'patches/051_user_preferences_ensure_row.sql',
    '052': 'patches/052_hard_stop_trigger.sql',
    '053': 'patches/053_hard_stop_config_lock.sql',
  },
  down: {
    '050': 'patches/050_trading_day_fn.down.sql',
    '051': 'patches/051_user_preferences_ensure_row.down.sql',
    '052': 'patches/052_hard_stop_trigger.down.sql',
    '053': 'patches/053_hard_stop_config_lock.down.sql',
  },
  golden: {
    trading_day: 'tests/trading_day_golden.generated.sql',
    hard_stop: 'tests/hard_stop_golden.generated.sql',
    config_lock: 'tests/hard_stop_config_lock_golden.generated.sql',
  },
  probe11: 'probes/11_p1_grants_matrix.sql',
  probe50: 'probes/50_p5_pre_checks.sql',
  matrix: 'tests/grants_matrix.expected.json',
};
const read = (rel) => fs.readFileSync(path.join(SB, rel), 'utf8');
const P5_FN_NAMES = {
  '050': ['trading_day'],
  '051': ['user_preferences_ensure_row'],
  '052': ['hard_stop_decide', 'hard_stop_evaluate', 'hard_stop_trades_trg'],
  '053': ['hard_stop_config_decide', 'hard_stop_prefs_config_decide', 'hard_stop_config_accounts_trg', 'hard_stop_config_prefs_trg'],
};
const ALL_P5_FNS = Object.values(P5_FN_NAMES).flat();
const TRIGGERS = {
  '051': [['auth.users', 'trg_user_preferences_ensure_row']],
  '052': [['public.trades', 'trg_hard_stop']],
  '053': [['public.accounts', 'trg_hard_stop_config_accounts'], ['public.user_preferences', 'trg_hard_stop_config_prefs']],
};

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// ---------------------------------------------------------------- helpers DB

async function migrations(db) {
  const r = await db.query('SELECT version FROM public.schema_migrations ORDER BY version');
  return r.rows.map((x) => x.version);
}

async function p5Catalog(db) {
  const fns = await db.query(
    `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY($1::text[]) ORDER BY 1`, [ALL_P5_FNS]);
  const trg = await db.query(
    `SELECT t.tgname, c.relnamespace::regnamespace::text || '.' || c.relname AS tbl, t.tgenabled
     FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND t.tgname IN ('trg_hard_stop','trg_hard_stop_config_accounts','trg_hard_stop_config_prefs','trg_user_preferences_ensure_row')
     ORDER BY 1`);
  return { functions: fns.rows.map((r) => r.proname), triggers: trg.rows };
}

// Golden trong giao dịch hiện tại; PASS khi có NOTICE "<name> golden PASS n/n" và không lỗi.
async function runGolden(db, key) {
  db.notices.length = 0;
  try {
    await db.query(read(F.golden[key]));
  } catch (e) {
    return { pass: false, msg: String(e.message).split('\n')[0].slice(0, 300) };
  }
  const m = db.notices.find((n) => /golden PASS \d+\/\d+/.test(n));
  return { pass: !!m, msg: m || 'không thấy NOTICE PASS' };
}

// So probe 11 với matrix kỳ vọng; `present` = các patch P5 đã/đang có (hàm của patch khác bị loại khỏi kỳ vọng).
async function probe11(db, present) {
  const r = await db.query(read(F.probe11));
  const actual = r.rows[0].matrix;
  const exp = JSON.parse(read(F.matrix));
  delete exp._doc;
  const absentFns = Object.entries(P5_FN_NAMES).filter(([v]) => !present.includes(v)).flatMap(([, n]) => n);
  for (const k of Object.keys(exp.functions)) {
    const name = k.replace(/^public\./, '').split('(')[0];
    if (absentFns.includes(name)) delete exp.functions[k];
  }
  const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]])) : v));
  const diffs = [];
  for (const sec of ['version', 'tables', 'functions', 'policies']) {
    if (canon(actual[sec]) !== canon(exp[sec])) {
      if (sec === 'functions') {
        const keys = new Set([...Object.keys(actual.functions || {}), ...Object.keys(exp.functions || {})]);
        for (const k of keys) {
          if (canon(actual.functions?.[k]) !== canon(exp.functions?.[k])) {
            diffs.push(`functions.${k}: actual=${canon(actual.functions?.[k])} expected=${canon(exp.functions?.[k])}`);
          }
        }
      } else diffs.push(`${sec} khác`);
    }
  }
  return { match: diffs.length === 0, diffs, functionsCount: Object.keys(actual.functions || {}).length };
}

async function probe50(db) {
  const r = await db.query(read(F.probe50));
  return r.rows[0].p5;
}

async function counts(db) {
  const r = await db.query(`SELECT (SELECT count(*) FROM auth.users)::int users,
    (SELECT count(*) FROM public.user_preferences)::int prefs,
    (SELECT count(*) FROM public.accounts)::int accounts,
    (SELECT count(*) FROM public.trades)::int trades`);
  return r.rows[0];
}

// Sao lưu JSON NGOÀI repo (accounts, user_preferences, trades, schema_migrations + định nghĩa hàm/trigger/policy
// public; auth.users CHỈ số lượng). Không có pg_dump trong môi trường -> catalog DDL thay cho dump schema.
async function backup(db, label) {
  if (!BACKUP_RAW) throw new Error('thiếu thư mục sao lưu');
  const dir = path.resolve(BACKUP_RAW);
  if (isInside(dir, REPO_ROOT)) throw new Error('thư mục sao lưu nằm TRONG repo');
  fs.mkdirSync(dir, { recursive: true });
  const data = {};
  const summary = {};
  for (const t of ['accounts', 'user_preferences', 'trades', 'schema_migrations']) {
    const rows = (await db.query(`SELECT * FROM public.${t}`)).rows;
    const n = (await db.query(`SELECT count(*)::int n FROM public.${t}`)).rows[0].n;
    if (rows.length !== n) throw new Error(`sao lưu ${t}: ${rows.length} hàng khác COUNT ${n}`);
    data[t] = rows;
    summary[t] = n;
  }
  data.auth_users_count = (await db.query('SELECT count(*)::int n FROM auth.users')).rows[0].n;
  summary.auth_users_count = data.auth_users_count;
  data.catalog = {
    functions: (await db.query(`SELECT p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'`)).rows,
    triggers: (await db.query(`SELECT t.tgname, pg_get_triggerdef(t.oid) def FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname IN ('public', 'auth')`)).rows,
    policies: (await db.query("SELECT * FROM pg_policies WHERE schemaname = 'public'")).rows,
  };
  const body = JSON.stringify(data);
  const file = path.join(dir, `p5_backup_${label}_${Date.now()}.json`);
  fs.writeFileSync(file, body, 'utf8');
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  log(`## sao lưu (${label}): ${JSON.stringify(summary)} sha256=${sha} -> [thư mục ngoài repo]/${path.basename(file)}`);
  return { file, sha, summary };
}

// Áp một patch trong giao dịch riêng; `verify(db)` chạy TRƯỚC COMMIT, trả mảng lỗi.
async function applyPatch(db, v, verify) {
  await db.query('BEGIN');
  try {
    await setTimeouts(db);
    await db.query(read(F.up[v]));
    const fails = verify ? await verify(db) : [];
    if (fails.length) {
      await db.query('ROLLBACK');
      return fails;
    }
    await db.query('COMMIT');
    return [];
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    return [`áp ${v}: ${errText(e)}`];
  }
}

// Gỡ toàn bộ P5 đang có: DISABLE TRIGGER trước, rồi .down theo thứ tự 053, 052, 051, 050.
// Review E17 M1: lock_timeout 3s cho DISABLE (không treo sau giao dịch dài); DISABLE trigger 051 trên auth.users
// (cần owner bảng auth) lỗi -> ghi lại và TIẾP TỤC chuỗi .down (051.down DROP trigger theo tên); evidence flush
// sau từng bước để crash giữa chừng không mất log. L = logger (mặc định logger của script; harness PGlite truyền riêng).
export async function rollbackAll(db, L = { log, flush, errText }) {
  const step = (line) => { L.log(line); L.flush(); };
  const mig = await migrations(db);
  const cat = await p5Catalog(db);
  const present = ['053', '052', '051', '050'].filter((v) => mig.includes(v)
    || P5_FN_NAMES[v].some((n) => cat.functions.includes(n)));
  step(`## rollback: patch có mặt (theo thứ tự gỡ): ${present.join(', ') || '(không)'}`);
  await db.query("SET lock_timeout = '3s'");
  step('   SET lock_timeout = 3s (phiên)');
  const disableWarnings = [];
  for (const v of ['053', '052', '051']) {
    for (const [tbl, tg] of TRIGGERS[v]) {
      if (!cat.triggers.some((t) => t.tgname === tg)) continue;
      try {
        await db.query(`ALTER TABLE ${tbl} DISABLE TRIGGER ${tg}`);
        step(`   DISABLE TRIGGER ${tg} ON ${tbl}: OK`);
      } catch (e) {
        if (v !== '051') { step(`   DISABLE TRIGGER ${tg} ON ${tbl}: LỖI ${L.errText(e)}`); throw e; }
        disableWarnings.push(tg);
        step(`   DISABLE TRIGGER ${tg} ON ${tbl}: LỖI ${L.errText(e)} - bỏ qua, tiếp tục chuỗi .down (051.down DROP trigger theo tên)`);
      }
    }
  }
  for (const v of present) {
    await db.query('BEGIN');
    try {
      await setTimeouts(db);
      await db.query(read(F.down[v]));
      await db.query('COMMIT');
      step(`   ${v}.down: OK`);
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      step(`   ${v}.down: LỖI ${L.errText(e)}`);
      throw new Error(`${v}.down lỗi: ${L.errText(e)}`);
    }
  }
  await db.query('RESET lock_timeout');
  const after = await p5Catalog(db);
  step(`## sau rollback: functions=${JSON.stringify(after.functions)} triggers=${JSON.stringify(after.triggers)} migrations=${(await migrations(db)).join(', ')}${disableWarnings.length ? ` disable-warnings=${disableWarnings.join(',')}` : ''}`);
  return { present, disableWarnings, after };
}

const ALL_TRIGGERS = [...TRIGGERS['052'], ...TRIGGERS['053'], ...TRIGGERS['051']];
async function tgState(db) {
  const r = await db.query(
    `SELECT tgname, tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[]) ORDER BY 1`,
    [ALL_TRIGGERS.map(([, tg]) => tg)]);
  return Object.fromEntries(r.rows.map((x) => [x.tgname, x.tgenabled]));
}

// Diễn tập công tắc khẩn (review E17 M1) trong BEGIN..ROLLBACK: không để lại thay đổi.
async function rehearseDisable(db) {
  const fails = [];
  const step = (line) => { log(line); flush(); };
  const before = await tgState(db);
  step(`## tgenabled trước: ${JSON.stringify(before)}`);
  if (ALL_TRIGGERS.some(([, tg]) => before[tg] !== 'O')) return [`trạng thái ban đầu không phải 'O' cho cả 4 trigger: ${JSON.stringify(before)}`];
  const residueBefore = await countResidue(db, []);
  step(`## dư lượng mẫu thử trước: ${JSON.stringify(residueBefore)}`);
  const ins = `INSERT INTO public.trades (user_id, account_id, asset, lot_size, pnl, result, setup, emotion, mistake, date)
     VALUES ($1,$2,'MNQ',1,-1,'Loss','p5-probe','Calm','None',now())`;
  await db.query('BEGIN');
  try {
    await setTimeouts(db);
    await db.query("SET LOCAL lock_timeout = '3s'");
    const f = await buildFixture(db);
    const disabledAlt = new Set();
    step('   fixture (user A khóa: lỗ 100 / limit 100) tạo trong giao dịch');
    const pre = await attempt(db, f.A, ins, [f.A, f.A1]);
    const preOk = !pre.ok && pre.code === 'P0001' && pre.hint === 'HARD_STOP';
    step(`   ${preOk ? 'PASS' : 'FAIL'} trước DISABLE: insert ngày khóa bị chặn (sqlstate ${pre.code || 'none'})`);
    if (!preOk) fails.push('trước DISABLE insert không bị chặn');
    for (const [tbl, tg] of ALL_TRIGGERS) {
      await db.query('SAVEPOINT p5_dis');
      try {
        await db.query(`ALTER TABLE ${tbl} DISABLE TRIGGER ${tg}`);
        await db.query('RELEASE SAVEPOINT p5_dis');
        step(`   DISABLE TRIGGER ${tg} ON ${tbl}: OK`);
      } catch (e) {
        await db.query('ROLLBACK TO SAVEPOINT p5_dis');
        await db.query('RELEASE SAVEPOINT p5_dis');
        step(`   DISABLE TRIGGER ${tg} ON ${tbl}: LỖI ${errText(e)} (sqlstate ${e.code})`);
        if (tg !== 'trg_user_preferences_ensure_row') { fails.push(`DISABLE ${tg}: ${e.code}`); continue; }
        // auth.users thuộc supabase_auth_admin: postgres không DISABLE được (quan sát PROD 29-10-26, 42501).
        // Công tắc thay thế cho 051 = DROP TRIGGER (cũng là 051.down) -> diễn tập trong SAVEPOINT, hoàn tác ngay.
        await db.query('SAVEPOINT p5_drop');
        try {
          await db.query(`DROP TRIGGER ${tg} ON ${tbl}`);
          step(`   PASS công tắc thay thế: DROP TRIGGER ${tg} ON ${tbl} OK (hoàn tác bằng ROLLBACK TO SAVEPOINT)`);
          disabledAlt.add(tg);
        } catch (e2) {
          step(`   FAIL công tắc thay thế: DROP TRIGGER ${tg} ON ${tbl}: LỖI ${errText(e2)} (sqlstate ${e2.code})`);
          fails.push(`không tắt được ${tg} (DISABLE ${e.code}, DROP ${e2.code})`);
        }
        await db.query('ROLLBACK TO SAVEPOINT p5_drop');
        await db.query('RELEASE SAVEPOINT p5_drop');
      }
    }
    const mid = await tgState(db);
    const midOk = ALL_TRIGGERS.every(([, tg]) => mid[tg] === 'D' || disabledAlt.has(tg));
    step(`   ${midOk ? 'PASS' : 'FAIL'} tgenabled trong giao dịch: ${JSON.stringify(mid)}${disabledAlt.size ? ` (tắt bằng DROP đã diễn tập: ${[...disabledAlt].join(',')})` : ''}`);
    if (!midOk) fails.push('tgenabled trong giao dịch không phải D (hoặc đã có công tắc thay thế) cho cả 4');
    const post = await attempt(db, f.A, ins, [f.A, f.A1]);
    const postOk = post.ok && post.rowCount === 1;
    step(`   ${postOk ? 'PASS' : 'FAIL'} sau DISABLE: insert ngày khóa (SET LOCAL ROLE authenticated) THÀNH CÔNG${postOk ? '' : ` (sqlstate ${post.code})`}`);
    if (!postOk) fails.push('sau DISABLE insert vẫn bị chặn');
  } catch (e) {
    fails.push(`lỗi diễn tập: ${errText(e)}`);
  } finally {
    await db.query('ROLLBACK');
    step('   ROLLBACK');
  }
  const after = await tgState(db);
  const afterOk = ALL_TRIGGERS.every(([, tg]) => after[tg] === 'O');
  step(`   ${afterOk ? 'PASS' : 'FAIL'} tgenabled sau ROLLBACK: ${JSON.stringify(after)}`);
  if (!afterOk) fails.push('tgenabled sau ROLLBACK không phải O');
  const residue = await countResidue(db, []);
  const resOk = Object.values(residue).every((n) => n === 0);
  step(`   ${resOk ? 'PASS' : 'FAIL'} dư lượng mẫu thử sau ROLLBACK: ${JSON.stringify(residue)}`);
  if (!resOk) fails.push('còn dữ liệu thử');
  return fails;
}

// ---------------------------------------------------------------- stages

async function stage0(db) {
  const fails = [];
  await backup(db, 'gd0');
  const c = await counts(db);
  log(`## đếm gốc: ${JSON.stringify(c)}`);
  const authTrg = await db.query(`SELECT t.tgname, t.tgenabled FROM pg_trigger t
    WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal ORDER BY 1`);
  log(`## trigger hiện có trên auth.users: ${JSON.stringify(authTrg.rows)}`);
  const pubTrg = await db.query(`SELECT c.relname tbl, t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY 1, 2`);
  log(`## trigger hiện có trên public: ${JSON.stringify(pubTrg.rows)}`);
  const p50 = await probe50(db);
  log(`## probe 50: ${JSON.stringify(p50)}`);
  if (p50.name_collisions.functions.length || p50.name_collisions.triggers.length) fails.push('đã có hàm/trigger trùng tên P5');
  const pv = p50.privileges;
  const pre = {
    set_role_authenticated: pv.member_authenticated,
    auth_users_insert: pv.auth_users_insert,
    auth_users_delete: pv.auth_users_delete,
    auth_users_trigger: pv.auth_users_trigger || p50.auth_users_owner === pv.current_user,
  };
  log(`## preflight quyền: ${JSON.stringify(pre)} (owner auth.users = current_user? ${p50.auth_users_owner === pv.current_user})`);
  for (const [k, ok] of Object.entries(pre)) if (!ok) log(`CONTEXT_PARTIAL: thiếu quyền ${k}`);
  const p11 = await probe11(db, []);
  log(`## probe 11 baseline (kỳ vọng trừ hàm P5): match=${p11.match} functions=${p11.functionsCount}`);
  p11.diffs.forEach((d) => log(`   DIFF ${d}`));
  if (!p11.match) fails.push('probe 11 baseline lệch matrix');
  if (!p50.trades_account_date_index.length) {
    log('## chỉ mục (account_id, date) THIẾU -> CREATE INDEX CONCURRENTLY IF NOT EXISTS (ngoài giao dịch, D-7)');
    await db.query("SET lock_timeout = '3s'");
    await db.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS trades_account_id_date_p5_idx ON public.trades (account_id, date)');
    await db.query('RESET lock_timeout');
    log(`   sau tạo: ${JSON.stringify((await probe50(db)).trades_account_date_index)}`);
  } else log('## chỉ mục (account_id, date) đã có -> không tạo');
  return fails;
}

// Đột biến C4: thay chuỗi trong thân patch, CREATE OR REPLACE trong SAVEPOINT -> golden/kịch bản PHẢI FAIL.
const RET_OLD_TAIL = "  IF TG_OP = 'DELETE' THEN\n    RETURN OLD;\n  END IF;\n  RETURN NEW;\nEND;\n$fn$;";
const MUTANTS = [
  ['052', 'drop >= (locked)', 'ELSIF v_loss * 100 >= v_limit_x100 THEN', 'ELSIF v_loss * 100 > v_limit_x100 THEN'],
  ['052', 'drop DELETE branch', 'v_allowed := v_old_key IS DISTINCT FROM v_day;', 'v_allowed := true;'],
  ['052', 'allow pnl column', "'risk_is_estimated'];\n  v_rules", "'risk_is_estimated', 'pnl'];\n  v_rules"],
  ['052', 'RETURN OLD -> NEW (DELETE tail)', RET_OLD_TAIL, RET_OLD_TAIL.replace('RETURN OLD;', 'RETURN NEW;'), 'last'],
  ['052', 'drop non-positive limit guard (M2)', 'IF v_limit_x100 IS NOT NULL AND v_limit_x100 <= 0 THEN', 'IF false THEN'],
  ['053', 'drop config raise branch', 'OR (v_old_l IS NOT NULL AND v_new_l IS NOT NULL AND v_new_l > v_old_l)', ''],
  ['053', 'drop reset change', 'OR v_reset_changed THEN', 'THEN'],
];

function mutate(text, a, b, mode) {
  const i = mode === 'last' ? text.lastIndexOf(a) : text.indexOf(a);
  if (i < 0) return null;
  return text.slice(0, i) + b + text.slice(i + a.length);
}

async function allChecks(db, f) {
  const out = [];
  for (const g of ['trading_day', 'hard_stop', 'config_lock']) {
    await db.query('SAVEPOINT g');
    const r = await runGolden(db, g);
    await db.query('ROLLBACK TO SAVEPOINT g');
    if (!r.pass) out.push(`golden ${g}`);
  }
  const s = await runScenarios(db, [...triggerScenarios(f), ...configScenarios(f)], null);
  out.push(...s.failed);
  return out;
}

async function stage1(db) {
  const fails = [];
  const before = await p5Catalog(db);
  await db.query('BEGIN');
  try {
    await setTimeouts(db);
    for (const v of ['050', '051', '052', '053']) {
      await db.query(read(F.up[v]));
      log(`## dry-run up ${v}: OK`);
    }
    for (const g of ['trading_day', 'hard_stop', 'config_lock']) {
      await db.query('SAVEPOINT g');
      const r = await runGolden(db, g);
      await db.query('ROLLBACK TO SAVEPOINT g');
      log(`## golden ${g}: ${r.pass ? 'PASS' : 'FAIL'} ${r.msg}`);
      if (!r.pass) fails.push(`golden ${g}`);
    }
    const f = await buildFixture(db);
    log('## kịch bản trong-txn (fixture tạo trong giao dịch sẽ ROLLBACK):');
    for (const [k, list] of [['trigger', triggerScenarios(f)], ['config', configScenarios(f)]]) {
      const r = await runScenarios(db, list, log, `[${k}] `);
      log(`## ${k}: PASS ${r.pass}/${r.total}`);
      if (r.failed.length) fails.push(`kịch bản ${k}: ${r.failed.join('; ')}`);
    }
    log('## đột biến (phải bị giết):');
    let killed = 0;
    for (const [v, name, a, b, mode] of MUTANTS) {
      const body = mutate(read(F.up[v]), a, b, mode);
      if (!body) { log(`   NOT_APPLIED ${name}`); fails.push(`đột biến không áp được: ${name}`); continue; }
      await db.query('SAVEPOINT mut');
      let res;
      try {
        await db.query(body);
        const bad = await allChecks(db, f);
        res = bad.length ? `KILLED by ${bad.slice(0, 3).join(', ')}` : 'SURVIVED';
      } catch (e) {
        res = `KILLED (lỗi áp: ${String(e.message).slice(0, 80)})`;
      }
      await db.query('ROLLBACK TO SAVEPOINT mut');
      if (res.startsWith('KILLED')) killed += 1; else fails.push(`đột biến sống: ${name}`);
      log(`   ${res.startsWith('KILLED') ? 'KILLED' : 'SURVIVED'} ${name} - ${res}`);
    }
    log(`## đột biến: ${killed}/${MUTANTS.length} bị giết`);
    // up/down/up
    for (const v of ['053', '052', '051', '050']) await db.query(read(F.down[v]));
    const mid = await p5Catalog(db);
    log(`## sau down 053..050 (trong txn): functions=${mid.functions.length} triggers=${mid.triggers.length}`);
    if (mid.functions.length || mid.triggers.length) fails.push('down không sạch');
    for (const v of ['050', '051', '052', '053']) await db.query(read(F.up[v]));
    for (const g of ['trading_day', 'hard_stop', 'config_lock']) {
      await db.query('SAVEPOINT g');
      const r = await runGolden(db, g);
      await db.query('ROLLBACK TO SAVEPOINT g');
      log(`## up lần 2 - golden ${g}: ${r.pass ? 'PASS' : 'FAIL'} ${r.msg}`);
      if (!r.pass) fails.push(`golden ${g} (up lần 2)`);
    }
  } catch (e) {
    fails.push(`lỗi dry-run: ${errText(e)}`);
  } finally {
    await db.query('ROLLBACK').catch(() => {});
  }
  const after = await p5Catalog(db);
  log(`## sau ROLLBACK: functions=${after.functions.length} triggers=${after.triggers.length} (trước: ${before.functions.length}/${before.triggers.length})`);
  if (after.functions.length !== before.functions.length || after.triggers.length !== before.triggers.length) fails.push('ROLLBACK để lại đối tượng');
  const res = await countResidue(db, []);
  log(`## dư lượng user thử: ${JSON.stringify(res)}`);
  if (res.users) fails.push('dư user thử');
  return fails;
}

async function needMig(db, list) {
  const mig = await migrations(db);
  const miss = list.filter((v) => !mig.includes(v));
  return miss.length ? [`thiếu patch tiền đề: ${miss.join(', ')}`] : [];
}

async function stage2(db) {
  await backup(db, 'gd2');
  const fails = await applyPatch(db, '050', async (d) => {
    const r = await runGolden(d, 'trading_day');
    log(`## golden trading_day (trước COMMIT): ${r.pass ? 'PASS' : 'FAIL'} ${r.msg}`);
    return r.pass ? [] : ['golden trading_day'];
  });
  if (fails.length) return fails;
  log('## áp 050: COMMIT');
  const p11 = await probe11(db, ['050']);
  log(`## probe 11 sau 050: match=${p11.match}`);
  p11.diffs.forEach((d) => log(`   DIFF ${d}`));
  return p11.match ? [] : ['probe 11 lệch sau 050'];
}

async function stage3(db) {
  const pre = await needMig(db, ['050']);
  if (pre.length) return pre;
  await backup(db, 'gd3');
  const fails = await applyPatch(db, '051', async (d) => {
    const c = await counts(d);
    const miss = (await d.query(`SELECT count(*)::int n FROM auth.users u
      WHERE NOT EXISTS (SELECT 1 FROM public.user_preferences p WHERE p.user_id = u.id)`)).rows[0].n;
    log(`## sau 051 + backfill (trước COMMIT): users=${c.users} prefs=${c.prefs} users_without_prefs=${miss}`);
    return miss === 0 ? [] : [`còn ${miss} user thiếu prefs`];
  });
  if (fails.length) {
    if (fails.some((x) => /permission|must be owner|42501/i.test(x))) {
      log(`CONTEXT_PARTIAL: 051 thiếu quyền trên auth.users -> ${fails.join('; ')}`);
      return ['CONTEXT_PARTIAL_051'];
    }
    return fails;
  }
  log('## áp 051: COMMIT');
  const s = await runSignup(db, log);
  if (!s.pass) return ['signup-creates-prefs'];
  const p11 = await probe11(db, ['050', '051']);
  log(`## probe 11 sau 051: match=${p11.match}`);
  p11.diffs.forEach((d) => log(`   DIFF ${d}`));
  return p11.match ? [] : ['probe 11 lệch sau 051'];
}

async function stage4(db, pg) {
  const pre = await needMig(db, ['050']);
  if (pre.length) return pre;
  await backup(db, 'gd4');
  const fails = await applyPatch(db, '052', async (d) => {
    const r = await runGolden(d, 'hard_stop');
    log(`## golden hard_stop (trước COMMIT): ${r.pass ? 'PASS' : 'FAIL'} ${r.msg}`);
    return r.pass ? [] : ['golden hard_stop'];
  });
  if (fails.length) return fails;
  log('## áp 052: COMMIT');
  const r = await runInTxnSuite(db, ['trigger'], log);
  log(`## smoke trigger (trong-txn ROLLBACK, trên trigger đã COMMIT): PASS ${r.pass}/${r.total}`);
  const out = r.failed.map((x) => `smoke ${x}`);
  const c = await runConcurrent(pg, db, log);
  if (!c.pass) out.push('hardstop-concurrent-insert');
  return out;
}

async function stage5(db) {
  const pre = await needMig(db, ['050', '052']);
  if (pre.length) return pre;
  await backup(db, 'gd5');
  const fails = await applyPatch(db, '053', async (d) => {
    const r = await runGolden(d, 'config_lock');
    log(`## golden config_lock (trước COMMIT): ${r.pass ? 'PASS' : 'FAIL'} ${r.msg}`);
    return r.pass ? [] : ['golden config_lock'];
  });
  if (fails.length) return fails;
  log('## áp 053: COMMIT');
  const r = await runInTxnSuite(db, ['config', 'trigger'], log);
  log(`## smoke config-lock-* + trigger (trong-txn ROLLBACK): PASS ${r.pass}/${r.total}`);
  return r.failed.map((x) => `smoke ${x}`);
}

async function stage6(db) {
  const fails = [];
  const mig = await migrations(db);
  log(`## schema_migrations: ${mig.join(', ')}`);
  const present = ['050', '051', '052', '053'].filter((v) => mig.includes(v));
  for (const v of ['050', '052', '053']) if (!mig.includes(v)) fails.push(`schema_migrations thiếu ${v}`);
  if (!mig.includes('051')) log('CONTEXT_PARTIAL: 051 vắng trong schema_migrations');
  const p11 = await probe11(db, present);
  log(`## probe 11 cuối: match=${p11.match} functions=${p11.functionsCount}`);
  p11.diffs.forEach((d) => log(`   DIFF ${d}`));
  if (!p11.match) fails.push('probe 11 lệch matrix');
  const c = await counts(db);
  log(`## đếm: ${JSON.stringify(c)}`);
  if (mig.includes('051') && c.users !== c.prefs) fails.push(`prefs ${c.prefs} != users ${c.users}`);
  const cat = await p5Catalog(db);
  log(`## trigger P5: ${JSON.stringify(cat.triggers)}`);
  if (cat.triggers.some((t) => t.tgenabled !== 'O')) fails.push('có trigger P5 không ở trạng thái O');
  const rpc = await db.query(`SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth,
      has_function_privilege('anon', p.oid, 'EXECUTE') anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY($1::text[]) ORDER BY 1`, [ALL_P5_FNS]);
  const callable = rpc.rows.filter((r) => r.auth || r.anon);
  log(`## hàm P5: ${rpc.rows.length}; gọi được bởi anon/authenticated: ${callable.length}`);
  if (callable.length) fails.push(`RPC gọi được: ${callable.map((r) => r.proname).join(', ')}`);
  const p50 = await probe50(db);
  log(`## probe 50 cuối: ${JSON.stringify({ users_total: p50.users_total, users_without_preferences: p50.users_without_preferences, hard_stop_non_numeric_limit: p50.hard_stop_non_numeric_limit, hard_stop_percent_nonpositive_balance: p50.hard_stop_percent_nonpositive_balance, index: p50.trades_account_date_index.map((i) => i.index) })}`);
  const res = await countResidue(db, []);
  log(`## dư lượng user thử (users/accounts/trades/prefs): ${JSON.stringify(res)}`);
  if (res.users + res.accounts + res.trades + res.prefs !== 0) fails.push('dư lượng user thử != 0');
  return fails;
}

// ---------------------------------------------------------------- main

async function main() {
  log(`# p5_prod_apply --stage ${STAGE} - ${new Date().toISOString()}`);
  if (!args.includes('--confirm-prod')) { log('REFUSED - thiếu --confirm-prod.'); return 2; }
  if (!process.env.PROD_DB_URL) { log('REFUSED - thiếu PROD_DB_URL.'); return 2; }
  if (!['0', '1', '2', '3', '4', '5', '6', 'rollback', 'rehearse'].includes(String(STAGE))) { log('REFUSED - --stage 0..6 | --rollback-all | --rehearse-disable'); return 2; }
  if (['0', '2', '3', '4', '5'].includes(STAGE)) {
    if (!BACKUP_RAW) { log('REFUSED - thiếu thư mục sao lưu (P5_BACKUP_DIR / --backup-dir).'); return 2; }
    if (isInside(path.resolve(BACKUP_RAW), REPO_ROOT)) { log('REFUSED - thư mục sao lưu nằm TRONG repo.'); return 2; }
  }
  const pg = await loadPg();
  const db = await connect(pg);
  log('# kết nối DB: OK');
  const migBefore = await migrations(db);
  log(`## schema_migrations trước: ${migBefore.join(', ')}`);
  if (STAGE === 'rollback') {
    try { await rollbackAll(db); await db.end(); return 0; } catch (e) { log(`ROLLBACK-ERROR ${errText(e)}`); return 3; }
  }
  let fails;
  try {
    fails = await ({ 0: stage0, 1: stage1, 2: stage2, 3: stage3, 4: stage4, 5: stage5, 6: stage6, rehearse: rehearseDisable })[STAGE](db, pg);
  } catch (e) {
    fails = [`lỗi: ${errText(e)}`];
  }
  if (fails.length === 1 && fails[0] === 'CONTEXT_PARTIAL_051') {
    log('RESULT: CONTEXT_PARTIAL - 051 không áp được vì thiếu quyền; giao dịch đã ROLLBACK; tiếp tục 052/053');
    await db.end();
    return 0;
  }
  if (!fails.length) {
    log(`## schema_migrations sau: ${(await migrations(db)).join(', ')}`);
    log(`RESULT: PASS - ${STAGE === 'rehearse' ? 'diễn tập DISABLE (ROLLBACK)' : `GĐ${STAGE}`}`);
    await db.end();
    return 0;
  }
  fails.forEach((f) => log(`FAIL ${f}`));
  let code = 1;
  if (['2', '3', '4', '5'].includes(STAGE)) {
    try { await rollbackAll(db); } catch (e) { log(`ROLLBACK-ERROR ${errText(e)} - cần người xử lý; sao lưu ở thư mục ngoài repo`); code = 3; }
  }
  log(`RESULT: FAIL - GĐ${STAGE}${code === 1 && ['2', '3', '4', '5'].includes(STAGE) ? ' (đã rollback toàn bộ P5)' : ''}`);
  await db.end().catch(() => {});
  return code;
}

// Chỉ chạy khi gọi trực tiếp (harness PGlite import rollbackAll mà không chạm PROD).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code;
  try {
    code = await main();
  } catch (e) {
    log(`ERROR ${errText(e)}`);
    code = 2;
  }
  flush();
  process.exit(code);
}
