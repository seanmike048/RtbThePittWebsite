import React, { useMemo } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { caseDraft } from '../../lib/cases/drafts.ts';
import { caseFinancials } from '../../lib/cases/financials.ts';
import { showUsd } from '../../lib/cases/fx.ts';
import { SOURCE_ONLY } from '../../lib/cases/sanitize.ts';
import type { CaseRecord } from '../../lib/cases/types.ts';
import { CopyButton } from '../ui.tsx';
import { ActionPlan } from './ActionPlan.tsx';
import { Fact, PageHeader, Prov, Section } from './bits.tsx';
import { useCases } from './CasesContext.tsx';

/** One publisher's case file: what the source says, what is calculated, what is hypothesis, what is held. */
export const CaseFile: React.FC<{ c: CaseRecord }> = ({ c }) => {
  const { go } = useCases();
  const f = useMemo(() => caseFinancials(c), [c]);
  const draft = useMemo(() => caseDraft(c), [c]);
  const raw = useMemo(() => c.provenance.raw.split('\n').map((l) => (SOURCE_ONLY.test(l) ? '[line kept in the stored source only]' : l)).join('\n'), [c]);

  return (
    <article className="space-y-6" aria-labelledby="case-title">
      <PageHeader
        title={c.publisher}
        c={c}
        aside={
          <button onClick={() => go('impact', c.caseId)} className="inline-flex items-center gap-1 text-sm text-accent-ink hover:underline cursor-pointer">
            Financial impact <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-warn-ink">{c.status}</span>
        {c.distinctions.map((d) => (
          <span key={d} className="text-ink-2">
            {d}
          </span>
        ))}
        {f.partialCut && <span className="text-ink-2">Partial cut: other seats still live</span>}
      </div>

      {c.publisherContactHeld && (
        <p className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn-ink">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Publisher contact is on hold until TechOps confirms the TOPS-11471 status. No message has been sent.
        </p>
      )}

      {c.summary && (
        <div className="max-w-3xl">
          <p className="text-[15px] leading-relaxed text-ink">{c.summary}</p>
          <Prov p="Source" />
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Fact k="Case" v={<span className="num text-xs">{c.caseId}</span>} />
        <Fact k="Disconnected" v={c.disconnectedAt ?? 'Not stated'} p="Source" />
        <Fact k="Publisher" v={c.meta ?? 'Not stated'} p="Source" />
        <Fact k="Removed per week" v={<span className="num font-semibold">{showUsd(f.removedAfterCut)}</span>} p={f.removedAfterCut.kind === 'usd' ? 'Calculated' : 'Unavailable'} />
        <Fact k="Still live per week" v={<span className="num">{showUsd(f.stillLive)}</span>} p={f.stillLive.kind === 'usd' ? 'Calculated' : 'Unavailable'} />
        <Fact k="Latest day after the cut" v={f.latestDay ?? 'No loaded day'} p="Observed" />
      </dl>

      <Section title="Evidence" note="Each block says how it is known. Context tickets and quality signals describe the situation; they do not prove why the seats were cut.">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-ink">What the source says</h3>
            {c.findings.length ? (
              <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
                {c.findings.map((x) => (
                  <li key={x} className="border-l-2 border-line pl-3">
                    {x}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No finding beyond the summary and the action plan.</p>
            )}
            <Prov p="Source" className="mt-1 block" />
            {c.findings.some((x) => x.includes('≈ $')) && <p className="mt-1 text-[11px] text-muted">≈ amounts: source EUR shown in USD at the cut-day rate. Financial Impact has the day-by-day figures.</p>}
          </div>
          <div className="space-y-4">
            {c.hypothesis && (
              <div>
                <h3 className="text-sm font-medium text-ink">Leading hypothesis</h3>
                <p className="mt-1 text-sm text-ink-2">{c.hypothesis.text}</p>
                <Prov p="Leading hypothesis — not confirmed" />
                {c.hypothesis.verify && (
                  <p className="mt-2 text-sm text-ink-2">
                    <span className="text-muted">To confirm: </span>
                    {c.hypothesis.verify}
                  </p>
                )}
                <Prov p="Pending TechOps confirmation" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-medium text-ink">Calculated here</h3>
              <p className="mt-1 text-sm text-ink-2">
                {showUsd(f.removedAfterCut)} per week removed on the cut seats{f.partialCut ? `, ${showUsd(f.stillLive)} still live on other seats` : ''}. {f.window ? `Window ${f.window.from} → ${f.window.to}.` : ''}
              </p>
              <Prov p="Calculated" />
            </div>
          </div>
        </div>
        {c.context.length > 0 && (
          <details className="mt-4 rounded-lg border border-line">
            <summary className="cursor-pointer px-3 py-2 text-sm text-ink-2">
              Related tickets ({c.context.length}) <Prov p="Context, not proof" className="ml-2" />
            </summary>
            <ul className="divide-y divide-line border-t border-line">
              {c.context.map((t) => (
                <li key={t.key} className="px-3 py-2 text-sm">
                  <p className="text-xs text-muted">
                    <span className="num font-medium text-ink-2">{t.key}</span>
                    {t.date && ` · ${t.date}`}
                    {t.scope && ` · ${t.scope}`}
                  </p>
                  <p className="mt-0.5 text-ink-2">{t.summary}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section title="Action plan & owners">
        <ActionPlan c={c} />
      </Section>

      <Section title="Draft" aside={<span className="text-xs text-muted">Draft only · no Jira ticket created · nothing is sent from here</span>}>
        <details className="rounded-lg border border-line">
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-ink-2">
            <span>{draft.title}</span>
            <span onClick={(e) => e.preventDefault()}>
              <CopyButton text={draft.body} label="Copy draft" />
            </span>
          </summary>
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap border-t border-line bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">{draft.body}</pre>
        </details>
        <p className="mt-1 text-[11px] text-muted">Rebuilt from the normalized case, in USD. The verbatim source draft is below.</p>
      </Section>

      <Section title="Source">
        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer px-3 py-2 text-sm text-ink-2">
            Case text as received · <span className="num text-xs text-muted">{c.provenance.hash}</span>
          </summary>
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap border-t border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">{raw}</pre>
          <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
            {c.provenance.sourceOnly.length} line(s) on metrics the product does not analyse are kept in the stored source and not displayed. Pasted text is shown as text; nothing in it is run or followed.
          </p>
        </details>
      </Section>
    </article>
  );
};
