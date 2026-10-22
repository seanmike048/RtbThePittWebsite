import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, FileText, FlaskConical, LayoutGrid } from 'lucide-react';
import { cx, fieldClass, StateNote, table as tbl } from '../ui.tsx';
import { DATASETS } from '../../lib/pitt/data.ts';
import {
  AGE_BUCKETS, NO_FILTERS, PRIORITY_RULES, defaultFilters, applyFilters, bucketTotals, cohortSummary, cohortVariance, deriveRows, filterOptions, fmtCompact, fmtMoney, fmtNum, kpis, priorFilters,
  reconcile, riskTable, sankey, type Filters, type Kpi, type SortKey,
} from '../../lib/pitt/engine.ts';
import { useCases } from '../cases/CasesContext.tsx';
import { RunStrip } from '../cases/RunStrip.tsx';
import { RevenueVariance } from '../cases/RevenueVariance.tsx';
import { Chip, Panel, PriorityChip, Tip, useCountUp } from './bits.tsx';
import { SankeyFlow } from './SankeyFlow.tsx';
import { FunnelPanel } from './FunnelPanel.tsx';
import { WhatIfPanel } from './WhatIfPanel.tsx';
import { NetworkPage } from './NetworkPage.tsx';
import { PublisherView } from './PublisherView.tsx';
import { UseYourData } from './UseYourData.tsx';

type View = { page: 'room' } | { page: 'network'; networkId: number } | { page: 'data' };
const field = fieldClass('sm');

/** The Disconnection Room: one cohort (filters first), every section derived from engine.ts. */
export const RoomPage: React.FC = () => {
  const [dsId, setDsId] = useState(DATASETS[0].id);
  const ds = DATASETS.find((d) => d.id === dsId)!;
  const opts = useMemo(() => filterOptions(ds), [ds]);
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(DATASETS[0]));
  const [mode, setMode] = useState<'internal' | 'publisher'>('internal');
  const [view, setView] = useState<View>({ page: 'room' });
  const [sort, setSort] = useState<SortKey>('value');
  const [atRiskOnly, setAtRiskOnly] = useState(true);

  // Switching data set resets the cohort to that set's own date range.
  useEffect(() => {
    setFilters(defaultFilters(ds));
    setView({ page: 'room' });
  }, [ds]);

  const all = useMemo(() => deriveRows(ds), [ds]);
  const rows = useMemo(() => applyFilters(all, filters), [all, filters]);
  const pf = useMemo(() => priorFilters(filters), [filters]);
  const prior = useMemo(() => (pf ? applyFilters(all, pf) : null), [all, pf]);
  const k = useMemo(() => kpis(ds, rows, prior, filters, pf), [ds, rows, prior, filters, pf]);
  const flow = useMemo(() => sankey(rows), [rows]);
  const table = useMemo(() => riskTable(rows, sort, atRiskOnly), [rows, sort, atRiskOnly]);
  const buckets = useMemo(() => bucketTotals(rows), [rows]);
  const summary = cohortSummary(ds, rows, filters);

  // Reconciliation log, on load and whenever the cohort changes.
  useEffect(() => {
    const r = reconcile(ds, rows);
    (r.ok ? console.info : console.error)('[The Pitt · Disconnection Room] ' + ds.label + ' · ' + r.message, { sankey: r.sankey, kpi: r.kpi, table: r.table });
  }, [ds, rows]);

  const top = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [view, mode]);

  const set = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));
  const sym = ds.currency.symbol;
  const variance = useMemo(() => cohortVariance(rows), [rows]);
  const { run, go } = useCases();
  // A network of the real data set that is also a case of the current run opens its case file.
  const caseOf = (nid: number) => (ds.synthetic ? null : run.cases.find((c) => c.networkId === nid) ?? null);

  return (
    <div ref={top} className="scroll-mt-28 space-y-4">
      {ds.synthetic && (
        <div role="status" className="sticky top-[calc(env(safe-area-inset-top,0px)+7rem)] z-30 flex items-center gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn-ink">
          <FlaskConical className="h-4 w-4 shrink-0" aria-hidden /> Synthetic demo data. Every network, owner and figure in this view is generated (scenarios A, B, C); none is a real Equativ case.
        </div>
      )}

      {/* Header */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Amazon DSP · all endpoints</p>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Disconnection Room</h1>
            {mode === 'internal' && (
              <p className="num mt-0.5 text-xs text-muted">
                {summary.networks} networks · {summary.seats} Amazon seats · {summary.window} · data as of {ds.asOf}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Data
              <select className={field} value={dsId} onChange={(e) => setDsId(e.target.value)}>
                {DATASETS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <div role="radiogroup" aria-label="View" className="flex rounded-md border border-line p-0.5">
              {(['internal', 'publisher'] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cx('rounded px-2.5 py-1 text-xs font-medium cursor-pointer', mode === m ? 'bg-surface-2 text-ink shadow-sm' : 'text-muted hover:text-ink')}
                >
                  {m === 'internal' ? 'Internal view' : 'Publisher view'}
                </button>
              ))}
            </div>
            <button onClick={() => setView({ page: 'data' })} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-2 hover:text-ink cursor-pointer">
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> Use your data
            </button>
          </div>
        </div>

        {/* Filters: applied before every derivation. Hidden in the publisher view, which shows one network only. */}
        <div role="group" aria-label="Filters" hidden={mode === 'publisher'} className="flex flex-wrap items-end gap-2 border-y border-line py-3">
          <Sel label="Business unit" value={filters.businessUnit ?? ''} onChange={(v) => set({ businessUnit: v || null })} options={opts.businessUnits.map((b) => [b, b])} />
          <Sel label="Amazon partner" value={filters.partnerId?.toString() ?? ''} onChange={(v) => set({ partnerId: v ? Number(v) : null })} options={opts.partners.map((p) => [String(p.id), p.id + ' · ' + p.name.replace('Amazon DSP ', '')])} />
          <Sel label="Region" value={filters.region ?? ''} onChange={(v) => set({ region: v || null })} options={opts.regions.map((r) => [r, r])} />
          <Sel label="Priority" value={filters.priority ?? ''} onChange={(v) => set({ priority: (v || null) as Filters['priority'] })} options={[['P0', 'P0'], ['P1', 'P1'], ['P2', 'P2']]} />
          <Sel label="Status" value={filters.status ?? ''} onChange={(v) => set({ status: (v || null) as Filters['status'] })} options={[['disconnected', 'Still disconnected'], ['reconnected', 'Reconnected']]} />
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
            Cut from
            <input type="date" className={cx(field, 'num')} value={filters.from ?? ''} min={opts.minDate} max={opts.maxDate} onChange={(e) => set({ from: e.target.value || null })} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
            to
            <input type="date" className={cx(field, 'num')} value={filters.to ?? ''} min={opts.minDate} max={opts.maxDate} onChange={(e) => set({ to: e.target.value || null })} />
          </label>
          <button onClick={() => setFilters(NO_FILTERS)} className="h-8 rounded-md px-2 text-xs text-muted hover:text-ink cursor-pointer">
            Clear filters
          </button>
          <span className="ml-auto self-center">
            <Chip tone="warn" title={'P0: still disconnected and ≥ ' + PRIORITY_RULES.p0SpendMin + ' / week · P1: ≥ ' + PRIORITY_RULES.p1SpendMin + ' or revenue drop ≥ ' + PRIORITY_RULES.p1DropPct + '% · P2: still disconnected, revenue missing'}>
              Placeholder thresholds
            </Chip>
          </span>
        </div>
      </header>

      {view.page === 'data' ? (
        <UseYourData onBack={() => setView({ page: 'room' })} />
      ) : mode === 'publisher' ? (
        <PublisherView ds={ds} rows={rows} networkId={view.page === 'network' ? view.networkId : null} onPick={(id) => setView({ page: 'network', networkId: id })} />
      ) : view.page === 'network' ? (
        <NetworkPage ds={ds} networkId={view.networkId} onBack={() => setView({ page: 'room' })} />
      ) : (
        <>
          {!ds.synthetic && <RunStrip />}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-5" aria-label="Key figures">
            {k.map((x) => (
              <KpiCard key={x.id} k={x} symbol={sym} hasPrior={!!prior} />
            ))}
          </dl>
          <p className="text-[11px] text-muted">{ds.currency.note}</p>

          <Panel
            id="flow"
            eyebrow="Revenue at risk flow"
            title="Where the weekly spend sat before the cut"
            description={'Business unit → Amazon seat → network → primary failing check → status. "Still disconnected" equals the Revenue at risk KPI (' + fmtMoney(flow.stillDisconnected, sym) + ').'}
          >
            <SankeyFlow nodes={flow.nodes} links={flow.links} symbol={sym} undrawn={flow.undrawn} />
          </Panel>

          <Panel
            id="risk"
            eyebrow="Disconnection risk"
            title="Every cut seat, by days since the cut"
            aside={
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div role="radiogroup" aria-label="Sort" className="flex rounded-md border border-line p-0.5">
                  {(
                    [
                      ['age', 'Age'],
                      ['value', 'Value'],
                      ['az', 'A–Z'],
                    ] as const
                  ).map(([id, l]) => (
                    <button key={id} role="radio" aria-checked={sort === id} onClick={() => setSort(id)} className={cx('rounded px-2 py-0.5 cursor-pointer', sort === id ? 'bg-surface-2 text-ink' : 'text-muted')}>
                      {l}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-muted">
                  <input type="checkbox" checked={atRiskOnly} onChange={(e) => setAtRiskOnly(e.target.checked)} className="accent-[var(--accent)]" /> At-risk only
                </label>
              </div>
            }
          >
            <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-2 border-b border-divider pb-3" aria-label="Revenue at risk by age bucket">
              {buckets.map((b) => (
                <div key={b.id}>
                  <dt className="text-xs text-muted">{b.label === 'Current' ? 'Cut today' : b.label + ' days'}</dt>
                  <dd className="num text-sm text-ink">
                    <span className="font-semibold">{b.count ? fmtMoney(b.value, sym) : '—'}</span> <span className="text-xs text-muted">· {b.count} seat{b.count === 1 ? '' : 's'}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <caption className="sr-only">Disconnection risk table; select a row to open the network page.</caption>
                <thead>
                  <tr className={tbl.head}>
                    {['Publisher', 'Amazon partner', 'Bucket', 'Days', 'Revenue at risk', 'Priority', 'Risk', 'Owner'].map((h, i) => (
                      <th key={h} scope="col" className={cx('border-b border-line px-2 py-2 font-medium', [3, 4].includes(i) && 'text-right')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {table.map((r) => (
                    <tr key={r.key} className="cursor-pointer hover:bg-surface-2" onClick={() => setView({ page: 'network', networkId: r.NETWORK_ID })}>
                      <td className="px-2 py-2 align-top">
                        <button className="text-left font-semibold text-ink hover:underline cursor-pointer" onClick={(e) => (e.stopPropagation(), setView({ page: 'network', networkId: r.NETWORK_ID }))}>
                          {r.PUBLISHER}
                        </button>
                        <span className="num ml-1 text-muted">#{r.NETWORK_ID}</span>
                        <span className="block max-w-md truncate text-muted" title={r.reason}>
                          {r.reason}
                        </span>
                        {caseOf(r.NETWORK_ID) && (
                          <button className="mt-0.5 inline-flex items-center gap-1 text-accent-ink hover:underline cursor-pointer" onClick={(e) => (e.stopPropagation(), go('investigations', caseOf(r.NETWORK_ID)!.caseId))}>
                            <FileText className="h-3 w-3" aria-hidden /> Case file
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top text-ink-2">
                        <span className="num">{r.PARTNER_ID}</span> {r.PARTNER_NAME.replace('Amazon DSP ', '')}
                      </td>
                      <td className="px-2 py-2 align-top text-ink-2">{AGE_BUCKETS.find((b) => b.id === r.bucket)!.label}</td>
                      <td className="num px-2 py-2 text-right align-top text-ink-2">{r.days}</td>
                      <td className="num px-2 py-2 text-right align-top font-semibold text-ink">{r.RECONNECTED_AT ? <span className="font-normal text-ok-ink">Reconnected · {fmtMoney(r.SPEND_7D_BEFORE, sym)}</span> : fmtMoney(r.SPEND_7D_BEFORE, sym)}</td>
                      <td className="px-2 py-2 align-top">
                        <PriorityChip p={r.priority} />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Chip tone={r.risk === 'Critical' ? 'danger' : r.risk === 'High' ? 'warn' : r.risk === 'Watch' ? 'info' : 'neutral'}>{r.risk}</Chip>
                      </td>
                      <td className="px-2 py-2 align-top text-ink-2">{r.USERNAME ?? <span className="text-muted">{caseOf(r.NETWORK_ID) ? 'See action plan' : 'Not recorded'}</span>}</td>
                    </tr>
                  ))}
                  {!table.length && (
                    <tr>
                      <td colSpan={8} className="px-2 py-3">
                        <StateNote kind="empty" compact title="No seat matches the filters" action={<button onClick={() => setFilters(NO_FILTERS)} className="text-xs text-accent-ink hover:underline cursor-pointer">Clear filters</button>} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <FunnelPanel ds={ds} rows={rows} />
            <Panel id="variance" eyebrow="Revenue variance" title="What the cut removed from the weekly spend" description="Cohort of this view, in USD. Run rate and projections are per publisher.">
              <RevenueVariance
                additive
                caption={'Seats in the filtered cohort. ' + ds.currency.note}
                items={variance.map((v) => ({ ...v, state: v.value == null ? 'Unavailable' : 'Calculated' }))}
              />
            </Panel>
          </div>
          <WhatIfPanel ds={ds} rows={rows} symbol={sym} />
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Source: {ds.source}
          </p>
        </>
      )}
    </div>
  );
};

const Sel: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: (readonly [string, string])[] }> = ({ label, value, onChange, options }) => (
  <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
    {label}
    <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  </label>
);

const KpiCard: React.FC<{ k: Kpi; symbol: string; hasPrior: boolean }> = ({ k, symbol, hasPrior }) => {
  const v = useCountUp(k.value);
  const shown = k.value == null ? 'No data' : k.kind === 'money' ? fmtMoney(v, symbol) : fmtNum(v);
  const up = (k.delta ?? 0) > 0;
  // More disconnections, revenue at risk or failing checks is bad; more reconnected or saved is good.
  const good = k.id === 'reconnected' || k.id === 'saved' ? up : !up;
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="flex items-center gap-1 text-xs text-muted">
        {k.label}
        <Tip label={'Definition of ' + k.label}>{k.definition}</Tip>
      </dt>
      <dd className="num mt-1 text-xl font-semibold text-ink" aria-label={k.label + ': ' + (k.value == null ? 'No data' : k.kind === 'money' ? fmtMoney(k.value, symbol) : fmtNum(k.value))}>
        {shown}
      </dd>
      {k.sub && <dd className="text-[11px] text-muted">{k.sub}</dd>}
      <dd className="num mt-1 flex items-center gap-1 text-[11px]">
        {!hasPrior || k.delta == null ? (
          <span className="text-muted">No prior period</span>
        ) : k.delta === 0 ? (
          <span className="text-muted">= prior period</span>
        ) : (
          <span className={good ? 'text-ok-ink' : 'text-danger-ink'}>
            {up ? <ArrowUp className="inline h-3 w-3" aria-hidden /> : <ArrowDown className="inline h-3 w-3" aria-hidden />}
            {k.kind === 'money' ? fmtMoney(Math.abs(k.delta), symbol) : fmtCompact(Math.abs(k.delta))} vs prior period
          </span>
        )}
      </dd>
    </div>
  );
};

