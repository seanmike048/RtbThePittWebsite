// Investigation launch and result ingestion.
// Flow: validate + authorise -> persist the run (idempotent) -> acknowledge with run ID -> dispatch to the approved n8n webhook
// -> n8n calls back with authenticated, run-bound events -> monotonic state, validated result.
// There is no cancel: stopping an n8n execution from here is not a verified capability, so the UI offers "Stop tracking" only.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { hostAllowed, missing } from './config.mjs';
import {
  ContractError, RUN_TERMINAL, buildLaunchPayload, canTransitionRun, canonical, newId, normalizeResult, sha256, validateEvent, validateLaunchInput,
} from './contracts.mjs';

const same = (a, b) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
};
const WEEK = 7 * 86_400_000;

/** Public view of a run: never includes the callback token hash or raw dispatch errors. */
export function publicRun(r) {
  if (!r) return null;
  const { callback_token_hash, idem_hash, ...rest } = r;
  return rest;
}

export function createInvestigations({ cfg, store, fetchImpl = fetch, now = () => Date.now(), schedule = (fn) => setImmediate(fn) }) {
  function audit(e) {
    store.audit({ kind: 'investigation', environment: cfg.environment, ...e });
  }

  async function launch(user, body) {
    if (!user.has('launcher')) throw new ContractError('forbidden', 'You do not have the launch permission');
    const gaps = missing(cfg, 'launch');
    if (gaps.length) throw new ContractError('upstream_unavailable', 'Investigation launch is not configured on this server', { missing: gaps });
    const scope = validateLaunchInput(body, user);
    const idem = sha256(user.id + '|' + scope.idempotency_key);
    const scopeKey = sha256({ dsp: scope.dsp_key, p: scope.partner_ids, n: scope.network_ids });

    const result = await store.tx((s) => {
      const existing = s.all('runs', (r) => r.idem_hash === idem)[0];
      if (existing) return { run: existing, duplicate: true };
      const inFlight = s.all('runs', (r) => r.scope_key === scopeKey && !RUN_TERMINAL.includes(r.state))[0];
      if (inFlight) return { run: inFlight, duplicate: true };
      const active = s.all('runs', (r) => !RUN_TERMINAL.includes(r.state)).length;
      if (active >= cfg.n8n.maxConcurrentRuns) throw new ContractError('rate_limited', 'Another investigation is running; the configured concurrency is ' + cfg.n8n.maxConcurrentRuns);
      const used = s.all('runs', (r) => Date.parse(r.created_at) > now() - WEEK && r.dispatch_attempted).length;
      if (used >= cfg.n8n.weeklyLaunchBudget) throw new ContractError('rate_limited', 'The weekly launch budget (' + cfg.n8n.weeklyLaunchBudget + ' n8n executions) is used up');
      const token = randomBytes(24).toString('base64url');
      const run = {
        run_id: newId('run'),
        request_id: newId('req'),
        environment: cfg.environment,
        workflow_id: cfg.n8n.workflowId,
        created_at: new Date(now()).toISOString(),
        created_by: user.id,
        scope: { dsp_key: scope.dsp_key, dsp_name: scope.dsp_name, partner_ids: scope.partner_ids, network_ids: scope.network_ids, timezone: scope.timezone, window: scope.window, snapshot_id: scope.snapshot_id },
        scope_key: scopeKey,
        idem_hash: idem,
        callback_token_hash: sha256(token),
        state: 'queued',
        stage: null,
        last_sequence: -1,
        dispatch_attempted: false,
        dispatch_outcome: null,
        history: [{ at: new Date(now()).toISOString(), state: 'queued', source: 'server' }],
        result: null,
        rejected_events: 0,
      };
      s.insert('runs', run.run_id, run);
      return { run, duplicate: false, token };
    });

    if (!result.duplicate) {
      audit({ action: 'launch_accepted', run_id: result.run.run_id, actor: user.id, scope: result.run.scope });
      schedule(() => dispatch(result.run.run_id, result.token, user).catch(() => {}));
    }
    return { run: publicRun(result.run), duplicate: result.duplicate };
  }

  function transition(s, runId, to, patch = {}, source = 'server') {
    return s.update('runs', runId, (r) => {
      if (r.state !== to && !canTransitionRun(r.state, to)) throw new ContractError('stale', 'Run is ' + r.state + '; cannot move to ' + to);
      return { ...r, ...patch, state: to, history: [...r.history, { at: new Date(now()).toISOString(), state: to, source }] };
    });
  }

  async function dispatch(runId, token, user) {
    const run = await store.tx((s) => transition(s, runId, 'dispatching', { dispatch_attempted: true }));
    if (!hostAllowed(cfg, cfg.n8n.launchUrl)) {
      await store.tx((s) => transition(s, runId, 'dispatch_failed', { dispatch_outcome: 'destination_not_allowed' }));
      return;
    }
    const payload = buildLaunchPayload({ run, scope: run.scope, environment: cfg.environment, user, callbackToken: token });
    let outcome;
    try {
      const res = await fetchImpl(cfg.n8n.launchUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [cfg.n8n.launchHeaderName]: cfg.n8n.launchHeaderValue, 'x-pitt-request-id': run.request_id },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(cfg.n8n.dispatchTimeoutMs),
      });
      outcome = res.ok ? 'accepted' : 'rejected_' + res.status;
    } catch (e) {
      // A timeout after sending means n8n may have started: never resend blindly.
      outcome = e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'unknown_timeout' : 'connection_failed';
    }
    await store.tx((s) => {
      const cur = s.get('runs', runId);
      if (RUN_TERMINAL.includes(cur.state) || cur.state === 'running') return s.update('runs', runId, (r) => ({ ...r, dispatch_outcome: outcome }));
      if (outcome === 'accepted') return transition(s, runId, 'running', { dispatch_outcome: outcome, stage: 'accepted_by_n8n' });
      if (outcome === 'unknown_timeout') return s.update('runs', runId, (r) => ({ ...r, dispatch_outcome: outcome }));
      return transition(s, runId, 'dispatch_failed', { dispatch_outcome: outcome });
    });
    audit({ action: 'dispatch', run_id: runId, outcome });
  }

  /** Service-only receiver for n8n callbacks. Auth = service key header + per-run token; replay = unique event_id + sequence + clock window. */
  async function receiveEvent(headers, body) {
    if (!cfg.n8n.callbackHeaderValue || !same(headers[cfg.n8n.callbackHeaderName.toLowerCase()], cfg.n8n.callbackHeaderValue))
      throw new ContractError('unauthorized', 'Invalid service credential');
    const runId = body && typeof body.run_id === 'string' ? body.run_id : null;
    return store.tx((s) => {
      const run = runId ? s.get('runs', runId) : null;
      if (!run || !same(sha256(String(headers['x-pitt-run-token'] || '')), run.callback_token_hash)) {
        if (run) s.update('runs', run.run_id, (r) => ({ ...r, rejected_events: r.rejected_events + 1 }));
        throw new ContractError('unauthorized', 'Invalid run token');
      }
      const ev = validateEvent(body, run, { now: now(), skewSeconds: cfg.n8n.callbackSkewSeconds });
      const key = run.run_id + ':' + ev.event_id;
      if (s.get('events', key)) throw new ContractError('duplicate', 'Event already received');
      s.insert('events', key, { run_id: run.run_id, event_id: ev.event_id, sequence: ev.sequence, type: ev.type, status: ev.status, received_at: new Date(now()).toISOString() });
      if (RUN_TERMINAL.includes(run.state)) {
        audit({ action: 'event_after_terminal_ignored', run_id: run.run_id, event_id: ev.event_id });
        return { run: publicRun(run), applied: false, reason: 'run_already_terminal' };
      }
      if (ev.sequence <= run.last_sequence) return { run: publicRun(run), applied: false, reason: 'out_of_order' };
      if (ev.type === 'progress') {
        const r = transition(s, run.run_id, ev.status, { last_sequence: ev.sequence, stage: ev.stage ? String(ev.stage).slice(0, 80) : run.stage, execution_id: ev.execution_id ?? run.execution_id ?? null }, 'n8n');
        return { run: publicRun(r), applied: true };
      }
      const result = normalizeResult(ev, run);
      if (canonical(result).length > cfg.n8n.maxResultBytes) throw new ContractError('invalid', 'Result exceeds the configured size limit');
      const status = ev.status === 'succeeded' && result.cases.some((c) => c.status !== 'READY_FOR_APPROVAL') ? 'partial' : ev.status;
      const r = transition(s, run.run_id, status, { last_sequence: ev.sequence, result, execution_id: ev.execution_id ?? null, stage: 'result_received' }, 'n8n');
      audit({ action: 'result_received', run_id: run.run_id, status, execution_id: ev.execution_id ?? null, cases: result.cases.length });
      return { run: publicRun(r), applied: true };
    });
  }

  function canView(user, run) {
    return run && (run.created_by === user.id || run.scope.network_ids.every((n) => user.canSeeNetwork(n))) && user.canSeePartner(run.scope.dsp_key);
  }

  function get(user, runId) {
    if (!user.has('viewer')) throw new ContractError('forbidden', 'No view permission');
    const run = store.get('runs', String(runId));
    if (!canView(user, run)) throw new ContractError('not_found', 'Run not found'); // same answer for other tenants' IDs
    return publicRun(run);
  }

  function list(user) {
    if (!user.has('viewer')) throw new ContractError('forbidden', 'No view permission');
    return store
      .all('runs', (r) => canView(user, r))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50)
      .map((r) => ({ ...publicRun(r), result: r.result ? { status: r.result.status, cases: r.result.cases.length } : null }));
  }

  async function sweep() {
    const cutoff = now() - cfg.n8n.runTimeoutMinutes * 60_000;
    await store.tx((s) => {
      for (const r of s.all('runs', (x) => !RUN_TERMINAL.includes(x.state) && Date.parse(x.created_at) < cutoff)) transition(s, r.run_id, 'timed_out', { stage: 'no_result_before_timeout' });
    });
  }

  return { launch, receiveEvent, get, list, sweep, dispatch };
}
