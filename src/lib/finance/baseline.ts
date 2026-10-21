/**
 * Observed daily series and the no-intervention projection for each scope.
 * The projection is a run-rate scenario (same-weekday mean of the last 28 complete days), not a statistical forecast.
 */
import { rpmbr } from './metrics.ts';
import { addDays, dayDiff, type BaselineDay } from './scenario.ts';
import { missing, unavailable, val, type Val } from './values.ts';
import { NETWORK_DAILY_RAW, PORTFOLIO_DAILY_RAW, SEAT_DAILY_RAW } from './snapshot.data.ts';

export interface ObservedDay {
  day: string;
  bidRequests: number | null;
  spend: number | null;
  /** Why a value is null: the source returned no row for the day. */
  note?: string;
}

export const PROJECTION_METHOD = 'Same-weekday mean of the last 28 complete observed days (run-rate scenario, not a forecast)';
export const INSUFFICIENT_HISTORY = 'Forecast unavailable because historical time series data is insufficient.';
const WINDOW = 28;

/** Fill a date range so that a day the source did not return shows as missing, never as an observed zero. */
export function denseDays<T extends { day: string }>(rows: T[], from: string, to: string, empty: (day: string) => T): T[] {
  const by = new Map(rows.map(r => [r.day, r]));
  const out: T[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(by.get(d) ?? empty(d));
  return out;
}

export function projectBaseline(history: ObservedDay[], until: string): { status: 'ok'; days: BaselineDay[] } | { status: 'unavailable'; reason: string } {
  const tail = history.slice(-WINDOW);
  const consecutive = tail.every((d, i) => i === 0 || dayDiff(tail[i - 1].day, d.day) === 1);
  if (tail.length < WINDOW || !consecutive || tail.some(d => d.bidRequests === null || d.spend === null))
    return { status: 'unavailable', reason: INSUFFICIENT_HISTORY };
  const actual: BaselineDay[] = history.map(d => ({
    day: d.day,
    kind: 'actual',
    B0: d.bidRequests,
    Y0: rpmbr(d.spend, d.bidRequests),
    S0: d.spend,
  }));
  const last = history[history.length - 1].day;
  const days: BaselineDay[] = [...actual];
  for (let d = addDays(last, 1); d <= until; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    const same = tail.filter(x => new Date(`${x.day}T00:00:00Z`).getUTCDay() === wd);
    const br = same.reduce((a, x) => a + x.bidRequests!, 0);
    const sp = same.reduce((a, x) => a + x.spend!, 0);
    days.push({ day: d, kind: 'projection', B0: br / same.length, Y0: rpmbr(sp, br), S0: sp / same.length });
  }
  return { status: 'ok', days };
}

/* ---------- Portfolio: Amazon DSP partner 437, visible BOTH + INTERMEDIARY view, UTC days ---------- */

export interface PortfolioDay extends ObservedDay {
  visibleNetworks: number;
  allBidRequests: number;
  allSpend: number;
}

export type PortfolioRaw = typeof PORTFOLIO_DAILY_RAW;
export type SeatRaw = typeof SEAT_DAILY_RAW;
export type NetworkRaw = typeof NETWORK_DAILY_RAW;

export const toPortfolioDaily = (raw: PortfolioRaw): PortfolioDay[] =>
  raw.map(([day, br, spend, nets, allBr, allSpend]) => ({ day, bidRequests: br, spend, visibleNetworks: nets, allBidRequests: allBr, allSpend }));

export const PORTFOLIO_DAILY: PortfolioDay[] = toPortfolioDaily(PORTFOLIO_DAILY_RAW);

/** Case-scope daily inputs; the snapshot by default, live rows after a refresh. */
export interface CaseData {
  seat: SeatRaw;
  network: NetworkRaw;
}
export const CASE_SNAPSHOT: CaseData = { seat: SEAT_DAILY_RAW, network: NETWORK_DAILY_RAW };

/* ---------- Investigation: network 5100 × Amazon variants ---------- */

export const CASE_SEATS = [491, 492] as const;
export const NETWORK_5100 = 5100;
export const NETWORK_5524 = 5524;

/** Days on which DAY_DEMAND has any row for a network (all DSPs). */
const networkDays = (network: number, data: CaseData) => new Set(data.network.filter(r => r[1] === network).map(r => r[0]));

/**
 * Amazon seat activity on 5100 per day. A day where the network has DAY_DEMAND rows but the seat has none is a
 * derived zero (network active, seat silent); a day without any network row is missing.
 */
export function seatSeries(partnerId: number, from: string, to: string, data: CaseData = CASE_SNAPSHOT): (ObservedDay & { state: Val })[] {
  const active = networkDays(NETWORK_5100, data);
  const rows = data.seat.filter(r => r[1] === partnerId);
  const by = new Map(rows.map(r => [r[0], r]));
  const out: (ObservedDay & { state: Val })[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = by.get(d);
    if (r) out.push({ day: d, bidRequests: r[2], spend: r[5], state: val(r[5]) });
    else if (active.has(d)) out.push({ day: d, bidRequests: 0, spend: 0, state: val(0), note: 'No seat row while the network had activity' });
    else out.push({ day: d, bidRequests: null, spend: null, state: missing('No row for network 5100 on this day'), note: 'No network row' });
  }
  return out;
}

export interface NetworkDay {
  day: string;
  allDsp: Val;
  amazon: Val;
}

export function networkSeries(network: number, from: string, to: string, data: CaseData = CASE_SNAPSHOT): NetworkDay[] {
  const by = new Map(data.network.filter(r => r[1] === network).map(r => [r[0], r]));
  const out: NetworkDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = by.get(d);
    out.push(r ? { day: d, allDsp: val(r[2]), amazon: val(r[3]) } : { day: d, allDsp: missing('No DAY_DEMAND row'), amazon: missing('No DAY_DEMAND row') });
  }
  return out;
}

/** Combined 491 + 492 daily spend on 5100; missing if either seat is missing that day. */
export function caseSeatTotal(from: string, to: string, data: CaseData = CASE_SNAPSHOT): ObservedDay[] {
  const a = seatSeries(491, from, to, data);
  const b = seatSeries(492, from, to, data);
  return a.map((x, i) => ({
    day: x.day,
    bidRequests: x.bidRequests === null || b[i].bidRequests === null ? null : x.bidRequests + b[i].bidRequests!,
    spend: x.spend === null || b[i].spend === null ? null : x.spend + b[i].spend!,
  }));
}

/**
 * No-intervention baseline for the case: the seats stay disconnected (state 1 “Reauct phase out”, no reconnection
 * recorded), so Amazon spend on 5100 is projected at 0. That is an explicit assumption, labelled as such.
 */
export function caseBaseline(until: string, lastObserved: string, data: CaseData = CASE_SNAPSHOT): BaselineDay[] {
  const obs = caseSeatTotal('2026-09-26', lastObserved, data);
  const days: BaselineDay[] = obs
    .filter(d => d.spend !== null)
    .map(d => ({ day: d.day, kind: 'actual', B0: d.bidRequests, Y0: rpmbr(d.spend, d.bidRequests), S0: d.spend }));
  for (let d = addDays(lastObserved, 1); d <= until; d = addDays(d, 1))
    days.push({ day: d, kind: 'projection', B0: 0, Y0: unavailable('Zero bid requests: yield undefined', ['comparator yield']), S0: 0 });
  return days;
}
