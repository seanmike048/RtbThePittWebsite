import React, { useMemo } from 'react';
import { AlertTriangle, ArrowLeft, FileText, Lock, ShieldAlert } from 'lucide-react';
import { checkGrid, fmtCompact, fmtMoney, fmtPct, investigation, networkSummary, rankedHypotheses, readiness, trafficContext } from '../../lib/pitt/engine.ts';
import type { Check, Dataset } from '../../lib/pitt/types.ts';
import { useCases } from '../cases/CasesContext.tsx';
import { StateNote } from '../ui.tsx';
import { Chip, Panel, PresenceChip, ResultChip } from './bits.tsx';

const JIRA = /^[A-Z][A-Z0-9]+-\d+$/;
const refHref = (ref: string) => (JIRA.test(ref) ? 'https://equativ.atlassian.net/browse/' + ref : '#ev-' + ref.replace(/[^A-Za-z0-9_-]/g, '_'));

/** Drill-down for one network: checks before vs after, traffic context, AI investigation, readiness, draft (read-only). */
export const NetworkPage: React.FC<{ ds: Dataset; networkId: number; onBack: () => void }> = ({ ds, networkId, onBack }) => {
  const s = useMemo(() => networkSummary(ds, networkId), [ds, networkId]);
  const grid = useMemo(() => checkGrid(ds, networkId), [ds, networkId]);
  const traffic = useMemo(() => trafficContext(ds, networkId), [ds, networkId]);
  const hyps = useMemo(() => rankedHypotheses(ds, networkId), [ds, networkId]);
  const inv = useMemo(() => investigation(ds, networkId), [ds, networkId]);
  const ready = useMemo(() => readiness(ds, networkId), [ds, networkId]);
  const sym = ds.currency.symbol;
  const evidence = ds.checks.filter((c) => c.network_id === networkId);
  const { run, go } = useCases();
  const caseRec = ds.synthetic ? null : run.cases.find((c) => c.networkId === networkId) ?? null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink cursor-pointer">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to the room
      </button>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Network #{networkId}</p>
          <h2 className="text-xl font-bold text-ink">{s.publisher}</h2>
          {inv?.meta && <p className="text-xs text-ink-2">{inv.meta}</p>}
          <p className="text-xs text-muted">
            Region {s.region ?? 'No data'} · {s.rows.map((r) => r.PARTNER_ID + ' ' + r.PARTNER_NAME.replace('Amazon DSP ', '') + ' cut ' + r.CUT_AT).join(' · ')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Revenue at risk</p>
          <p className="num text-2xl font-bold text-ink">{fmtMoney(s.atRisk, sym)}</p>
          <Chip tone={s.disconnected ? 'danger' : 'ok'}>{s.disconnected ? 'Still disconnected' : 'Reconnected'}</Chip>
          {caseRec && (
            <button onClick={() => go('investigations', caseRec.caseId)} className="mt-2 flex items-center gap-1 text-xs text-link hover:underline cursor-pointer">
              <FileText className="h-3.5 w-3.5" aria-hidden /> Open the case file
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel id="checks" eyebrow="Quality checks" title="Before vs after the cut" description="PASS green, FAIL red, NO DATA grey: no data is unknown, never a pass. Each cell links its evidence.">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Checks before and after the cut</caption>
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="py-1.5 font-medium">Check</th>
                <th scope="col" className="py-1.5 font-medium">Before</th>
                <th scope="col" className="py-1.5 font-medium">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {grid.map((g) => (
                <tr key={g.check}>
                  <th scope="row" className="py-2 pr-2 font-medium text-ink-2">
                    {g.label}
                  </th>
                  {[g.BEFORE, g.AFTER].map((c, i) => (
                    <td key={i} className="py-2 pr-2 align-top">
                      <Cell c={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-ink-2">Evidence ({evidence.length})</summary>
            <ul className="mt-2 space-y-1">
              {evidence.map((c) => (
                <li key={c.evidence_ref + c.window} id={'ev-' + c.evidence_ref.replace(/[^A-Za-z0-9_-]/g, '_')} className="text-muted">
                  <span className="num text-ink-2">{c.evidence_ref}</span> · {c.check} {c.window}: {c.result} · {c.detail}
                </li>
              ))}
            </ul>
          </details>
        </Panel>

        <Panel id="traffic" eyebrow="Traffic context" title="Network auctions vs Amazon bid requests">
          {traffic.amazonSpecific && (
            <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn-ink">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Drop is Amazon-specific: network auctions are stable while Amazon bid requests dropped.
            </p>
          )}
          {!traffic.metrics.length ? (
            <StateNote kind="unavailable" compact title="No traffic metric for this network" />
          ) : (
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Traffic metrics before and after</caption>
              <thead>
                <tr className="text-xs text-muted">
                  {['Metric', 'Before', 'After', 'Change', 'Period · source'].map((h, i) => (
                    <th key={h} scope="col" className={'py-1.5 pr-2 font-medium ' + (i > 0 && i < 4 ? 'text-right' : '')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {traffic.metrics.map((m, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-2 text-ink-2">
                      {m.metric.replace(/_/g, ' ')}
                      {m.partner_name && <span className="block text-muted">{m.partner_name}</span>}
                    </td>
                    <td className="num py-2 pr-2 text-right text-ink-2">{fmtCompact(m.before)}</td>
                    <td className="num py-2 pr-2 text-right text-ink-2">{fmtCompact(m.after)}</td>
                    <td className={'num py-2 pr-2 text-right font-semibold ' + (m.change == null ? 'text-muted' : m.change < 0 ? 'text-danger-ink' : 'text-ok-ink')}>{fmtPct(m.change)}</td>
                    <td className="py-2 text-muted">
                      {m.period} · {m.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel id="ai" eyebrow="Investigation" title="Leading hypotheses" description="Hypotheses as the source states them, in source order. Not confirmed, not scored.">
        {!inv ? (
          <StateNote kind="unavailable" compact title="No investigation for this network" />
        ) : (
          <div className="space-y-3">
            {caseRec && (
              <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">
                The case summary, findings and action plan for this network are in its case file (Investigations), rebuilt from the run.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Chip tone={inv.validation.passed == null ? 'neutral' : inv.validation.passed ? 'ok' : 'danger'}>validation passed: {inv.validation.passed == null ? 'No data' : String(inv.validation.passed)}</Chip>
              <Chip tone={inv.validation.ai_output_accepted == null ? 'neutral' : inv.validation.ai_output_accepted ? 'ok' : 'warn'}>
                ai_output_accepted: {inv.validation.ai_output_accepted == null ? 'No data' : String(inv.validation.ai_output_accepted)}
              </Chip>
              <Chip tone={inv.validation.fallback_fields?.length ? 'warn' : 'neutral'}>
                fallback_fields: {inv.validation.fallback_fields == null ? 'No data' : inv.validation.fallback_fields.length ? inv.validation.fallback_fields.join(', ') : 'none'}
              </Chip>
            </div>
            <ol className="space-y-2">
              {hyps.map((h, i) => (
                <li key={i} className="rounded-lg border border-line bg-surface-2 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="num text-muted">#{i + 1}</span>
                    <strong className="text-sm text-ink">{h.label}</strong>
                    <Chip tone="warn">Leading hypothesis — not confirmed</Chip>
                  </div>
                  {h.evidence_refs.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-1">
                      {h.evidence_refs.map((r) => (
                        <a key={r} href={refHref(r)} target={JIRA.test(r) ? '_blank' : undefined} rel="noreferrer" className="num rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-2 hover:text-ink">
                          {r}
                        </a>
                      ))}
                      {h.unverified.map((r) => (
                        <Chip key={'u' + r} tone="danger" title={r + ' is not a row in Checks'}>
                          <ShieldAlert className="h-3 w-3" aria-hidden /> Unverified evidence · {r}
                        </Chip>
                      ))}
                    </p>
                  )}
                  {h.missing_info.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-muted">Missing information</p>
                      <ul className="list-disc pl-4 text-ink-2">
                        {h.missing_info.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReadinessPanel groups={ready} />
        <Panel id="draft" eyebrow="Draft message" title="Read-only draft" aside={<Chip tone="warn"><Lock className="h-3 w-3" aria-hidden /> Requires human approval in Slack</Chip>}>
          {inv?.draft_message ? (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 text-[11.5px] leading-relaxed text-ink-2">{inv.draft_message}</pre>
          ) : caseRec ? (
            <p className="text-sm text-ink-2">The draft for this case is in its case file: Draft only, no Jira ticket created.</p>
          ) : (
            <StateNote kind="empty" compact title="No draft for this network" />
          )}
          <p className="mt-2 text-[11px] text-muted">Nothing can be sent from this page.</p>
        </Panel>
      </div>
    </div>
  );
};

const Cell: React.FC<{ c: Check | null }> = ({ c }) =>
  !c ? (
    <ResultChip r={null} />
  ) : (
    <a href={refHref(c.evidence_ref)} className="group block" title={c.detail}>
      <ResultChip r={c.result} />
      <span className="mt-0.5 block text-[11px] text-muted group-hover:text-ink-2">{c.detail}</span>
    </a>
  );

export const ReadinessPanel: React.FC<{ groups: ReturnType<typeof readiness> }> = ({ groups }) => (
  <Panel id="ready" eyebrow="Amazon readiness" title="OpenRTB signals">
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.id}>
          <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-2">
            {g.label} {g.note && <Chip tone="info">{g.note}</Chip>}
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {g.items.map((it) => (
              <li key={it.signal} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-2 px-2 py-1 text-xs">
                <span className="num text-ink-2" title={it.detail ?? undefined}>
                  {it.signal}
                </span>
                <PresenceChip p={it.presence} />
              </li>
            ))}
          </ul>
          {g.items.some((i) => i.detail) && (
            <ul className="mt-1 text-[11px] text-muted">
              {g.items.filter((i) => i.detail).map((i) => (
                <li key={i.signal}>
                  {i.signal}: {i.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  </Panel>
);
