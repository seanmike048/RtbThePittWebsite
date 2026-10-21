// Acceptance tests for the launch, refresh and optimization backend. Numbers in comments refer to the brief's section 15.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInvestigations } from './investigations.mjs';
import { createOptimizations } from './optimizations.mjs';
import { createRefresh, validateActivity, QUERY_FAMILIES, validateRefreshInput } from './refresh.mjs';
import { createApi } from './app.mjs';
import { MemoryStore } from './store.mjs';
import { canonicalTarget, normalizeCase, sha256 } from './contracts.mjs';
import { WRITE_CAPABILITIES, executable } from './capabilities.mjs';
import { FIXTURE_CASE, fakeFetch, okJson, resultEvent, testConfig, user } from './fixtures.mjs';

const launcher = user('alice', ['viewer', 'launcher', 'refresher', 'approver']);
const body = (over = {}) => ({ dsp: 'amazon_dsp', partner_ids: [437], network_ids: [5412], idempotency_key: 'k'.repeat(20), ...over });
const flush = () => new Promise((r) => setImmediate(r));

function setup(over = {}) {
  const cfg = testConfig(over.cfg);
  const store = new MemoryStore();
  const f = fakeFetch({ 'https://n8n.example.test/': async () => okJson(200, { message: 'Workflow was started' }), ...(over.routes || {}) });
  const inv = createInvestigations({ cfg, store, fetchImpl: f });
  return { cfg, store, f, inv };
}
async function launched(ctx, b = body()) {
  const out = await ctx.inv.launch(launcher, b);
  await flush();
  await flush();
  const token = ctx.f.calls.at(-1)?.body?.callback?.token;
  return { run: ctx.store.get('runs', out.run.run_id), token, out };
}
const headers = (cfg, token) => ({ [cfg.n8n.callbackHeaderName]: cfg.n8n.callbackHeaderValue, 'x-pitt-run-token': token });

test('1. Authorised Amazon launch posts the exact scope to the configured webhook only', async () => {
  const ctx = setup();
  const { run, out } = await launched(ctx);
  assert.equal(out.duplicate, false);
  assert.equal(ctx.f.calls.length, 1);
  const c = ctx.f.calls[0];
  assert.equal(c.url, 'https://n8n.example.test/webhook/fixture-path');
  assert.equal(c.init.headers['x-pitt-launch-key'], 'fixture-launch-key-value');
  assert.equal(c.body.schema_version, 'pitt.launch.v1');
  assert.deepEqual(c.body.scope, { dsp_key: 'amazon_dsp', partner_ids: [437], network_ids: [5412], timezone: 'UTC', window: 'workflow_defined' });
  assert.equal(c.body.run_id, run.run_id);
  assert.equal(c.body.requested_by, 'alice');
  assert.deepEqual(c.body.options, { post_to_slack: false, create_jira: false }); // 23. no hidden messaging
  assert.equal(run.state, 'running');
});

test('1b. The launch answers only after n8n answered; a dispatch that never got an answer does not block the scope', async () => {
  const ctx = setup();
  const out = await ctx.inv.launch(launcher, body());
  assert.equal(out.run.state, 'running'); // dispatched inside the request
  assert.equal(out.run.dispatch_outcome, 'accepted');
  let t = Date.now();
  const store = new MemoryStore();
  const f = fakeFetch({ 'https://n8n.example.test/': () => new Promise(() => {}) }); // never answers, never times out (frozen instance)
  const cfg = testConfig();
  const inv = createInvestigations({ cfg, store, fetchImpl: f, now: () => t });
  void inv.launch(launcher, body()); // hangs like the frozen call
  await flush();
  const stuck = store.all('runs')[0];
  assert.equal(stuck.state, 'dispatching');
  t += cfg.n8n.dispatchTimeoutMs + 31_000;
  const inv2 = createInvestigations({ cfg, store, fetchImpl: fakeFetch({ 'https://n8n.example.test/': async () => okJson(404, {}) }), now: () => t });
  const again = await inv2.launch(launcher, body({ idempotency_key: 'n'.repeat(20) }));
  assert.notEqual(again.run.run_id, stuck.run_id);
  assert.equal(store.get('runs', stuck.run_id).dispatch_outcome, 'interrupted_no_answer');
  assert.equal(again.run.state, 'dispatch_failed');
  assert.equal(again.run.dispatch_outcome, 'rejected_404');
});

test('2. Unsupported DSP never falls back to Amazon; nothing is dispatched', async () => {
  const ctx = setup();
  await assert.rejects(ctx.inv.launch(launcher, body({ dsp: 'ttd', partner_ids: [75] })), (e) => e.code === 'unsupported');
  await assert.rejects(ctx.inv.launch(launcher, body({ partner_ids: [75] })), (e) => e.code === 'invalid'); // TTD seat under Amazon
  assert.equal(ctx.f.calls.length, 0);
});

test('3. Double clicks and transport retries create one logical run and one dispatch', async () => {
  const ctx = setup();
  const [a, b] = await Promise.all([ctx.inv.launch(launcher, body()), ctx.inv.launch(launcher, body())]);
  const c = await ctx.inv.launch(launcher, body({ idempotency_key: 'z'.repeat(20) })); // new key, same scope still in flight
  await flush();
  await flush();
  assert.equal(a.run.run_id, b.run.run_id);
  assert.equal(c.run.run_id, a.run.run_id);
  assert.equal(ctx.store.all('runs').length, 1);
  assert.equal(ctx.f.calls.length, 1);
});

test('4. No n8n, Manage or Snowflake secret reaches the browser bundle or run payloads', async () => {
  const ctx = setup();
  const { run } = await launched(ctx);
  const visible = JSON.stringify(ctx.inv.get(launcher, run.run_id));
  for (const s of ['fixture-launch-key-value', 'fixture-callback-key-value', run.callback_token_hash]) assert.ok(!visible.includes(s));
  const files = [];
  const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.(tsx?|css|html)$/.test(f) && files.push(join(d, f))));
  walk('src');
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /PITT_(N8N_LAUNCH_HEADER_VALUE|CALLBACK_HEADER_VALUE|SNOWFLAKE_PRIVATE_KEY_PEM|SESSION_SECRET)|VITE_[A-Z_]*(KEY|SECRET|TOKEN)|snowflakecomputing\.com|\/webhook\//, f);
  }
});

test('5. Invalid key, wrong run token, replay, stale clock and scope mismatch are rejected', async () => {
  const ctx = setup();
  const { run, token } = await launched(ctx);
  const ev = resultEvent(run);
  await assert.rejects(ctx.inv.receiveEvent({ [ctx.cfg.n8n.callbackHeaderName]: 'nope', 'x-pitt-run-token': token }, ev), (e) => e.code === 'unauthorized');
  await assert.rejects(ctx.inv.receiveEvent(headers(ctx.cfg, 'wrong'), ev), (e) => e.code === 'unauthorized');
  await assert.rejects(ctx.inv.receiveEvent(headers(ctx.cfg, token), { ...ev, sent_at: '2020-01-01T00:00:00Z' }), (e) => e.code === 'stale');
  await assert.rejects(ctx.inv.receiveEvent(headers(ctx.cfg, token), { ...ev, scope: { ...ev.scope, partner_ids: [437, 491] } }), (e) => e.code === 'forbidden');
  await assert.rejects(ctx.inv.receiveEvent(headers(ctx.cfg, token), { ...ev, environment: 'production' }), (e) => e.code === 'forbidden');
  const ok = await ctx.inv.receiveEvent(headers(ctx.cfg, token), ev);
  assert.equal(ok.applied, true);
  await assert.rejects(ctx.inv.receiveEvent(headers(ctx.cfg, token), ev), (e) => e.code === 'duplicate');
});

test('6. A delayed progress event never overwrites a terminal result; status survives a reload', async () => {
  const ctx = setup();
  const { run, token } = await launched(ctx);
  await ctx.inv.receiveEvent(headers(ctx.cfg, token), resultEvent(run, { sequence: 5 }));
  const late = { ...resultEvent(run), type: 'progress', status: 'running', sequence: 2, result: undefined };
  const out = await ctx.inv.receiveEvent(headers(ctx.cfg, token), late);
  assert.equal(out.applied, false);
  assert.equal(ctx.inv.get(launcher, run.run_id).state, 'succeeded'); // a reload reads the same server state
});

test('7. Failed and partial results are reported as such', async () => {
  const ctx = setup();
  const { run, token } = await launched(ctx);
  const failed = await ctx.inv.receiveEvent(headers(ctx.cfg, token), resultEvent(run, { status: 'failed', result: { cases: [] }, error: { message: 'Investigator error' } }));
  assert.equal(failed.run.state, 'failed');
  assert.equal(failed.run.result.error, 'Investigator error');
  const ctx2 = setup();
  const r2 = await launched(ctx2);
  const partial = await ctx2.inv.receiveEvent(headers(ctx2.cfg, r2.token), resultEvent(r2.run, { result: { cases: [{ ...FIXTURE_CASE, status: 'INVESTIGATION_INVALID' }] } }));
  assert.equal(partial.run.state, 'partial');
});

test('8. Result keeps currency status, unconfirmed hypotheses, separate confidences and unsent drafts', () => {
  const c = normalizeCase(FIXTURE_CASE, { network_ids: [5412], partner_ids: [437] });
  assert.equal(c.exposure.currency.code, null); // basis says "currency not documented"
  assert.equal(c.exposure.currency.status, 'not_documented');
  assert.equal(c.disconnected_at_timezone, null);
  assert.equal(c.hypotheses[0].confirmed, false);
  assert.equal(c.evidence_confidence.label, 'MEDIUM');
  assert.equal(c.root_cause_confidence, 'low');
  assert.ok(c.drafts.every((d) => d.sent === false));
  assert.deepEqual(c.checks.map((x) => x.result), ['pass', 'unknown', 'pass', 'fail']); // NO DATA is unknown, not PASS
  const v46 = normalizeCase({ ...FIXTURE_CASE, business_context: { revenue_currency: 'EUR', revenue_currency_status: 'source-documented, not Finance-validated', rpmbr_7d_before: { unit: 'EUR per million bid requests sent', partner: { value: 19.45 }, network_all_partners: { value: 2.55 } } } }, { network_ids: [5412], partner_ids: [437] });
  assert.equal(v46.exposure.currency.code, 'EUR');
  assert.equal(v46.exposure.rpmbr.partner, 19.45);
  assert.throws(() => normalizeCase({ ...FIXTURE_CASE, network_id: 1 }, { network_ids: [5412], partner_ids: [437] }), (e) => e.code === 'forbidden');
});

function snowflakeFake(handler) {
  const statements = [];
  const f = fakeFetch({
    'https://acct-test.snowflakecomputing.com/api/v2/statements': async (url, init) => {
      const b = JSON.parse(init.body);
      statements.push(b);
      return handler(b);
    },
  });
  return { f, statements };
}
const rowsFor = (b) => {
  if (/MAX\(day\)/.test(b.statement)) return okJson(200, { statementHandle: 'q-wm', resultSetMetaData: { numRows: 1, rowType: [{ name: 'LAST_DAY' }] }, data: [['2026-10-19']] });
  if (/DAY_SCO_NODES/.test(b.statement))
    return okJson(200, { statementHandle: 'q-act', resultSetMetaData: { numRows: 2, rowType: [{ name: 'DAY' }, { name: 'NETWORK_ID' }, { name: 'PARTNER_ID' }, { name: 'BID_REQUESTS' }, { name: 'SPEND' }] }, data: [['2026-10-18', '5412', '437', '1000000', '20'], ['2026-10-19', '5412', '437', '0', null]] });
  return okJson(200, { statementHandle: 'q-ev', resultSetMetaData: { numRows: 0, rowType: [] }, data: [] });
};

test('9. Refresh builds a validated snapshot with query IDs, read-only SQL and no execution', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cfg = testConfig();
  cfg.snowflake = { ...cfg.snowflake, account: 'acct-test', user: 'PITT_READER', role: 'R', warehouse: 'W', privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }), publicKeyFingerprint: 'SHA256:abc' };
  const store = new MemoryStore();
  const { f, statements } = snowflakeFake(rowsFor);
  const { createSnowflake } = await import('./snowflake.mjs');
  const promoted = [];
  const ref = createRefresh({ cfg, store, snowflake: createSnowflake(cfg, f), onPromote: (s) => promoted.push(s) });
  const { refresh } = await ref.start(launcher, { dsp: 'amazon_dsp', partner_ids: [437], network_ids: [5412], from: '2026-10-18', to: '2026-10-19' });
  const snap = await ref.run(refresh.refresh_id);
  assert.equal(snap.status, 'complete');
  assert.equal(snap.datasets.seat_daily_activity.query_id, 'q-act');
  assert.equal(snap.source_watermark, '2026-10-19');
  assert.equal(snap.activity[0].rpmbr, 20); // 20 / 1,000,000 x 1e6
  assert.equal(snap.activity[1].rpmbr, null); // 0 bid requests: no RPMBr, not 0
  assert.equal(snap.activity[1].spend, null); // missing stays missing
  for (const s of statements) assert.match(s.statement.trim(), /^(SELECT|WITH)\b/);
  for (const s of statements) assert.doesNotMatch(s.statement, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|GRANT)\b/i);
  assert.equal(promoted.length, 1);
  assert.equal(store.all('executions').length, 0);
});

test('10. A failed refresh keeps the last complete snapshot and never turns missing data into zero', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cfg = testConfig();
  cfg.snowflake = { ...cfg.snowflake, account: 'acct-test', user: 'U', role: 'R', warehouse: 'W', privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }), publicKeyFingerprint: 'SHA256:abc' };
  const store = new MemoryStore();
  let fail = false;
  const { f } = snowflakeFake((b) => (fail && /DAY_SCO_NODES/.test(b.statement) && !/MAX\(day\)/.test(b.statement) ? okJson(422, { code: '002003' }) : rowsFor(b)));
  const { createSnowflake } = await import('./snowflake.mjs');
  const ref = createRefresh({ cfg, store, snowflake: createSnowflake(cfg, f) });
  const scope = { dsp: 'amazon_dsp', partner_ids: [437], network_ids: [5412], from: '2026-10-18', to: '2026-10-19' };
  const first = await ref.run((await ref.start(launcher, scope)).refresh.refresh_id);
  fail = true;
  const second = await ref.run((await ref.start(launcher, scope)).refresh.refresh_id);
  assert.equal(second.status, 'partial');
  assert.equal(second.activity, null);
  assert.ok(second.blocked_calculations.length);
  assert.equal(ref.current(launcher, { dsp_key: 'amazon_dsp', partner_ids: [437], network_ids: [5412] }).snapshot_id, first.snapshot_id);
  const v = validateActivity([], { from: '2026-10-01', to: '2026-10-03', partner_ids: [437], network_ids: [1] }, '2026-10-03');
  assert.deepEqual(v.coverage.missing_days, ['2026-10-01', '2026-10-02', '2026-10-03']);
});

test('10b. Without Snowflake configuration the refresh is refused up front, naming the missing variables', async () => {
  const store = new MemoryStore();
  const ref = createRefresh({ cfg: testConfig(), store, snowflake: { query: async () => assert.fail('no query expected') } });
  await assert.rejects(ref.start(launcher, { dsp: 'amazon_dsp', partner_ids: [437], network_ids: [5412], from: '2026-10-18', to: '2026-10-19' }), (e) => e.code === 'upstream_unavailable' && e.details.missing.includes('PITT_SNOWFLAKE_ACCOUNT'));
  assert.equal(store.all('refreshes').length, 0);
});

test('11. Another user cannot read a run or refresh by guessing its ID', async () => {
  const ctx = setup();
  const { run } = await launched(ctx);
  const mallory = user('mallory', ['viewer'], [9999], ['amazon_dsp']);
  assert.throws(() => ctx.inv.get(mallory, run.run_id), (e) => e.code === 'not_found');
  assert.equal(ctx.inv.list(mallory).length, 0);
  assert.throws(() => validateRefreshInput({ dsp: 'amazon_dsp', partner_ids: [437], network_ids: [5412], from: '2026-10-01', to: '2026-10-02' }, mallory), (e) => e.code === 'forbidden');
});

// ---------- Optimizations ----------
const VERIFIED_CAP = { ...WRITE_CAPABILITIES[0], api: 'FAKE (test double)', nativeScope: 'network_partner', canReadState: true, canWrite: true, matching: 'exact_host', concurrency: 'if_version', verification: 'read_back', status: 'verified' };

function fakeAdapter(initial = [], opts = {}) {
  const state = { version: 1, entries: initial.map((v) => ({ canonical: v })) };
  const a = {
    available: true,
    reads: 0,
    writes: [],
    async read({ scope }) {
      a.reads++;
      if (opts.readFailsAfterWrite && a.writes.length) throw new Error('read failed');
      return { resource_id: 'res-1', native_scope: opts.nativeScope ?? 'network_partner', network_id: scope.network_id, version: state.version, entries: state.entries.map((e) => ({ ...e })) };
    },
    async applyDelta(d) {
      a.writes.push(d);
      if (opts.timeout) throw Object.assign(new Error('timeout'), { code: 'timeout' });
      const add = opts.partial ? d.add.slice(0, 1) : d.add;
      for (const t of add) state.entries.push({ canonical: t.value });
      state.entries = state.entries.filter((e) => !d.remove.some((r) => r.value === e.canonical));
      state.version++;
      return { status: 200, version: state.version };
    },
    bump(extra) {
      state.entries.push({ canonical: extra });
      state.version++;
    },
  };
  return a;
}

async function optSetup({ adapter, caps = [VERIFIED_CAP], cfgOver = { killSwitch: false, manage: { baseUrl: null, writesEnabled: true } }, targets = ['ads.example.com'] } = {}) {
  const cfg = testConfig(cfgOver);
  const store = new MemoryStore();
  const scheduled = [];
  const opt = createOptimizations({ cfg, store, adapter, capabilities: caps, schedule: (fn) => scheduled.push(fn) });
  const c = normalizeCase({ ...FIXTURE_CASE, open_items: [{ ...FIXTURE_CASE.open_items[0], lever_id: 'L9', category: 'supply_quality', proposed_change: { action: 'exclude_domain', targets } }] }, { network_ids: [5412], partner_ids: [437] });
  const run = { run_id: 'run_x', environment: cfg.environment, state: 'succeeded', scope: { dsp_key: 'amazon_dsp', partner_ids: [437], network_ids: [5412], snapshot_id: null }, result: { received_at: new Date().toISOString(), cases: [c] } };
  const [rec] = await opt.syncFromRun(run);
  return { cfg, store, opt, rec, scheduled, run, adapter };
}

test('12 + 25. With no verified Manage API every change is manual_required with a precise request, and nothing is called', async () => {
  const store = new MemoryStore();
  const cfg = testConfig();
  const opt = createOptimizations({ cfg, store });
  const c = normalizeCase({ ...FIXTURE_CASE, open_items: [{ ...FIXTURE_CASE.open_items[0], category: 'supply_quality', proposed_change: { action: 'exclude_domain', targets: ['ads.example.com'] } }] }, { network_ids: [5412], partner_ids: [437] });
  const [rec] = await opt.syncFromRun({ run_id: 'r', environment: cfg.environment, state: 'succeeded', scope: { dsp_key: 'amazon_dsp', partner_ids: [437], network_ids: [5412] }, result: { received_at: 'x', cases: [c] } });
  const out = await opt.preview(launcher, rec.recommendation_id);
  assert.equal(out.status, 'manual_required');
  assert.match(out.ask.text, /native scope/);
  assert.equal(executable(WRITE_CAPABILITIES[0], cfg).ok, false);
  const listed = opt.list(launcher)[0];
  assert.equal(listed.capability.executable, false);
  // The workflow's prose open items (call limiter, etc.) are tasks, never changes.
  const tasks = await opt.syncFromRun({ run_id: 'r2', environment: cfg.environment, state: 'succeeded', scope: { dsp_key: 'amazon_dsp', partner_ids: [437], network_ids: [5412] }, result: { received_at: 'x', cases: [normalizeCase(FIXTURE_CASE, { network_ids: [5412], partner_ids: [437] })] } });
  assert.equal(tasks[0].kind, 'task');
  assert.equal(tasks[0].state, 'manual_required');
});

test('13. A resource broader than one network x seat stops the preview instead of widening the write', async () => {
  const adapter = fakeAdapter([], { nativeScope: 'all_networks_shared_list' });
  const { opt, rec } = await optSetup({ adapter });
  const out = await opt.preview(launcher, rec.recommendation_id);
  assert.equal(out.status, 'manual_required');
  assert.equal(out.reason, 'resource_scope_mismatch');
  assert.equal(adapter.writes.length, 0);
});

test('14. No records the rejection and makes no external call; the same change is not re-proposed', async () => {
  const adapter = fakeAdapter();
  const { opt, rec, store, run } = await optSetup({ adapter });
  const { preview } = await opt.preview(launcher, rec.recommendation_id);
  await opt.decide(launcher, rec.recommendation_id, { decision: 'no', preview_id: preview.preview_id, payload_hash: preview.payload_hash, reason: 'not now' });
  assert.equal(store.get('recommendations', rec.recommendation_id).state, 'rejected');
  assert.equal(adapter.writes.length, 0);
  assert.equal((await opt.syncFromRun(run)).length, 0);
});

test('15. Yes queues and applies exactly the approved diff, then verifies by reading back', async () => {
  const adapter = fakeAdapter(['already.example.com']);
  const { opt, rec, scheduled, store } = await optSetup({ adapter, targets: ['ads.example.com', 'already.example.com'] });
  const { preview } = await opt.preview(launcher, rec.recommendation_id);
  assert.deepEqual(preview.payload.add.map((t) => t.value), ['ads.example.com']);
  assert.deepEqual(preview.already_present, ['already.example.com']);
  const d = await opt.decide(launcher, rec.recommendation_id, { decision: 'yes', preview_id: preview.preview_id, payload_hash: preview.payload_hash });
  assert.equal(d.queued, true);
  await scheduled[0]();
  assert.equal(adapter.writes.length, 1);
  assert.deepEqual(adapter.writes[0].add, preview.payload.add);
  assert.equal(adapter.writes[0].if_version, 1);
  assert.equal(store.get('executions', d.execution_id).state, 'configuration_verified');
});

test('16. An n8n investigation approval does not authorise a write', async () => {
  const adapter = fakeAdapter();
  const { opt, rec, store } = await optSetup({ adapter });
  assert.equal(FIXTURE_CASE.approval_status, 'PENDING_HUMAN_APPROVAL');
  assert.notEqual(store.get('recommendations', rec.recommendation_id).state, 'approved');
  await assert.rejects(opt.decide(launcher, rec.recommendation_id, { decision: 'yes', preview_id: 'prv_none', payload_hash: 'x' }), (e) => e.code === 'not_found');
  assert.equal(adapter.writes.length, 0);
});

test('17. Stale state, changed payload, expired approval or missing permission prevent execution', async () => {
  // changed payload
  let s = await optSetup({ adapter: fakeAdapter() });
  let { preview } = await s.opt.preview(launcher, s.rec.recommendation_id);
  await assert.rejects(s.opt.decide(launcher, s.rec.recommendation_id, { decision: 'yes', preview_id: preview.preview_id, payload_hash: sha256('other') }), (e) => e.code === 'stale');
  // no approver role
  await assert.rejects(s.opt.decide(user('bob', ['viewer']), s.rec.recommendation_id, { decision: 'yes', preview_id: preview.preview_id, payload_hash: preview.payload_hash }), (e) => e.code === 'forbidden');
  // expired
  let t = Date.now();
  const cfg = testConfig({ killSwitch: false, manage: { baseUrl: null, writesEnabled: true } });
  const store = new MemoryStore();
  const adapter = fakeAdapter();
  const opt = createOptimizations({ cfg, store, adapter, capabilities: [VERIFIED_CAP], now: () => t, schedule: () => {} });
  const [rec] = await opt.syncFromRun(s.run);
  ({ preview } = await opt.preview(launcher, rec.recommendation_id));
  t += 31 * 60_000;
  await assert.rejects(opt.decide(launcher, rec.recommendation_id, { decision: 'yes', preview_id: preview.preview_id, payload_hash: preview.payload_hash }), (e) => e.code === 'stale');
  // before-state changed by someone else between approval and execution
  s = await optSetup({ adapter: fakeAdapter() });
  ({ preview } = await s.opt.preview(launcher, s.rec.recommendation_id));
  const d = await s.opt.decide(launcher, s.rec.recommendation_id, { decision: 'yes', preview_id: preview.preview_id, payload_hash: preview.payload_hash });
  s.adapter.bump('edited-by-someone-else.example.com'); // resource version moves after the preview
  await s.scheduled[0]();
  assert.equal(s.store.get('executions', d.execution_id).state, 'stale');
  assert.equal(s.adapter.writes.length, 0);
  // new evidence snapshot makes a pending approval stale
  s = await optSetup({ adapter: fakeAdapter() });
  await s.opt.preview(launcher, s.rec.recommendation_id);
  await s.opt.onSnapshot({ snapshot_id: 'snap_new', scope: { dsp_key: 'amazon_dsp', network_ids: [5412] } });
  assert.equal(s.store.get('recommendations', s.rec.recommendation_id).state, 'stale');
  // kill switch on at execution time
  s = await optSetup({ adapter: fakeAdapter() });
  ({ preview } = await s.opt.preview(launcher, s.rec.recommendation_id));
  const d2 = await s.opt.decide(launcher, s.rec.recommendation_id, { decision: 'yes', preview_id: preview.preview_id, payload_hash: preview.payload_hash });
  s.cfg.killSwitch = true;
  await s.scheduled[0]();
  assert.equal(s.store.get('executions', d2.execution_id).state, 'blocked');
});

test('18. Concurrent Yes clicks create one execution intent', async () => {
  const adapter = fakeAdapter();
  const { opt, rec, store } = await optSetup({ adapter });
  const { preview } = await opt.preview(launcher, rec.recommendation_id);
  const b = { decision: 'yes', preview_id: preview.preview_id, payload_hash: preview.payload_hash };
  const results = await Promise.allSettled([opt.decide(launcher, rec.recommendation_id, b), opt.decide(launcher, rec.recommendation_id, b)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(store.all('executions').length, 1);
});

test('19. A timeout with no read-back is outcome_unknown and is not retried', async () => {
  const adapter = fakeAdapter([], { timeout: true, readFailsAfterWrite: true });
  const { opt, rec, scheduled, store } = await optSetup({ adapter });
  const { preview } = await opt.preview(launcher, rec.recommendation_id);
  const d = await opt.decide(launcher, rec.recommendation_id, { decision: 'yes', preview_id: preview.preview_id, payload_hash: preview.payload_hash });
  await scheduled[0]();
  await opt.execute(d.execution_id); // a second worker pass must not write again
  assert.equal(adapter.writes.length, 1);
  assert.equal(store.get('executions', d.execution_id).state, 'outcome_unknown');
});

test('20. Partial application and verification failure are distinct, per target', async () => {
  const adapter = fakeAdapter([], { partial: true });
  const { opt, rec, scheduled, store } = await optSetup({ adapter, targets: ['a.example.com', 'b.example.com'] });
  const { preview } = await opt.preview(launcher, rec.recommendation_id);
  const d = await opt.decide(launcher, rec.recommendation_id, { decision: 'yes', preview_id: preview.preview_id, payload_hash: preview.payload_hash });
  await scheduled[0]();
  const exe = store.get('executions', d.execution_id);
  assert.equal(exe.state, 'partially_applied');
  assert.deepEqual(exe.targets, { 'a.example.com': 'configuration_verified', 'b.example.com': 'not_present' });
});

test('21. Rollback removes only this change\'s entries, keeps others\' later entries, and needs its own approval', async () => {
  const adapter = fakeAdapter();
  const { opt, rec, scheduled } = await optSetup({ adapter });
  const { preview } = await opt.preview(launcher, rec.recommendation_id);
  await opt.decide(launcher, rec.recommendation_id, { decision: 'yes', preview_id: preview.preview_id, payload_hash: preview.payload_hash });
  await scheduled[0]();
  adapter.bump('someone-else.example.com');
  const rb = await opt.rollbackPreview(launcher, rec.recommendation_id);
  assert.deepEqual(rb.payload.remove.map((r) => r.value), ['ads.example.com']);
  assert.deepEqual(rb.payload.add, []);
  assert.match(rb.note, /own approval/);
  assert.equal(adapter.writes.length, 1); // preview only, no write
});

test('22. Targets are typed and never expanded; injected markup stays inert text', () => {
  assert.equal(canonicalTarget('domain', 'evil.com/<script>'), null);
  assert.equal(canonicalTarget('domain', '*.example.com'), null);
  assert.equal(canonicalTarget('domain', 'Sub.Example.com').canonical, 'sub.example.com');
  assert.equal(canonicalTarget('domain', 'sub.example.com').matching, 'exact_host');
  assert.equal(canonicalTarget('bundle', 'com.Example.App').canonical, 'com.Example.App');
  const c = normalizeCase(FIXTURE_CASE, { network_ids: [5412], partner_ids: [437] });
  assert.equal(c.drafts[0].message, FIXTURE_CASE.communication_drafts[0].message); // kept as text; React renders it escaped
});

test('24. Refresh SQL binds only the selected seats; rows of another seat are flagged', () => {
  const q = QUERY_FAMILIES.seat_daily_activity.build({ network_ids: [5100], partner_ids: [437], from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(q.binds, [5100, 437, '2026-09-01', '2026-09-30']);
  assert.doesNotMatch(q.sql, /491|492/);
  const v = validateActivity([{ DAY: '2026-09-01', NETWORK_ID: '5100', PARTNER_ID: '492', BID_REQUESTS: '5', SPEND: '1' }], { from: '2026-09-01', to: '2026-09-01', partner_ids: [437], network_ids: [5100] }, '2026-09-01');
  assert.match(v.issues[0], /outside the requested scope/);
});

// ---------- HTTP layer ----------
test('HTTP: sign-in, CSRF and same-origin checks guard every mutation', async () => {
  const token = 'tok_' + 'a'.repeat(30);
  const cfg = testConfig();
  cfg.publicOrigins = ['https://thepitt.example.hosted.app'];
  cfg.auth.usersJson = JSON.stringify([{ id: 'alice', token_sha256: sha256(token), roles: ['viewer', 'launcher'], networks: ['*'], partners: ['*'] }]);
  const f = fakeFetch({ 'https://n8n.example.test/': async () => okJson(200, {}) });
  const api = createApi({ cfg, store: new MemoryStore(), fetchImpl: f });
  const srv = createServer((q, r) => api.handle(q, r));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    const anon = await fetch(base + '/api/investigations');
    assert.equal(anon.status, 401);
    // Signed out: the page learns which variables are missing (names only), never their values.
    const pre = await (await fetch(base + '/api/session')).json();
    assert.equal(pre.user, null);
    assert.deepEqual(pre.setup.launch, []);
    assert.ok(pre.setup.snowflake.includes('PITT_SNOWFLAKE_ACCOUNT'));
    assert.ok(!JSON.stringify(pre).includes('fixture-launch-key-value') && !JSON.stringify(pre).includes('fixture-callback-key-value'));
    const bad = await fetch(base + '/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'wrong-token-wrong-token-xx' }) });
    assert.equal(bad.status, 401);
    const login = await fetch(base + '/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const { csrf } = await login.json();
    const noCsrf = await fetch(base + '/api/investigations', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(noCsrf.status, 403);
    const cross = await fetch(base + '/api/investigations', { method: 'POST', headers: { cookie, 'x-pitt-csrf': csrf, origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(cross.status, 403);
    // Behind App Hosting the Host header is internal: the configured public origin is accepted, an unknown one is not.
    const proxied = await fetch(base + '/api/investigations', { method: 'POST', headers: { cookie, 'x-pitt-csrf': csrf, origin: 'https://thepitt.example.hosted.app', 'content-type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(proxied.status, 202);
    const ok = await fetch(base + '/api/investigations', { method: 'POST', headers: { cookie, 'x-pitt-csrf': csrf, 'content-type': 'application/json' }, body: JSON.stringify(body({ idempotency_key: 'q'.repeat(20) })) });
    assert.equal(ok.status, 200); // same scope still in flight: the server returns the existing run
    const injected = await fetch(base + '/api/investigations', { method: 'POST', headers: { cookie, 'x-pitt-csrf': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ ...body(), webhook_url: 'https://evil.example/hook' }) });
    assert.equal(injected.status, 400); // a browser cannot choose the destination
    const caps = await (await fetch(base + '/api/manage-capabilities', { headers: { cookie } })).json();
    assert.ok(caps.capabilities.every((c) => c.status !== 'verified'));
  } finally {
    api.close();
    srv.close();
  }
});
