// Optimization recommendations: Recommendation -> Validate -> Preview -> Yes/No -> Authorise -> Execute -> Verify.
// Workflow suggestions become recommendations; only a typed change whose capability is verified can ever be executed.
// Contacting a partner, checking a setup or asking a publisher stays a task. Approving an investigation in n8n never
// authorises a change here: only a decision bound to an immutable preview does.
import { WRITE_CAPABILITIES, executable } from './capabilities.mjs';
import { ContractError, RUN_TERMINAL, canTransitionOpt, canonical, canonicalTarget, newId, sha256 } from './contracts.mjs';

/** The default Manage adapter: no verified API, so every read and write is unavailable. Tests inject a fake adapter. */
export const UNAVAILABLE_ADAPTER = {
  available: false,
  reason: 'No verified Manage API contract for domain / bundle exclusion (docs/manage-capability-matrix.md).',
};

// Changes that weaken a protection or undo a commercial decision are never automated in this first capability set.
const NEVER_AUTOMATED = ['quality_block', 'blocklist', 'ivt', 'ads_txt', 'network_wide_cut', 'partner_wide_event'];

export function createOptimizations({ cfg, store, adapter = UNAVAILABLE_ADAPTER, capabilities = WRITE_CAPABILITIES, now = () => Date.now(), schedule = (fn) => setImmediate(fn) }) {
  const iso = () => new Date(now()).toISOString();
  const writeCapability = (action) => capabilities.find((c) => c.action === action) || null;

  function setState(s, id, to, patch = {}) {
    return s.update('recommendations', id, (r) => {
      if (!canTransitionOpt(r.state, to)) throw new ContractError('stale', 'Recommendation is ' + r.state + '; cannot move to ' + to);
      return { ...r, ...patch, state: to, history: [...r.history, { at: iso(), state: to }] };
    });
  }

  /** Builds recommendations from a finished run. Idempotent: the same evidence never creates a second copy, and a rejected one is not re-proposed. */
  async function syncFromRun(run) {
    if (!run?.result || !RUN_TERMINAL.includes(run.state)) return [];
    const created = [];
    await store.tx((s) => {
      for (const c of run.result.cases) {
        for (const item of c.open_items) {
          const change = item.proposed_change && typeof item.proposed_change === 'object' ? item.proposed_change : null;
          const cap = change ? writeCapability(change.action) : null;
          const targets = change && Array.isArray(change.targets) ? change.targets.map((t) => canonicalTarget(change.action === 'exclude_bundle' ? 'bundle' : 'domain', t)) : [];
          const kind = change && cap && !NEVER_AUTOMATED.includes(item.category) ? 'change' : 'task';
          const evidenceHash = sha256(canonical({ run: run.run_id, case: c.case_id, item }));
          const contentKey = sha256(canonical({ case: c.case_id, network: c.network.id, kind, action: change?.action ?? null, targets: targets.map((t) => t?.canonical ?? null), item: item.lever_id, signal: item.signal }));
          if (s.all('recommendations', (r) => r.content_key === contentKey).length) continue;
          const invalid = kind === 'change' && (!targets.length || targets.some((t) => !t));
          const id = newId('opt');
          const rec = {
            recommendation_id: id,
            version: 1,
            content_key: contentKey,
            run_id: run.run_id,
            case_id: c.case_id,
            environment: run.environment,
            scope: { dsp_key: run.scope.dsp_key, network_id: c.network.id, network_name: c.network.name, partner_ids: run.scope.partner_ids, seat: item.seat },
            kind,
            action_type: kind === 'change' ? change.action : 'task',
            targets: kind === 'change' ? targets : [],
            owner: item.owner,
            approval_role: kind === 'change' ? 'approver' : null,
            category: item.category,
            rationale: { signal: item.signal, evidence_ref: item.evidence_ref, note: 'Evidence from the run result; a hypothesis alone is never a remediation.' },
            next_step: item.fix,
            escalate: item.escalate,
            evidence: { run_id: run.run_id, result_received_at: run.result.received_at, snapshot_id: run.scope.snapshot_id, evidence_hash: evidenceHash },
            impact: { traffic: null, spend: null, note: 'Affected traffic and spend are not measurable until the target resource can be read.' },
            reversibility: kind === 'change' ? 'unknown until the API documents a removal operation' : 'not applicable',
            state: kind === 'task' ? 'manual_required' : invalid ? 'validation_failed' : 'proposed',
            history: [{ at: iso(), state: 'created' }],
            created_at: iso(),
          };
          s.insert('recommendations', id, rec);
          created.push(rec);
        }
      }
    });
    if (created.length) store.audit({ kind: 'optimization', action: 'recommendations_created', run_id: run.run_id, count: created.length });
    return created;
  }

  const canView = (user, r) => r && user.has('viewer') && user.canSeePartner(r.scope.dsp_key) && user.canSeeNetwork(r.scope.network_id);

  function list(user) {
    return store.all('recommendations', (r) => canView(user, r)).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => withCapability(r));
  }

  function withCapability(r) {
    const cap = r.kind === 'change' ? writeCapability(r.action_type) : null;
    const ex = cap ? executable(cap, cfg) : { ok: false, reason: r.kind === 'task' ? 'task_not_executable' : 'unsupported_action' };
    return { ...r, capability: cap ? { status: cap.status, ask: cap.ask, executable: ex.ok, reason: ex.reason, adapter_available: !!adapter.available } : { executable: false, reason: ex.reason } };
  }

  function getVisible(user, id) {
    const r = store.get('recommendations', String(id));
    if (!canView(user, r)) throw new ContractError('not_found', 'Recommendation not found');
    return r;
  }

  /** Reads the current state and stores an immutable preview. Without a verified adapter the answer is manual_required. */
  async function preview(user, id) {
    if (!user.has('viewer')) throw new ContractError('forbidden', 'No view permission');
    const r = getVisible(user, id);
    if (r.kind !== 'change') throw new ContractError('unsupported', 'This recommendation is a task for ' + (r.owner || 'its owner') + ', not an executable change');
    if (!['proposed', 'stale', 'manual_required', 'awaiting_approval'].includes(r.state)) throw new ContractError('stale', 'Recommendation is ' + r.state);
    const cap = writeCapability(r.action_type);
    const ex = executable(cap, cfg);
    if (!adapter.available || !ex.ok) {
      await store.tx((s) => (r.state === 'manual_required' ? null : setState(s, r.recommendation_id, 'manual_required', { manual_reason: adapter.available ? ex.reason : 'integration_unavailable' })));
      return { status: 'manual_required', reason: adapter.available ? ex.reason : 'integration_unavailable', ask: cap?.ask ?? null };
    }
    let before;
    try {
      before = await adapter.read({ action: r.action_type, scope: r.scope, environment: r.environment });
    } catch (e) {
      throw new ContractError('upstream_unavailable', 'Could not read the current state');
    }
    if (!before || before.native_scope !== cap.nativeScope || before.network_id !== r.scope.network_id) {
      // The resource is broader (or different) than the approved scope: stop, never widen the write.
      await store.tx((s) => setState(s, r.recommendation_id, 'manual_required', { manual_reason: 'resource_scope_mismatch' }));
      return { status: 'manual_required', reason: 'resource_scope_mismatch' };
    }
    const existing = new Set(before.entries.map((e) => e.canonical));
    const add = r.targets.filter((t) => !existing.has(t.canonical));
    const payload = { action: r.action_type, resource_id: before.resource_id, native_scope: before.native_scope, environment: r.environment, add: add.map((t) => ({ type: t.type, value: t.canonical, matching: t.matching })), remove: [] };
    const p = {
      preview_id: newId('prv'),
      recommendation_id: r.recommendation_id,
      recommendation_version: r.version,
      evidence_hash: r.evidence.evidence_hash,
      payload,
      payload_hash: sha256(canonical(payload)),
      before_state: { version: before.version, entries: before.entries, consumers: before.consumers ?? null },
      already_present: r.targets.filter((t) => existing.has(t.canonical)).map((t) => t.canonical),
      created_by: user.id,
      created_at: iso(),
      expires_at: new Date(now() + cfg.approvalTtlMinutes * 60_000).toISOString(),
    };
    await store.tx((s) => {
      s.insert('previews', p.preview_id, p);
      if (r.state !== 'awaiting_approval') setState(s, r.recommendation_id, 'awaiting_approval', { preview_id: p.preview_id });
      else s.update('recommendations', r.recommendation_id, (x) => ({ ...x, preview_id: p.preview_id }));
    });
    store.audit({ kind: 'optimization', action: 'preview_created', recommendation_id: r.recommendation_id, preview_id: p.preview_id, payload_hash: p.payload_hash, actor: user.id });
    return { status: 'awaiting_approval', preview: p };
  }

  /** Records Yes / No against one preview version. No never calls anything external. */
  async function decide(user, id, body) {
    const r = getVisible(user, id);
    const decision = body?.decision;
    if (!['yes', 'no'].includes(decision)) throw new ContractError('invalid', 'decision must be "yes" or "no"');
    if (typeof body.preview_id !== 'string') throw new ContractError('invalid', 'preview_id is required');
    if (typeof body.payload_hash !== 'string') throw new ContractError('invalid', 'payload_hash is required (the exact preview the approver saw)');
    if (!user.has('approver')) throw new ContractError('forbidden', 'You do not have the approval permission');

    const out = await store.tx((s) => {
      const cur = s.get('recommendations', r.recommendation_id);
      const p = s.get('previews', body.preview_id);
      if (!p || p.recommendation_id !== cur.recommendation_id) throw new ContractError('not_found', 'Preview not found');
      if (s.get('decisions', p.preview_id)) throw new ContractError('duplicate', 'A decision was already recorded for this preview');
      if (cur.state !== 'awaiting_approval' || cur.preview_id !== p.preview_id) throw new ContractError('stale', 'This preview is no longer the current one');
      if (p.payload_hash !== body.payload_hash || sha256(canonical(p.payload)) !== p.payload_hash) throw new ContractError('stale', 'The change differs from the reviewed preview');
      const d = { preview_id: p.preview_id, recommendation_id: cur.recommendation_id, decision, reason: body.reason ? String(body.reason).slice(0, 500) : null, actor: user.id, at: iso(), payload_hash: p.payload_hash, environment: cfg.environment };
      if (decision === 'no') {
        s.insert('decisions', p.preview_id, d);
        setState(s, cur.recommendation_id, 'rejected', { decision: d });
        return { decision: d, queued: false };
      }
      if (Date.parse(p.expires_at) < now()) throw new ContractError('stale', 'Approval window expired; create a new preview');
      if (cur.version !== p.recommendation_version || cur.evidence.evidence_hash !== p.evidence_hash) throw new ContractError('stale', 'Evidence changed since the preview');
      if (cur.environment !== cfg.environment) throw new ContractError('forbidden', 'Environment mismatch');
      const ex = executable(writeCapability(cur.action_type), cfg);
      if (!ex.ok || !adapter.available) throw new ContractError('upstream_unavailable', 'Execution is disabled: ' + (adapter.available ? ex.reason : 'integration_unavailable'));
      s.insert('decisions', p.preview_id, d);
      setState(s, cur.recommendation_id, 'approved', { decision: d });
      const intent = { execution_id: newId('exe'), recommendation_id: cur.recommendation_id, preview_id: p.preview_id, payload: p.payload, payload_hash: p.payload_hash, before_version: p.before_state.version, approved_by: user.id, idempotency_key: sha256('exe|' + p.preview_id), state: 'queued', created_at: iso(), targets: {}, attempts: [] };
      s.insert('executions', intent.execution_id, intent);
      setState(s, cur.recommendation_id, 'queued', { execution_id: intent.execution_id });
      return { decision: d, queued: true, execution_id: intent.execution_id };
    });
    store.audit({ kind: 'optimization', action: 'decision', recommendation_id: r.recommendation_id, decision, actor: user.id, preview_id: body.preview_id, payload_hash: body.payload_hash });
    if (out.queued) schedule(() => execute(out.execution_id).catch(() => {}));
    return out;
  }

  /** Separate worker step. Re-reads state, applies only the approved delta, never retries blindly after a possible write. */
  async function execute(executionId) {
    const intent = store.get('executions', executionId);
    if (!intent || intent.state !== 'queued') return intent;
    const rec = store.get('recommendations', intent.recommendation_id);
    const cap = writeCapability(rec.action_type);
    if (!executable(cap, cfg).ok || !adapter.available) {
      await store.tx((s) => s.update('executions', executionId, (x) => ({ ...x, state: 'blocked', blocked_reason: 'writes disabled at execution time (kill switch or capability)' })));
      return store.get('executions', executionId);
    }
    const current = await adapter.read({ action: rec.action_type, scope: rec.scope, environment: rec.environment });
    if (!current || current.version !== intent.before_version) {
      await store.tx((s) => {
        s.update('executions', executionId, (x) => ({ ...x, state: 'stale', blocked_reason: 'resource changed since the preview' }));
        setState(s, rec.recommendation_id, 'stale');
      });
      store.audit({ kind: 'optimization', action: 'execution_stale', execution_id: executionId });
      return store.get('executions', executionId);
    }
    await store.tx((s) => {
      s.update('executions', executionId, (x) => ({ ...x, state: 'executing', started_at: iso() }));
      setState(s, rec.recommendation_id, 'executing');
    });
    let outcome;
    try {
      const res = await adapter.applyDelta({ resource_id: intent.payload.resource_id, add: intent.payload.add, remove: intent.payload.remove, if_version: intent.before_version, idempotency_key: intent.idempotency_key });
      outcome = { accepted: true, response: { status: res?.status ?? null, version: res?.version ?? null } };
    } catch (e) {
      outcome = { accepted: false, unknown: e?.code === 'timeout' || e?.name === 'TimeoutError', error: String(e?.message || e).slice(0, 200) };
    }
    // Verify by reading back, per target. API acceptance alone is not proof.
    let after = null;
    try {
      after = await adapter.read({ action: rec.action_type, scope: rec.scope, environment: rec.environment });
    } catch {
      after = null;
    }
    const present = new Set((after?.entries || []).map((e) => e.canonical));
    const targets = Object.fromEntries(intent.payload.add.map((t) => [t.value, after ? (present.has(t.value) ? 'configuration_verified' : 'not_present') : 'unknown']));
    const vals = Object.values(targets);
    let state;
    if (!after) state = 'outcome_unknown';
    else if (vals.every((v) => v === 'configuration_verified')) state = 'configuration_verified';
    else if (vals.some((v) => v === 'configuration_verified')) state = 'partially_applied';
    else state = outcome.unknown ? 'outcome_unknown' : 'verification_failed';
    await store.tx((s) => {
      s.update('executions', executionId, (x) => ({ ...x, state, targets, finished_at: iso(), attempts: [...x.attempts, { at: iso(), ...outcome }], after_version: after?.version ?? null }));
      setState(s, rec.recommendation_id, state);
    });
    store.audit({ kind: 'optimization', action: 'execution_finished', execution_id: executionId, recommendation_id: rec.recommendation_id, state, targets, api: outcome.accepted ? 'accepted' : outcome.unknown ? 'unknown' : 'refused' });
    return store.get('executions', executionId);
  }

  function execution(user, id) {
    const r = getVisible(user, id);
    return r.execution_id ? store.get('executions', r.execution_id) : null;
  }

  /** Rollback = a new reviewed change removing only this execution's verified additions still present now. */
  async function rollbackPreview(user, id) {
    const r = getVisible(user, id);
    const exe = r.execution_id ? store.get('executions', r.execution_id) : null;
    if (!exe || !['configuration_verified', 'partially_applied'].includes(exe.state)) throw new ContractError('stale', 'Nothing verified to roll back');
    if (!adapter.available) throw new ContractError('upstream_unavailable', 'Integration unavailable');
    const now0 = await adapter.read({ action: r.action_type, scope: r.scope, environment: r.environment });
    const still = new Set(now0.entries.map((e) => e.canonical));
    const remove = Object.entries(exe.targets).filter(([v, st]) => st === 'configuration_verified' && still.has(v)).map(([v]) => ({ type: r.targets.find((t) => t.canonical === v)?.type, value: v }));
    const payload = { action: r.action_type, resource_id: now0.resource_id, native_scope: now0.native_scope, environment: r.environment, add: [], remove };
    const p = { preview_id: newId('prv'), recommendation_id: r.recommendation_id, kind: 'rollback', payload, payload_hash: sha256(canonical(payload)), before_state: { version: now0.version, entries: now0.entries }, created_by: user.id, created_at: iso(), expires_at: new Date(now() + cfg.approvalTtlMinutes * 60_000).toISOString(), note: 'Needs its own approval. Entries added by others since the change are left untouched.' };
    await store.tx((s) => s.insert('previews', p.preview_id, p));
    return p;
  }

  /** A newly promoted snapshot for the same network makes pending approvals stale: approve again on fresh evidence. */
  async function onSnapshot(snapshot) {
    await store.tx((s) => {
      for (const r of s.all('recommendations', (x) => x.scope.dsp_key === snapshot.scope.dsp_key && snapshot.scope.network_ids.includes(x.scope.network_id) && ['awaiting_approval', 'approved'].includes(x.state)))
        setState(s, r.recommendation_id, 'stale', { stale_reason: 'new data snapshot ' + snapshot.snapshot_id, version: r.version + 1 });
    });
  }

  return { syncFromRun, list, preview, decide, execute, execution, rollbackPreview, onSnapshot, capabilities: () => capabilities };
}
