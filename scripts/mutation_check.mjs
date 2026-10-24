#!/usr/bin/env node
// Hardening P3 F2: manual mutation check for the P3 libs and store.
// For each mutant in test-fixtures/mutations.json: apply an exact-string patch (must match exactly
// once, else NOT_APPLIED = FAIL), run `vitest run <test>` and expect it to FAIL (mutant killed),
// then restore the original file from a temp backup and assert its sha256 is unchanged.
// Safety (S8): sha256 of every mutated file is recorded before any change; files are restored in
// `finally`, on SIGINT/SIGTERM and on process exit; sha256 is asserted after each mutant and at the
// end, and `git status --porcelain` of both repos must be identical before and after.
// Vitest is spawned with process.execPath + node_modules/vitest/vitest.mjs (no npx, no .cmd, no shell).
// Exit 0 only when every mutant is killed and all integrity checks pass.
// Usage: node scripts/mutation_check.mjs [--report <file>] [--only <id,id>]
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, '..');
const ROOT = path.resolve(APP, '..');
const VITEST = path.join(APP, 'node_modules', 'vitest', 'vitest.mjs');
const SPEC = path.join(APP, 'test-fixtures', 'mutations.json');
const TIMEOUT_MS = 240_000;

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const reportPath = argVal('--report');
const only = argVal('--only') ? new Set(argVal('--only').split(',')) : null;

const out = [];
const log = (line = '') => { out.push(line); console.log(line); };
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const gitStatus = (cwd) => {
  const r = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git status failed in ${cwd}: ${r.stderr}`);
  return r.stdout;
};
const countOccurrences = (hay, needle) => (needle === '' ? 0 : hay.split(needle).length - 1);

if (!fs.existsSync(VITEST)) { console.error(`vitest not found at ${VITEST}`); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const mutants = spec.mutants.filter((m) => !only || only.has(m.id));
const ids = new Set();
for (const m of mutants) {
  if (!m.id || !m.file || typeof m.find !== 'string' || typeof m.replace !== 'string' || !m.test) throw new Error(`bad mutant entry: ${JSON.stringify(m)}`);
  if (ids.has(m.id)) throw new Error(`duplicate mutant id ${m.id}`);
  if (m.find === m.replace) throw new Error(`${m.id}: equivalent mutant (find === replace)`);
  ids.add(m.id);
}

// --- record originals ---
const files = [...new Set(mutants.map((m) => m.file))];
const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p3-mutation-'));
const original = new Map(); // rel -> { abs, backup, sha }
for (const rel of files) {
  const abs = path.join(APP, rel);
  const backup = path.join(backupDir, rel.replace(/[\\/]/g, '__'));
  fs.copyFileSync(abs, backup);
  original.set(rel, { abs, backup, sha: sha256(abs) });
}
const statusBefore = { app: gitStatus(APP), root: gitStatus(ROOT) };

let restored = false;
function restoreAll() {
  for (const { abs, backup, sha } of original.values()) {
    if (!fs.existsSync(abs) || sha256(abs) !== sha) fs.copyFileSync(backup, abs);
  }
}
function finalRestore() {
  if (restored) return;
  restoreAll();
  restored = true;
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { try { finalRestore(); } finally { console.error(`\n${sig}: originals restored`); process.exit(sig === 'SIGINT' ? 130 : 143); } });
}
process.on('exit', () => { try { finalRestore(); } catch { /* best effort */ } });
process.on('uncaughtException', (err) => { try { finalRestore(); } finally { console.error(err); process.exit(2); } });

function runVitest(testFile) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [VITEST, 'run', testFile], { cwd: APP, encoding: 'utf8', timeout: TIMEOUT_MS, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } });
  const text = `${r.stdout || ''}\n${r.stderr || ''}`.replace(/\u001b\[[0-9;]*m/g, '');
  const summary = (text.match(/Tests\s+[^\n]+/) || [''])[0].trim();
  return { status: r.status, timedOut: r.error?.code === 'ETIMEDOUT', ms: Date.now() - t0, summary };
}

log(`P3 mutation check - ${new Date().toISOString()}`);
log(`node ${process.version} (${process.execPath}); vitest ${VITEST}`);
log(`mutants: ${mutants.length}; files: ${files.join(', ')}`);
log('');

let integrityOk = true;
const results = [];
try {
  // Baseline: every test file must be GREEN on the unmutated code, otherwise "killed" is vacuous.
  log('Baseline (unmutated) test files:');
  let baselineOk = true;
  for (const test of [...new Set(mutants.map((m) => m.test))]) {
    const r = runVitest(test);
    const ok = r.status === 0;
    baselineOk &&= ok;
    log(`  ${ok ? 'GREEN' : 'RED  '} ${test} (${r.ms} ms) ${r.summary}`);
  }
  if (!baselineOk) throw new Error('baseline test run is not green; mutation results would be meaningless');
  log('');

  for (const m of mutants) {
    const { abs, sha } = original.get(m.file);
    let verdict;
    let detail = '';
    try {
      const src = fs.readFileSync(abs, 'utf8');
      const eol = src.includes('\r\n') ? '\r\n' : '\n';
      const find = m.find.replace(/\n/g, eol);
      const replace = m.replace.replace(/\n/g, eol);
      const n = countOccurrences(src, find);
      if (n !== 1) {
        verdict = 'NOT_APPLIED';
        detail = `find matched ${n} times (must be exactly 1)`;
      } else {
        fs.writeFileSync(abs, src.replace(find, () => replace));
        const r = runVitest(m.test);
        if (r.timedOut) { verdict = 'KILLED'; detail = `timeout after ${r.ms} ms`; } else if (r.status === 0) { verdict = 'SURVIVED'; detail = r.summary; } else { verdict = 'KILLED'; detail = `${r.summary} (${r.ms} ms)`; }
      }
    } finally {
      fs.copyFileSync(original.get(m.file).backup, abs);
      const after = sha256(abs);
      if (after !== sha) { integrityOk = false; log(`  INTEGRITY FAIL: ${m.file} sha256 ${after} != ${sha} after ${m.id}`); }
    }
    results.push({ id: m.id, verdict, detail });
    log(`  ${verdict.padEnd(11)} ${m.id} - ${m.description} [${m.test}] ${detail}`);
    if (!integrityOk) throw new Error('integrity check failed; aborting');
  }
} catch (err) {
  log(`ERROR: ${err && err.message}`);
  integrityOk = integrityOk && false;
} finally {
  finalRestore();
}

// --- end-of-run integrity ---
log('');
log('Integrity:');
for (const [rel, { abs, sha }] of original) {
  const now = sha256(abs);
  const ok = now === sha;
  integrityOk &&= ok;
  log(`  ${ok ? 'OK  ' : 'FAIL'} sha256 ${rel} ${now}`);
}
const statusAfter = { app: gitStatus(APP), root: gitStatus(ROOT) };
for (const k of ['app', 'root']) {
  const ok = statusAfter[k] === statusBefore[k];
  integrityOk &&= ok;
  log(`  ${ok ? 'OK  ' : 'FAIL'} git status --porcelain (${k}) identical before/after (${statusBefore[k].split('\n').filter(Boolean).length} entries)`);
}
fs.rmSync(backupDir, { recursive: true, force: true });

const killed = results.filter((r) => r.verdict === 'KILLED').length;
const survived = results.filter((r) => r.verdict === 'SURVIVED').map((r) => r.id);
const notApplied = results.filter((r) => r.verdict === 'NOT_APPLIED').map((r) => r.id);
const pass = integrityOk && results.length === mutants.length && killed === mutants.length;
log('');
log(`RESULT: ${pass ? 'PASS' : 'FAIL'} | killed ${killed}/${mutants.length} | survived ${survived.length}${survived.length ? ` (${survived.join(', ')})` : ''} | NOT_APPLIED ${notApplied.length}${notApplied.length ? ` (${notApplied.join(', ')})` : ''} | integrity ${integrityOk ? 'OK' : 'FAIL'}`);
if (reportPath) fs.writeFileSync(path.resolve(reportPath), `${out.join('\n')}\n`);
process.exit(pass ? 0 : 1);
