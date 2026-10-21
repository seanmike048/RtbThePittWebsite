import React, { useMemo } from 'react';
import { CHECK_LABEL, networkSummary, readiness, type Row } from '../../lib/pitt/engine.ts';
import type { Dataset } from '../../lib/pitt/types.ts';
import { Chip, Panel } from './bits.tsx';
import { ReadinessPanel } from './NetworkPage.tsx';

/**
 * What a publisher may see about their own network: status, failing checks, readiness, recommended fixes, reconnection
 * timeline. Hidden: owners, other publishers, Equativ revenue, AI hypotheses and validation internals.
 */
export const PublisherView: React.FC<{ ds: Dataset; rows: Row[]; networkId: number | null; onPick: (id: number) => void }> = ({ ds, rows, networkId, onPick }) => {
  const nets = useMemo(() => [...new Map(rows.map((r) => [r.NETWORK_ID, r.PUBLISHER])).entries()], [rows]);
  const id = networkId ?? nets[0]?.[0] ?? null;
  const s = useMemo(() => (id == null ? null : networkSummary(ds, id)), [ds, id]);
  const ready = useMemo(() => (id == null ? [] : readiness(ds, id)), [ds, id]);
  if (id == null || !s) return <p className="text-sm italic text-muted">No network in the current filters.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-info/40 bg-info-soft px-3 py-2 text-xs text-ink-2">
        <span>Publisher view: one network at a time. Owners, other publishers, Equativ revenue and AI internals are hidden.</span>
        <label className="flex items-center gap-1.5">
          Preview as
          <select className="h-7 rounded-md border border-line bg-surface-2 px-1.5 text-xs text-ink" value={id} onChange={(e) => onPick(Number(e.target.value))}>
            {nets.map(([nid, name]) => (
              <option key={nid} value={nid}>
                {name} · #{nid}
              </option>
            ))}
          </select>
        </label>
      </div>
      <header>
        <h2 className="text-xl font-bold text-ink">{s.publisher}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          Network #{id} <Chip tone={s.disconnected ? 'danger' : 'ok'}>{s.disconnected ? 'Disconnected from Amazon DSP' : 'Reconnected to Amazon DSP'}</Chip>
        </p>
      </header>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel id="pub-fix" eyebrow="What to fix" title={s.failing.length ? s.failing.length + ' check(s) failing after the cut' : 'No check failing after the cut'}>
          {s.fixes.length ? (
            <ul className="space-y-2 text-sm">
              {s.fixes.map((f) => (
                <li key={f.check} className="rounded-lg border border-line bg-surface-2 p-3">
                  <p className="font-semibold text-ink">{f.label}</p>
                  <p className="text-xs text-ink-2">{s.failing.find((c) => c.check === f.check)?.detail}</p>
                  <p className="mt-1 text-xs text-accent-ink">Recommended fix: {f.fix}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">No failing check was found on your side. Your account team is checking the situation and will follow up.</p>
          )}
        </Panel>
        <Panel id="pub-time" eyebrow="Reconnection timeline" title="What happened, in order">
          <ol className="space-y-2 border-l border-line pl-4 text-xs">
            {s.timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" aria-hidden />
                <p className="num text-muted">{t.at ?? 'After the cut'}</p>
                <p className="text-ink-2">{t.what.replace(/ \(\d+\)$/, '')}</p>
              </li>
            ))}
            {s.disconnected && (
              <li className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-line-strong" aria-hidden />
                <p className="text-muted">Next</p>
                <p className="text-ink-2">{s.fixes.length ? 'Apply the fixes above; reconnection is requested once they are verified.' : 'Waiting for the account team.'}</p>
              </li>
            )}
          </ol>
          <p className="mt-2 text-[11px] text-muted">Checks: {Object.values(CHECK_LABEL).slice(0, 4).join(', ')}.</p>
        </Panel>
      </div>
      <ReadinessPanel groups={ready} />
    </div>
  );
};
