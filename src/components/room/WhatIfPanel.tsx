import React, { useMemo, useState } from 'react';
import { CHECK_LABEL, CHECK_ORDER, PRIORITY_RULES, fmtMoney, fmtNum, whatIf, type Row } from '../../lib/pitt/engine.ts';
import type { CheckName, Dataset } from '../../lib/pitt/types.ts';
import { Chip, Panel } from './bits.tsx';

/** What-if: fix some checks (or the top N fixable networks) and see the projected recovery. Projection, not a forecast. */
export const WhatIfPanel: React.FC<{ ds: Dataset; rows: Row[]; symbol: string }> = ({ ds, rows, symbol }) => {
  const [mode, setMode] = useState<'checks' | 'count'>('checks');
  const [fix, setFix] = useState<CheckName[]>([]);
  const [n, setN] = useState(0);
  const base = useMemo(() => whatIf(ds, rows, [], null), [ds, rows]);
  const r = useMemo(() => (mode === 'checks' ? whatIf(ds, rows, fix, null) : whatIf(ds, rows, [], n)), [ds, rows, fix, n, mode]);
  return (
    <Panel id="whatif" eyebrow="What-if" title="If these were fixed and the seats reconnected" aside={<Chip tone="warn">Projection, not a forecast</Chip>}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-3 text-xs">
          <div role="radiogroup" aria-label="What-if mode" className="flex w-fit rounded-md border border-line p-0.5">
            {(
              [
                ['checks', 'Fix checks'],
                ['count', 'Networks fixed'],
              ] as const
            ).map(([id, l]) => (
              <button key={id} role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={'rounded px-2 py-0.5 cursor-pointer ' + (mode === id ? 'bg-surface-2 text-ink' : 'text-muted')}>
                {l}
              </button>
            ))}
          </div>
          {mode === 'checks' ? (
            <fieldset className="space-y-1.5">
              <legend className="sr-only">Checks to fix</legend>
              {CHECK_ORDER.map((c) => (
                <label key={c} className="flex items-center gap-2 text-ink-2">
                  <input type="checkbox" className="accent-[var(--accent)]" checked={fix.includes(c)} onChange={(e) => setFix(e.target.checked ? [...fix, c] : fix.filter((x) => x !== c))} /> Fix {CHECK_LABEL[c]}
                </label>
              ))}
              <p className="text-muted">A network counts as fixed when every check failing after its cut is ticked.</p>
            </fieldset>
          ) : (
            <label className="block text-ink-2">
              Networks fixed: <span className="num font-semibold text-ink">{n}</span> of {base.fixableNetworks} with a failing check
              <input type="range" min={0} max={base.fixableNetworks} value={Math.min(n, base.fixableNetworks)} onChange={(e) => setN(Number(e.target.value))} className="mt-1 block w-full accent-[var(--accent)]" />
              <span className="text-muted">Highest revenue at risk first.</span>
            </label>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <Stat k="Networks fixed" v={String(r.fixedNetworks)} />
          <Stat k="Projected recovery if fixed" v={fmtMoney(r.recovered, symbol) + (r.recovered != null ? ' / wk' : '')} />
          <Stat k="P0 seats" v={r.p0Before + ' → ' + r.p0After} />
          <Stat k="P0 that become P2" v={String(r.p0ToP2)} />
          <div className="col-span-2 rounded-lg border border-line bg-surface-2 p-2 sm:col-span-2">
            <dt className="text-muted">Priority changes</dt>
            <dd className="num mt-0.5 text-ink-2">{Object.keys(r.transitions).length ? Object.entries(r.transitions).map(([t, c]) => c + ' × ' + t).join(' · ') : 'None'}</dd>
          </div>
        </dl>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Projection, not a forecast: fixed networks are treated as reconnected at their pre-cut weekly spend, and priorities are recomputed with the same placeholder rules. A reconnected P0 seat with spend ≥ {fmtNum(PRIORITY_RULES.p1SpendMin)} lands in P1, so "P0 that become P2" stays at 0 unless the rules change.
      </p>
    </Panel>
  );
};

const Stat: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="rounded-lg border border-line bg-surface-2 p-2">
    <dt className="text-muted">{k}</dt>
    <dd className="num mt-0.5 text-base font-semibold text-ink">{v}</dd>
  </div>
);
