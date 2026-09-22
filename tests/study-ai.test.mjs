import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const originalFetch = globalThis.fetch;
let handler; let state;
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test-key', OPENAI_API_KEY: 'secret-only-on-server', ALLOWED_ORIGINS: 'https://study.example.com', AI_ALLOWED_EMAILS: 'owner@example.com' };
globalThis.Deno = { env: { get: key => env[key] }, serve: value => { handler = value; } };
globalThis.__testCreateClient = (_url, _key, options) => {
  state.authorization = options.global.headers.Authorization;
  return {
    auth: { getUser: async token => { state.token = token; return { data: { user: state.user }, error: state.authError }; } },
    rpc: async name => { state.rpcCalls++; state.rpcName = name; return { data: state.quota, error: state.quotaError }; }
  };
};
const source = (await readFile(new URL('../supabase/functions/study-ai/index.ts', import.meta.url), 'utf8')).replace(/import \{ createClient \} from '[^']+';/, 'const createClient = globalThis.__testCreateClient;');
const transformed = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`);

beforeEach(() => {
  state = { user: { id: 'owner-id', email: 'owner@example.com', email_confirmed_at: '2026-01-01' }, authError: null, quota: true, quotaError: null, rpcCalls: 0, fetchCalls: 0, material: { summary: 'El valor presente descuenta flujos futuros [p. 7].', cards: [{ front: '¿Qué es el valor presente?', back: 'El equivalente hoy de flujos futuros.', sourcePage: 7 }], questions: [] } };
  globalThis.fetch = async (_url, options) => {
    state.fetchCalls++; state.providerBody = JSON.parse(options.body); state.providerHeaders = options.headers;
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(state.material) }] }] });
  };
});
after(() => { globalThis.fetch = originalFetch; delete globalThis.Deno; delete globalThis.__testCreateClient; });
function request({ authorization = 'Bearer valid-user-token', origin = 'https://study.example.com', body = { pages: [{ number: 7, text: 'El valor presente representa el equivalente hoy de flujos futuros descontados según una tasa y un periodo definidos.' }], mode: 'all' } } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  if (authorization) headers.Authorization = authorization;
  return new Request('https://example.supabase.co/functions/v1/study-ai', { method: 'POST', headers, body: JSON.stringify(body) });
}

test('Anonymous, invalid sessions and foreign origins cannot spend API quota', async () => {
  assert.equal((await handler(request({ authorization: '' }))).status, 401);
  assert.equal((await handler(request({ origin: 'https://evil.example.com' }))).status, 403);
  state.authError = new Error('Expired');
  assert.equal((await handler(request())).status, 401);
  assert.equal(state.fetchCalls, 0);
  assert.equal(state.rpcCalls, 0);
});

test('Verified session is not enough: only the configured owner emails may invoke AI', async () => {
  state.user.email = 'other@example.com';
  assert.equal((await handler(request())).status, 403);
  state.user.email = 'owner@example.com'; state.user.email_confirmed_at = null;
  assert.equal((await handler(request())).status, 403);
  assert.equal(state.fetchCalls, 0);
});

test('Duplicate page references and oversized text are rejected before reserving quota', async () => {
  const page = { number: 7, text: 'a'.repeat(100) };
  assert.equal((await handler(request({ body: { pages: [page, page] } }))).status, 400);
  assert.equal((await handler(request({ body: { pages: [{ number: 7, text: 'a'.repeat(40001) }] } }))).status, 400);
  assert.equal((await handler(request({ body: { pages: [{ number: 7, text: 'a'.repeat(250000) }] } }))).status, 413);
  assert.equal(state.rpcCalls, 0);
});

test('An exhausted or broken quota service fails closed without calling OpenAI', async () => {
  state.quota = false;
  assert.equal((await handler(request())).status, 429);
  state.quotaError = new Error('RPC missing');
  assert.equal((await handler(request())).status, 503);
  assert.equal(state.fetchCalls, 0);
});

test('Successful generation uses verified token, server-only key, strict schema and draft metadata', async () => {
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://study.example.com');
  const body = await response.json();
  assert.equal(body.draft, true);
  assert.deepEqual(body.sourcePages, [7]);
  assert.equal(state.token, 'valid-user-token');
  assert.equal(state.rpcName, 'consume_ai_quota');
  assert.equal(state.providerBody.store, false);
  assert.equal(state.providerBody.text.format.strict, true);
  assert.equal(state.providerHeaders.Authorization, 'Bearer secret-only-on-server');
  assert.ok(!JSON.stringify(body).includes('secret-only-on-server'));
});

test('Generated references outside the provided pages and invalid answers cannot be saved', async () => {
  state.material.cards[0].sourcePage = 99;
  assert.equal((await handler(request())).status, 502);
  state.material.cards = []; state.material.summary = 'Invented reference [p. 99].';
  assert.equal((await handler(request())).status, 502);
  state.material.summary = ''; state.material.questions = [{ prompt: 'Question?', options: ['A', 'B', 'C'], correctIndex: 3, explanation: 'Explanation', sourcePage: 7 }];
  assert.equal((await handler(request())).status, 502);
});
