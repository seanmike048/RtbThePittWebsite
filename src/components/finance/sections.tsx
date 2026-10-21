/** Chart sections of the financial impact page, in the brief's priority order. */
import React, { useMemo, useState } from 'react';
import { CircleDashed, CircleDot } from 'lucide-react';
import type { ScopeKey } from '../../lib/finance/assumptions.ts';
import { networkSeries, seatSeries, type CaseData, type PortfolioDay } from '../../lib/finance/baseline.ts';
import { cashFlow, NOT_REACHED } from '../../lib/finance/cashflow.ts';
import { unitLabel, WAREHOUSE_SPEND } from '../../lib/finance/currency.ts';
import { effortSummary, EFFORT_TASKS } from '../../lib/finance/effort.ts';
import { ALERT_SEAT_REVENUE, BLOCKING_REASON, cutEpisodes, reconcileRevenue } from '../../lib/finance/evidence.ts';
import { rpmbr } from '../../lib/finance/metrics.ts';
import { queries } from '../../lib/finance/provenance.ts';
import { addDays, tornado, type ScenarioInputs } from '../../lib/finance/scenario.ts';
import { BASELINE_437_SEP, COHORT_437, EPISODES_5100, FUNNEL_437_SEP, PRE_CUT_FULL_DAYS } from '../../lib/finance/snapshot.data.ts';
import { num, showVal } from '../../lib/finance/values.ts';
import { WORKBOOK_ROWS, isVisible } from '../../lib/cfo437/publishers.ts';
import { Badge, Card, cx, EmptyNote } from '../ui.tsx';
import { ChartFrame, compactNum, HBars, LegendKey, LineChart, Tornado, Waterfall, type Classification, type Series } from './charts.tsx';
import type { ViewModel } from './model.ts';

export const SCU = unitLabel(WAREHOUSE_SPEND, true);
export const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const int = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (n: number, d = 1) => `${n.toFixed(d)}%`;
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const SCOPE_LABEL: Record<ScopeKey, string> = {
  portfolio: 'Amazon DSP · partner 437 (AMER Display B) · visible BOTH + INTERMEDIARY networks',
  case: 'Network 5100 Tubi TV STR · Amazon seats 491 (Video B) + 492 (CTV B) · 437, 489, 490 had no activity',
};

const FRESH = 'Snowflake read 2026-10-21 01:59 UTC · complete through 2026-10-19';

export function scenarioClass(approval: string, ok: boolean): Classification {
  if (!ok) return 'Unavailable';
  return approval === 'illustrative' ? 'Scenario · illustrative' : 'Scenario · user-entered';
}

/* ------------------------------------------------------------- P0 spend after resolution */

export const SpendAfterResolution: React.FC<{ vm: ViewModel; approval: string }> = ({ vm, approval }) => {
  const ok = vm.result?.status === 'ok';
  const series: Series[] = [
    { id: 'obs', label: 'Observed', values: vm.chart.observed, color: 'ink' },
    { id: 'base', label: 'No intervention', values: vm.chart.noIntervention, color: 'muted', dash: '6 4' },
  ];
  if (ok) {
    series.push({ id: 'cond', label: 'If resolved', values: vm.chart.conditional, color: 'viz1', dash: '8 4' });
    series.push({ id: 'exp', label: 'Expected', values: vm.chart.expected, color: 'viz2', dash: '2 3' });
  }
  const rows = vm.chart.days
    .map((d, i) => [d, vm.chart.observed[i], vm.chart.noIntervention[i], vm.chart.conditional[i], vm.chart.expected[i]] as const)
    .filter(r => r.slice(1).some(v => v !== null))
    .map(([d, o, b, c, e]) => [d, o === null ? (d <= vm.dataThrough ? 'Missing' : '—') : money(o), b === null ? '—' : money(b), c === null ? '—' : money(c), e === null ? '—' : money(e)]);
  return (
    <ChartFrame
      id="fa-spend"
      priority="P0"
      title="Spend after resolution"
      question="What would daily spend look like with no intervention, if an approved fix succeeds, and weighted by the chance it succeeds?"
      scope={SCOPE_LABEL[vm.scope]}
      period={`2026-09-06 → ${vm.chart.days[vm.chart.days.length - 1]} (UTC days)`}
      unit={`${SCU} per day`}
      freshness={FRESH}
      classification={ok ? scenarioClass(approval, ok) : 'Measured'}
      queries={queries(vm.scope === 'portfolio' ? 'daily437Visible' : 'seatDaily5100', vm.scope === 'portfolio' ? 'coverageSco' : 'networkDaily')}
      sourceNote={
        vm.scope === 'portfolio'
          ? 'Observed = DAY_SCO_NODES spend for networks whose current sellers.json type is BOTH or INTERMEDIARY. No intervention = same-weekday mean of the last 28 days (run-rate scenario, not a forecast).'
          : 'Observed = DAY_SCO_NODES spend for seats 491 + 492 on network 5100. Days without any network-5100 row are missing, not zero. No intervention = seats stay disconnected (0), an explicit assumption.'
      }
      table={{ columns: [{ label: 'Day' }, { label: 'Observed', right: true }, { label: 'No intervention', right: true }, { label: 'If resolved', right: true }, { label: 'Expected', right: true }], rows }}
      state={vm.baselineError ? { kind: 'unavailable', message: vm.baselineError } : undefined}
    >
      <LineChart
        days={vm.chart.days}
        series={series}
        marker={ok && vm.window ? { day: vm.window.from, label: 'Proposed resolution' } : { day: vm.firstProjectedDay, label: 'Projection starts' }}
        format={n => `${money(n)} ${SCU}`}
        label="Daily spend: observed, no intervention, conditional and expected"
      />
      {!ok && (
        <p className="mt-2 text-xs text-muted">
          Conditional and expected lines appear once the assumptions are complete. Until then only observed spend and the no-intervention run rate are shown.
        </p>
      )}
    </ChartFrame>
  );
};

/* ------------------------------------------------------------- P0 cumulative incremental */

export const CumulativeIncremental: React.FC<{ vm: ViewModel; approval: string }> = ({ vm, approval }) => {
  const ok = vm.result?.status === 'ok' && vm.window;
  const idx = vm.chart.days.map((d, i) => [d, i] as const).filter(([d]) => vm.window && d >= vm.window.from && d < vm.window.to);
  const days = idx.map(([d]) => d);
  const values = idx.map(([, i]) => vm.chart.cumulative[i]);
  return (
    <ChartFrame
      id="fa-cumulative"
      priority="P0"
      title="Cumulative incremental spend"
      question="How much more spend does the expected scenario add than doing nothing, at the same scope and dates?"
      scope={SCOPE_LABEL[vm.scope]}
      period={vm.window ? `${vm.window.from} → ${addDays(vm.window.to, -1)} (${vm.horizonDays} days)` : 'Needs a resolution date'}
      unit={SCU}
      freshness={FRESH}
      classification={scenarioClass(approval, !!ok)}
      queries={queries(vm.scope === 'portfolio' ? 'daily437Visible' : 'seatDaily5100')}
      sourceNote="Σ (expected − no intervention) per day = Σ p × (S1 − S0). Gross cumulative spend is never relabelled as uplift."
      state={!ok ? { kind: 'unavailable', message: 'Unavailable until the scenario inputs are complete. Nothing is drawn from blank assumptions.' } : undefined}
      table={{ columns: [{ label: 'Day' }, { label: `Cumulative expected incremental (${SCU})`, right: true }], rows: days.map((d, i) => [d, values[i] === null ? '—' : money(values[i]!)]) }}
    >
      <LineChart days={days} series={[{ id: 'cum', label: 'Cumulative expected incremental', values, color: 'viz2', dash: '2 3' }]} format={n => `${money(n)} ${SCU}`} label="Cumulative expected incremental spend" zeroLine />
    </ChartFrame>
  );
};

/* ------------------------------------------------------------- P0 volume / yield waterfall */

export const VolumeYield: React.FC<{ vm: ViewModel; approval: string; mode: ScenarioInputs['mode'] }> = ({ vm, approval, mode }) => {
  const d = vm.decomposition;
  const spendGap = mode === 'spend-gap';
  return (
    <ChartFrame
      id="fa-waterfall"
      priority="P0"
      title="Volume and yield attribution"
      question="Of the conditional uplift, how much comes from restored bid requests, from yield, and from the two together?"
      scope={SCOPE_LABEL[vm.scope]}
      period={vm.window ? `${vm.window.from} → ${addDays(vm.window.to, -1)}` : '—'}
      unit={SCU}
      freshness={FRESH}
      classification={scenarioClass(approval, !!d)}
      queries={queries('daily437Visible')}
      sourceNote="Volume = (B1 − B0) × Y0 / 1e6 · Yield = B0 × (Y1 − Y0) / 1e6 · Interaction = (B1 − B0) × (Y1 − Y0) / 1e6. Their sum equals S1 − S0 (conditional, before p)."
      state={
        spendGap
          ? { kind: 'unavailable', message: 'Disabled in spend-gap mode: the case has only a spend comparator, so volume and yield cannot be separated.' }
          : !d
            ? { kind: 'unavailable', message: 'Unavailable until the scenario inputs are complete.' }
            : undefined
      }
      table={d ? { columns: [{ label: 'Component' }, { label: SCU, right: true }], rows: [['Volume', money(d.volume)], ['Yield', money(d.yield)], ['Interaction', money(d.interaction)], ['Conditional uplift (S1 − S0)', money(d.total)], ['Check: sum − total', money(d.volume + d.yield + d.interaction - d.total)]] } : undefined}
    >
      {d && (
        <>
          <Waterfall steps={[{ label: 'Volume', value: d.volume }, { label: 'Yield', value: d.yield }, { label: 'Interaction', value: d.interaction }]} totalLabel="Conditional uplift" format={n => compactNum(n)} label="Volume, yield and interaction add up to the conditional uplift" />
          <p className="mt-2 text-xs text-muted">
            Reconciles to <span className="num text-ink">{money(d.total)}</span> {SCU}; difference{' '}
            <span className="num">{money(d.volume + d.yield + d.interaction - d.total)}</span>.
          </p>
        </>
      )}
    </ChartFrame>
  );
};

/* ------------------------------------------------------------- P0 baseline / current / scenario */

export const PeriodComparison: React.FC<{ vm: ViewModel; portfolio: PortfolioDay[]; caseData: CaseData; approval: string }> = ({ vm, portfolio, caseData, approval }) => {
  const ok = vm.result?.status === 'ok' && vm.window ? vm.result : null;
  const sel = ok ? ok.rows.filter(r => r.day >= vm.window!.from && r.day < vm.window!.to) : [];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  type P = { label: string; coverage: string; spend: number | null; br: number | null; tone: 'muted' | 'ink' | 'viz2'; hatched?: boolean };
  let periods: P[];
  if (vm.scope === 'portfolio') {
    const last = portfolio.slice(-28);
    periods = [
      { label: 'Baseline · Sep 2026 (monthly ÷ 30)', coverage: '30 days, MONTH_SCO_NODES', spend: BASELINE_437_SEP.spend / 30, br: BASELINE_437_SEP.bidRequests / 30, tone: 'muted' },
      { label: `Current · ${last[0].day} → ${last[last.length - 1].day}`, coverage: `${last.length} complete days, DAY_SCO_NODES`, spend: mean(last.map(d => d.spend!)), br: mean(last.map(d => d.bidRequests!)), tone: 'ink' },
      { label: 'Scenario · if resolved, horizon mean', coverage: ok ? `${sel.length} projected days` : 'Unavailable', spend: ok ? mean(sel.map(r => r.S1)) : null, br: ok ? mean(sel.map(r => r.B1!)) : null, tone: 'viz2', hatched: true },
    ];
  } else {
    const s492 = seatSeries(492, '2026-09-26', vm.dataThrough, caseData);
    const since = seatSeries(491, '2026-09-26', vm.dataThrough, caseData).map((d, i) => [d, s492[i]] as const);
    const obs = since.filter(([a, b]) => a.spend !== null && b.spend !== null);
    const pre = PRE_CUT_FULL_DAYS[491].spend + PRE_CUT_FULL_DAYS[492].spend;
    periods = [
      { label: 'Baseline · full days Sep 18–24', coverage: '7 days, DAY_DEMAND', spend: pre / 7, br: null, tone: 'muted' },
      { label: `Current · Sep 26 → ${obs.length ? obs[obs.length - 1][0].day.slice(5) : '—'}`, coverage: `${obs.length} observed days; ${since.length - obs.length} missing`, spend: mean(obs.map(([a, b]) => a.spend! + b.spend!)), br: mean(obs.map(([a, b]) => a.bidRequests! + b.bidRequests!)), tone: 'ink' },
      { label: 'Scenario · if resolved, horizon mean', coverage: ok ? `${sel.length} projected days` : 'Unavailable', spend: ok ? mean(sel.map(r => r.S1)) : null, br: null, tone: 'viz2', hatched: true },
    ];
  }
  const yieldOf = (p: P) => (p.spend !== null && p.br !== null ? rpmbr(p.spend, p.br) : null);
  const metric = (title: string, unit: string, pick: (p: P) => number | null, fmtN: (n: number) => string) => {
    const vals = periods.map(pick);
    return (
      <div className="min-w-0 rounded-xl border border-line p-3">
        <p className="text-xs font-semibold text-ink">{title}</p>
        <p className="text-[11px] text-muted">{unit}</p>
        <div className="mt-3">
          <HBars
            stacked
            label={title}
            rows={periods.map((p, i) => ({ label: p.label, value: vals[i], display: vals[i] === null ? 'Unavailable' : fmtN(vals[i]!), tone: p.tone, hatched: p.hatched, note: p.coverage }))}
          />
        </div>
      </div>
    );
  };
  return (
    <ChartFrame
      id="fa-periods"
      priority="P0"
      title="Baseline, current and scenario"
      question="How do daily spend, bid requests and pooled RPMBr compare before, now and under the scenario?"
      scope={SCOPE_LABEL[vm.scope]}
      period="Per-day means; each period's coverage is shown under its value"
      unit="Separate units per panel"
      freshness={FRESH}
      classification={ok ? scenarioClass(approval, true) : 'Measured'}
      queries={queries(...(vm.scope === 'portfolio' ? ['baseline437', 'daily437Visible'] : ['preCutWindow', 'seatDaily5100']))}
      sourceNote="Three panels with their own axes, never a mixed-unit axis. Pooled RPMBr = Σ spend ÷ Σ bid requests × 1,000,000."
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {metric('Spend per day', SCU, p => p.spend, money)}
        {metric('Bid requests per day', 'bid requests', p => p.br, compactNum)}
        {metric('Pooled RPMBr', `${SCU} per 1M bid requests`, p => {
          const y = yieldOf(p);
          return y && y.kind !== 'unavailable' && y.kind !== 'missing' && y.kind !== 'excluded' ? num(y) : null;
        }, n => n.toFixed(2))}
      </div>
      {vm.scope === 'case' && <p className="mt-2 text-xs text-muted">The baseline week has no bid-request split here (DAY_DEMAND has no bid requests); since the cut, bid requests are 0 and RPMBr is undefined, not zero.</p>}
    </ChartFrame>
  );
};

/* ------------------------------------------------------------- P0 incident timeline */

export const IncidentTimeline: React.FC = () => {
  const cuts = cutEpisodes();
  const cut = cuts[0];
  const priorStarts = EPISODES_5100.filter(e => e.reason === 0 && cuts.some(c => c.partnerId === e.partnerId && c.start === e.end)).map(e => e.start.slice(0, 10)).sort();
  const items: { label: string; at: string | null; detail: string; known: boolean }[] = [
    { label: 'Prior connected state', at: priorStarts.length ? `from ${priorStarts[0]} … ${priorStarts[priorStarts.length - 1]}` : null, detail: `Connected (reason 0) with comments “${[...new Set(cuts.map(c => c.priorComment))].join('”, “')}”.`, known: true },
    { label: 'Disconnection', at: cut ? `${cut.start.slice(0, 19)} (zone not documented)` : null, detail: `${cuts.length} seats → reason ${cut?.reason} “${BLOCKING_REASON[cut?.reason ?? 1]}”, comment “${cut?.comment}”, by ${cut?.by}.`, known: !!cut },
    { label: 'Detection by The Pitt', at: null, detail: 'Unknown: the workflow output has no execution ID or timestamps.', known: false },
    { label: 'Investigation approved', at: null, detail: '“Human approval completed.” No approval timestamp was supplied.', known: false },
    { label: 'Action taken', at: null, detail: 'None recorded. The publisher draft was not sent; internal actions were routed to TechOps, Partnerships and the KAM.', known: false },
    { label: 'Reconnection', at: null, detail: 'None: all five intervals are still open in the connection log read on 2026-10-21.', known: false },
    { label: 'Sustained recovery', at: null, detail: 'Not applicable until a reconnection exists.', known: false },
  ];
  return (
    <ChartFrame
      id="fa-timeline"
      priority="P0"
      title="Incident timeline"
      question="When did each step of this case happen, and which timestamps are still unknown?"
      scope="Network 5100 × Amazon variants 437, 489, 490, 491, 492 (one case, five seats)"
      period="2026-02-10 → 2026-10-21"
      unit="Timestamps as written"
      freshness="Connection log read 2026-10-21"
      classification="Measured"
      queries={queries('episodes5100')}
      sourceNote="Unknown timestamps stay unknown; none is filled from the narrative or assumed to be UTC."
    >
      <ol className="relative space-y-4 border-l border-line pl-5">
        {items.map(it => (
          <li key={it.label} className="relative">
            <span className="absolute -left-[27px] top-0.5 rounded-full bg-surface">
              {it.known ? <CircleDot className="h-4 w-4 text-ink-2" /> : <CircleDashed className="h-4 w-4 text-faint" />}
            </span>
            <p className="text-sm font-medium text-ink">
              {it.label}{' '}
              <span className={cx('num ml-1 text-xs', it.known ? 'text-ink-2' : 'italic text-muted')}>{it.at ?? 'Unknown'}</span>
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted [overflow-wrap:anywhere]">{it.detail}</p>
          </li>
        ))}
      </ol>
    </ChartFrame>
  );
};

/* ------------------------------------------------------------- P0 effort */

export const EffortByTask: React.FC = () => {
  const e = effortSummary(EFFORT_TASKS);
  return (
    <ChartFrame
      id="fa-effort"
      priority="P0"
      title="Effort saved by task"
      question="How many active minutes does each investigation task take manually versus with The Pitt, and what is released per role?"
      scope="Per investigation (one case = one investigation, whatever the seat count)"
      period="—"
      unit="Active minutes; net hours"
      freshness="No effort source"
      classification="Unavailable"
      queries={[]}
      sourceNote="Workflow runtime is not human effort. Net hours released = manual touch hours − Pitt-assisted touch hours; negative savings are kept."
      state={{
        kind: 'unavailable',
        message: (
          <>
            Net hours released are unavailable: none of the {e.per.length} tasks has measured or assumed minutes. Needed: active minutes by role and task for matched manual and
            Pitt-assisted cases, including review, rework and follow-up.
            <span className="mt-2 block not-italic">
              {e.per.map(t => (
                <span key={t.task} className="mr-2 mt-1 inline-block rounded-lg border border-line bg-surface px-2 py-0.5 text-xs text-ink-2">
                  {t.task} · {t.role}
                </span>
              ))}
            </span>
          </>
        ),
      }}
    />
  );
};

/* ------------------------------------------------------------- P1 scope reconciliation */

export const ScopeReconciliation: React.FC<{ reported: number | null }> = ({ reported }) => {
  const r = reconcileRevenue(reported);
  const max = Math.max(...ALERT_SEAT_REVENUE.map(s => s.amount));
  return (
    <ChartFrame
      id="fa-scope"
      priority="P1"
      title="Scope reconciliation: why 16,037 is not endpoint-437 exposure"
      question="Which Amazon seat and format carries the case's seven-day revenue, and how much of it belongs to endpoint 437 Display?"
      scope="Network 5100 × Amazon variants; compared with the 437 Display portfolio"
      period="Alert-view window: UTC days 2026-09-19 → 2026-09-25 (includes the partial cut day)"
      unit={SCU}
      freshness="Alert view and DAY_DEMAND read 2026-10-20 / 21"
      classification="Measured"
      queries={queries('alertDdl', 'preCutWindow', 'seatDaily5100')}
      sourceNote={r.window.alertView}
      table={{
        columns: [{ label: 'Seat' }, { label: 'Format' }, { label: `Alert window (${SCU})`, right: true }],
        rows: [...ALERT_SEAT_REVENUE.map(s => [`${s.partnerId} ${s.name}`, s.format, money(s.amount)]), ['Detailed sum', '', money(r.detailed)], ['Sum of displayed values', '', money(r.displayedSum)], ['Workflow (rounded)', '', reported === null ? '—' : int(reported)]],
      }}
    >
      <HBars
        label="Seven-day revenue by seat"
        max={max}
        rows={ALERT_SEAT_REVENUE.map(s => ({ label: `${s.partnerId} · ${s.name}`, value: s.amount, display: money(s.amount), tone: s.partnerId === 437 ? 'ink' : 'muted', note: s.partnerId === 437 ? 'Endpoint 437 Display: no activity on 5100' : s.format }))}
      />
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-lg bg-surface-2 p-3">
          <p className="text-muted">11,267.01 + 4,770.19</p>
          <p className="num mt-0.5 text-sm font-semibold text-ink">{money(r.displayedSum)}</p>
          <p className="text-muted">Workflow says {reported === null ? '—' : int(reported)}: the detailed {money(r.detailed)} rounded; difference {money(r.roundingDifference ?? 0)}.</p>
        </div>
        <div className="rounded-lg bg-surface-2 p-3">
          <p className="text-muted">Full UTC days Sep 18–24</p>
          <p className="num mt-0.5 text-sm font-semibold text-ink">{money(r.window.fullDays.amount)}</p>
          <p className="text-muted">Same seats, a different window. Kept separate, not swapped in.</p>
        </div>
        <div className="rounded-lg border border-ok/25 bg-ok-soft p-3">
          <p className="text-ok-ink">Endpoint 437 Display share</p>
          <p className="num mt-0.5 text-sm font-semibold text-ink">0.00</p>
          <p className="text-muted">The case adds nothing to the 437 portfolio.</p>
        </div>
      </div>
    </ChartFrame>
  );
};

/* ------------------------------------------------------------- P1 funnel */

export const Funnel: React.FC = () => {
  const f = FUNNEL_437_SEP;
  const stages = [
    { label: 'Bid requests', v: f.bidRequests },
    { label: 'Bids', v: f.bids },
    { label: 'Wins (RTB impressions)', v: f.wins },
    { label: 'Billed impressions', v: f.impressions },
  ];
  return (
    <ChartFrame
      id="fa-funnel"
      priority="P1"
      title="Funnel, endpoint 437, September 2026"
      question="Where does volume fall away between bid requests and billed impressions?"
      scope="Partner 437, all 861 networks (not only the visible view); impression type 0 (Banner) only"
      period="September 2026"
      unit="Counts"
      freshness="MONTH_SCO_NODES read 2026-10-21"
      classification="Measured"
      queries={queries('funnel437', 'mix437')}
      sourceNote={`Auctions (${compactNum(f.auctions)}) are left out: the count is lower than bids, so it is not on the same grain as this partner-level funnel. Eligible bids are not available.`}
      table={{ columns: [{ label: 'Stage' }, { label: 'Count', right: true }, { label: 'Of previous', right: true }], rows: stages.map((s, i) => [s.label, int(s.v), i ? pct((s.v / stages[i - 1].v) * 100, 2) : '—']) }}
    >
      <HBars label="Funnel stages" rows={stages.map((s, i) => ({ label: s.label, value: s.v, display: compactNum(s.v), note: i ? `${pct((s.v / stages[i - 1].v) * 100)} of previous` : undefined }))} />
      <p className="mt-3 text-xs text-muted">
        Spend {money(f.spend)} {SCU} → pooled RPMBr {(num(rpmbr(f.spend, f.bidRequests)) ?? 0).toFixed(2)} across all rows.
      </p>
    </ChartFrame>
  );
};

/* ------------------------------------------------------------- P1 supply paths */

export const SupplyPaths: React.FC<{ caseData: CaseData; dataThrough: string }> = ({ caseData, dataThrough }) => {
  const from = '2026-09-06';
  const n5100 = networkSeries(5100, from, dataThrough, caseData);
  const n5524 = networkSeries(5524, from, dataThrough, caseData);
  const days = n5100.map(d => d.day);
  const panels: { title: string; values: (number | null)[]; color: 'ink' | 'muted' }[] = [
    { title: '#5100 Tubi TV STR · Amazon variants', values: n5100.map(d => num(d.amazon)), color: 'ink' },
    { title: '#5100 Tubi TV STR · all DSPs', values: n5100.map(d => num(d.allDsp)), color: 'muted' },
    { title: '#5524 Tubi · Amazon variants', values: n5524.map(d => num(d.amazon)), color: 'ink' },
    { title: '#5524 Tubi · all DSPs', values: n5524.map(d => num(d.allDsp)), color: 'muted' },
  ];
  return (
    <ChartFrame
      id="fa-paths"
      priority="P1"
      title="Supply-path comparison"
      question="Did spend on the related network move when Amazon left #5100, and did #5100 lose other demand too?"
      scope="Networks 5100 and 5524; Amazon = partners 437, 489–492; all DSPs = every partner"
      period={`${from} → ${dataThrough}`}
      unit={`${SCU} per day; each panel has its own axis`}
      freshness={FRESH}
      classification="Measured"
      queries={queries('networkDaily')}
      sourceNote="DAY_DEMAND spend at one row per day and network. The native supply-grain query (DAY_SUPPLY) failed with a timeout, so auctions are not shown. Publisher identity and inventory overlap between 5100 and 5524 are not verified."
      table={{ columns: [{ label: 'Day' }, ...panels.map(p => ({ label: p.title, right: true }))], rows: days.map((d, i) => [d, ...panels.map(p => (p.values[i] === null ? 'Missing' : money(p.values[i]!)))]) }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {panels.map(p => (
          <div key={p.title} className="min-w-0">
            <p className="text-xs font-medium text-ink-2">{p.title}</p>
            <LineChart compact height={170} days={days} series={[{ id: p.title, label: p.title, values: p.values, color: p.color }]} marker={{ day: '2026-09-25', label: 'Cut' }} format={n => `${money(n)} ${SCU}`} label={p.title} />
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn-ink">
        No migration conclusion. #5100 all-DSP spend also fell after the cut and the network has no rows after 2026-10-14 (shown as gaps), while #5524 all-DSP spend rose with Amazon near zero there. Neither
        pattern shows that #5524 received #5100's Amazon spend; it is not credited to recovery or to The Pitt.
      </div>
    </ChartFrame>
  );
};

/* ------------------------------------------------------------- P1 Pareto */

export const Pareto: React.FC = () => {
  const visible = WORKBOOK_ROWS.filter(isVisible);
  const sorted = [...visible].sort((a, b) => b.spend - a.spend);
  const total = sorted.reduce((a, r) => a + Math.max(r.spend, 0), 0);
  const positive = sorted.filter(r => r.spend > 0);
  const zero = sorted.filter(r => r.spend === 0).length;
  const negative = sorted.filter(r => r.spend < 0).length;
  const shown = positive.slice(0, 40);
  let c = 0;
  const cum = positive.map(r => (c += r.spend) / total);
  const W = 720;
  const top = { h: 90, t: 8 };
  const bot = { h: 120, t: 116 };
  const P = { l: 48, r: 8 };
  const slot = (W - P.l - P.r) / shown.length;
  const maxS = shown[0]?.spend ?? 1;
  const [hover, setHover] = useState<number | null>(null);
  const top16 = cum[15] ?? null;
  return (
    <ChartFrame
      id="fa-pareto"
      priority="P1"
      title="Publisher spend concentration"
      question="How concentrated is endpoint-437 spend across publishers?"
      scope="Workbook rows, visible BOTH + INTERMEDIARY selection (316 rows)"
      period="September 2026"
      unit={`${SCU}; cumulative share in %`}
      freshness="Workbook read through Google Drive, 2026-10-20"
      classification="Measured"
      queries={queries('baseline437')}
      sourceNote={`Two panels on separate axes (no dual axis). ${positive.length} positive, ${zero} zero, ${negative} negative spend rows; zero and negative rows are not part of the curve. Top 40 of ${positive.length} positive rows are drawn.`}
      table={{ columns: [{ label: 'Rank' }, { label: 'Publisher' }, { label: `Spend (${SCU})`, right: true }, { label: 'Cumulative share', right: true }], rows: shown.map((r, i) => [i + 1, `${r.publisherName} (${r.publisherId})`, money(r.spend), pct(cum[i] * 100)]) }}
    >
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-2">
        <span>
          Top 16 share <strong className="num text-ink">{top16 === null ? '—' : pct(top16 * 100, 2)}</strong>
        </span>
        <span>
          Zero-spend rows <strong className="num text-ink">{zero}</strong>
        </span>
        <span>
          Negative rows <strong className="num text-ink">{negative}</strong>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} 250`} className="h-auto w-full" role="img" aria-label="Cumulative share (top) and spend per publisher (bottom)" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map(t => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={top.t + top.h * (1 - t)} y2={top.t + top.h * (1 - t)} className="stroke-line" />
            <text x={P.l - 6} y={top.t + top.h * (1 - t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {t * 100}%
            </text>
          </g>
        ))}
        <path d={shown.map((_, i) => `${i ? 'L' : 'M'}${P.l + slot * i + slot / 2},${top.t + top.h * (1 - cum[i])}`).join(' ')} fill="none" className="stroke-viz-1" strokeWidth={2} />
        {[0, 0.5, 1].map(t => (
          <g key={`b${t}`}>
            <line x1={P.l} x2={W - P.r} y1={bot.t + bot.h * (1 - t)} y2={bot.t + bot.h * (1 - t)} className="stroke-line" />
            <text x={P.l - 6} y={bot.t + bot.h * (1 - t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {compactNum(maxS * t)}
            </text>
          </g>
        ))}
        {shown.map((r, i) => (
          <g key={r.publisherId} onMouseEnter={() => setHover(i)}>
            <rect x={P.l + slot * i + 1} y={bot.t + bot.h * (1 - r.spend / maxS)} width={Math.max(1, slot - 2)} height={bot.h * (r.spend / maxS)} rx={2} className={hover === i ? 'fill-viz-1' : 'fill-muted'} />
            <rect x={P.l + slot * i} y={top.t} width={slot} height={bot.t + bot.h - top.t} fill="transparent" />
          </g>
        ))}
        <line x1={P.l + slot * 16} x2={P.l + slot * 16} y1={top.t} y2={bot.t + bot.h} className="stroke-ink-2" strokeDasharray="2 3" />
        <text x={P.l + slot * 16 + 4} y={top.t + 12} className="fill-ink-2 text-[11px]">
          Top 16
        </text>
      </svg>
      <p className="h-5 text-xs text-ink-2" role="status">
        {hover !== null ? `#${hover + 1} ${shown[hover].publisherName}: ${money(shown[hover].spend)} ${SCU} · cumulative ${pct(cum[hover] * 100)}` : 'Hover a bar for the publisher.'}
      </p>
    </ChartFrame>
  );
};

/* ------------------------------------------------------------- P1 tornado */

export const Sensitivity: React.FC<{ vm: ViewModel; inputs: ScenarioInputs; approval: string }> = ({ vm, inputs, approval }) => {
  const t = useMemo(() => {
    if (vm.result?.status !== 'ok' || !vm.baseline) return null;
    const clamp = (x: number) => Math.min(1, Math.max(0, x));
    const f = [
      { key: 'q' as const, label: 'Restoration fraction q', low: clamp(inputs.q! * 0.5), high: clamp(inputs.q! * 1.5), fmt: (n: number) => pct(n * 100, 0) },
      { key: 'p' as const, label: 'Success probability p', low: clamp(inputs.p! * 0.5), high: clamp(inputs.p! * 1.5), fmt: (n: number) => pct(n * 100, 0) },
      { key: 'rampDays' as const, label: 'Ramp', low: Math.min(365, inputs.rampDays! * 2 || 14), high: Math.floor(inputs.rampDays! / 2), fmt: (n: number) => `${n} days` },
      { key: 'delay' as const, label: 'Resolution delay', low: 14, high: 0, fmt: (n: number) => `+${n} days` },
    ];
    if (inputs.mode === 'volume-yield') {
      f.push({ key: 'targetBidRequestsPerDay' as never, label: 'Target bid requests', low: inputs.targetBidRequestsPerDay! * 0.995, high: inputs.targetBidRequestsPerDay! * 1.005, fmt: (n: number) => compactNum(n) });
      f.push({ key: 'yieldChange' as never, label: 'Yield change', low: inputs.yieldChange! - 1, high: inputs.yieldChange! + 1, fmt: (n: number) => `${n.toFixed(2)} /1M` });
    } else f.push({ key: 'counterfactualSpendPerDay' as never, label: 'Spend comparator', low: inputs.counterfactualSpendPerDay! * 0.75, high: inputs.counterfactualSpendPerDay! * 1.25, fmt: (n: number) => money(n) });
    return tornado(vm.baseline, inputs, vm.horizonDays, f);
  }, [vm, inputs]);
  return (
    <ChartFrame
      id="fa-tornado"
      priority="P1"
      title="Sensitivity"
      question="Which single input moves the expected incremental spend most over the chosen horizon?"
      scope={SCOPE_LABEL[vm.scope]}
      period={vm.window ? `${vm.window.from} → ${addDays(vm.window.to, -1)}` : '—'}
      unit={SCU}
      freshness={FRESH}
      classification={scenarioClass(approval, !!t)}
      queries={[]}
      sourceNote="One factor at a time; every variant is measured over the same window. Ranges are illustrative (±50% for q and p, half / double the ramp, +14 days delay, ±25% comparator, ±0.5% target volume, ±1 yield), not approved ranges or confidence intervals."
      state={!t ? { kind: 'unavailable', message: 'Unavailable until the scenario inputs are complete.' } : undefined}
    >
      {t && (
        <>
          <div className="mb-3 flex flex-wrap gap-4">
            <LegendKey s={{ label: 'Low setting', color: 'viz2' }} />
            <LegendKey s={{ label: 'High setting', color: 'viz1' }} />
          </div>
          <Tornado base={t.base} bars={t.bars} format={money} />
        </>
      )}
    </ChartFrame>
  );
};

/* ------------------------------------------------------------- P1 cash flow + finance */

export const CashFlowSection: React.FC<{ vm: ViewModel }> = ({ vm }) => {
  const [impl, setImpl] = useState('');
  const [opex, setOpex] = useState('');
  const [rate, setRate] = useState('');
  const toN = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));
  const months = 12;
  const res = cashFlow({
    periods: Array.from({ length: months }, (_, i) => ({ label: `Month ${i + 1}`, benefit: null, cost: toN(opex) === null || toN(impl) === null ? null : (i === 0 ? toN(impl)! : 0) + toN(opex)! })),
    discountRatePerPeriod: toN(rate) === null ? null : (1 + toN(rate)! / 100) ** (1 / 12) - 1,
    currency: WAREHOUSE_SPEND,
    benefitIsApprovedContribution: false,
  });
  const field = (id: string, label: string, v: string, set: (s: string) => void, unit: string) => (
    <div>
      <label htmlFor={id} className="flex justify-between text-xs font-medium text-ink-2">
        {label} <span className="font-normal text-muted">{unit}</span>
      </label>
      <input id={id} inputMode="decimal" value={v} placeholder="Blank" onChange={e => set(e.target.value)} className="num mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:font-sans placeholder:italic placeholder:text-faint focus:border-accent focus:outline-none" />
    </div>
  );
  const line = (label: string, v: string, why?: string) => (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2 last:border-0">
      <span className="text-sm text-ink-2">{label}</span>
      <span className="text-right">
        <span className={cx('text-sm', v === 'Unavailable' ? 'italic text-muted' : 'num font-semibold text-ink')}>{v}</span>
        {why && <span className="block max-w-md text-[11px] text-muted">{why}</span>}
      </span>
    </div>
  );
  const blocked = res.blockers.length > 0;
  const reasonOf = (x: { kind: string; reason?: string }) => (x.kind !== 'unavailable' ? undefined : blocked ? 'Blocked by the inputs listed below.' : x.reason);
  return (
    <ChartFrame
      id="fa-cash"
      priority="P1"
      title="Finance: contribution, costs, ROI, payback, NPV"
      question="Once Finance supplies the inputs, when does the cumulative net cash flow turn positive?"
      scope={SCOPE_LABEL[vm.scope]}
      period="12 monthly periods from the resolution date"
      unit="Validated currency only"
      freshness="No Finance inputs"
      classification="Unavailable"
      queries={[]}
      sourceNote="Gross buyer spend is a commercial outcome, not profit. Net benefit = approved monetary benefits − incremental costs; ROI = net benefit ÷ costs; payback = first period with cumulative net ≥ 0; NPV needs an approved discount rate; IRR only with one sign change."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-3">
          {field('fa-impl', 'Implementation cost (one-off)', impl, setImpl, SCU)}
          {field('fa-opex', 'Operating cost per month', opex, setOpex, SCU)}
          {field('fa-rate', 'Annual discount rate', rate, setRate, '%')}
          <p className="text-[11px] leading-relaxed text-muted">
            Costs entered here are what-ifs. The benefit side stays empty until Finance defines incremental contribution (gross spend × an approved take rate or margin) and validates the
            currency.
          </p>
        </div>
        <div>
          {line('Incremental contribution', 'Unavailable', 'Needs a Finance-approved contribution definition.')}
          {line('Actual cash savings', 'Unavailable', 'No evidenced reduction in expenditure.')}
          {line('Capacity released (not cash)', 'Unavailable', 'Needs measured effort and a validated loaded hourly cost.')}
          {line('Net benefit', showVal(res.net, money), reasonOf(res.net))}
          {line('ROI', showVal(res.roi, n => pct(n)), res.roi.kind === 'unavailable' ? res.roi.reason : undefined)}
          {line('Payback', res.payback.kind === 'period' ? res.payback.label : res.payback.kind === 'not-reached' ? NOT_REACHED : 'Unavailable', res.payback.kind === 'unavailable' ? (blocked ? 'Blocked by the inputs listed below.' : res.payback.reason) : undefined)}
          {line('NPV', showVal(res.npv, money), reasonOf(res.npv))}
          {line('IRR', showVal(res.irr, n => pct(n)), reasonOf(res.irr))}
          {res.blockers.length > 0 && (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn-ink">Blocked by: {res.blockers.join('; ')}.</p>
          )}
        </div>
      </div>
    </ChartFrame>
  );
};

/* ------------------------------------------------------------- P2 outcome validation + cohort */

export const OutcomeValidation: React.FC = () => {
  const total = COHORT_437.reduce((a, c) => a + c.cuts, 0);
  return (
    <ChartFrame
      id="fa-outcomes"
      priority="P2"
      title="Outcome validation"
      question="How did past projections compare with observed recovery, and what happened to past cuts on endpoint 437?"
      scope="Projections: none recorded · Cohort: partner 437, every network"
      period="Cuts started 2025-10-19 → 2026-09-18 (≥ 30 days of follow-up)"
      unit="Counts"
      freshness="Connection log read 2026-10-21"
      classification="Measured"
      queries={queries('cohort437', 'reasonCounts')}
      sourceNote="Reconnection is not an authorized fix and says nothing about spend after reconnection. Unresolved cuts are included. These counts are not used as a success probability."
      table={{
        columns: [{ label: 'Blocking reason' }, { label: 'Cuts', right: true }, { label: '≤ 30 days', right: true }, { label: 'Later', right: true }, { label: 'Still cut', right: true }, { label: 'Other block', right: true }],
        rows: COHORT_437.map(c => [`${c.reason} ${BLOCKING_REASON[c.reason]}`, int(c.cuts), int(c.reconnected30d), int(c.reconnectedLater), int(c.stillDisconnected), int(c.changedToOtherBlock)]),
      }}
    >
      <EmptyNote>Forecast accuracy: no past projections were recorded, so there is nothing to compare (sample size 0). Saved scenarios will be the first projections to validate.</EmptyNote>
      <p className="mt-4 text-xs font-medium text-ink-2">Partner 437 cuts by documented reason and what happened next ({int(total)} cuts)</p>
      <div className="mt-2 space-y-2">
        {COHORT_437.map(c => {
          const seg = [
            { v: c.reconnected30d, cls: 'bg-viz-1', label: 'Reconnected ≤ 30 days' },
            { v: c.reconnectedLater, cls: 'bg-viz-1/45', label: 'Reconnected later' },
            { v: c.stillDisconnected, cls: 'bg-muted', label: 'Still disconnected' },
            { v: c.changedToOtherBlock, cls: 'bg-faint/50', label: 'Moved to another block' },
          ];
          return (
            <div key={c.reason} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,13rem)_1fr_auto] sm:items-center sm:gap-3">
              <span className="text-xs text-ink-2">
                {c.reason} · {BLOCKING_REASON[c.reason]}
              </span>
              <div className="flex h-3.5 gap-[2px] overflow-hidden rounded bg-surface-2">
                {seg.map(s => (s.v ? <span key={s.label} className={s.cls} style={{ width: `${(s.v / c.cuts) * 100}%` }} title={`${s.label}: ${s.v}`} /> : null))}
              </div>
              <span className="num text-right text-xs text-ink">{int(c.cuts)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-viz-1" />Reconnected ≤ 30 days</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-viz-1/45" />Reconnected later</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-muted" />Still disconnected</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-faint/50" />Moved to another block</span>
      </div>
    </ChartFrame>
  );
};

export const Section: React.FC<{ title: string; eyebrow: string; children: React.ReactNode; id?: string }> = ({ title, eyebrow, children, id }) => (
  <section aria-labelledby={id} className="space-y-4">
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-1 text-lg font-semibold tracking-tight text-ink">
        {title}
      </h2>
    </div>
    {children}
  </section>
);

export const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => <Card className="p-4 text-sm text-muted">{children}</Card>;

export { shortDay };
