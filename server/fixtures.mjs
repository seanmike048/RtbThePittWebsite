// Test fixtures. The case item follows the shape of the Investigator v4.6 node "15 Final Report" output (fields read from
// the workflow code on 2026-10-21); the values are made up for tests and labelled FIXTURE.
import { loadConfig } from './config.mjs';
import { principal } from './auth.mjs';
import { EVENT_SCHEMA } from './contracts.mjs';

export function testConfig(over = {}) {
  const cfg = loadConfig({
    PITT_ENV: 'dev',
    PITT_AUTH_MODE: 'tokens',
    PITT_USERS_JSON: '[]',
    PITT_SESSION_SECRET: 'x'.repeat(40),
    PITT_ALLOWED_OUTBOUND_HOSTS: 'n8n.example.test,acct-test.snowflakecomputing.com',
    PITT_N8N_LAUNCH_URL: 'https://n8n.example.test/webhook/fixture-path',
    PITT_N8N_LAUNCH_HEADER_NAME: 'x-pitt-launch-key',
    PITT_N8N_LAUNCH_HEADER_VALUE: 'fixture-launch-key-value',
    PITT_CALLBACK_HEADER_VALUE: 'fixture-callback-key-value',
    PITT_N8N_WORKFLOW_ID: 'FRYm3m0UAffFyJLq',
    PITT_WEEKLY_LAUNCH_BUDGET: '5',
    PITT_MAX_CONCURRENT_RUNS: '2',
  });
  return { ...cfg, ...over };
}

export const user = (id, roles, networks = ['*'], partners = ['*']) => principal({ id, roles, networks, partners });

/** Fake fetch: records every call; `routes` maps a URL prefix to a responder. */
export function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
    const key = Object.keys(routes).find((k) => String(url).startsWith(k));
    if (!key) throw new TypeError('fetch failed: no route for ' + url);
    return routes[key](String(url), init);
  };
  f.calls = calls;
  return f;
}
export const okJson = (status, body) => ({ ok: status < 300, status, json: async () => body });

export const FIXTURE_CASE = {
  case_id: 'LIVE-5412-amazon_dsp',
  network_id: 5412,
  partner: 'Amazon DSP',
  data_origin: 'LIVE_SNOWFLAKE',
  message_sent: false,
  network_name: 'FIXTURE Network',
  disconnected_at: '2026-10-20 11:38',
  spend_at_stake: { weekly_run_rate_before_cut: 3100, daily_run_rate_before_cut: 443, days_since_cut: 1, run_rate_not_realised_since_cut_estimate: 443, basis: 'official alert view, currency not documented' },
  open_items: [
    { lever_id: 'L1', category: 'equativ_call_limitation', owner: 'TechOps', seat: 'Amazon DSP AMER Display B (seat 437)', status: 'DiscardedByLimitator', signal: 'Amazon DSP AMER Display B (seat 437): DiscardedByLimitator on 62% of pre-cut calls', fix: 'Ask #help-call-limiter whether limitation is expected.', escalate: '#help-call-limiter', evidence_ref: 'demand_funnel_context.by_seat.0.top_statuses.0.share_pct_of_calls', request_sent: false },
  ],
  revenue_7d_before: 3100,
  revenue_basis: 'official alert view, currency not documented',
  status: 'READY_FOR_APPROVAL',
  approval_eligible: true,
  approval_status: 'PENDING_HUMAN_APPROVAL',
  checks: { ads_txt: 'PASS', sco: 'NO DATA', blocked_inventory: 'PASS', ivt: 'FAIL' },
  quality_checks: { ads_txt: { rule_applied: 'TechOps rule: FAIL if network_not_present_pct_post > 5', metrics: { network_not_present_pct_post: 1.2 } }, sco: { rule_applied: 'No SCO rows', metrics: {} }, blocked_inventory: { rule_applied: 'x', metrics: {} }, ivt: { rule_applied: 'y', metrics: { ivt_pct_post: 11 } } },
  window_notes: ['sco completeness and ads_txt are network-level (not specific to Amazon DSP); partner_bid_requests are partner-level.'],
  investigation: {
    confidence: { level: 'low', justification: 'Reason not recorded.' },
    confirmed_facts: [{ fact: 'Seats were disconnected on 2026-10-20.', evidence_refs: ['evidence.meta.disconnected_at'] }],
    hypotheses: [{ id: 'H1', title: 'Commercial or seat-level DSP cut', likelihood: 'medium', how_to_verify: 'Ask Partnerships.' }],
    claim_review: [],
  },
  communication_drafts: [{ audience: 'Publisher KAM', kind: 'publisher_message', message: 'Hi, <script>alert(1)</script> we see a disconnection.', requires_human_approval: true }],
  unsupported_numbers: [],
  priority: { code: 'P1', label: 'HIGH', provisional: true },
  evidence_confidence: { label: 'MEDIUM', basis: 'observed' },
};

export function resultEvent(run, over = {}) {
  return {
    schema_version: EVENT_SCHEMA,
    event_id: 'evt-' + Math.random().toString(36).slice(2, 12),
    run_id: run.run_id,
    request_id: run.request_id,
    environment: run.environment,
    sequence: 10,
    type: 'result',
    status: 'succeeded',
    sent_at: new Date().toISOString(),
    execution_id: '1234',
    workflow_id: 'FRYm3m0UAffFyJLq',
    scope: { dsp_key: run.scope.dsp_key, partner_ids: run.scope.partner_ids, network_ids: run.scope.network_ids },
    result: { cases: [FIXTURE_CASE] },
    ...over,
  };
}
