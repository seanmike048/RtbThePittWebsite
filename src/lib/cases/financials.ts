/**
 * Per-publisher financial impact, in USD. Every figure is scoped to one network; nothing falls back to another
 * publisher or to a portfolio aggregate. Observed, calculated, projected and confirmed values stay separate.
 *
 * Window: the 7 UTC days ending on the cut day, the same window as the alert view's REVENUE_7_DAYS_BEFORE
 * (reconciled per seat in data/snowflake/amazon-spend-2026-10-21.json).
 */
import { fmtUsd, sumDailyEurToUsd, toUsd, usdValue, type RateTable, RATES, type Usd } from './fx.ts';
import { SPEND_SNAPSHOT } from './spend.data.ts';
import type { CaseRecord, SpendSnapshot } from './types.ts';

export const SEAT_NAME: Record<number, string> = {
  437: 'AMER Display B',
  489: 'EMEA/APAC Display B',
  490: 'Native B',
  491: 'Video B',
  492: 'CTV B',
};
export const AMAZON_SEATS = [437, 489, 490, 491, 492];
export const seatLabel = (id: number) => `Endpoint ${id} · ${SEAT_NAME[id] ?? 'Amazon DSP'}`;

const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);

export interface SeatImpact {
  partnerId: number;
  name: string;
  state: 'Cut' | 'Still live';
  cutAt: string | null;
  preCutWeek: Usd;
  latestDay: Usd | null;
}

export interface CaseFinancials {
  networkId: number;
  basis: 'snapshot' | 'source-total' | 'none';
  window: { from: string; to: string } | null;
  latestDay: string | null;
  seats: SeatImpact[];
  preCutWeek: Usd;
  removedAfterCut: Usd;
  stillLive: Usd;
  /** Latest loaded day's Amazon spend × 7, on every seat of the network (a run rate, not a forecast). */
  currentRunRate: Usd;
  /** Only from a complete Spend Projection scenario. */
  projectedRecovery: Usd;
  /** Only when a reconnection and restored spend are verified. None is verified in the stored data. */
  confirmedRestored: Usd;
  partialCut: boolean;
  notes: string[];
}

const unavailable = (reason: string): Usd => ({ kind: 'unavailable', reason });

/** Minimum weekly spend for a non-cut seat to count as still live. */
export const STILL_LIVE_MIN_USD = 1;

const sumUsd = (xs: Usd[]): Usd => {
  const bad = xs.find((x) => x.kind === 'unavailable');
  if (bad) return bad;
  return { kind: 'usd', usd: xs.reduce((a, x) => a + (x as { usd: number }).usd, 0), basis: 'Sum of per-seat USD values' };
};

export function caseFinancials(c: CaseRecord, snap: SpendSnapshot = SPEND_SNAPSHOT, rates: RateTable = RATES, projected: Usd | null = null): CaseFinancials {
  const nid = c.networkId;
  const cuts = snap.alert_cuts.filter((x) => x.network_id === nid);
  const daily = snap.daily.filter((d) => d.network_id === nid);
  const projectedRecovery = projected ?? unavailable('No complete Spend Projection scenario for this publisher.');
  const confirmedRestored = unavailable('No verified reconnection or restored spend in the stored data.');

  if (!cuts.length) {
    // A pasted run without Snowflake detail: the draft's own total, converted at the cut-day rate. No seat detail.
    if (!c.sourceSpend) {
      const u = unavailable('No spend in the source and no Snowflake detail for this network.');
      return { networkId: nid, basis: 'none', window: null, latestDay: null, seats: [], preCutWeek: u, removedAfterCut: u, stillLive: u, currentRunRate: u, projectedRecovery, confirmedRestored, partialCut: false, notes: [] };
    }
    const total = toUsd(c.sourceSpend.amount, c.sourceSpend.currency, c.disconnectedAt, rates);
    const need = unavailable('Needs a Snowflake refresh for this network (seat-level daily spend).');
    return {
      networkId: nid,
      basis: 'source-total',
      window: null,
      latestDay: null,
      seats: [],
      preCutWeek: total,
      removedAfterCut: total,
      stillLive: need,
      currentRunRate: need,
      projectedRecovery,
      confirmedRestored,
      partialCut: false,
      notes: ['Source total from the draft, converted at the cut-day rate; no daily detail, so no seat split.'],
    };
  }

  const cutDay = cuts.map((x) => x.cut_at.slice(0, 10)).sort()[0];
  const window = { from: addDays(cutDay, -6), to: cutDay };
  const coverage = snap.coverage.filter((x) => x.network_id === nid).map((x) => x.day).sort();
  const latestDay = coverage.length ? coverage[coverage.length - 1] : null;
  const cutIds = new Set(cuts.map((x) => x.partner_id));
  const seatDays = (pid: number, from: string, to: string) => {
    const out: { day: string; eur: number }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, eur: daily.find((x) => x.partner_id === pid && x.day === d)?.spend_eur ?? 0 });
    return out;
  };
  // A seat that was not cut counts as "still live" only with real activity in the window, not rounding noise.
  const candidates = [...new Set(daily.filter((d) => !cutIds.has(d.partner_id)).map((d) => d.partner_id))];
  const live = candidates.filter((pid) => (usdValue(sumDailyEurToUsd(seatDays(pid, window.from, window.to), rates)) ?? 0) >= STILL_LIVE_MIN_USD);

  const seats: SeatImpact[] = [...[...cutIds].sort((a, b) => a - b), ...live.sort((a, b) => a - b)].map((pid) => ({
    partnerId: pid,
    name: seatLabel(pid),
    state: cutIds.has(pid) ? 'Cut' : 'Still live',
    cutAt: cuts.find((x) => x.partner_id === pid)?.cut_at ?? null,
    preCutWeek: sumDailyEurToUsd(seatDays(pid, window.from, window.to), rates),
    latestDay: latestDay ? sumDailyEurToUsd(seatDays(pid, latestDay, latestDay), rates) : null,
  }));

  const removed = sumUsd(seats.filter((s) => s.state === 'Cut').map((s) => s.preCutWeek));
  const stillLive = live.length ? sumUsd(seats.filter((s) => s.state === 'Still live').map((s) => s.preCutWeek)) : { kind: 'usd' as const, usd: 0, basis: `No other Amazon seat had at least $${STILL_LIVE_MIN_USD} in the window` };
  const latest = latestDay ? sumUsd(seats.map((s) => s.latestDay!)) : null;
  const notes: string[] = [];
  if (live.length) notes.push(`Only part of the publisher's Amazon DSP activity was cut: ${live.map(seatLabel).join(', ')} still had spend.`);

  return {
    networkId: nid,
    basis: 'snapshot',
    window,
    latestDay,
    seats,
    preCutWeek: sumUsd([removed, stillLive]),
    removedAfterCut: removed,
    stillLive,
    currentRunRate: latest && latest.kind === 'usd' ? { kind: 'usd', usd: latest.usd * 7, basis: `Spend on ${latestDay} × 7 (one loaded day; a run rate, not a forecast)` } : unavailable('No loaded day after the cut.'),
    projectedRecovery,
    confirmedRestored,
    partialCut: live.length > 0,
    notes,
  };
}

/** Run-level total: each case converted first, then summed. Unavailable if any case is unavailable. */
export function runRemovedTotal(cases: CaseRecord[], snap: SpendSnapshot = SPEND_SNAPSHOT, rates: RateTable = RATES): Usd {
  return sumUsd(cases.map((c) => caseFinancials(c, snap, rates).removedAfterCut));
}

export interface VarianceRow {
  id: 'precut' | 'removed' | 'live' | 'runrate' | 'projected' | 'restored';
  label: string;
  value: Usd;
  /** Additive rows compose "Pre-cut weekly spend"; the others are separate measures. */
  role: 'total' | 'part' | 'measure';
  explain: string;
}

/** The six rows of the Revenue variance component, with short labels and a plain explanation each. */
export function varianceRows(f: CaseFinancials): VarianceRow[] {
  return [
    { id: 'precut', label: 'Pre-cut weekly spend', value: f.preCutWeek, role: 'total', explain: 'Amazon DSP spend on every seat in the 7 days ending on the cut day.' },
    { id: 'removed', label: 'Removed after cut', value: f.removedAfterCut, role: 'part', explain: 'The part of that week on the seats that were cut.' },
    { id: 'live', label: 'Still live', value: f.stillLive, role: 'part', explain: 'The part on seats that were not cut. Not recovered: it was never lost.' },
    { id: 'runrate', label: 'Current run rate', value: f.currentRunRate, role: 'measure', explain: 'Latest loaded day × 7, all seats. One day is a signal, not a trend.' },
    { id: 'projected', label: 'Projected recovery', value: f.projectedRecovery, role: 'measure', explain: 'Expected weekly spend back if the approved fix works (Spend Projection).' },
    { id: 'restored', label: 'Confirmed restored', value: f.confirmedRestored, role: 'measure', explain: 'Spend observed again after a verified reconnection.' },
  ];
}

/** Waterfall is valid only when the parts add up to the total (within a cent). */
export const isAdditive = (f: CaseFinancials) => {
  const t = usdValue(f.preCutWeek), r = usdValue(f.removedAfterCut), l = usdValue(f.stillLive);
  return t != null && r != null && l != null && Math.abs(t - r - l) < 0.01;
};

export const describeUsd = (u: Usd) => (u.kind === 'usd' ? `${fmtUsd(u.usd)} · ${u.basis}` : u.reason);
