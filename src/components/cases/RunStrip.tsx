import React from 'react';
import { runRemovedTotal } from '../../lib/cases/financials.ts';
import { showUsd } from '../../lib/cases/fx.ts';
import { useCases } from './CasesContext.tsx';

/** Run-level context: facts about the whole run, kept apart from any one publisher. */
export const RunStrip: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { run, go } = useCases();
  const c = run.context;
  return (
    <section aria-label="Run context" className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-xs font-medium text-muted">
          Run context · {run.label}
          <span> · applies to the whole run, not to one publisher</span>
        </p>
        <button onClick={() => go('investigations')} className="text-xs text-accent-ink hover:underline cursor-pointer">
          {run.cases.length} publisher case{run.cases.length === 1 ? '' : 's'} →
        </button>
      </div>
      <p className="mt-1 text-sm text-ink">
        {run.cases.length} publishers disconnected from Amazon DSP · <span className="num font-semibold">{showUsd(runRemovedTotal(run.cases))}</span> per week of pre-cut spend removed
        <span className="text-muted"> (USD, each publisher converted day by day, then summed)</span>
      </p>
      {!compact && (
        <ul className="mt-2 space-y-0.5 text-xs text-ink-2">
          {c.tickets.length > 0 && <li>Cuts made during {c.tickets.join(', ')} (Equativ's Amazon DSP reseller clean-up), per the run.</li>}
          {c.notes.map((n) => (
            <li key={n} className="[overflow-wrap:anywhere]">
              {n.charAt(0).toUpperCase() + n.slice(1)}.
            </li>
          ))}
          <li>
            Publisher contact: <strong className="font-medium text-ink">{c.publisherContact}</strong> · Jira: <strong className="font-medium text-ink">{c.jira}</strong>
          </li>
        </ul>
      )}
    </section>
  );
};
