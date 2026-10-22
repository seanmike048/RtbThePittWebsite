/**
 * Spend Projection for one publisher. Baseline = the weekly USD removed by the cut (per day: removed / 7).
 * A scenario says how much of it comes back, how likely the fix works, when it starts and how fast it ramps.
 * Inputs start blank: with any input missing, the projection is unavailable (never a default number).
 *
 *   restored(t) = baseline × restoration × ramp(t),  ramp(t) = clamp((t − start) / rampDays, 0, 1)
 *   expected(t) = probability × restored(t)          (probability applied once)
 */
import type { Usd } from './fx.ts';

export interface Scenario {
  /** Share of the removed spend that comes back, 0–100. */
  restorationPct: number | null;
  /** Chance the approved fix works, 0–100. */
  probabilityPct: number | null;
  /** Days from approval until spend starts to return. */
  startDays: number | null;
  /** Days to reach the full restoration share. */
  rampDays: number | null;
  /** Who set the values. Illustrative values are never treated as approved. */
  origin: 'blank' | 'entered' | 'illustrative';
}

export const BLANK: Scenario = { restorationPct: null, probabilityPct: null, startDays: null, rampDays: null, origin: 'blank' };
/** Labelled "Illustrative" wherever shown. */
export const ILLUSTRATIVE: Scenario = { restorationPct: 100, probabilityPct: 50, startDays: 7, rampDays: 14, origin: 'illustrative' };

export const HORIZONS = [30, 90] as const;

export interface ProjectionPoint {
  day: number;
  /** Cumulative expected spend back, USD. */
  expected: number;
  /** Cumulative spend back if the fix works, USD (before probability). */
  ifSuccessful: number;
}

export type Projection =
  | { kind: 'ok'; points: ProjectionPoint[]; totals: { days: number; expected: number; ifSuccessful: number }[]; weeklyAtFullRamp: number; illustrative: boolean }
  | { kind: 'unavailable'; reason: string; missing: string[] };

export function validate(s: Scenario): string[] {
  const missing: string[] = [];
  const pct = (v: number | null, name: string) => (v == null ? missing.push(name) : (v < 0 || v > 100) && missing.push(name + ' (0–100)'));
  pct(s.restorationPct, 'Restoration share');
  pct(s.probabilityPct, 'Probability the fix works');
  if (s.startDays == null || s.startDays < 0) missing.push('Days until spend returns');
  if (s.rampDays == null || s.rampDays < 0) missing.push('Ramp days');
  return missing;
}

export function project(removedWeekly: Usd, s: Scenario, horizon = 90): Projection {
  if (removedWeekly.kind !== 'usd') return { kind: 'unavailable', reason: removedWeekly.reason, missing: [] };
  const missing = validate(s);
  if (missing.length) return { kind: 'unavailable', reason: 'Scenario incomplete.', missing };
  const perDay = removedWeekly.usd / 7;
  const r = s.restorationPct! / 100, p = s.probabilityPct! / 100;
  const points: ProjectionPoint[] = [];
  let ifOk = 0;
  for (let t = 1; t <= horizon; t++) {
    const ramp = s.rampDays === 0 ? (t > s.startDays! ? 1 : 0) : Math.min(1, Math.max(0, (t - s.startDays!) / s.rampDays!));
    ifOk += perDay * r * ramp;
    points.push({ day: t, ifSuccessful: ifOk, expected: p * ifOk });
  }
  const totals = HORIZONS.filter((h) => h <= horizon).map((h) => ({ days: h, expected: points[h - 1].expected, ifSuccessful: points[h - 1].ifSuccessful }));
  return { kind: 'ok', points, totals, weeklyAtFullRamp: removedWeekly.usd * r * p, illustrative: s.origin === 'illustrative' };
}

/** Weekly expected recovery at full ramp, as a USD value for the Revenue variance row. */
export const projectedWeekly = (pr: Projection): Usd | null =>
  pr.kind === 'ok' ? { kind: 'usd', usd: pr.weeklyAtFullRamp, basis: pr.illustrative ? 'Illustrative scenario, not approved' : 'Entered scenario, at full ramp' } : null;
