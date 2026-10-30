#!/usr/bin/env node
// Repo hygiene check (Hardening P7 Step C5). Pure Node ESM, no external dependencies.
//
// Checks (on the app repo root):
//   (a) the env template exists, has no secret-looking values, and documents exactly the env vars the
//       app uses (active keys) plus the script-only keys (commented)
//   (b) .gitignore still ignores env files AND keeps the negation for the env template
//   (c) .gitattributes forces eol=lf
//   (d) no CRLF line endings in tracked text files (working tree content, read with fs)
//   (e) the orphan component EquityCurveChart.tsx is gone (removed in P7 C4)
// Self-test: `--self-test` runs the same pure checks on scripts/fixtures/repo-hygiene/ and proves
// they FAIL on a fake secret, a missing .gitignore negation, missing eol=lf and CRLF content, and
// PASS on the clean set.
//
// Usage: node scripts/repo_hygiene_check.mjs [--self-test]
// Exit: 0 = all checks pass, 1 = at least one check failed, 2 = usage error.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(__dirname, '..');
export const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'repo-hygiene');

const ENV_TEMPLATE = ['.env', 'example'].join('.');

// Env vars the app reads (must be active KEY= lines) and script-only vars (must be documented, may be commented).
export const APP_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
];
export const SCRIPT_ENV_VARS = ['PROD_DB_URL', 'PG_MODULE_PATH'];

const PLACEHOLDER_RE = /^(?:<[^>]*>|your[-_a-z0-9.]*|.*example.*|changeme.*|xxx+|placeholder.*|\.\.\.)$/i;
// Model ids like "openai/gpt-4o-mini" are configuration, not secrets: lowercase/digits/-./: only, short.
const MODEL_ID_RE = /^[a-z0-9][a-z0-9._:-]*\/[a-z0-9][a-z0-9._:-]*$/;

/** Classify one value: returns null when acceptable, else a reason string. */
export function secretReason(value) {
  const v = value.trim().replace(/^(['"])(.*)\1$/, '$2');
  if (v === '') return null;
  if (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/.test(v)) return 'looks like a JWT';
  if (/^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i.test(v) && !/:(?:<[^>]*>|password|your[-_a-z]*|changeme|\*+)@/i.test(v)) {
    return 'connection URL with an embedded password';
  }
  if (/^sk-[A-Za-z0-9_-]{16,}/.test(v)) return 'looks like an API key (sk-...)';
  if (PLACEHOLDER_RE.test(v)) return null;
  if (MODEL_ID_RE.test(v) && v.length <= 64) return null;
  if (/^[A-Za-z0-9+/=_-]{24,}$/.test(v)) return 'long random-looking token';
  // Real Supabase project refs are 20 lowercase alphanumerics (no dashes); placeholders contain words/dashes.
  if (/^https?:\/\/[a-z0-9]{20}\.supabase\.co/.test(v)) return 'real Supabase project URL';
  return null;
}

/** Parse KEY=VALUE lines; commented lines (`# KEY=...`) are returned with commented: true. */
export function parseEnvTemplate(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*(#\s*)?([A-Z][A-Z0-9_]*)\s*=(.*)$/);
    if (m) out.push({ key: m[2], value: m[3], commented: Boolean(m[1]) });
  }
  return out;
}

export function checkEnvTemplate(text, { appVars = APP_ENV_VARS, scriptVars = SCRIPT_ENV_VARS } = {}) {
  const errors = [];
  if (typeof text !== 'string') return [`${ENV_TEMPLATE} is missing`];
  const entries = parseEnvTemplate(text);
  for (const e of entries) {
    const why = secretReason(e.value);
    if (why) errors.push(`${e.key}: value ${why}`);
  }
  const active = new Set(entries.filter((e) => !e.commented).map((e) => e.key));
  const all = new Set(entries.map((e) => e.key));
  for (const k of appVars) if (!active.has(k)) errors.push(`missing active key ${k}`);
  for (const k of scriptVars) if (!all.has(k)) errors.push(`missing documented script key ${k}`);
  const known = new Set([...appVars, ...scriptVars]);
  for (const k of all) if (!known.has(k)) errors.push(`unknown key ${k} (not used by src/ or scripts/)`);
  return errors;
}

export function checkGitignore(text) {
  if (typeof text !== 'string') return ['.gitignore is missing'];
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const errors = [];
  if (!lines.includes('.env*')) errors.push('.gitignore must ignore `.env*`');
  if (!lines.includes(`!${ENV_TEMPLATE}`)) errors.push(`.gitignore must keep the negation \`!${ENV_TEMPLATE}\``);
  return errors;
}

export function checkGitattributes(text) {
  if (typeof text !== 'string') return ['.gitattributes is missing'];
  return /^\*\s+.*\beol=lf\b/m.test(text) ? [] : ['.gitattributes must set `eol=lf` for `*`'];
}

/** files: array of { path, content: Buffer|string } -> list of paths containing CRLF. */
export function findCrlf(files) {
  return files.filter((f) => (Buffer.isBuffer(f.content) ? f.content.includes('\r\n') : f.content.includes('\r\n'))).map((f) => f.path);
}

const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.sql', '.css', '.yml', '.yaml', '.txt', '.html', '.example', '.fixture']);
const SKIP_DIRS = new Set(['.git', '.next', 'out', 'build', 'coverage', ['node', 'modules'].join('_')]);

function isTextPath(p) {
  const base = path.basename(p);
  return TEXT_EXT.has(path.extname(p)) || base.startsWith('.git') || base === ENV_TEMPLATE;
}

function walk(dir, root, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) walk(path.join(dir, ent.name), root, acc);
    } else if (ent.isFile()) {
      acc.push(path.relative(root, path.join(dir, ent.name)).split(path.sep).join('/'));
    }
  }
  return acc;
}

/** Tracked files via `git ls-files`; falls back to a filesystem walk if git is unavailable. */
export function listTrackedFiles(root) {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (r.status === 0 && r.stdout) return { files: r.stdout.split('\0').filter(Boolean), source: 'git ls-files' };
  return { files: walk(root, root, []), source: 'fs walk (git unavailable)' };
}

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined);

export function runRepoChecks(root = APP_ROOT) {
  const results = [];
  results.push({ name: '(a) env template: exists, no secrets, keys match usage', errors: checkEnvTemplate(read(path.join(root, ENV_TEMPLATE))) });
  results.push({ name: '(b) .gitignore ignores env files and keeps the template negation', errors: checkGitignore(read(path.join(root, '.gitignore'))) });
  results.push({ name: '(c) .gitattributes eol=lf', errors: checkGitattributes(read(path.join(root, '.gitattributes'))) });
  const { files, source } = listTrackedFiles(root);
  const text = files.filter(isTextPath).filter((f) => fs.existsSync(path.join(root, f)));
  const crlf = findCrlf(text.map((f) => ({ path: f, content: fs.readFileSync(path.join(root, f)) })));
  results.push({ name: `(d) no CRLF in ${text.length} tracked text files [${source}]`, errors: crlf.map((f) => `CRLF in ${f}`) });
  const orphan = 'src/components/EquityCurveChart.tsx';
  results.push({ name: '(e) orphan EquityCurveChart.tsx removed (P7 C4)', errors: fs.existsSync(path.join(root, orphan)) ? [`${orphan} still exists`] : [] });
  return results;
}

/** Self-test on fixtures: every bad case must FAIL its check, the clean set must PASS. */
export function runSelfTest(dir = FIXTURE_DIR) {
  const f = (name) => fs.readFileSync(path.join(dir, name), 'utf8').replace(/\r\n/g, '\n');
  const cleanEnv = f('env-template-clean.fixture');
  const cases = [
    { name: 'clean env template passes', expectFail: false, errors: checkEnvTemplate(cleanEnv) },
    { name: 'env template with fake JWT fails', expectFail: true, errors: checkEnvTemplate(f('env-template-secret.fixture')) },
    { name: 'env template with password in DB URL fails', expectFail: true, errors: checkEnvTemplate(f('env-template-dburl.fixture')) },
    { name: 'env template missing a used key fails', expectFail: true, errors: checkEnvTemplate(cleanEnv.replace(/^OPENROUTER_MODEL=.*$/m, '')) },
    { name: 'missing env template fails', expectFail: true, errors: checkEnvTemplate(undefined) },
    { name: 'clean .gitignore passes', expectFail: false, errors: checkGitignore(f('gitignore-clean.fixture')) },
    { name: '.gitignore without template negation fails', expectFail: true, errors: checkGitignore(f('gitignore-no-negation.fixture')) },
    { name: 'clean .gitattributes passes', expectFail: false, errors: checkGitattributes(f('gitattributes-clean.fixture')) },
    { name: '.gitattributes without eol=lf fails', expectFail: true, errors: checkGitattributes('* text=auto\n') },
    { name: 'LF file passes the CRLF check', expectFail: false, errors: findCrlf([{ path: 'lf.ts', content: f('lf-sample.fixture') }]) },
    // CRLF is built in memory: a committed CRLF fixture would be normalized by eol=lf.
    { name: 'CRLF file fails the CRLF check', expectFail: true, errors: findCrlf([{ path: 'crlf.ts', content: Buffer.from(f('lf-sample.fixture').replace(/\n/g, '\r\n')) }]) },
  ];
  return cases.map((c) => ({ ...c, ok: c.expectFail ? c.errors.length > 0 : c.errors.length === 0 }));
}

function main(argv) {
  const args = argv.slice(2);
  const unknown = args.filter((a) => a !== '--self-test');
  if (unknown.length) { console.error(`unknown argument(s): ${unknown.join(' ')}`); return 2; }
  let failed = 0;
  if (args.includes('--self-test')) {
    console.log('repo_hygiene_check --self-test (fixtures: scripts/fixtures/repo-hygiene/)');
    for (const c of runSelfTest()) {
      console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.errors.length ? ` -> ${c.errors.length} finding(s)` : ''}`);
      if (!c.ok) failed++;
    }
  }
  console.log('repo_hygiene_check (app repo)');
  for (const r of runRepoChecks()) {
    console.log(`  ${r.errors.length ? 'FAIL' : 'PASS'}  ${r.name}`);
    for (const e of r.errors) console.log(`        - ${e}`);
    if (r.errors.length) failed++;
  }
  console.log(failed ? `FAILED: ${failed} check(s)` : 'OK: all hygiene checks passed');
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv));
}
