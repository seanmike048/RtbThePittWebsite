import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { caseFinancials } from '../../lib/cases/financials.ts';
import { showUsd } from '../../lib/cases/fx.ts';
import { cx, fieldClass, StateNote } from '../ui.tsx';
import { useCases } from './CasesContext.tsx';

/** Every publisher of the run, searchable. One row per case; opening one selects it for every page. */
export const PublisherDirectory: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { run, selected, go, tab } = useCases();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return run.cases.filter((c) => !n || [c.publisher, String(c.networkId), c.caseId, c.region ?? '', c.meta ?? ''].some((x) => x.toLowerCase().includes(n)));
  }, [run, q]);
  const open = (id: string) => go(tab === 'overview' ? 'investigations' : tab, id);

  if (!run.cases.length)
    return <StateNote kind="empty" title="No publisher case in this run">Import a full n8n or Slack output to start (Import run, top right).</StateNote>;

  return (
    <div className="space-y-2">
      <label className="relative block">
        <span className="sr-only">Search publishers</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search publisher, network or case ID"
          className={fieldClass() + ' w-full pl-8'}
        />
      </label>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {rows.map((c) => {
          const f = caseFinancials(c);
          const active = selected?.caseId === c.caseId;
          return (
            <li key={c.caseId}>
              <button
                onClick={() => open(c.caseId)}
                aria-current={active ? 'true' : undefined}
                className={cx('grid w-full gap-x-4 gap-y-1 px-3 py-3 text-left transition-colors cursor-pointer hover:bg-surface-2', active && 'bg-accent-soft/60', compact ? 'grid-cols-1' : 'sm:grid-cols-[minmax(0,1fr)_auto]')}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    {c.publisher} <span className="num font-normal text-muted">#{c.networkId}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {c.dsp} · {c.region ?? 'region not stated'} · cut {c.disconnectedAt?.slice(0, 10) ?? 'date not stated'}
                  </span>
                  <span className="mt-1 block text-xs text-ink-2">
                    {c.status}
                    {c.distinctions.length > 0 && <span className="text-muted"> · {c.distinctions.join(' · ')}</span>}
                    {f.partialCut && <span className="text-muted"> · Partial cut</span>}
                  </span>
                </span>
                <span className={cx('text-xs', compact ? '' : 'sm:text-right')}>
                  <span className="num block text-sm font-semibold text-ink">{showUsd(f.removedAfterCut)}</span>
                  <span className="text-muted">removed per week</span>
                </span>
              </button>
            </li>
          );
        })}
        {!rows.length && (
          <li className="p-2">
            <StateNote kind="empty" compact title={`No publisher matches “${q}”`} action={<button onClick={() => setQ('')} className="text-xs text-link hover:underline cursor-pointer">Clear search</button>} />
          </li>
        )}
      </ul>
    </div>
  );
};
