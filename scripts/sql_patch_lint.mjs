#!/usr/bin/env node
// sql_patch_lint.mjs - kiểm quy ước patch SQL trong supabase/patches/ (Phase 00, D3/D3a).
//
// Quy tắc:
//   1. Tên file: NNN_name.sql (patch) và NNN_name.down.sql (đường lui); name = [a-z0-9_].
//   2. Mỗi patch có .down.sql tương ứng và ngược lại.
//   3. Số NNN không trùng giữa các patch (thứ tự áp = thứ tự số tăng dần).
//   4. Mỗi patch có `INSERT INTO public.schema_migrations` ghi đúng version NNN.
//   5. Patch (không phải .down.sql) cấm DROP TABLE / DROP COLUMN / DELETE FROM,
//      trừ khi file có dòng `-- DESTRUCTIVE-OK: <lý do>`.
//
// Dùng:
//   node scripts/sql_patch_lint.mjs                 # lint supabase/patches
//   node scripts/sql_patch_lint.mjs --dir <path>    # lint thư mục khác
//   node scripts/sql_patch_lint.mjs --self-test     # chạy fixture trong scripts/fixtures/sql_patch_lint
// Exit code: 0 = sạch, 1 = có lỗi.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DIR = path.resolve(__dirname, '../supabase/patches');
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/sql_patch_lint');

const UP_RE = /^(\d{3})_([a-z0-9_]+)\.sql$/;
const DOWN_RE = /^(\d{3})_([a-z0-9_]+)\.down\.sql$/;
const DESTRUCTIVE_RE = /\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bDELETE\s+FROM\b/i;
const DESTRUCTIVE_OK_RE = /^\s*--\s*DESTRUCTIVE-OK:\s*\S+/m;

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function lintDir(dir) {
  const errors = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return [`Không tìm thấy thư mục patch: ${dir}`];
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const ups = new Map();
  const downs = new Map();
  const versions = new Map();

  for (const f of files) {
    const down = DOWN_RE.exec(f);
    if (down) {
      downs.set(`${down[1]}_${down[2]}`, f);
      continue;
    }
    const up = UP_RE.exec(f);
    if (!up) {
      errors.push(`${f}: sai tên (cần NNN_name.sql hoặc NNN_name.down.sql, name = [a-z0-9_])`);
      continue;
    }
    const key = `${up[1]}_${up[2]}`;
    ups.set(key, f);
    if (versions.has(up[1])) {
      errors.push(`${f}: số ${up[1]} trùng với ${versions.get(up[1])}`);
    } else {
      versions.set(up[1], f);
    }
  }

  if (ups.size === 0) errors.push(`Thư mục ${dir} không có patch nào`);

  for (const [key, f] of ups) {
    if (!downs.has(key)) errors.push(`${f}: thiếu ${key}.down.sql`);
  }
  for (const [key, f] of downs) {
    if (!ups.has(key)) errors.push(`${f}: không có patch ${key}.sql tương ứng`);
  }

  for (const [key, f] of ups) {
    const version = key.slice(0, 3);
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const code = stripComments(raw);
    const insertRe = new RegExp(
      `INSERT\\s+INTO\\s+public\\.schema_migrations\\b[\\s\\S]*?'${version}'`,
      'i',
    );
    if (!/INSERT\s+INTO\s+public\.schema_migrations\b/i.test(code)) {
      errors.push(`${f}: thiếu INSERT INTO public.schema_migrations`);
    } else if (!insertRe.test(code)) {
      errors.push(`${f}: INSERT INTO public.schema_migrations không ghi version '${version}'`);
    }
    const hit = DESTRUCTIVE_RE.exec(code);
    if (hit && !DESTRUCTIVE_OK_RE.test(raw)) {
      errors.push(`${f}: có "${hit[0]}" nhưng thiếu dòng "-- DESTRUCTIVE-OK: <lý do>"`);
    }
  }

  return errors;
}

function runLint(dir) {
  const errors = lintDir(dir);
  const rel = path.relative(process.cwd(), dir) || '.';
  if (errors.length === 0) {
    console.log(`sql_patch_lint: OK (${rel})`);
    return 0;
  }
  console.error(`sql_patch_lint: ${errors.length} lỗi trong ${rel}`);
  for (const e of errors) console.error(`  - ${e}`);
  return 1;
}

function selfTest() {
  const cases = [
    { name: 'valid', expectExit: 0 },
    { name: 'destructive_ok', expectExit: 0 },
    { name: 'missing_down', expectExit: 1 },
    { name: 'destructive', expectExit: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const dir = path.join(FIXTURE_DIR, c.name);
    const res = spawnSync(process.execPath, [__filename, '--dir', dir], { encoding: 'utf8' });
    const ok = res.status === c.expectExit;
    if (!ok) failed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'} self-test ${c.name}: exit ${res.status} (expected ${c.expectExit})`);
    if (!ok) process.stdout.write(`${res.stdout}${res.stderr}`);
  }
  console.log(`sql_patch_lint --self-test: ${cases.length - failed}/${cases.length} PASS`);
  return failed === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  process.exit(selfTest());
}
const dirIdx = args.indexOf('--dir');
const dir = dirIdx >= 0 && args[dirIdx + 1] ? path.resolve(args[dirIdx + 1]) : DEFAULT_DIR;
process.exit(runLint(dir));
