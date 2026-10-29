#!/usr/bin/env node
// gen_sql_golden.mjs - sinh golden SQL từ golden JSON dùng chung với Vitest (Phase 05, A3/C2/C6/C7, D-4).
//
// Nguồn (một nguồn cho client + server):
//   test-fixtures/golden/trading_day.golden.json            -> supabase/tests/trading_day_golden.generated.sql
//   test-fixtures/golden/hard_stop.golden.json
//     + test-fixtures/golden/hard_stop.server_overrides.json -> supabase/tests/hard_stop_golden.generated.sql
//   test-fixtures/golden/hard_stop_config_lock.golden.json   -> supabase/tests/hard_stop_config_lock_golden.generated.sql
//   patches 050 + 052 + 053 + 3 golden                        -> <root>/process/.../harness/p5/apply_050_053_with_golden.sql
//                                                                (BEGIN ... ROLLBACK; KHÔNG BAO GIỜ COMMIT)
// Mỗi file sinh có băm sha256 của nguồn + số ca JSON (n). Mỗi khối DO gom mọi ca lệch rồi RAISE EXCEPTION
// (lệch = cả giao dịch rollback); hết lệch thì RAISE NOTICE 'PASS n/n'. KHÔNG sửa tay file sinh.
//
// Sidecar D-4: mọi ca của hard_stop.golden.json PHẢI thuộc đúng một nhóm:
//   run            -> gọi hard_stop_decide, so với expected của golden;
//   serverExpected -> so với "expected" riêng của server (kèm "reason");
//   skip           -> không chạy trên server (kèm "reason").
//
// Dùng:
//   node scripts/gen_sql_golden.mjs            # ghi lại file sinh
//   node scripts/gen_sql_golden.mjs --check    # exit 1 nếu ca chưa phân loại / sidecar thừa / file sinh lệch nguồn
//   Tùy chọn (dùng cho self-test): --golden-dir <d> --tests-dir <d> --patches-dir <d> --harness-dir <d>

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : def;
};
const CHECK = args.includes('--check');
const GOLDEN_DIR = opt('--golden-dir', path.join(APP, 'test-fixtures/golden'));
const TESTS_DIR = opt('--tests-dir', path.join(APP, 'supabase/tests'));
const PATCHES_DIR = opt('--patches-dir', path.join(APP, 'supabase/patches'));
const HARNESS_DIR = opt(
  '--harness-dir',
  path.resolve(APP, '../process/general-plans/active/hardening-security-data-integrity_11-10-26/harness/p5'),
);

const GROUPS = new Set(['run', 'serverExpected', 'skip']);
const FIELD_TO_COLUMN = {
  id: 'id',
  accountId: 'account_id',
  asset: 'asset',
  lotSize: 'lot_size',
  pnl: 'pnl',
  result: 'result',
  setup: 'setup',
  confluences: 'confluences',
  emotion: 'emotion',
  mistake: 'mistake',
  notes: 'notes',
  date: 'date',
  riskAmount: 'risk_amount',
  rMultiple: 'r_multiple',
  riskIsEstimated: 'risk_is_estimated',
  session: 'session',
  checklistResults: 'checklist_results',
  screenshotUrl: 'screenshot_url',
  screenshotPath: 'screenshot_path',
};
const OP = { add: 'INSERT', update: 'UPDATE', delete: 'DELETE' };

/* ---------------------------------------------------------------------------------------------- */

const readRaw = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const sha256 = (...parts) => crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex');
const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const jlit = (v) => (v === null || v === undefined ? 'NULL' : `${lit(JSON.stringify(v))}::jsonb`);
const tslit = (v) => `${lit(v)}::timestamptz`;
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};
const iso = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const ms = Date.parse(String(v));
  return Number.isNaN(ms) ? v : new Date(ms).toISOString();
};
const comment = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /');

/** client "HH:mm" -> SQL time literal; invalid -> 00:00 (same rule as parseResetTime). */
function resetTimeLiteral(value) {
  if (typeof value !== 'string') return "'00:00'::time";
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? `'${m[1]}:${m[2]}'::time` : "'00:00'::time";
}

/** Client Trade fields -> DB row, with the store's write semantics (numbers, risk <= 0 -> null, ISO date). */
function toRow(fields) {
  const row = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (k === 'screenshotFile') {
      // an image upload or removal = a new screenshot_path value (or null)
      row.screenshot_path = v === null ? null : 'golden-user/new-upload.webp';
      continue;
    }
    const col = FIELD_TO_COLUMN[k];
    if (!col || v === undefined) continue;
    if (col === 'lot_size' || col === 'pnl' || col === 'r_multiple') row[col] = num(v);
    else if (col === 'risk_amount') {
      const n = num(v);
      row[col] = typeof n === 'number' && n > 0 ? n : null;
    } else if (col === 'date') row[col] = iso(v);
    else row[col] = v;
  }
  return row;
}

const numEq = (expr, value) =>
  value === null || value === undefined
    ? `(${expr}) IS NULL`
    : `abs((${expr})::numeric - (${value})::numeric) <= 1e-9`;

/* ---------------------------------------------------------------------------------------------- */

function header(title, sources, hash, n, counts) {
  return [
    `-- ${title}`,
    '-- GENERATED by scripts/gen_sql_golden.mjs - DO NOT EDIT BY HAND (regenerate; --check guards drift).',
    `-- source: ${sources.join(' + ')}`,
    `-- source-sha256: ${hash}`,
    `-- cases: ${n}${counts ? ` (run ${counts.run}, serverExpected ${counts.serverExpected}, skip ${counts.skip})` : ''}`,
    '-- Needs patches 050 (+ 052, 053 for hard_stop files). No transaction statements: run inside BEGIN ... ROLLBACK.',
    '',
  ].join('\n');
}

function doBlock(label, body, runCount) {
  return [
    'DO $golden$',
    'DECLARE',
    '  v_res  jsonb;',
    '  v_lock boolean;',
    '  v_any  boolean;',
    '  v_day  date;',
    "  v_fail text[] := '{}';",
    '  v_run  integer := 0;',
    'BEGIN',
    ...body,
    '  IF cardinality(v_fail) > 0 THEN',
    `    RAISE EXCEPTION '${label} golden FAIL %/%: %', cardinality(v_fail), v_run, array_to_string(v_fail, E'\\n');`,
    '  END IF;',
    `  IF v_run <> ${runCount} THEN`,
    `    RAISE EXCEPTION '${label} golden ran % cases, expected ${runCount}', v_run;`,
    '  END IF;',
    `  RAISE NOTICE '${label} golden PASS %/%', v_run, v_run;`,
    'END',
    '$golden$;',
    '',
  ].join('\n');
}

function genTradingDay(raw) {
  const g = JSON.parse(raw);
  const body = [];
  for (const c of g.cases) {
    const o = c.override || {};
    body.push(`  -- ${comment(c.name)}`);
    body.push(
      `  v_day := public.trading_day(${tslit(c.instant)}, ${lit(c.userTz)}, ${resetTimeLiteral(o.resetTime)}, ${lit(o.resetTz)});`,
    );
    body.push('  v_run := v_run + 1;');
    body.push(`  IF v_day IS DISTINCT FROM ${lit(c.expected)}::date THEN`);
    body.push(`    v_fail := v_fail || (${lit(c.name)} || ': got ' || coalesce(v_day::text, 'NULL') || ', expected ${c.expected}');`);
    body.push('  END IF;');
  }
  return { n: g.cases.length, run: g.cases.length, sql: doBlock('trading_day', body, g.cases.length) };
}

function classify(golden, sidecar) {
  const errors = [];
  const entries = (sidecar && sidecar.cases) || {};
  const names = golden.cases.map((c) => c.name);
  const seen = new Set();
  for (const name of names) {
    if (seen.has(name)) errors.push(`duplicate golden case name: ${name}`);
    seen.add(name);
    const e = entries[name];
    if (!e) {
      errors.push(`unclassified golden case (add it to hard_stop.server_overrides.json): ${name}`);
      continue;
    }
    if (!GROUPS.has(e.group)) errors.push(`invalid group "${e.group}" for: ${name}`);
    if ((e.group === 'skip' || e.group === 'serverExpected') && !(typeof e.reason === 'string' && e.reason.trim()))
      errors.push(`group ${e.group} needs a reason: ${name}`);
    if (e.group === 'serverExpected' && (!e.expected || typeof e.expected !== 'object'))
      errors.push(`serverExpected needs an "expected" object: ${name}`);
  }
  for (const name of Object.keys(entries)) if (!seen.has(name)) errors.push(`sidecar entry has no golden case: ${name}`);
  return errors;
}

function genHardStop(raw, sidecarRaw) {
  const g = JSON.parse(raw);
  const sidecar = JSON.parse(sidecarRaw);
  const errors = classify(g, sidecar);
  const counts = { run: 0, serverExpected: 0, skip: 0 };
  const body = [];
  for (const c of g.cases) {
    const e = sidecar.cases[c.name];
    if (!e) continue;
    counts[e.group] = (counts[e.group] || 0) + 1;
    if (e.group === 'skip') {
      body.push(`  -- SKIP ${comment(c.name)} (${comment(e.reason)})`);
      continue;
    }
    const expected = e.group === 'serverExpected' ? e.expected : c.expected;
    const op = c.op ? OP[c.op] : null;
    const oldRow = c.op === 'update' || c.op === 'delete' ? toRow(c.before) : null;
    let newRow = null;
    if (c.op === 'add') newRow = toRow(c.after);
    if (c.op === 'update') newRow = { ...oldRow, ...toRow(c.after) };
    const trades = (c.trades || []).map((t) => ({ ...t, date: iso(t.date), pnl: num(t.pnl) }));
    body.push(`  -- ${e.group === 'serverExpected' ? 'SERVER-EXPECTED ' : ''}${comment(c.name)}`);
    body.push(
      `  v_res := public.hard_stop_decide(${jlit(c.account)}, ${jlit(trades)}, ${lit(c.tz)}, ${lit(op)}, ${jlit(oldRow)}, ${jlit(newRow)}, ${tslit(c.now)});`,
    );
    body.push('  v_run := v_run + 1;');
    const conds = [];
    if ('status' in expected) conds.push(`(v_res->>'status') IS NOT DISTINCT FROM ${lit(expected.status)}`);
    if ('dayKey' in expected) conds.push(`(v_res->>'dayKey') IS NOT DISTINCT FROM ${lit(expected.dayKey)}`);
    if ('lossToday' in expected) conds.push(numEq(`v_res->>'lossToday'`, expected.lossToday));
    if ('limit' in expected) conds.push(numEq(`v_res->>'limit'`, expected.limit));
    if (op && 'allowed' in expected) {
      conds.push(`(v_res->>'allowed') = ${lit(String(expected.allowed))}`);
      conds.push(`(v_res->>'code') IS NOT DISTINCT FROM ${lit(expected.allowed ? null : expected.code ?? 'HARD_STOP')}`);
    }
    body.push(`  IF NOT coalesce(${conds.join('\n         AND ')}, false) THEN`);
    body.push(`    v_fail := v_fail || (${lit(c.name)} || ': ' || v_res::text);`);
    body.push('  END IF;');
  }
  const runCount = counts.run + counts.serverExpected;
  return { n: g.cases.length, counts, errors, sql: doBlock('hard_stop', body, runCount) };
}

function genConfigLock(raw) {
  const g = JSON.parse(raw);
  const body = [];
  for (const c of g.cases) {
    const trades = (c.trades || []).map((t) => ({ ...t, date: iso(t.date), pnl: num(t.pnl) }));
    body.push(`  -- ${c.kind} ${comment(c.name)}`);
    if (c.kind === 'account') {
      body.push(
        `  v_lock := (public.hard_stop_decide(${jlit(c.old)}, ${jlit(trades)}, ${lit(c.oldTz)}, NULL, NULL, NULL, ${tslit(c.now)})->>'status') = 'locked';`,
      );
      body.push(`  v_res := public.hard_stop_config_decide(${jlit(c.old)}, ${jlit(c.new)}, v_lock);`);
    } else {
      body.push('  v_any := false;');
      for (const acc of c.accounts || []) {
        body.push(
          `  v_any := v_any OR coalesce((public.hard_stop_decide(${jlit(acc)}, ${jlit(trades)}, ${lit(c.oldTz)}, NULL, NULL, NULL, ${tslit(c.now)})->>'status') = 'locked', false);`,
        );
      }
      const newTz = c.newTz === undefined ? c.oldTz : c.newTz; // undefined = timezone not changed
      body.push(`  v_res := public.hard_stop_prefs_config_decide(${lit(c.oldTz)}, ${lit(newTz)}, v_any);`);
    }
    body.push('  v_run := v_run + 1;');
    body.push(
      `  IF NOT coalesce((v_res->>'allowed') = ${lit(String(c.expected.allowed))} AND (v_res->>'code') IS NOT DISTINCT FROM ${lit(c.expected.allowed ? null : c.expected.code)}, false) THEN`,
    );
    body.push(`    v_fail := v_fail || (${lit(c.name)} || ': ' || coalesce(v_res::text, 'NULL'));`);
    body.push('  END IF;');
  }
  return { n: g.cases.length, run: g.cases.length, sql: doBlock('hard_stop_config_lock', body, g.cases.length) };
}

/* ---------------------------------------------------------------------------------------------- */

function build() {
  const src = {
    td: readRaw(GOLDEN_DIR, 'trading_day.golden.json'),
    hs: readRaw(GOLDEN_DIR, 'hard_stop.golden.json'),
    side: readRaw(GOLDEN_DIR, 'hard_stop.server_overrides.json'),
    cl: readRaw(GOLDEN_DIR, 'hard_stop_config_lock.golden.json'),
  };
  const td = genTradingDay(src.td);
  const hs = genHardStop(src.hs, src.side);
  const cl = genConfigLock(src.cl);

  const files = new Map();
  files.set(
    path.join(TESTS_DIR, 'trading_day_golden.generated.sql'),
    header('Golden: public.trading_day (patch 050)', ['test-fixtures/golden/trading_day.golden.json'], sha256(src.td), td.n) + td.sql,
  );
  files.set(
    path.join(TESTS_DIR, 'hard_stop_golden.generated.sql'),
    header(
      'Golden: public.hard_stop_decide (patch 052)',
      ['test-fixtures/golden/hard_stop.golden.json', 'test-fixtures/golden/hard_stop.server_overrides.json'],
      sha256(src.hs, src.side),
      hs.n,
      hs.counts,
    ) + hs.sql,
  );
  files.set(
    path.join(TESTS_DIR, 'hard_stop_config_lock_golden.generated.sql'),
    header(
      'Golden: public.hard_stop_config_decide + hard_stop_prefs_config_decide (patch 053)',
      ['test-fixtures/golden/hard_stop_config_lock.golden.json'],
      sha256(src.cl),
      cl.n,
    ) + cl.sql,
  );

  if (fs.existsSync(path.dirname(HARNESS_DIR))) {
    const patch = (f) => readRaw(PATCHES_DIR, f).replace(/\r\n/g, '\n').trimEnd();
    const goldenBodies = [...files.values()];
    const apply = [
      '-- harness/p5/apply_050_053_with_golden.sql - DRY-RUN ARTEFACT (Phase 05, C6).',
      '-- GENERATED by trade-note-app/scripts/gen_sql_golden.mjs - DO NOT EDIT BY HAND.',
      `-- source-sha256: ${sha256(patch('050_trading_day_fn.sql'), patch('052_hard_stop_trigger.sql'), patch('053_hard_stop_config_lock.sql'), ...goldenBodies)}`,
      '-- BEGIN; 050; 052; 053; golden trading_day; golden hard_stop; golden config_lock; ROLLBACK;',
      '-- Any golden mismatch RAISEs EXCEPTION -> the whole transaction (incl. CREATE TRIGGER) rolls back.',
      '-- Ends with ROLLBACK: running this file NEVER commits 050/052/053. Patch 051 (auth.users) is applied',
      '-- separately at stage 3 and is not part of this file.',
      '',
      'BEGIN;',
      "SET LOCAL lock_timeout = '3s';",
      "SET LOCAL statement_timeout = '60s';",
      '',
      '-- ===== 050 =====',
      patch('050_trading_day_fn.sql'),
      '',
      '-- ===== 052 =====',
      patch('052_hard_stop_trigger.sql'),
      '',
      '-- ===== 053 =====',
      patch('053_hard_stop_config_lock.sql'),
      '',
      ...goldenBodies.map((b) => b.trimEnd() + '\n'),
      'ROLLBACK;',
      '',
    ].join('\n');
    files.set(path.join(HARNESS_DIR, 'apply_050_053_with_golden.sql'), apply);
  } else {
    console.warn(`gen_sql_golden: harness dir parent not found, skipping apply file: ${HARNESS_DIR}`);
  }
  return { files, hs, td, cl };
}

const { files, hs, td, cl } = build();
console.log(
  `gen_sql_golden: trading_day ${td.n} cases; hard_stop ${hs.n} cases (run ${hs.counts.run}, override ${hs.counts.serverExpected}, skip ${hs.counts.skip}); config_lock ${cl.n} cases`,
);

const problems = [...hs.errors];
if (CHECK) {
  for (const [file, content] of files) {
    const rel = path.relative(APP, file);
    if (!fs.existsSync(file)) problems.push(`missing generated file: ${rel}`);
    else if (fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== content) problems.push(`stale generated file (hash/n drift): ${rel}`);
  }
  if (problems.length) {
    console.error(`gen_sql_golden --check: FAIL (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('gen_sql_golden --check: OK');
  process.exit(0);
}

if (hs.errors.length) {
  console.error('gen_sql_golden: classification errors, nothing written:');
  for (const p of hs.errors) console.error(`  - ${p}`);
  process.exit(1);
}
for (const [file, content] of files) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`  wrote ${path.relative(APP, file)}`);
}
