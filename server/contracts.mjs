// Versioned contracts between the browser, this server and n8n, with validators and state machines.
// Route, field and state names are The Pitt's own application contract; none of them is an n8n or Manage API.
import { createHash, randomUUID } from 'node:crypto';
import { dspByKey } from './capabilities.mjs';

export const LAUNCH_SCHEMA = 'pitt.launch.v1';
export const EVENT_SCHEMA = 'pitt.event.v1';
export const RESULT_SCHEMA = 'pitt.result.v1';

export class ContractError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code; // invalid | unsupported | unauthorized | forbidden | stale | duplicate | rate_limited | upstream_unavailable | outcome_unknown | not_found
    this.details = details;
  }
}
const fail = (code, msg, details) => {
  throw new ContractError(code, msg, details);
};

/** Key-sorted JSON, so the same content always hashes the same. */
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : canonical(s)).digest('hex');
export const newId = (prefix) => prefix + '_' + randomUUID().replace(/-/g, '').slice(0, 20);

const isInt = (v) => Number.isInteger(v) && v > 0 && v < 1e9;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Launch request from the browser ----------
/**
 * The browser sends only a scope; the server derives user, environment, workflow and destinations.
 * Window: the Investigator anchors its windows on the disconnection (14 days before, up to 30 after, UTC days), so a
 * user-chosen window is not sent to it; it is recorded as 'workflow_defined'.
 */
export function validateLaunchInput(body, user) {
  if (!body || typeof body !== 'object') fail('invalid', 'Body must be a JSON object');
  const allowed = ['dsp', 'partner_ids', 'network_ids', 'idempotency_key', 'snapshot_id'];
  for (const k of Object.keys(body)) if (!allowed.includes(k)) fail('invalid', 'Unknown field: ' + k);
  const dsp = dspByKey(body.dsp);
  if (!dsp) fail('invalid', 'Unknown DSP');
  if (dsp.status !== 'supported') fail('unsupported', dsp.name + ' is not integrated for launch: ' + dsp.note);
  if (!Array.isArray(body.partner_ids) || !body.partner_ids.length || body.partner_ids.length > 10) fail('invalid', 'partner_ids: 1 to 10 seat IDs');
  const seatIds = dsp.seats.map((s) => s.id);
  for (const p of body.partner_ids) if (!isInt(p) || !seatIds.includes(p)) fail('invalid', 'Seat ' + p + ' is not a ' + dsp.name + ' seat in the registry');
  if (!Array.isArray(body.network_ids) || !body.network_ids.length || body.network_ids.length > 10) fail('invalid', 'network_ids: 1 to 10 networks');
  for (const n of body.network_ids) if (!isInt(n)) fail('invalid', 'network_ids must be positive integers');
  if (typeof body.idempotency_key !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(body.idempotency_key)) fail('invalid', 'idempotency_key: 16-80 URL-safe characters');
  if (body.snapshot_id != null && (typeof body.snapshot_id !== 'string' || !/^snap_[a-z0-9]{20}$/.test(body.snapshot_id))) fail('invalid', 'snapshot_id');
  for (const n of body.network_ids) if (!user.canSeeNetwork(n)) fail('forbidden', 'Network ' + n + ' is outside your authorised scope');
  if (!user.canSeePartner(dsp.key)) fail('forbidden', dsp.name + ' is outside your authorised scope');
  return {
    dsp_key: dsp.key,
    dsp_name: dsp.name,
    partner_ids: [...new Set(body.partner_ids)].sort((a, b) => a - b),
    network_ids: [...new Set(body.network_ids)].sort((a, b) => a - b),
    timezone: 'UTC',
    window: 'workflow_defined',
    snapshot_id: body.snapshot_id ?? null,
    idempotency_key: body.idempotency_key,
  };
}

/** Payload POSTed to the approved n8n webhook. No secret except the per-run callback token, which n8n echoes back. */
export function buildLaunchPayload({ run, scope, environment, user, callbackToken }) {
  return {
    schema_version: LAUNCH_SCHEMA,
    request_id: run.request_id,
    run_id: run.run_id,
    environment,
    requested_at: run.created_at,
    requested_by: user.id,
    scope: {
      dsp_key: scope.dsp_key,
      partner_ids: scope.partner_ids,
      network_ids: scope.network_ids,
      timezone: scope.timezone,
      window: scope.window,
    },
    capabilities: ['investigate'],
    options: { post_to_slack: false, create_jira: false },
    snapshot_id: scope.snapshot_id,
    callback: { token: callbackToken },
  };
}

// ---------- Run state machine ----------
export const RUN_STATES = ['queued', 'dispatching', 'running', 'waiting_for_input', 'succeeded', 'partial', 'failed', 'dispatch_failed', 'timed_out'];
export const RUN_TERMINAL = ['succeeded', 'partial', 'failed', 'dispatch_failed', 'timed_out'];
const RUN_NEXT = {
  queued: ['dispatching', 'failed', 'timed_out'],
  dispatching: ['running', 'dispatch_failed', 'succeeded', 'partial', 'failed', 'timed_out'],
  running: ['running', 'waiting_for_input', 'succeeded', 'partial', 'failed', 'timed_out'],
  waiting_for_input: ['running', 'succeeded', 'partial', 'failed', 'timed_out'],
};
export function canTransitionRun(from, to) {
  return (RUN_NEXT[from] || []).includes(to);
}

// ---------- Callback events from n8n ----------
export function validateEvent(ev, run, { now = Date.now(), skewSeconds = 300 } = {}) {
  if (!ev || typeof ev !== 'object') fail('invalid', 'Event must be an object');
  if (ev.schema_version !== EVENT_SCHEMA) fail('invalid', 'schema_version must be ' + EVENT_SCHEMA);
  if (typeof ev.event_id !== 'string' || !/^[A-Za-z0-9_.:-]{8,120}$/.test(ev.event_id)) fail('invalid', 'event_id');
  if (!run) fail('not_found', 'Unknown run');
  if (ev.run_id !== run.run_id || ev.request_id !== run.request_id) fail('forbidden', 'Run or request ID mismatch');
  if (ev.environment !== run.environment) fail('forbidden', 'Environment mismatch');
  const sent = Date.parse(ev.sent_at);
  if (!Number.isFinite(sent) || Math.abs(now - sent) > skewSeconds * 1000) fail('stale', 'sent_at outside the accepted window');
  if (!Number.isInteger(ev.sequence) || ev.sequence < 0) fail('invalid', 'sequence');
  if (!['progress', 'result'].includes(ev.type)) fail('invalid', 'type');
  const s = ev.scope || {};
  if (s.dsp_key !== run.scope.dsp_key || canonical(s.network_ids) !== canonical(run.scope.network_ids) || canonical(s.partner_ids) !== canonical(run.scope.partner_ids))
    fail('forbidden', 'Scope in the event does not match the launched scope');
  if (ev.type === 'progress' && !['running', 'waiting_for_input'].includes(ev.status)) fail('invalid', 'progress status');
  if (ev.type === 'result' && !['succeeded', 'partial', 'failed'].includes(ev.status)) fail('invalid', 'result status');
  return ev;
}

// ---------- Results pushed by n8n (no site-initiated run) ----------
export const PUSH_SCHEMA = 'pitt.push.v1';
const PARTNER_NAME_TO_KEY = { 'amazon dsp': 'amazon_dsp', beeswax: 'beeswax', 'google dv360': 'dv360', 'the trade desk': 'ttd', 'yahoo dsp': 'yahoo_dsp', 'microsoft ads (xandr)': 'xandr' };
export const partnerKeyOf = (v) => (dspByKey(String(v || '')) ? String(v) : PARTNER_NAME_TO_KEY[String(v || '').trim().toLowerCase()] ?? null);

export function validatePush(ev, { environment, now = Date.now(), skewSeconds = 300 } = {}) {
  if (!ev || typeof ev !== 'object') fail('invalid', 'Push must be an object');
  if (ev.schema_version !== PUSH_SCHEMA) fail('invalid', 'schema_version must be ' + PUSH_SCHEMA);
  if (typeof ev.event_id !== 'string' || !/^[A-Za-z0-9_.:-]{8,120}$/.test(ev.event_id)) fail('invalid', 'event_id');
  if (ev.environment !== environment) fail('forbidden', 'Environment mismatch');
  const sent = Date.parse(ev.sent_at);
  if (!Number.isFinite(sent) || Math.abs(now - sent) > skewSeconds * 1000) fail('stale', 'sent_at outside the accepted window');
  if (!['succeeded', 'partial', 'failed'].includes(ev.status)) fail('invalid', 'status');
  const s = ev.scope || {};
  const dsp = dspByKey(partnerKeyOf(s.dsp_key));
  if (!dsp) fail('invalid', 'Unknown DSP in scope');
  const nids = Array.isArray(s.network_ids) ? [...new Set(s.network_ids.map(Number))].sort((a, b) => a - b) : [];
  if (!nids.length || nids.length > 50 || !nids.every((n) => Number.isInteger(n) && n > 0)) fail('invalid', 'scope.network_ids');
  const seatIds = dsp.seats.map((x) => x.id);
  const pids = Array.isArray(s.partner_ids) && s.partner_ids.length ? [...new Set(s.partner_ids.map(Number))].sort((a, b) => a - b) : seatIds;
  if (!pids.every((p) => seatIds.includes(p))) fail('invalid', 'scope.partner_ids must be ' + dsp.name + ' seats');
  if (!ev.result || !Array.isArray(ev.result.cases)) fail('invalid', 'result.cases must be an array');
  return {
    ...ev,
    scope: { dsp_key: dsp.key, dsp_name: dsp.name, partner_ids: pids, network_ids: nids, timezone: 'UTC', window: 'workflow_defined', snapshot_id: null },
  };
}

// ---------- Structured result ----------
const CHECK = { PASS: 'pass', FAIL: 'fail', 'NO DATA': 'unknown', NO_DATA: 'unknown' };
const CASE_STATUS = ['READY_FOR_APPROVAL', 'INVESTIGATION_INVALID', 'DRAFTS_INVALID', 'EVIDENCE_NOT_FOUND'];
const txt = (v, max = 4000) => (v == null ? null : String(v).slice(0, max));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Currency status from the workflow's own basis label. Unknown stays unknown. */
export function currencyStatus(basis) {
  const b = String(basis || '');
  if (/currency not documented/i.test(b)) return { code: null, status: 'not_documented', label: 'currency not documented in source' };
  if (/\bEUR\b/.test(b)) return { code: 'EUR', status: 'source_documented', label: 'EUR as documented by the source column; not Finance-validated' };
  return { code: null, status: 'unknown', label: 'currency unknown' };
}

/** RPMBr block from Investigator v4.6 (business_context.rpmbr_7d_before). Missing = null, never 0. */
function rpmbrOf(r) {
  if (!r || typeof r !== 'object') return null;
  return {
    unit: txt(r.unit, 80),
    definition: txt(r.definition, 400),
    window: { first_day: txt(r.window_first_day, 10), last_day: txt(r.window_last_day, 10), days_with_data: num(r.days_with_data) },
    partner: num(r.partner?.value),
    network_all_partners: num(r.network_all_partners?.value),
    note: txt(r.note, 300),
  };
}

/**
 * Maps one item of the Investigator's "15 Final Report" output (v4.6) to a typed case. Fields the workflow does not
 * provide stay null; nothing is reconstructed from prose. The original item is kept as `raw` for audit.
 */
export function normalizeCase(item, scope) {
  if (!item || typeof item !== 'object') fail('invalid', 'Case must be an object');
  const nid = Number(item.network_id);
  if (!scope.network_ids.includes(nid)) fail('forbidden', 'Case network ' + item.network_id + ' is outside the launched scope');
  const status = CASE_STATUS.includes(item.status) ? item.status : 'UNRECOGNISED';
  const inv = item.investigation && typeof item.investigation === 'object' ? item.investigation : null;
  const sas = item.spend_at_stake || {};
  const checks = Object.entries(item.checks || {}).map(([k, v]) => ({
    name: k,
    result: CHECK[v] ?? 'unknown',
    rule: txt(item.quality_checks?.[k]?.rule_applied, 400),
    metrics: item.quality_checks?.[k]?.metrics ?? null,
  }));
  const basis = item.revenue_basis ?? sas.basis ?? null;
  return {
    case_id: txt(item.case_id, 120),
    status,
    network: { id: nid, name: txt(item.network_name, 200) },
    partner: { name: txt(item.partner, 120), seat_ids_checked: scope.partner_ids },
    disconnected_at: txt(item.disconnected_at, 40),
    disconnected_at_timezone: null, // the workflow does not state a zone
    data_origin: txt(item.data_origin, 40),
    priority: item.priority ? { code: txt(item.priority.code, 4), label: txt(item.priority.label, 20), provisional: item.priority.provisional !== false } : null,
    exposure: {
      label: 'Partner spend in the 7 days before the cut (not confirmed lost revenue)',
      weekly_before_cut: num(sas.weekly_run_rate_before_cut ?? item.revenue_7d_before),
      run_rate_not_realised_estimate: num(sas.run_rate_not_realised_since_cut_estimate),
      days_since_cut: num(sas.days_since_cut),
      basis: txt(basis, 200),
      // Investigator v4.6 (2026-10-21) emits business_context.revenue_currency / _status / _source; older outputs only a basis label.
      currency: item.business_context?.revenue_currency
        ? { code: txt(item.business_context.revenue_currency, 3), status: 'source_documented', label: txt(item.business_context.revenue_currency_status, 120), source: txt(item.business_context.revenue_currency_source, 400) }
        : currencyStatus(basis),
      rpmbr: rpmbrOf(item.business_context?.rpmbr_7d_before),
    },
    checks,
    evidence_confidence: item.evidence_confidence ? { label: txt(item.evidence_confidence.label, 20), basis: txt(item.evidence_confidence.basis, 400) } : null,
    root_cause_confidence: inv?.confidence?.level ?? null,
    confirmed_facts: Array.isArray(inv?.confirmed_facts) ? inv.confirmed_facts.slice(0, 20).map((f) => ({ fact: txt(f.fact ?? f, 600), refs: Array.isArray(f.evidence_refs) ? f.evidence_refs.slice(0, 10).map((r) => txt(r, 200)) : [] })) : [],
    hypotheses: Array.isArray(inv?.hypotheses)
      ? inv.hypotheses.slice(0, 5).map((h) => ({ id: txt(h.id, 10), title: txt(h.title, 300), likelihood: txt(h.likelihood, 10), how_to_verify: txt(h.how_to_verify, 600), confirmed: false }))
      : [],
    claim_review: Array.isArray(inv?.claim_review) ? inv.claim_review.slice(0, 10).map((c) => ({ verdict: txt(c.verdict, 20), statement: txt(c.statement, 600) })) : [],
    open_items: Array.isArray(item.open_items)
      ? item.open_items.slice(0, 20).map((l) => ({
          lever_id: txt(l.lever_id, 10),
          category: txt(l.category, 60),
          owner: txt(l.owner, 40),
          seat: txt(l.seat, 300),
          status: txt(l.status, 120),
          signal: txt(l.signal, 600),
          fix: txt(l.fix, 600),
          escalate: txt(l.escalate, 60),
          evidence_ref: txt(l.evidence_ref, 200),
          request_sent: typeof l.request_sent === 'boolean' ? l.request_sent : null,
          // Only a typed change from the workflow is kept; prose is never turned into a target.
          proposed_change:
            l.proposed_change && ['exclude_domain', 'exclude_bundle'].includes(l.proposed_change.action) && Array.isArray(l.proposed_change.targets)
              ? { action: l.proposed_change.action, targets: l.proposed_change.targets.slice(0, 50).map((t) => String(t).slice(0, 253)) }
              : null,
        }))
      : [],
    drafts: Array.isArray(item.communication_drafts)
      ? item.communication_drafts.slice(0, 6).map((d) => ({ audience: txt(d.audience, 40), kind: txt(d.kind, 40), message: txt(d.message, 2000), sent: false, requires_human_approval: true }))
      : [],
    investigation_approval: { status: txt(item.approval_status, 40), note: 'Investigation approval in n8n never authorises a Manage change.' },
    warnings: [...(Array.isArray(item.window_notes) ? item.window_notes : []), ...(Array.isArray(item.unsupported_numbers) && item.unsupported_numbers.length ? ['Numbers not found in the evidence: ' + item.unsupported_numbers.join(', ')] : [])].slice(0, 20).map((w) => txt(w, 400)),
    // Kept for audit; e-mail addresses (routing) are redacted before anything reaches a browser.
    raw: JSON.parse(JSON.stringify(item).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted e-mail]')),
  };
}

export function normalizeResult(ev, run) {
  const r = ev.result || {};
  const cases = Array.isArray(r.cases) ? r.cases.map((c) => normalizeCase(c, run.scope)) : [];
  return {
    schema_version: RESULT_SCHEMA,
    run_id: run.run_id,
    status: ev.status,
    workflow: { id: txt(ev.workflow_id, 40), execution_id: txt(ev.execution_id, 40), revision: txt(ev.workflow_revision, 80) },
    scope: run.scope,
    received_at: new Date().toISOString(),
    cases,
    error: ev.error ? txt(ev.error.message ?? ev.error, 500) : null,
  };
}

// ---------- Optimization state machine ----------
export const OPT_STATES = [
  'proposed', 'validation_failed', 'manual_required', 'awaiting_approval', 'rejected', 'approved', 'stale', 'queued', 'executing',
  'outcome_unknown', 'configuration_verified', 'verification_failed', 'partially_applied', 'rollback_requested', 'rolled_back',
];
const OPT_NEXT = {
  proposed: ['validation_failed', 'manual_required', 'awaiting_approval', 'stale'],
  awaiting_approval: ['rejected', 'approved', 'stale', 'manual_required'],
  approved: ['queued', 'stale'],
  queued: ['executing', 'stale'],
  executing: ['outcome_unknown', 'configuration_verified', 'verification_failed', 'partially_applied'],
  outcome_unknown: ['configuration_verified', 'verification_failed', 'partially_applied'],
  configuration_verified: ['rollback_requested'],
  partially_applied: ['rollback_requested'],
  verification_failed: ['rollback_requested'],
  rollback_requested: ['rolled_back'],
  stale: ['awaiting_approval', 'manual_required'],
  manual_required: ['awaiting_approval', 'stale'],
};
export function canTransitionOpt(from, to) {
  return (OPT_NEXT[from] || []).includes(to);
}

// ---------- Domain / bundle targets ----------
/** Typed, never expanded: a subdomain stays a subdomain, exact stays exact. Returns null when the value is not valid for the type. */
export function canonicalTarget(type, value) {
  const v = String(value ?? '').trim();
  if (type === 'domain') {
    const d = v.toLowerCase();
    if (/[/:?#*@\s]/.test(d) || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return null;
    return { type, original: v, canonical: d, matching: 'exact_host' };
  }
  if (type === 'bundle') {
    // Case is preserved: bundle semantics differ by store and are not verified.
    if (!/^[A-Za-z0-9._-]{2,200}$/.test(v)) return null;
    return { type, original: v, canonical: v, matching: 'exact_case_preserved' };
  }
  return null;
}

export { ISO_DAY };
