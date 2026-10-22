import React, { useState } from 'react';
import { caseFinancials, SEAT_NAME } from '../../lib/cases/financials.ts';
import type { Tab } from '../../lib/cases/selection.ts';
import type { CaseRecord, Provenance } from '../../lib/cases/types.ts';
import { Icon } from '../shell/Icon.tsx';
import { useShell } from '../shell/ShellContext.tsx';
import { Button, CardHeader, cx, StateNote } from '../ui.tsx';
import { useCases } from './CasesContext.tsx';
import { PublisherDirectory } from './PublisherDirectory.tsx';

/** A quiet provenance label: says how a statement is known, without competing with the content. */
export const Prov: React.FC<{ p: Provenance | 'Draft only' | 'Unavailable' | 'Projected' | 'Observed' | 'Illustrative'; className?: string }> = ({ p, className }) => {
  const tone =
    p === 'Pending TechOps confirmation' || p === 'Illustrative'
      ? 'text-warn-ink'
      : p === 'Leading hypothesis — not confirmed' || p === 'Context, not proof'
        ? 'text-info'
        : 'text-muted';
  return <span className={cx('whitespace-nowrap text-[11px] font-medium', tone, className)}>{p}</span>;
};

/** A Maestro card: 17px title row with actions on the right, 16px padding, 1px border, no shadow. */
export const Section: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode; id?: string; note?: React.ReactNode; flush?: boolean }> = ({ title, aside, children, id, note, flush }) => (
  <section id={id} className="rounded-lg border border-line bg-surface">
    <CardHeader title={title} aside={aside} sub={note} />
    <div className={flush ? '' : 'px-4 pb-4'}>{children}</div>
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

const HELP: Record<Tab, string> = {
  overview:
    'Every Amazon DSP seat cut in the selected data set. Filters apply before every figure. Spend is the 7 days ending on the cut day, in USD (EUR from Snowflake converted day by day). Revenue at risk is a run rate, not a confirmed loss.',
  investigations:
    'One case file per publisher of the imported run: what the source says, what is calculated, what is a hypothesis and what waits for TechOps. Drafts are rebuilt in USD; nothing is sent or created.',
  impact:
    'Spend for the selected publisher only, in USD: the pre-cut week split into removed and still-live seats, the latest run rate, and projections only when a scenario exists.',
  projection:
    'A scenario you enter for the selected publisher. Inputs start blank; illustrative values are labelled and never approved. The projection is never added to observed spend.',
  optimization:
    'Changes proposed from the action plan, preview and approval only. No Manage, Jira or Slack write integration is configured, so execution is always refused.',
};

/** Maestro page header: context line, 26px title with "Need help ?", the one primary action on the right. */
export const PageHeader: React.FC<{ title: string; lead?: React.ReactNode; aside?: React.ReactNode; c?: CaseRecord | null }> = ({ title, lead, aside, c }) => {
  const ctx = c ? endpointContext(c) : null;
  const { tab } = useCases();
  const { openImport } = useShell();
  const [help, setHelp] = useState(false);
  return (
    <header className="space-y-2">
      <p className="text-xs text-muted">
        {c ? (
          <>
            <span className="font-medium text-ink-2">{c.publisher}</span> <span className="id">#{c.networkId}</span> · {ctx!.cut}
            {ctx!.live && <span> · {ctx!.live}</span>}
          </>
        ) : (
          'Amazon DSP'
        )}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-[26px] font-normal leading-8 text-ink">{title}</h1>
          <button type="button" onClick={() => setHelp((h) => !h)} aria-expanded={help} className="inline-flex items-center gap-1 text-sm text-link hover:underline cursor-pointer">
            <span className="h-2 w-2 rounded-full bg-link" aria-hidden /> Need help ?
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {aside}
          <Button variant="primary" onClick={openImport}>
            <Icon name="paste" /> Import run
          </Button>
        </div>
      </div>
      {help && <p className="max-w-3xl rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink-2">{HELP[tab]}</p>}
      {lead && <p className="max-w-3xl text-sm text-muted">{lead}</p>}
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
        <StateNote kind="unavailable" title="This publisher is not in the current run">
          The link asks for {missingId}; the current run is {run.label}. Pick one of its publishers below.
        </StateNote>
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
