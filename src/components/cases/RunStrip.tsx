import React from 'react';
import { runRemovedTotal } from '../../lib/cases/financials.ts';
import { showUsd } from '../../lib/cases/fx.ts';
import { Overline } from '../ui.tsx';
import { useCases } from './CasesContext.tsx';

/** Run-level context in a Maestro summary band: facts about the whole run, kept apart from any one publisher. */
export const RunStrip: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { run, go } = useCases();
  const c = run.context;
  return (
    <section aria-label="Run context" className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="bg-surface-2 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <Overline className="text-accent-ink">The Pitt · Summary · run context</Overline>
          <button onClick={() => go('investigations')} className="text-sm text-link hover:underline cursor-pointer">
            {run.cases.length} publisher case{run.cases.length === 1 ? '' : 's'}
          </button>
        </div>
        <p className="mt-1 text-sm text-ink">
          {run.cases.length} publishers disconnected from Amazon DSP · <span className="num font-medium">{showUsd(runRemovedTotal(run.cases))}</span> per week of pre-cut spend removed
          {compact && c.notes[0] && <span> · {c.notes[0].replace(/\s*\(.*\)/, '')}</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {run.label} · applies to the whole run, not to one publisher · USD, each publisher converted day by day, then summed
        </p>
      </div>
      {!compact && (
        <ul className="space-y-0.5 border-t border-line px-4 py-3 text-[13px] text-ink-2">
          {c.tickets.length > 0 && <li>Cuts made during {c.tickets.join(', ')}, Equativ's Amazon DSP reseller clean-up, per the run.</li>}
          {c.notes.map((n) => (
            <li key={n} className="[overflow-wrap:anywhere]">
              {n.charAt(0).toUpperCase() + n.slice(1)}.
            </li>
          ))}
          <li>
            Publisher contact: <span className="font-medium text-ink">{c.publisherContact}</span> · Jira: <span className="font-medium text-ink">{c.jira}</span>
          </li>
        </ul>
      )}
    </section>
  );
};
