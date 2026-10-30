#!/usr/bin/env node
// P7 (hardening) i18n hard-coded string scan.
//
// Parses every src/**/*.{ts,tsx} file (tests excluded) with the TypeScript compiler API and reports:
//   - "vi": a Vietnamese letter inside a JSX text node or ANY string/template literal;
//   - "en": hard-coded English inside a JSX text node, a display prop (placeholder | title | aria-label | alt),
//           a JSX child expression {"..."}, or the first argument of toast()/toast.x(); the literal may sit
//           inside a conditional (a ? "x" : "y"), a fallback (a || "x", a ?? "x", a && "x") or parentheses.
// Known blind spots (see backlog i18n-english-residual note): strings built in variables/objects/helpers and
// passed later (e.g. lib/*.ts return values), template literals with substitutions in props, non-toast APIs.
// Comments are never scanned (the AST has no comment nodes), `//` inside JSX text is ignored,
// and symbol characters such as U+00D7 (x sign) are not Vietnamese letters.
//
// Every finding must be covered by an allow-list entry with a non-empty `reason`
// (scripts/i18n_hardcoded_allowlist.json); otherwise the scan fails.
//
// Usage:
//   node scripts/i18n_hardcoded_scan.mjs              self-test, then scan (exit 1 on any finding outside the allow-list)
//   node scripts/i18n_hardcoded_scan.mjs --baseline   list every raw finding (no allow-list), never fails
//   node scripts/i18n_hardcoded_scan.mjs --self-test  run only the fixture self-test
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(__dirname, '..');
export const ALLOWLIST_PATH = path.resolve(__dirname, 'i18n_hardcoded_allowlist.json');
export const FIXTURE_DIR = path.resolve(__dirname, 'fixtures', 'i18n-scan');

const DISPLAY_PROPS = new Set(['placeholder', 'title', 'aria-label', 'alt', '#children', '#toast']);
// Vietnamese letters only (precomposed + combining marks). Latin-1 symbols (U+00D7, U+00B0, ...) are not letters here.
const VI_RE = /[àáâãèéêìíòóôõùúýăđĩũơưÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐĨŨƠƯẠ-ỹ̀-̣̃̉]/;

/** Narrow English heuristic: two or more alphabetic words, or one word of 4+ letters that has a lowercase letter. */
export function looksEnglish(text) {
  const words = text.match(/[A-Za-z][A-Za-z']*/g) || [];
  const real = words.filter((w) => w.replace(/'/g, '').length >= 2);
  if (real.length >= 2) return true;
  return real.length === 1 && real[0].length >= 4 && /[a-z]/.test(real[0]);
}

/** JSX text with HTML entities (&ldquo; ...) and `//...` fragments removed (a `//` in JSX text is literal text, often a divider). */
function cleanJsxText(raw) {
  return raw.replace(/&[a-zA-Z]+;|&#\d+;/g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();
}

// Walks up through value-preserving wrappers so `title={on ? "Mute audio" : "Unmute audio"}`,
// `title={label || "Fallback text"}` and `("...")` count as the attribute's value (review E17 m1).
function displayContextOf(node) {
  let child = node;
  let p = node.parent;
  while (p) {
    if (ts.isParenthesizedExpression(p)) { child = p; p = p.parent; continue; }
    if (ts.isConditionalExpression(p) && p.condition !== child) { child = p; p = p.parent; continue; }
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(p.operatorToken.kind) && p.right === child) { child = p; p = p.parent; continue; }
    break;
  }
  return { child, p };
}

/** Returns the display context of a string literal: a JSX attribute name, '#children', '#toast', or null. */
function propNameOf(node) {
  const { child, p } = displayContextOf(node);
  if (!p) return null;
  if (ts.isJsxExpression(p)) {
    const q = p.parent;
    if (q && ts.isJsxAttribute(q)) return q.name.getText();
    if (q && (ts.isJsxElement(q) || ts.isJsxFragment(q))) return '#children'; // <b>{"Hard-coded text"}</b>
    return null;
  }
  if (ts.isJsxAttribute(p)) return p.name.getText();
  // toast("..."), toast.error("..."), toast.success("...") ... (first argument only)
  if (ts.isCallExpression(p) && p.arguments[0] === child) {
    const callee = p.expression;
    const base = ts.isPropertyAccessExpression(callee) ? callee.expression : callee;
    if (ts.isIdentifier(base) && base.text === 'toast') return '#toast';
  }
  return null;
}

/** Scan one source text. Returns [{ file, line, kind, text }]. */
export function scanSource(file, src) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') || file.endsWith('.fixture') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = [];
  const push = (node, kind, text) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({ file, line: line + 1, kind, text: text.slice(0, 120) });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxText(node)) {
      const text = cleanJsxText(node.text);
      if (text) {
        if (VI_RE.test(text)) push(node, 'vi', text);
        else if (looksEnglish(text)) push(node, 'en', text);
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const text = node.text;
      const prop = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? propNameOf(node) : null;
      if (VI_RE.test(text)) push(node, 'vi', text);
      else if (prop && DISPLAY_PROPS.has(prop) && looksEnglish(text)) push(node, 'en', text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function listSourceFiles(root = APP_ROOT) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(r); continue; }
      if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(r);
    }
  };
  walk('src');
  return out.sort();
}

export function scanProject(root = APP_ROOT) {
  const findings = [];
  for (const f of listSourceFiles(root)) findings.push(...scanSource(f, fs.readFileSync(path.join(root, f), 'utf8')));
  return findings;
}

/** Allow-list entries: { file, kind: "vi"|"en"|"all", contains?: string, reason: string }. */
export function validateAllowlist(list) {
  const problems = [];
  if (!Array.isArray(list)) return ['allow-list must be an array'];
  list.forEach((a, i) => {
    if (!a || typeof a.file !== 'string' || !a.file) problems.push(`entry ${i}: missing file`);
    if (!['vi', 'en', 'all'].includes(a && a.kind)) problems.push(`entry ${i} (${a && a.file}): kind must be vi|en|all`);
    if (!a || typeof a.reason !== 'string' || a.reason.trim().length < 5) problems.push(`entry ${i} (${a && a.file}): reason is required`);
    if (a && a.contains !== undefined && (typeof a.contains !== 'string' || !a.contains)) problems.push(`entry ${i} (${a.file}): contains must be a non-empty string`);
  });
  return problems;
}

export function applyAllowlist(findings, list) {
  const covered = (f) => list.some((a) => a.file === f.file && (a.kind === 'all' || a.kind === f.kind) && (!a.contains || f.text.includes(a.contains)));
  return findings.filter((f) => !covered(f));
}

export function loadAllowlist(p = ALLOWLIST_PATH) {
  return JSON.parse(fs.readFileSync(p, 'utf8')).entries;
}

/** Fixture self-test: proves the rules (Vietnamese/English caught; `//`, U+00D7, comments ignored; reason required). */
export function selfTest() {
  const problems = [];
  const fx = (name) => fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
  const kinds = (name) => scanSource(`fixture/${name}`, fx(name)).map((f) => f.kind).sort();
  const expect = (name, want) => { const got = kinds(name); if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
  expect('vietnamese-jsx.tsx.fixture', ['vi', 'vi']);
  expect('english-jsx.tsx.fixture', ['en', 'en']);
  expect('english-conditional.tsx.fixture', ['en', 'en', 'en', 'en', 'en']);
  expect('ignored.tsx.fixture', []);
  if (validateAllowlist([{ file: 'src/x.tsx', kind: 'vi' }]).length === 0) problems.push('allow-list entry without reason must be rejected');
  if (validateAllowlist([{ file: 'src/x.tsx', kind: 'vi', reason: 'documented reason' }]).length !== 0) problems.push('valid allow-list entry rejected');
  return problems;
}

function main(argv) {
  if (argv.includes('--self-test')) {
    const p = selfTest();
    if (p.length) { console.error('i18n scan self-test FAILED:\n  ' + p.join('\n  ')); process.exit(1); }
    console.log('i18n scan self-test: OK');
    return;
  }
  const findings = scanProject();
  if (argv.includes('--baseline')) {
    const by = (k) => findings.filter((f) => f.kind === k).length;
    const files = new Set(findings.map((f) => f.file));
    console.log(`i18n scan BASELINE (no allow-list): ${findings.length} findings (vi=${by('vi')}, en=${by('en')}) in ${files.size} files`);
    for (const f of findings) console.log(`${f.kind}\t${f.file}:${f.line}\t${f.text}`);
    return;
  }
  const st = selfTest();
  if (st.length) { console.error('i18n scan self-test FAILED:\n  ' + st.join('\n  ')); process.exit(1); }
  const list = loadAllowlist();
  const bad = validateAllowlist(list);
  if (bad.length) { console.error('i18n allow-list INVALID:\n  ' + bad.join('\n  ')); process.exit(1); }
  const left = applyAllowlist(findings, list);
  if (left.length) {
    console.error(`i18n scan FAILED: ${left.length} hard-coded string(s) outside the allow-list:`);
    for (const f of left) console.error(`  [${f.kind}] ${f.file}:${f.line}  ${f.text}`);
    process.exit(1);
  }
  console.log(`i18n scan OK: ${findings.length} raw findings, all covered by ${list.length} allow-list entries (each with a reason).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
