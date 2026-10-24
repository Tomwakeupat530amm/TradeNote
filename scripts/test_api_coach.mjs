// test_api_coach.mjs - contract test for POST /api/ai-coach (Phase 02, A6). Hybrid gate.
//
// Contract (src/app/api/ai-coach/route.ts): every error body is exactly { error: CODE } with
// CODE in UNAUTHORIZED | INVALID_INPUT | RATE_LIMITED | AI_UNAVAILABLE, and rejections happen in
// this order: auth (401) -> byte cap 64KB (413) -> JSON + zod (400) -> DB quota (429) -> upstream.
//
// Preconditions:
//   - dev server running (npm run dev) at AI_COACH_BASE_URL (default http://localhost:3000)
//   - AI_COACH_TEST_TOKEN = access token (JWT) of a THROWAWAY user, from the environment only.
//     It is never printed or written to a file. Without it the token cases report SKIPPED (not a pass).
// Flags:
//   --allow-live   also send one VALID payload (consumes 1 quota call and may call OpenRouter).
//                  OFF by default and excluded from EVL. There is no live 429 test at route level.
//
// Exit: 0 = all cases ran and passed; 1 = a case failed; 3 = no failure but some cases SKIPPED.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTE_PATH = path.resolve(__dirname, '../src/app/api/ai-coach/route.ts');

const args = process.argv.slice(2);
const ALLOW_LIVE = args.includes('--allow-live');
const BASE = (process.env.AI_COACH_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const URL_ = `${BASE}/api/ai-coach`;
const TOKEN = process.env.AI_COACH_TEST_TOKEN || '';

const CODES = ['UNAUTHORIZED', 'INVALID_INPUT', 'RATE_LIMITED', 'AI_UNAVAILABLE'];
// Strings that must never appear in any response body.
const LEAK_PATTERNS = [/OPENROUTER/i, /\.env/i, /sk-or-/i, /at Object\./, /SUPABASE_/i, /service_role/i, /stack/i];

const results = [];
function record(name, status, detail = '') {
  results.push({ name, status });
  const mark = status === 'PASS' ? 'PASS' : status === 'SKIPPED' ? 'SKIPPED' : 'FAIL';
  console.log(`${mark} ${name}${detail ? ` - ${detail}` : ''}`);
}

async function runCase(name, fn, { needsToken = false, needsServer = true, live = false } = {}) {
  if (live && !ALLOW_LIVE) return record(name, 'SKIPPED', 'needs --allow-live (off by default)');
  if (needsToken && !TOKEN) return record(name, 'SKIPPED', 'AI_COACH_TEST_TOKEN not set (not a pass)');
  if (needsServer && !serverUp) return record(name, 'SKIPPED', `no dev server at ${BASE} (not a pass)`);
  try {
    await fn();
    record(name, 'PASS');
  } catch (err) {
    record(name, 'FAIL', err && err.message ? err.message.replaceAll(TOKEN || '\u0000', '[TOKEN]') : String(err));
  }
}

async function post(body, { token, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(URL_, { method: 'POST', headers: h, body });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, text, json };
}

function assertRedacted(text) {
  for (const re of LEAK_PATTERNS) assert.ok(!re.test(text), `response leaks internal text matching ${re}`);
}

function assertError(r, status, code) {
  assertRedacted(r.text);
  assert.strictEqual(r.res.status, status, `expected HTTP ${status}, got ${r.res.status}`);
  assert.ok(r.json && typeof r.json === 'object', 'error body must be JSON');
  assert.deepStrictEqual(Object.keys(r.json), ['error'], 'error body must be exactly { error }');
  assert.strictEqual(r.json.error, code);
}

const validPayload = {
  accountName: 'Contract Test',
  totalTrades: 3,
  totalPnL: 400,
  winRate: 33,
  winsCount: 1,
  lossesCount: 2,
  averageR: 0.27,
  sessionBreakdown: { 'London-NY Overlap': { trades: 3, pnl: 400, winRate: 33 } },
  mistakeCosts: { FOMO: { count: 1, totalLoss: -500 } },
  revengeStreakLoss: -600,
  revengeStreakCount: 1,
  setupPerformance: { Breakout: { count: 2, winRate: 0, pnl: -1100 } },
  assetPerformance: { MNQ: { count: 2, winRate: 0, pnl: -1100 } },
  locale: 'en',
};

let serverUp = false;

async function main() {
  console.log('=======================================================');
  console.log('  CONTRACT TEST: POST /api/ai-coach');
  console.log(`  target: ${URL_} | token: ${TOKEN ? 'set' : 'not set'} | live: ${ALLOW_LIVE ? 'on' : 'off'}`);
  console.log('=======================================================');

  // Static checks on the route source (no server needed).
  await runCase('static: in-memory limiter removed (no new Map / checkRateLimit)', async () => {
    const code = fs.readFileSync(ROUTE_PATH, 'utf8');
    assert.ok(!code.includes('new Map'), 'route.ts must not contain new Map');
    assert.ok(!code.includes('checkRateLimit'), 'route.ts must not contain checkRateLimit');
  }, { needsServer: false });
  await runCase('static: no config-leaking error text', async () => {
    const code = fs.readFileSync(ROUTE_PATH, 'utf8');
    assert.ok(!code.includes('OPENROUTER_API_KEY is not configured'), 'leaky message must be gone');
    assert.ok(!/error\.message|err\.message/.test(code), 'route must not use error.message');
    assert.ok(!code.includes('service_role'), 'route must never use service_role');
  }, { needsServer: false });

  try {
    await fetch(BASE, { method: 'HEAD' });
    serverUp = true;
  } catch {
    serverUp = false;
  }

  await runCase('401 UNAUTHORIZED without token', async () => {
    assertError(await post(JSON.stringify({})), 401, 'UNAUTHORIZED');
  });
  await runCase('401 UNAUTHORIZED with a forged token', async () => {
    assertError(await post(JSON.stringify(validPayload), { token: 'not-a-real-jwt' }), 401, 'UNAUTHORIZED');
  });
  await runCase('413 INVALID_INPUT for a body over 64KB', async () => {
    const big = JSON.stringify({ ...validPayload, accountName: 'x'.repeat(70 * 1024) });
    assertError(await post(big, { token: TOKEN }), 413, 'INVALID_INPUT');
  }, { needsToken: true });
  await runCase('400 INVALID_INPUT for non-JSON body', async () => {
    assertError(await post('{not json', { token: TOKEN }), 400, 'INVALID_INPUT');
  }, { needsToken: true });
  await runCase('400 INVALID_INPUT for wrong types (no reflection)', async () => {
    const r = await post(JSON.stringify({ ...validPayload, totalTrades: 'MARKER_abc123' }), { token: TOKEN });
    assertError(r, 400, 'INVALID_INPUT');
    assert.ok(!r.text.includes('MARKER_abc123'), 'response must not reflect user data');
  }, { needsToken: true });
  await runCase('400 INVALID_INPUT for legacy trades[] payload / extra keys', async () => {
    assertError(await post(JSON.stringify({ trades: [], locale: 'vi' }), { token: TOKEN }), 400, 'INVALID_INPUT');
    assertError(await post(JSON.stringify({ ...validPayload, extra: 1 }), { token: TOKEN }), 400, 'INVALID_INPUT');
  }, { needsToken: true });

  await runCase('live: valid payload -> 200 with 4 fields, or a known code', async () => {
    const r = await post(JSON.stringify(validPayload), { token: TOKEN });
    assertRedacted(r.text);
    if (r.res.status === 200) {
      const a = r.json && r.json.analysis;
      for (const k of ['big_leak', 'real_edge', 'what_if', 'action_rule']) assert.ok(a && typeof a[k] === 'string', `missing ${k}`);
    } else {
      assert.ok(r.json && CODES.includes(r.json.error), `unexpected error body for HTTP ${r.res.status}`);
      if (r.res.status === 429) assert.ok(Number(r.res.headers.get('Retry-After')) > 0, '429 needs Retry-After');
    }
  }, { needsToken: true, live: true });

  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIPPED').length;
  const passed = results.length - failed - skipped;
  console.log(`\nTOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${failed} | SKIPPED: ${skipped} (SKIPPED is not a pass)`);
  process.exit(failed > 0 ? 1 : skipped > 0 ? 3 : 0);
}

main().catch((err) => {
  console.error('FAIL unexpected harness error:', err && err.name);
  process.exit(1);
});
