import React from 'react';
import { caseFinancials, SEAT_NAME } from '../../lib/cases/financials.ts';
import type { CaseRecord, Provenance } from '../../lib/cases/types.ts';
import { cx } from '../ui.tsx';
import { useCases } from './CasesContext.tsx';
import { PublisherDirectory } from './PublisherDirectory.tsx';

/** A quiet provenance label: says how a statement is known, without competing with the content. */
export const Prov: React.FC<{ p: Provenance | 'Draft only' | 'Unavailable' | 'Projected' | 'Observed' | 'Illustrative'; className?: string }> = ({ p, className }) => {
  const tone =
    p === 'Pending TechOps confirmation' || p === 'Illustrative'
      ? 'text-warn-ink'
      : p === 'Leading hypothesis — not confirmed' || p === 'Context, not proof'
        ? 'text-info'
        : p === 'Unavailable'
          ? 'text-faint'
          : 'text-muted';
  return <span className={cx('whitespace-nowrap text-[11px] font-medium', tone, className)}>{p}</span>;
};

export const Section: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode; id?: string; note?: React.ReactNode }> = ({ title, aside, children, id, note }) => (
  <section id={id} className="border-t border-line pt-5">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {aside}
    </div>
    {note && <p className="-mt-2 mb-3 max-w-3xl text-xs text-muted">{note}</p>}
    {children}
  </section>
);

/** "Amazon DSP · Endpoints 489 EMEA/APAC Display B, 491 Video B …": endpoint numbers as context, not as navigation. */
export function endpointContext(c: CaseRecord) {
  const f = caseFinancials(c);
  const cut = f.seats.filter((s) => s.state === 'Cut');
  const live = f.seats.filter((s) => s.state === 'Still live');
  const list = (xs: typeof cut) => xs.map((s) => `${s.partnerId} ${SEAT_NAME[s.partnerId] ?? ''}`.trim()).join(', ');
  return { cut: cut.length ? `${c.dsp} · cut on endpoint${cut.length > 1 ? 's' : ''} ${list(cut)}` : c.dsp, live: live.length ? `still live on ${list(live)}` : null };
}

export const PageHeader: React.FC<{ title: string; lead?: React.ReactNode; aside?: React.ReactNode; c?: CaseRecord | null }> = ({ title, lead, aside, c }) => {
  const ctx = c ? endpointContext(c) : null;
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-muted">
          {c ? (
            <>
              <span className="font-medium text-ink-2">{c.publisher}</span> · #{c.networkId} · {ctx!.cut}
              {ctx!.live && <span> · {ctx!.live}</span>}
            </>
          ) : (
            'No publisher selected'
          )}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {lead && <p className="mt-1 max-w-3xl text-sm text-muted">{lead}</p>}
      </div>
      {aside}
    </header>
  );
};

/** Pages scoped to one publisher render the directory instead of guessing one. */
export const RequirePublisher: React.FC<{ title: string; children: (c: CaseRecord) => React.ReactNode }> = ({ title, children }) => {
  const { selected, missingId, run } = useCases();
  if (selected) return <>{children(selected)}</>;
  return (
    <div className="space-y-4">
      <PageHeader title={title} lead={missingId ? undefined : 'Pick a publisher. Everything on this page is scoped to one publisher; nothing falls back to another one or to a total.'} />
      {missingId && (
        <p role="status" className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn-ink">
          The publisher in this link ({missingId}) is not in the current run ({run.label}). Pick one of its publishers below.
        </p>
      )}
      <PublisherDirectory />
    </div>
  );
};

export const Fact: React.FC<{ k: string; v: React.ReactNode; p?: React.ComponentProps<typeof Prov>['p'] }> = ({ k, v, p }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted">{k}</dt>
    <dd className="mt-0.5 text-sm text-ink [overflow-wrap:anywhere]">{v}</dd>
    {p && <Prov p={p} />}
  </div>
);
