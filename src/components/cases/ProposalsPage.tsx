import React, { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { showUsd } from '../../lib/cases/fx.ts';
import { DRY_RUN, NEXT_STATES, noProposalReason, proposalsFor, type AuditEntry, type Proposal, type ProposalState } from '../../lib/cases/proposals.ts';
import type { CaseRecord } from '../../lib/cases/types.ts';
import { Button, cx } from '../ui.tsx';
import { PageHeader, RequirePublisher, Section } from './bits.tsx';

export const ProposalsPage: React.FC<{ serverQueue?: React.ReactNode }> = ({ serverQueue }) => (
  <RequirePublisher title="Optimization">
    {(c) => (
      <>
        <Proposals key={c.caseId} c={c} />
        {serverQueue && (
          <Section title="n8n run queue (server)" note="Recommendations pushed by n8n runs to the hosted backend, with their own approval flow.">
            {serverQueue}
          </Section>
        )}
      </>
    )}
  </RequirePublisher>
);

const STATE_KEY = 'pitt-opt-state';
const AUDIT_KEY = 'pitt-opt-audit';
const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const store = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* this visit only */
  }
};

const Proposals: React.FC<{ c: CaseRecord }> = ({ c }) => {
  const base = useMemo(() => proposalsFor(c), [c]);
  const [states, setStates] = useState<Record<string, ProposalState>>(() => load(STATE_KEY, {}));
  const [audit, setAudit] = useState<AuditEntry[]>(() => load(AUDIT_KEY, []));
  useEffect(() => store(STATE_KEY, states), [states]);
  useEffect(() => store(AUDIT_KEY, audit), [audit]);
  const log = (e: Omit<AuditEntry, 'at'>) => setAudit((a) => [{ ...e, at: new Date().toISOString() }, ...a].slice(0, 200));
  const none = noProposalReason(c);

  return (
    <div className="space-y-6">
      <PageHeader title="Optimization" c={c} lead="Proposed changes for this publisher. Preview and approval only: nothing is executed, no ticket is created and no message is sent." />
      <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span>
          <strong className="font-medium text-ink">{DRY_RUN.label}.</strong> {DRY_RUN.reason}
        </span>
      </p>
      {!base.length && <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-2">{none}</p>}
      {base.map((p) => (
        <ProposalCard
          key={p.id}
          p={{ ...p, state: states[p.id] ?? p.state }}
          audit={audit.filter((a) => a.proposalId === p.id)}
          onState={(s) => setStates((m) => ({ ...m, [p.id]: s }))}
          log={log}
        />
      ))}
      {base.length > 0 && none && <p className="text-sm text-muted">{none}</p>}
    </div>
  );
};

const ProposalCard: React.FC<{ p: Proposal; audit: AuditEntry[]; onState: (s: ProposalState) => void; log: (e: Omit<AuditEntry, 'at'>) => void }> = ({ p, audit, onState, log }) => {
  const [preview, setPreview] = useState<ReturnType<typeof DRY_RUN.dryRun> | null>(null);
  const [approver, setApprover] = useState('');
  const [scopeOk, setScopeOk] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const can = (s: ProposalState) => NEXT_STATES[p.state].includes(s);

  const rows: [string, React.ReactNode][] = [
    ['Current state', p.currentState],
    ['Proposed change', p.proposedChange],
    ['Evidence', <ul className="space-y-1">{p.evidence.map((e) => <li key={e}>{e}</li>)}</ul>],
    ['Spend at stake', <><span className="num font-medium text-ink">{showUsd(p.atStake)}</span> per week before the cut (observed on the affected seats; not a projection)</>],
    ['Expected impact', 'From Spend Projection only, when a scenario exists. Not estimated here.'],
    ['Assumptions', <ul className="list-disc space-y-0.5 pl-4">{p.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>],
    ['Scope and window', `${p.scope} · ${p.window}`],
    ['Risk', p.risk],
    ['Reversibility', p.reversibility],
    ['Required approval', p.requiredApproval],
    ['Precondition', p.gate ?? 'None stated'],
  ];

  return (
    <section className="rounded-lg border border-line bg-surface" aria-labelledby={p.id + '-t'}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 id={p.id + '-t'} className="text-base font-semibold text-ink">
            {p.title}
          </h2>
          <p className="text-xs text-muted">
            {p.publisher} · #{p.networkId} · {p.dsp} · endpoints {p.endpoints.join(', ')}
          </p>
        </div>
        <span className={cx('rounded-md border px-2 py-0.5 text-xs font-medium', p.state === 'Approved' ? 'border-ok/30 bg-ok-soft text-ok-ink' : 'border-line bg-surface-2 text-ink-2')}>{p.state}</span>
      </div>
      <dl className="divide-y divide-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
        <div className="grid gap-1 px-4 py-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt className="text-xs text-muted">Execution</dt>
          <dd className="text-ink-2">Unavailable · no write integration</dd>
        </div>
      </dl>

      <div className="space-y-3 border-t border-line px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              const d = DRY_RUN.dryRun(p);
              setPreview(d);
              log({ proposalId: p.id, event: 'Previewed', by: null, scope: p.scope, payload: d, result: 'Preview built; nothing sent', rollback: null });
            }}
          >
            Preview change
          </Button>
          {can('Needs review') && (
            <Button size="sm" onClick={() => (onState('Needs review'), log({ proposalId: p.id, event: 'Marked for review', by: null, scope: p.scope, payload: null, result: 'State: Needs review', rollback: null }))}>
              Mark for review
            </Button>
          )}
          {p.state === 'Approved' && (
            <Button size="sm" variant="ghost" onClick={() => (onState('Needs review'), log({ proposalId: p.id, event: 'Approval withdrawn', by: null, scope: p.scope, payload: null, result: 'State: Needs review', rollback: null }))}>
              Withdraw approval
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              DRY_RUN.execute(p, approver ? { approver, scope: p.scope } : null).catch((e: Error) => {
                setRefusal(e.message);
                log({ proposalId: p.id, event: 'Execution refused', by: approver || null, scope: p.scope, payload: DRY_RUN.dryRun(p), result: e.message, rollback: null });
              })
            }
          >
            Execute
          </Button>
        </div>
        {refusal && <p className="text-xs text-danger-ink" role="alert">{refusal}</p>}

        {can('Approved') && (
          <form
            className="flex flex-wrap items-end gap-2 rounded-md bg-surface-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!approver.trim() || !scopeOk) return;
              onState('Approved');
              log({ proposalId: p.id, event: 'Approved', by: approver.trim(), scope: p.scope, payload: DRY_RUN.dryRun(p), result: 'Approval recorded in this browser; not executed', rollback: p.reversibility });
            }}
          >
            <label className="text-xs text-muted">
              Approver
              <input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Name" className="mt-1 block h-8 rounded-md border border-line bg-surface px-2 text-sm text-ink focus:border-accent focus:outline-none" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              <input type="checkbox" checked={scopeOk} onChange={(e) => setScopeOk(e.target.checked)} className="accent-[var(--accent)]" /> I approve exactly this scope: {p.scope}
            </label>
            <Button size="sm" variant="primary" type="submit" disabled={!approver.trim() || !scopeOk}>
              Record approval
            </Button>
          </form>
        )}

        {preview && (
          <div>
            <p className="text-xs text-muted">Dry-run payload (never sent)</p>
            <pre className="mt-1 overflow-x-auto rounded-md bg-code-bg p-3 text-xs text-code-ink">{JSON.stringify(preview, null, 2)}</pre>
          </div>
        )}

        {audit.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-ink-2">Audit history ({audit.length})</summary>
            <ol className="mt-2 space-y-1 text-xs text-muted">
              {audit.map((a, i) => (
                <li key={i}>
                  <span className="num">{a.at.replace('T', ' ').slice(0, 19)}</span> · {a.event}
                  {a.by && ` by ${a.by}`} · {a.scope} · {a.result}
                  {a.rollback && ` · rollback: ${a.rollback}`}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </section>
  );
};
