/** View model for the financial impact page: one function from (scope, scenario, data) to everything the page shows. */
import { PER_MILLION, pooledRpmbr, rpmbr } from '../../lib/finance/metrics.ts';
import { caseBaseline, caseSeatTotal, projectBaseline, type CaseData, type PortfolioDay } from '../../lib/finance/baseline.ts';
import { addDays, horizonTotals, HORIZONS, runScenario, twelveMonthDays, accelerationValue, type BaselineDay, type ScenarioResult } from '../../lib/finance/scenario.ts';
import type { SavedScenario, ScopeKey } from '../../lib/finance/assumptions.ts';
import { unavailable, val, type Val } from '../../lib/finance/values.ts';
import { PRE_CUT_FULL_DAYS } from '../../lib/finance/snapshot.data.ts';

export type HorizonKey = (typeof HORIZONS)[number]['key'];

export interface ViewModel {
  scope: ScopeKey;
  dataThrough: string;
  firstProjectedDay: string;
  baseline: BaselineDay[] | null;
  baselineError: string | null;
  result: ScenarioResult | null;
  horizonDays: number;
  totals: ReturnType<typeof horizonTotals> | null;
  /** Window used by the horizon metrics: [resolution date, resolution + horizon). */
  window: { from: string; to: string } | null;
  chart: { days: string[]; observed: (number | null)[]; noIntervention: (number | null)[]; conditional: (number | null)[]; expected: (number | null)[]; cumulative: (number | null)[] };
  rpmbrChange: Val;
  acceleration: Val;
  decomposition: { volume: number; yield: number; interaction: number; total: number } | null;
  meanBidRequests: number;
  preCutDailySpend: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function buildModel(opts: {
  scope: ScopeKey;
  scenario: SavedScenario;
  horizon: HorizonKey;
  portfolio: PortfolioDay[];
  caseData: CaseData;
  manualResolutionDate: string | null;
}): ViewModel {
  const { scope, scenario, horizon, portfolio, caseData } = opts;
  const dataThrough = portfolio[portfolio.length - 1].day;
  const firstProjectedDay = addDays(dataThrough, 1);
  const until = addDays(dataThrough, 400);
  const last28 = portfolio.slice(-28);
  const meanBidRequests = sum(last28.map(d => d.bidRequests ?? 0)) / last28.length;
  const preCutDailySpend = (PRE_CUT_FULL_DAYS[491].spend + PRE_CUT_FULL_DAYS[492].spend) / 7;

  let baseline: BaselineDay[] | null = null;
  let baselineError: string | null = null;
  if (scope === 'portfolio') {
    const p = projectBaseline(portfolio, until);
    if (p.status === 'ok') baseline = p.days;
    else baselineError = p.reason;
  } else baseline = caseBaseline(until, dataThrough, caseData);

  const result = baseline ? runScenario(baseline, scenario.inputs) : null;
  const res = scenario.inputs.resolutionDate;
  const h = HORIZONS.find(x => x.key === horizon)!;
  const horizonDays = h.days ?? twelveMonthDays(res ?? firstProjectedDay);
  const ok = result?.status === 'ok' ? result : null;
  const totals = ok && res ? horizonTotals(ok.rows, res) : null;
  const window = res ? { from: res, to: addDays(res, horizonDays) } : null;

  // Chart: observed actuals, then the projection over the chosen horizon (at least 30 days so the shape is visible).
  const start = '2026-09-06';
  const end = addDays(window?.from ?? firstProjectedDay, Math.max(horizonDays, 30) - 1);
  const observedSeries = scope === 'portfolio' ? portfolio.map(d => ({ day: d.day, v: d.spend })) : caseSeatTotal(start, dataThrough, caseData).map(d => ({ day: d.day, v: d.spend }));
  const obsBy = new Map(observedSeries.map(o => [o.day, o.v]));
  const rowBy = new Map((ok?.rows ?? []).map(r => [r.day, r]));
  const baseBy = new Map((baseline ?? []).map(b => [b.day, b]));
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const proj = (d: string) => baseBy.get(d)?.kind === 'projection';
  const chart = {
    days,
    observed: days.map(d => (d <= dataThrough ? (obsBy.get(d) ?? null) : null)),
    noIntervention: days.map(d => (proj(d) ? (baseBy.get(d)!.S0 ?? null) : d === dataThrough ? (obsBy.get(d) ?? null) : null)),
    conditional: days.map(d => (proj(d) && rowBy.has(d) ? rowBy.get(d)!.S1 : null)),
    expected: days.map(d => (proj(d) && rowBy.has(d) ? rowBy.get(d)!.expected : null)),
    cumulative: days.map(() => null as number | null),
  };
  if (ok && window) {
    let c = 0;
    chart.cumulative = days.map(d => {
      const r = rowBy.get(d);
      if (!r || r.kind !== 'projection' || d < window.from || d >= window.to) return null;
      c += r.expectedIncremental;
      return c;
    });
  }

  let rpmbrChange: Val = unavailable('Needs a complete scenario.');
  let decomposition: ViewModel['decomposition'] = null;
  if (ok && window) {
    const sel = ok.rows.filter(r => r.day >= window.from && r.day < window.to);
    if (ok.mode === 'spend-gap') rpmbrChange = unavailable('Spend-gap mode: volume and yield are not modelled.');
    else if (sel.length) {
      const before = pooledRpmbr(sel.map(r => ({ spend: r.S0, bidRequests: r.B0 })));
      const after = rpmbr(sum(sel.map(r => r.S1)), sum(sel.map(r => r.B1 ?? 0)));
      rpmbrChange = before.kind === 'value' && after.kind === 'value' ? val(after.v - before.v) : unavailable('Pooled RPMBr is undefined in this window.');
      decomposition = {
        volume: sum(sel.map(r => r.volume ?? 0)),
        yield: sum(sel.map(r => r.yield ?? 0)),
        interaction: sum(sel.map(r => r.interaction ?? 0)),
        total: sum(sel.map(r => r.S1 - r.S0)),
      };
    }
  }

  let acceleration: Val = unavailable('Needs validated manual and Pitt resolution timelines.', ['manual resolution date', 'Pitt resolution date']);
  if (ok && res && window && opts.manualResolutionDate && baseline) {
    const a = accelerationValue(baseline, scenario.inputs, res, opts.manualResolutionDate, window.to);
    acceleration = a.value;
  }

  return { scope, dataThrough, firstProjectedDay, baseline, baselineError, result, horizonDays, totals, window, chart, rpmbrChange, acceleration, decomposition, meanBidRequests, preCutDailySpend };
}

export const perMillion = PER_MILLION;
