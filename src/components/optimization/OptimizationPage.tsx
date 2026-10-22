import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, SlidersHorizontal, X } from 'lucide-react';
import { Badge, Button, Card, CopyButton, EmptyNote, Eyebrow, SectionHeading, TableShell, Th, cx } from '../ui.tsx';
import { api, describe } from '../../lib/ops/api.ts';
import { OPT_LABEL } from '../../lib/ops/runs.ts';
import type { Preview, Recommendation } from '../../lib/ops/types.ts';
import type { Ops } from '../ops/useOps.ts';

/**
 * Workflow recommendations with a safe execution boundary. A task stays a task; a typed change can only be executed after
 * a preview of the exact diff and an explicit Yes from an approver, and only when its Manage capability is verified.
 */
export const OptimizationPage: React.FC<{ ops: Ops }> = ({ ops }) => {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const [preview, setPreview] = useState<{ rec: Recommendation; p: Preview } | null>(null);
  const [manual, setManual] = useState<{ rec: Recommendation; reason: string; ask?: { channel: string; text: string } } | null>(null);

  const load = useCallback(() => {
    api.optimizations().then((x) => setRecs(x.recommendations)).catch((e) => setError(describe(e)));
  }, []);
  useEffect(() => {
    if (ops.backend === 'ok' && ops.session?.user) load();
  }, [ops.backend, ops.session, ops.runs, load]);

  if (ops.backend === 'none')
    return (
      <Card className="p-6">
        <SectionHeading eyebrow="Optimization" title="Recommendations and approved changes" icon={<SlidersHorizontal className="h-5 w-5" />} />
        <EmptyNote className="mt-4">This page has no Pitt backend, so there are no recommendations to review here. They come from n8n runs pushed to the hosted app.</EmptyNote>
      </Card>
    );
  if (!ops.session?.user) return <EmptyNote>Sign in (top bar) to see recommendations.</EmptyNote>;

  const writes = ops.status?.manage;

  const open = async (r: Recommendation) => {
    setSelected(r);
    if (r.kind !== 'change') return;
    try {
      const out = await api.preview(r.recommendation_id);
      if (out.status === 'awaiting_approval' && out.preview) setPreview({ rec: r, p: out.preview });
      else setManual({ rec: r, reason: out.reason ?? 'manual_required', ask: out.ask ?? r.capability.ask });
      load();
    } catch (e) {
      setError(describe(e));
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <SectionHeading
          eyebrow="Optimization"
          title="Recommendations and approved changes"
          icon={<SlidersHorizontal className="h-5 w-5" />}
          description="Each row comes from an n8n investigation run. Contacting a partner, checking a setup or asking a publisher stays a task with an owner. A change runs only after you review its exact diff and answer Yes."
          aside={
            <Badge tone={writes?.writes_enabled ? 'danger' : 'neutral'} dot>
              {writes?.kill_switch ? 'External writes off (kill switch)' : writes?.writes_enabled ? 'External writes enabled' : 'External writes disabled'}
            </Badge>
          }
        />
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-soft/50 px-3 py-2 text-xs text-warn-ink">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            No Manage API for domain or bundle exclusion has been verified yet, so every change is <strong>Manual action required</strong> with the exact request to send. Approving an
            investigation in n8n never authorises a change here.
          </span>
        </div>
        {error && <p className="mt-3 text-sm text-danger-ink">{error}</p>}
        <div className="mt-4">
          {!recs ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : !recs.length ? (
            <EmptyNote>No recommendation yet. Run The Pitt main workflow in n8n (from M1); its open items appear here when the result arrives.</EmptyNote>
          ) : (
            <TableShell minWidth="960px">
              <thead>
                <tr>
                  <Th>Proposed action</Th>
                  <Th>Target</Th>
                  <Th>Scope</Th>
                  <Th>Evidence</Th>
                  <Th>Impact</Th>
                  <Th>Owner</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recs.map((r) => {
                  const l = OPT_LABEL[r.state];
                  return (
                    <tr key={r.recommendation_id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="text-ink">{r.kind === 'task' ? 'Task' : r.action_type.replace('_', ' ')}</p>
                        <p className="mt-0.5 max-w-xs text-xs text-muted">{r.rationale.signal}</p>
                      </td>
                      <td className="num px-4 py-3 text-xs">{r.targets.length ? r.targets.map((t) => t.canonical).join(', ') : '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        #{r.scope.network_id} {r.scope.network_name}
                        <br />
                        <span className="text-muted">{r.scope.seat ?? 'seats ' + r.scope.partner_ids.join(', ')} · {r.environment}</span>
                      </td>
                      <td className="num px-4 py-3 text-xs text-muted">
                        run {r.evidence.run_id.slice(0, 12)}…<br />
                        {r.evidence.result_received_at.slice(0, 16).replace('T', ' ')} UTC
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{r.impact.traffic == null ? 'Not measurable yet' : r.impact.traffic}</td>
                      <td className="px-4 py-3 text-xs">{r.owner ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Badge tone={l.tone}>{l.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="secondary" onClick={() => void open(r)}>
                          {r.kind === 'change' ? 'Review change' : 'Details'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          )}
        </div>
      </Card>

      {selected && !preview && !manual && <DetailDrawer rec={selected} onClose={() => setSelected(null)} />}
      {manual && (
        <DetailDrawer rec={manual.rec} onClose={() => (setManual(null), setSelected(null))}>
          <Eyebrow tone="warn">Manual action required</Eyebrow>
          <p className="mt-1 text-sm text-ink-2">Reason: {manual.reason.replace(/_/g, ' ')}. Execution stays disabled.</p>
          {manual.ask && (
            <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
              <p className="text-xs text-muted">Send to {manual.ask.channel}</p>
              <p className="mt-1 text-ink-2">{manual.ask.text}</p>
              <CopyButton text={manual.ask.text} label="Copy request" className="mt-2" />
            </div>
          )}
        </DetailDrawer>
      )}
      {preview && (
        <ApprovalDialog
          rec={preview.rec}
          p={preview.p}
          environment={ops.status?.environment ?? 'unknown'}
          onDone={() => {
            setPreview(null);
            setSelected(null);
            load();
          }}
        />
      )}
    </div>
  );
};

const DetailDrawer: React.FC<{ rec: Recommendation; onClose: () => void; children?: React.ReactNode }> = ({ rec, onClose, children }) => (
  <Card className="p-5 sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div>
        <Eyebrow>{rec.kind === 'task' ? 'Task' : 'Change'} · {rec.recommendation_id} · v{rec.version}</Eyebrow>
        <h3 className="mt-1 text-base font-semibold text-ink">{rec.rationale.signal}</h3>
      </div>
      <button type="button" onClick={onClose} aria-label="Close details" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer">
        <X className="h-4 w-4" />
      </button>
    </div>
    <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
      <dt className="text-muted">Next step</dt>
      <dd className="text-ink-2">{rec.next_step}</dd>
      <dt className="text-muted">Owner · escalate</dt>
      <dd className="text-ink-2">{rec.owner} · {rec.escalate ?? '—'}</dd>
      <dt className="text-muted">Evidence</dt>
      <dd className="num text-xs text-ink-2">{rec.rationale.evidence_ref} (run {rec.evidence.run_id})</dd>
      <dt className="text-muted">Reversibility</dt>
      <dd className="text-ink-2">{rec.reversibility}</dd>
      {rec.stale_reason && (
        <>
          <dt className="text-muted">Stale because</dt>
          <dd className="text-warn-ink">{rec.stale_reason}</dd>
        </>
      )}
    </dl>
    {children && <div className="mt-4">{children}</div>}
  </Card>
);

/** Yes / No on one immutable preview. Focus starts on "No"; Tab stays inside; Escape closes without deciding. */
const ApprovalDialog: React.FC<{ rec: Recommendation; p: Preview; environment: string; onDone: () => void }> = ({ rec, p, environment, onDone }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>('button, textarea, [href]')].filter((x) => !x.hasAttribute('disabled'));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (e.preventDefault(), f[0].focus());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const decide = async (decision: 'yes' | 'no') => {
    setSending(true);
    setErr(null);
    try {
      await api.decide(rec.recommendation_id, { decision, preview_id: p.preview_id, payload_hash: p.payload_hash, reason: reason || undefined });
      onDone();
    } catch (e) {
      setErr(describe(e));
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="pitt-approve-title">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" />
      <div ref={ref} className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <div className="border-b border-line px-5 py-4">
          <Badge tone={environment === 'production' ? 'danger' : 'info'} dot>
            {environment.toUpperCase()}
          </Badge>
          <h2 id="pitt-approve-title" className="mt-2 text-base font-semibold text-ink">
            Add {p.payload.add.length} {p.payload.add[0]?.type ?? 'entry'} exclusion{p.payload.add.length === 1 ? '' : 's'} for network #{rec.scope.network_id}?
          </h2>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,12rem)_1fr]">
            <dt className="text-muted">Resource</dt>
            <dd className="num text-ink">{p.payload.resource_id} · scope {p.payload.native_scope}</dd>
            <dt className="text-muted">Applies to</dt>
            <dd className="text-ink">{rec.scope.seat ?? 'seats ' + rec.scope.partner_ids.join(', ')} on network #{rec.scope.network_id}</dd>
            <dt className="text-muted">Other consumers</dt>
            <dd className="text-ink">{p.before_state.consumers == null ? 'Not reported by the API' : JSON.stringify(p.before_state.consumers)}</dd>
          </dl>
          <div>
            <Eyebrow>Diff (only these entries change)</Eyebrow>
            <ul className="num mt-1 space-y-0.5 text-xs">
              {p.payload.add.map((t) => (
                <li key={t.value} className="text-ok-ink">
                  + {t.value} <span className="text-muted">({t.matching})</span>
                </li>
              ))}
              {p.payload.remove.map((t) => (
                <li key={t.value} className="text-danger-ink">− {t.value}</li>
              ))}
              {p.already_present.map((v) => (
                <li key={v} className="text-muted">= {v} (already present, unchanged)</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">{p.before_state.entries.length} existing entries stay as they are (version {String(p.before_state.version)}).</p>
          </div>
          <p className="text-xs text-muted">
            Evidence: {rec.rationale.signal}. Affected traffic and spend: {rec.impact.note} Rollback: {rec.reversibility}. This approval expires at {p.expires_at.slice(11, 16)} UTC and only covers this exact diff.
          </p>
          <label className="block text-xs text-muted">
            Reason (optional)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface p-2 text-sm text-ink" rows={2} />
          </label>
          {err && <p className="text-sm text-danger-ink">{err}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">
          <Button data-autofocus size="sm" variant="secondary" disabled={sending} onClick={() => void decide('no')}>
            No, keep current settings
          </Button>
          <Button size="sm" variant="primary" disabled={sending} className={cx(environment === 'production' && 'bg-danger')} onClick={() => void decide('yes')}>
            Yes, apply these changes
          </Button>
        </div>
      </div>
    </div>
  );
};
