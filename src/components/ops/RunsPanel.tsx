import React, { useState } from 'react';
import { ChevronDown, EyeOff } from 'lucide-react';
import { Badge, Button, Card, EmptyNote, Eyebrow, SectionHeading, cx } from '../ui.tsx';
import { RUN_LABEL, dispatchHint, fmtMoney, isTerminal } from '../../lib/ops/runs.ts';
import type { CaseResult, Run } from '../../lib/ops/types.ts';
import type { Ops } from './useOps.ts';

const CHECK_TONE = { pass: 'ok', fail: 'danger', unknown: 'neutral' } as const;
const CHECK_TEXT = { pass: 'PASS', fail: 'FAIL', unknown: 'UNKNOWN (no data)' } as const;

/** Launched runs from this site: live status from the server, then the typed result. Older results stay visible during new runs. */
export const RunsPanel: React.FC<{ ops: Ops }> = ({ ops }) => {
  if (ops.backend !== 'ok' || !ops.session?.user) return null;
  return (
    <Card className="p-5 sm:p-6">
      <SectionHeading eyebrow="Launched from this site" title="Investigation runs" description="Status comes from the server and the n8n callback; stages are only those n8n reported." />
      <div className="mt-4 space-y-3">
        {ops.runs.length === 0 && <EmptyNote>No run yet. Choose a scope above and press Launch investigation.</EmptyNote>}
        {ops.runs.map((r) => (
          <RunRow key={r.run_id} run={r} onStop={() => ops.stopTracking(r.run_id)} />
        ))}
      </div>
    </Card>
  );
};

const RunRow: React.FC<{ run: Run; onStop: () => void }> = ({ run, onStop }) => {
  const [open, setOpen] = useState(isTerminal(run.state));
  const l = RUN_LABEL[run.state];
  return (
    <div className="rounded-xl border border-line">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <Badge tone={l.tone} dot>
          {l.label}
        </Badge>
        <span className="text-sm text-ink">
          {run.scope.dsp_name} · seats <span className="num">{run.scope.partner_ids.join(', ')}</span> · networks <span className="num">{run.scope.network_ids.join(', ')}</span>
        </span>
        <span className="num text-xs text-muted">
          {run.run_id} · {run.created_at.replace('T', ' ').slice(0, 16)} UTC{run.execution_id ? ' · n8n execution ' + run.execution_id : ''}
          {run.stage ? ' · ' + run.stage : ''}
        </span>
        {run.dispatch_outcome === 'unknown_timeout' && <Badge tone="warn">n8n did not confirm receipt; waiting for its callback, not resending</Badge>}
        {run.state === 'dispatch_failed' && dispatchHint(run.dispatch_outcome) && <p className="basis-full text-xs text-danger-ink">{dispatchHint(run.dispatch_outcome)}</p>}
        <div className="ml-auto flex gap-1">
          {!isTerminal(run.state) && (
            <Button size="sm" variant="ghost" onClick={onStop} title="Stops following this run in this browser. It does not stop the n8n execution.">
              <EyeOff className="h-3.5 w-3.5" /> Stop tracking
            </Button>
          )}
          {run.result && (
            <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
              <ChevronDown className={cx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} /> {open ? 'Hide' : 'Show'} result
            </Button>
          )}
        </div>
      </div>
      {open && run.result && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          {run.result.error && <p className="text-sm text-danger-ink">Workflow error: {run.result.error}</p>}
          {run.result.cases.length === 0 && <EmptyNote>The workflow returned no case.</EmptyNote>}
          {run.result.cases.map((c) => (
            <CaseView key={c.case_id ?? c.network.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
};

/** One typed case. Every text is rendered as text (React escapes it); nothing from the workflow is executed or rendered as HTML. */
export const CaseView: React.FC<{ c: CaseResult }> = ({ c }) => {
  const [raw, setRaw] = useState(false);
  const cur = c.exposure.currency;
  const teams = [...new Set(c.open_items.map((o) => o.owner ?? 'Unassigned'))];
  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-ink">
          {c.network.name ?? 'Network'} · #{c.network.id} · {c.partner.name}
        </h3>
        {c.priority && <Badge tone="accent">Priority {c.priority.code} {c.priority.label}{c.priority.provisional ? ' (provisional)' : ''}</Badge>}
        <Badge tone={c.status === 'READY_FOR_APPROVAL' ? 'ok' : 'warn'}>{c.status.replace(/_/g, ' ').toLowerCase()}</Badge>
        <span className="text-xs text-muted">Disconnected {c.disconnected_at ?? 'n/a'} (time zone not stated by the source)</span>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-surface-2 p-3">
          <Eyebrow>Observed exposure</Eyebrow>
          <p className="num mt-1 text-xl font-semibold text-ink">{fmtMoney(c.exposure.weekly_before_cut, cur.code)}</p>
          <p className="mt-1 text-xs text-muted">{c.exposure.label}. {cur.label ?? 'Currency unknown'}.</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <Eyebrow>RPMBr, 7 days before the cut</Eyebrow>
          <p className="num mt-1 text-xl font-semibold text-ink">{c.exposure.rpmbr?.partner != null ? (cur.code === 'EUR' ? '€' : '') + c.exposure.rpmbr.partner.toFixed(2) : 'n/a'}</p>
          <p className="mt-1 text-xs text-muted">
            {c.exposure.rpmbr ? (c.exposure.rpmbr.unit ?? '') + '. Network, all partners: ' + (c.exposure.rpmbr.network_all_partners ?? 'n/a') + '.' : 'Not in this workflow output.'}
          </p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <Eyebrow>Confidence</Eyebrow>
          <p className="mt-1 text-sm text-ink">Evidence: {c.evidence_confidence?.label ?? 'n/a'}</p>
          <p className="text-sm text-ink">Root cause: {c.root_cause_confidence ?? 'n/a'}</p>
        </div>
      </div>

      <div>
        <Eyebrow>Quality checks</Eyebrow>
        <ul className="mt-2 flex flex-wrap gap-2">
          {c.checks.map((k) => (
            <li key={k.name}>
              <details className="rounded-lg border border-line px-2 py-1 text-xs">
                <summary className="cursor-pointer">
                  {k.name} <Badge tone={CHECK_TONE[k.result]}>{CHECK_TEXT[k.result]}</Badge>
                </summary>
                <p className="mt-1 max-w-md text-muted">{k.rule}</p>
                {k.metrics && <pre className="num mt-1 max-w-md overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-2">{JSON.stringify(k.metrics, null, 1)}</pre>}
              </details>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <Eyebrow tone="ok">Confirmed findings</Eyebrow>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
            {c.confirmed_facts.length ? c.confirmed_facts.map((f, i) => <li key={i}>{f.fact}</li>) : <li className="list-none text-muted">None returned.</li>}
          </ul>
        </div>
        <div>
          <Eyebrow tone="warn">Hypotheses (not confirmed)</Eyebrow>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            {c.hypotheses.map((h) => (
              <li key={h.id ?? h.title}>
                <strong className="font-medium">{h.id}</strong> {h.title} <span className="text-muted">· {h.likelihood} · verify: {h.how_to_verify}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <Eyebrow>Open items by team</Eyebrow>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {teams.map((t) => (
            <div key={t} className="rounded-xl border border-line p-3">
              <p className="text-sm font-semibold text-ink">{t}</p>
              <ul className="mt-1 space-y-2 text-sm text-ink-2">
                {c.open_items.filter((o) => (o.owner ?? 'Unassigned') === t).map((o) => (
                  <li key={o.lever_id ?? o.signal}>
                    {o.signal}
                    <br />
                    <span className="text-muted">↳ {o.fix}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">These become rows in the Optimization tab. Only a typed, verified change can ever be executed there; the rest stay tasks.</p>
      </div>

      {c.drafts.map((d, i) => (
        <div key={i} className="rounded-xl border border-dashed border-line-strong p-3">
          <Eyebrow>
            {d.kind === 'publisher_message' ? 'Publisher message' : 'Draft for ' + d.audience} · <span className="text-warn-ink">draft, not sent</span>
          </Eyebrow>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{d.message}</p>
        </div>
      ))}

      {c.warnings.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
          {c.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{c.investigation_approval.note}</p>
      <Button size="sm" variant="ghost" onClick={() => setRaw(!raw)} aria-expanded={raw}>
        {raw ? 'Hide' : 'Show'} raw workflow output
      </Button>
      {raw && <pre className="num max-h-72 overflow-auto rounded-xl bg-surface-2 p-3 text-[11px] text-ink-2">{JSON.stringify(c.raw, null, 2)}</pre>}
    </article>
  );
};
