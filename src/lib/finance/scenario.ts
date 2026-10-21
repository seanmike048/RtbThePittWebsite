/**
 * Spend-after-resolution model (daily). Proposed modelling logic, not an Equativ standard.
 *
 * Volume-and-yield mode, for each day t:
 *   S0_t = B0_t × Y0_t / 1e6                         no intervention
 *   B1_t = B0_t + q × max(Btarget_t − B0_t, 0) × r_t  r_t = 0 before the resolution date
 *   Y1_t = Y0_t + Δyield (from the resolution date)
 *   S1_t = B1_t × Y1_t / 1e6                         conditional on success
 *   E_t  = S0_t + p × (S1_t − S0_t)                  expected; p is applied exactly once
 * Spend-gap mode (when only a spend comparator exists): S1_t = S0_t + q × max(CF − S0_t, 0) × r_t, no volume/yield split.
 * One mode per case, never both added.
 */
import { PER_MILLION } from './metrics.ts';
import { num, unavailable, val, type Val } from './values.ts';

export type Mode = 'volume-yield' | 'spend-gap';

export interface BaselineDay {
  day: string;
  /** actual = observed in the warehouse; projection = run-rate no-intervention projection (not a forecast). */
  kind: 'actual' | 'projection';
  B0: number | null;
  Y0: Val;
  S0: number | null;
}

export interface ScenarioInputs {
  mode: Mode;
  resolutionDate: string | null;
  rampDays: number | null;
  q: number | null;
  p: number | null;
  targetBidRequestsPerDay: number | null;
  yieldChange: number | null;
  comparatorYield: number | null;
  counterfactualSpendPerDay: number | null;
}

export const BLANK_INPUTS: ScenarioInputs = {
  mode: 'volume-yield',
  resolutionDate: null,
  rampDays: null,
  q: null,
  p: null,
  targetBidRequestsPerDay: null,
  yieldChange: null,
  comparatorYield: null,
  counterfactualSpendPerDay: null,
};

export interface ScenarioRow {
  day: string;
  kind: BaselineDay['kind'];
  r: number;
  B0: number | null;
  B1: number | null;
  Y0: number | null;
  Y1: number | null;
  S0: number;
  S1: number;
  /** S1 − S0 */
  uplift: number;
  expected: number;
  /** expected − S0 = p × uplift */
  expectedIncremental: number;
  cumExpectedIncremental: number;
  volume: number | null;
  yield: number | null;
  interaction: number | null;
}

export type ScenarioResult =
  | { status: 'ok'; rows: ScenarioRow[]; mode: Mode }
  | { status: 'unavailable'; missing: string[]; errors: string[] };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Checks percentages, date order, ramp, denominators and mode-specific inputs before any arithmetic. */
export function validateInputs(baseline: BaselineDay[], inp: ScenarioInputs): { missing: string[]; errors: string[] } {
  const missing: string[] = [];
  const errors: string[] = [];
  if (!baseline.length) errors.push('No baseline days.');
  for (let i = 1; i < baseline.length; i++) if (baseline[i].day <= baseline[i - 1].day) errors.push(`Baseline days out of order at ${baseline[i].day}.`);
  const lastActual = [...baseline].reverse().find(d => d.kind === 'actual')?.day ?? null;

  if (inp.resolutionDate === null) missing.push('Resolution date');
  else if (!DAY_RE.test(inp.resolutionDate)) errors.push('Resolution date must be YYYY-MM-DD.');
  else {
    const firstProjected = baseline.find(d => d.kind === 'projection')?.day ?? null;
    if (lastActual && inp.resolutionDate <= lastActual)
      errors.push(`Resolution date must be after the last observed day (${lastActual}); observed days stay actuals.`);
    else if (firstProjected && inp.resolutionDate < firstProjected)
      errors.push(`Resolution date must be on or after ${firstProjected}, the first projected day.`);
    else if (baseline.length && inp.resolutionDate > baseline[baseline.length - 1].day) errors.push('Resolution date is beyond the projected horizon.');
  }
  if (inp.rampDays === null) missing.push('Ramp (days to full restoration)');
  else if (!Number.isInteger(inp.rampDays) || inp.rampDays < 0 || inp.rampDays > 365) errors.push('Ramp must be a whole number of days between 0 and 365.');
  const frac = (x: number | null, name: string) => {
    if (x === null) missing.push(name);
    else if (!(x >= 0 && x <= 1)) errors.push(`${name} must be between 0% and 100%.`);
  };
  frac(inp.q, 'Restoration fraction q');
  frac(inp.p, 'Success probability p');

  if (inp.mode === 'volume-yield') {
    if (inp.targetBidRequestsPerDay === null) missing.push('Target bid requests per day (Btarget)');
    else if (!(inp.targetBidRequestsPerDay >= 0)) errors.push('Target bid requests must be ≥ 0.');
    if (inp.yieldChange === null) missing.push('Yield change (Δ RPMBr)');
    else if (!Number.isFinite(inp.yieldChange)) errors.push('Yield change must be a number.');
    if (inp.comparatorYield !== null && !(inp.comparatorYield >= 0)) errors.push('Comparator yield must be ≥ 0.');
    const undefinedYield = baseline.some(d => d.kind === 'projection' && num(d.Y0) === null);
    if (undefinedYield && inp.comparatorYield === null)
      missing.push('Comparator yield (baseline yield is undefined on days with zero bid requests)');
    if (baseline.some(d => d.B0 === null)) errors.push('Volume-and-yield mode needs bid requests on every day.');
  } else {
    if (inp.counterfactualSpendPerDay === null) missing.push('Validated spend comparator per day');
    else if (!(inp.counterfactualSpendPerDay >= 0)) errors.push('Spend comparator must be ≥ 0.');
    if (baseline.some(d => d.S0 === null)) errors.push('Spend-gap mode needs no-intervention spend on every day.');
  }
  return { missing, errors };
}

export function ramp(day: string, resolutionDate: string, rampDays: number): number {
  const t = dayDiff(resolutionDate, day);
  if (t < 0) return 0;
  return rampDays === 0 ? 1 : Math.min(1, (t + 1) / rampDays);
}

/** Exact decomposition; volume + yield + interaction = S1 − S0. */
export function decompose(B0: number, Y0: number, B1: number, Y1: number) {
  const volume = ((B1 - B0) * Y0) / PER_MILLION;
  const yieldEffect = (B0 * (Y1 - Y0)) / PER_MILLION;
  const interaction = ((B1 - B0) * (Y1 - Y0)) / PER_MILLION;
  return { volume, yield: yieldEffect, interaction, total: (B1 * Y1 - B0 * Y0) / PER_MILLION };
}

export function runScenario(baseline: BaselineDay[], inp: ScenarioInputs): ScenarioResult {
  const { missing, errors } = validateInputs(baseline, inp);
  if (missing.length || errors.length) return { status: 'unavailable', missing, errors };
  const res = inp.resolutionDate!;
  const q = inp.q!;
  const p = inp.p!;
  let cum = 0;
  const rows: ScenarioRow[] = baseline.map(d => {
    const r = ramp(d.day, res, inp.rampDays!);
    if (inp.mode === 'spend-gap') {
      const S0 = d.S0!;
      const S1 = S0 + q * Math.max(inp.counterfactualSpendPerDay! - S0, 0) * r;
      const uplift = S1 - S0;
      const expected = S0 + p * uplift;
      cum += expected - S0;
      return { day: d.day, kind: d.kind, r, B0: d.B0, B1: null, Y0: num(d.Y0), Y1: null, S0, S1, uplift, expected, expectedIncremental: expected - S0, cumExpectedIncremental: cum, volume: null, yield: null, interaction: null };
    }
    const B0 = d.B0!;
    const Y0 = num(d.Y0) ?? inp.comparatorYield!;
    const B1 = B0 + q * Math.max(inp.targetBidRequestsPerDay! - B0, 0) * r;
    const Y1 = d.day >= res ? Y0 + inp.yieldChange! : Y0;
    const S0 = (B0 * Y0) / PER_MILLION;
    const S1 = (B1 * Y1) / PER_MILLION;
    const parts = decompose(B0, Y0, B1, Y1);
    const uplift = S1 - S0;
    const expected = S0 + p * uplift;
    cum += expected - S0;
    return { day: d.day, kind: d.kind, r, B0, B1, Y0, Y1, S0, S1, uplift, expected, expectedIncremental: expected - S0, cumExpectedIncremental: cum, volume: parts.volume, yield: parts.yield, interaction: parts.interaction };
  });
  return { status: 'ok', rows, mode: inp.mode };
}

export const HORIZONS = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '14d', label: '14 days', days: 14 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: '12m', label: '12 calendar months', days: null },
] as const;

/** Day count of 12 calendar months starting on a date (365 or 366). */
export function twelveMonthDays(start: string): number {
  const t = new Date(`${start}T00:00:00Z`);
  const end = new Date(Date.UTC(t.getUTCFullYear() + 1, t.getUTCMonth(), t.getUTCDate()));
  return Math.round((end.getTime() - t.getTime()) / 86_400_000);
}

export interface HorizonTotal {
  key: string;
  label: string;
  days: number;
  S0: Val;
  S1: Val;
  expected: Val;
  expectedIncremental: Val;
}

/** Totals from the resolution date over each horizon. A horizon the projection does not cover is unavailable, not truncated. */
export function horizonTotals(rows: ScenarioRow[], resolutionDate: string): HorizonTotal[] {
  return HORIZONS.map(h => {
    const days = h.days ?? twelveMonthDays(resolutionDate);
    const end = addDays(resolutionDate, days);
    const sel = rows.filter(r => r.day >= resolutionDate && r.day < end);
    if (sel.length < days) {
      const u = unavailable(`The projection covers ${sel.length} of ${days} days.`);
      return { key: h.key, label: h.label, days, S0: u, S1: u, expected: u, expectedIncremental: u };
    }
    const sum = (f: (r: ScenarioRow) => number) => val(sel.reduce((a, r) => a + f(r), 0));
    return { key: h.key, label: h.label, days, S0: sum(r => r.S0), S1: sum(r => r.S1), expected: sum(r => r.expected), expectedIncremental: sum(r => r.expectedIncremental) };
  });
}

/**
 * Faster-resolution value: the same model and horizon run with an earlier and a later resolution date.
 * It is a component of the earlier scenario's incremental spend, so it is reported as "of which", never added to it.
 */
export function accelerationValue(baseline: BaselineDay[], inp: ScenarioInputs, earlyDate: string, lateDate: string, horizonEnd: string) {
  if (!(earlyDate < lateDate)) return { value: unavailable('The Pitt date must be earlier than the manual date.'), early: null, late: null };
  const early = runScenario(baseline, { ...inp, resolutionDate: earlyDate });
  const late = runScenario(baseline, { ...inp, resolutionDate: lateDate });
  if (early.status !== 'ok' || late.status !== 'ok') return { value: unavailable('Both timelines need a complete scenario.'), early: null, late: null };
  const within = (r: ScenarioRow) => r.day >= earlyDate && r.day < horizonEnd;
  const e = early.rows.filter(within).reduce((a, r) => a + r.expected, 0);
  const l = late.rows.filter(within).reduce((a, r) => a + r.expected, 0);
  const earlyIncremental = early.rows.filter(within).reduce((a, r) => a + r.expectedIncremental, 0);
  return { value: val(e - l), early, late, earlyIncremental: val(earlyIncremental) };
}

export interface SensitivityBar {
  key: string;
  label: string;
  low: number | null;
  high: number | null;
  lowInput: string;
  highInput: string;
}

/** One-factor-at-a-time tornado on the expected incremental spend over a horizon. */
export function tornado(
  baseline: BaselineDay[],
  inp: ScenarioInputs,
  horizonDays: number,
  factors: { key: keyof ScenarioInputs | 'delay'; label: string; low: number; high: number; fmt: (n: number) => string }[],
): { base: number; bars: SensitivityBar[] } | null {
  // Every variant is measured over the same window, starting on the base resolution date, so a delay costs days.
  const start = inp.resolutionDate;
  if (!start) return null;
  const end = addDays(start, horizonDays);
  const run = (x: ScenarioInputs) => {
    const r = runScenario(baseline, x);
    if (r.status !== 'ok') return null;
    return r.rows.filter(row => row.day >= start && row.day < end).reduce((a, row) => a + row.expectedIncremental, 0);
  };
  const base = run(inp);
  if (base === null) return null;
  const bars = factors.map(f => {
    const at = (v: number) =>
      f.key === 'delay' ? run({ ...inp, resolutionDate: addDays(inp.resolutionDate!, v) }) : run({ ...inp, [f.key]: v } as ScenarioInputs);
    return { key: String(f.key), label: f.label, low: at(f.low), high: at(f.high), lowInput: f.fmt(f.low), highInput: f.fmt(f.high) };
  });
  return { base, bars };
}
