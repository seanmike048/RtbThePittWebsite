/**
 * Pure scenario arithmetic for the endpoint-437 CFO impact model.
 * Every output is a Result so a missing input surfaces as a named "unavailable" state, never as 0.
 * Nothing here is a forecast.
 */
import type { AssumptionSet } from './assumptions.ts';
import { type BaselineView, SCOPE, VISIBLE_VIEW } from './baseline.ts';

export interface Result {
  value: number | null;
  status: 'ok' | 'unavailable' | 'blocked';
  reason?: string;
}

const ok = (value: number): Result => ({ value, status: 'ok' });
const unavailable = (reason: string): Result => ({ value: null, status: 'unavailable', reason });

const pct = (v: number | null) => (v === null ? null : v / 100);

function need(values: Record<string, number | null>): string | null {
  const missing = Object.entries(values)
    .filter(([, v]) => v === null || Number.isNaN(v))
    .map(([k]) => k);
  return missing.length ? `Requires: ${missing.join(', ')}` : null;
}

export type EligibleMode = 'all_visible' | 'subset' | 'validated';

export interface Exposure {
  spend: number | null;
  bidRequests: number | null;
  publishers: number | null;
  mode: EligibleMode;
  /** Only validated issue-specific spend may be called financial exposure. */
  isIssueSpecific: boolean;
  label: string;
}

export function resolveExposure(
  mode: EligibleMode,
  a: AssumptionSet,
  subset: { spend: number; bidRequests: number; publishers: number } | null,
  baseline: BaselineView = VISIBLE_VIEW,
): Exposure {
  if (mode === 'all_visible') {
    return {
      spend: baseline.spend,
      bidRequests: baseline.bidRequests,
      publishers: baseline.rows,
      mode,
      isIssueSpecific: false,
      label: 'Demonstration · all visible endpoint spend (not issue-specific exposure)',
    };
  }
  if (mode === 'subset') {
    return {
      spend: subset?.spend ?? null,
      bidRequests: subset?.bidRequests ?? null,
      publishers: subset?.publishers ?? null,
      mode,
      isIssueSpecific: false,
      label: 'Demonstration · selected publisher subset (not issue-specific exposure)',
    };
  }
  return {
    spend: a.eligibleSpend.value,
    bidRequests: a.eligibleBidRequests.value,
    publishers: a.eligiblePublishers.value,
    mode,
    isIssueSpecific: true,
    label: 'Validated issue-specific financial exposure',
  };
}

/** Scenario recovered spend = eligible spend × coverage × recovery rate × probability. */
export function recoveredSpend(e: Exposure, a: AssumptionSet): Result {
  const m = need({
    'eligible spend at risk': e.spend,
    'resolution coverage': a.coveragePct.value,
    'recovery rate': a.recoveryRatePct.value,
    'recovery probability': a.recoveryProbabilityPct.value,
  });
  if (m) return unavailable(m);
  return ok(e.spend! * pct(a.coveragePct.value)! * pct(a.recoveryRatePct.value)! * pct(a.recoveryProbabilityPct.value)!);
}

/** Scenario spend after resolution = historical baseline + scenario recovered spend. */
export function spendAfterResolution(recovered: Result, baseline = VISIBLE_VIEW.spend): Result {
  if (recovered.value === null) return unavailable(recovered.reason ?? 'Recovered spend unavailable');
  return ok(baseline + recovered.value);
}

export function incrementalPct(recovered: Result, baseline = VISIBLE_VIEW.spend): Result {
  if (recovered.value === null) return unavailable(recovered.reason ?? 'Recovered spend unavailable');
  return ok((recovered.value / baseline) * 100);
}

/** Recovered bid requests = eligible bid requests × coverage × bid-request recovery rate × probability. */
export function recoveredBidRequests(e: Exposure, a: AssumptionSet): Result {
  const m = need({
    'eligible bid requests': e.bidRequests,
    'resolution coverage': a.coveragePct.value,
    'bid-request recovery rate': a.bidRecoveryRatePct.value,
    'recovery probability': a.recoveryProbabilityPct.value,
  });
  if (m) return unavailable(m);
  return ok(
    e.bidRequests! * pct(a.coveragePct.value)! * pct(a.bidRecoveryRatePct.value)! * pct(a.recoveryProbabilityPct.value)!,
  );
}

/** Incremental spend from recovered bid requests = recovered bid requests × RPMBr ÷ 1,000,000. */
export function spendFromBidRequests(recoveredBids: Result, rpmbrValue = VISIBLE_VIEW.weightedRpmbr): Result {
  if (recoveredBids.value === null) return unavailable(recoveredBids.reason ?? 'Recovered bid requests unavailable');
  return ok((recoveredBids.value * rpmbrValue) / 1_000_000);
}

export function effectiveDaysSaved(a: AssumptionSet): Result {
  if (a.daysSaved.value !== null) return ok(a.daysSaved.value);
  const h = a.historicalDetectionDays.value;
  const x = a.expectedDetectionDays.value;
  if (h !== null && x !== null) return ok(Math.max(0, h - x));
  return unavailable('Requires: days saved, or historical and expected detection time');
}

/** Value protected = (eligible spend ÷ historical days) × days saved × historical recovery probability. */
export function valueProtected(e: Exposure, a: AssumptionSet, historicalDays = SCOPE.historicalDays): Result {
  const days = effectiveDaysSaved(a);
  const m = need({
    'eligible spend at risk': e.spend,
    'days saved': days.value,
    'historical recovery probability': a.historicalRecoveryProbabilityPct.value,
  });
  if (m) return unavailable('Value protected unavailable until historical detection and recovery data are provided.');
  return ok((e.spend! / historicalDays) * days.value! * pct(a.historicalRecoveryProbabilityPct.value)!);
}

export function hoursSaved(a: AssumptionSet): Result {
  const m = need({
    investigations: a.investigations.value,
    'share automated': a.automatedPct.value,
    'hours per investigation': a.hoursPerInvestigation.value,
  });
  if (m) return unavailable('Operational value unavailable until labor-rate and investigation-time inputs are validated.');
  return ok(a.investigations.value! * pct(a.automatedPct.value)! * a.hoursPerInvestigation.value!);
}

/** Direct cost reduction = hours saved × loaded hourly cost × cash-realization rate. */
export function directCostReduction(a: AssumptionSet): Result {
  const h = hoursSaved(a);
  if (h.value === null || a.loadedHourlyCost.value === null || a.cashRealizationPct.value === null) {
    return unavailable('Operational value unavailable until labor-rate and investigation-time inputs are validated.');
  }
  return ok(h.value * a.loadedHourlyCost.value * pct(a.cashRealizationPct.value)!);
}

/** Capacity value = hours saved × loaded hourly cost. Released capacity is not cash. */
export function capacityValue(a: AssumptionSet): Result {
  const h = hoursSaved(a);
  if (h.value === null || a.loadedHourlyCost.value === null) {
    return unavailable('Operational value unavailable until labor-rate and investigation-time inputs are validated.');
  }
  return ok(h.value * a.loadedHourlyCost.value);
}

export type OverlapStatus = 'not_evaluated' | 'potential_overlap' | 'validated_non_overlapping';

export const OVERLAP_LABELS: Record<OverlapStatus, string> = {
  not_evaluated: 'Not evaluated',
  potential_overlap: 'Potential overlap',
  validated_non_overlapping: 'Validated as non-overlapping',
};

export interface BenefitBreakdown {
  total: Result;
  included: string[];
  excluded: { label: string; reason: string }[];
}

/**
 * Total scenario benefit. Recovered spend and direct cash cost reduction are always eligible.
 * Spend from recovered bid requests, RPMBr-improvement value and faster-detection value overlap with
 * recovered spend (same eligible base), so they are only added once overlap is validated as removed.
 */
export function totalBenefit(parts: {
  recovered: Result;
  directCash: Result;
  fromBidRequests: Result;
  protectedValue: Result;
  rpmbrImprovement?: Result;
  overlap: OverlapStatus;
}): BenefitBreakdown {
  const included: string[] = [];
  const excluded: { label: string; reason: string }[] = [];
  let sum = 0;
  let any = false;

  const add = (label: string, r: Result) => {
    if (r.value === null) {
      excluded.push({ label, reason: r.reason ?? 'Unavailable' });
      return;
    }
    sum += r.value;
    any = true;
    included.push(label);
  };

  add('Scenario recovered spend', parts.recovered);
  add('Direct operational cash value', parts.directCash);

  const guarded: [string, Result | undefined][] = [
    ['Incremental spend from recovered bid requests', parts.fromBidRequests],
    ['Value protected from faster detection', parts.protectedValue],
    ['RPMBr improvement value', parts.rpmbrImprovement],
  ];
  for (const [label, r] of guarded) {
    if (!r) continue;
    if (parts.overlap !== 'validated_non_overlapping') {
      if (r.value !== null) excluded.push({ label, reason: 'Blocked by double-counting guard' });
      continue;
    }
    add(label, r);
  }

  return { total: any ? ok(sum) : unavailable('No benefit component is available yet'), included, excluded };
}

export const ROI_UNAVAILABLE = 'ROI unavailable until implementation cost, operating cost, labor cost, and currency are validated.';

export interface FinancialStatus {
  netBenefit: Result;
  roi: Result;
  payback: Result;
  npv: Result;
  irr: Result;
}

/** ROI / payback need validated costs, labour rate and currency. NPV / IRR need dated cash flows and a discount rate. */
export function financialStatus(benefit: Result, a: AssumptionSet, currencyValidated: boolean): FinancialStatus {
  const costsReady = a.implementationCost.value !== null && a.operatingCost.value !== null && a.loadedHourlyCost.value !== null;
  const npvIrr = unavailable('NPV and IRR unavailable: no dated cash flows or Finance-approved discount rate.');
  if (!costsReady || !currencyValidated || benefit.value === null) {
    return { netBenefit: unavailable(ROI_UNAVAILABLE), roi: unavailable(ROI_UNAVAILABLE), payback: unavailable(ROI_UNAVAILABLE), npv: npvIrr, irr: npvIrr };
  }
  const monthlyNet = benefit.value - a.operatingCost.value!;
  const impl = a.implementationCost.value!;
  return {
    netBenefit: ok(monthlyNet - impl),
    roi: impl > 0 ? ok(((monthlyNet - impl) / impl) * 100) : unavailable('ROI undefined with zero implementation cost'),
    payback: monthlyNet > 0 ? ok(impl / monthlyNet) : unavailable('No payback: monthly net benefit is not positive'),
    npv: npvIrr,
    irr: npvIrr,
  };
}

export const HORIZONS = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '14d', label: '14 days', days: 14 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: '12m', label: '12 months', days: 365 },
] as const;

export interface HorizonRow {
  label: string;
  days: number;
  historicalDaysUsed: number;
  baselineSpend: number;
  recovered: Result;
  after: Result;
  incremental: Result;
}

/** Run-rate arithmetic from the baseline month's daily average. Never a forecast, never lifetime totals. */
export function horizonRunRates(
  recoveredMonthly: Result,
  baselineMonthly = VISIBLE_VIEW.spend,
  days = SCOPE.historicalDays,
): HorizonRow[] {
  const dailyBase = baselineMonthly / days;
  return HORIZONS.map(h => {
    const baselineSpend = dailyBase * h.days;
    const recovered =
      recoveredMonthly.value === null ? recoveredMonthly : ok((recoveredMonthly.value / days) * h.days);
    return {
      label: h.label,
      days: h.days,
      historicalDaysUsed: days,
      baselineSpend,
      recovered,
      after: recovered.value === null ? recovered : ok(baselineSpend + recovered.value),
      incremental: recovered.value === null ? recovered : ok((recovered.value / baselineSpend) * 100),
    };
  });
}

/* ---------------- Publisher prioritization ---------------- */

export type EvidenceConfidence = 'Confirmed' | 'High' | 'Medium' | 'Low' | 'Unverified';

export const CONFIDENCE_TIER: Record<EvidenceConfidence, number> = {
  Confirmed: 4,
  High: 3,
  Medium: 2,
  Low: 1,
  Unverified: 0,
};

export interface PriorityWeights {
  exposure: number;
  bidRequests: number;
  rpmbr: number;
  confidence: number;
  severity: number;
  recoverySpeed: number;
  effort: number;
  strategic: number;
}

export const DEFAULT_WEIGHTS: PriorityWeights = {
  exposure: 25,
  bidRequests: 20,
  rpmbr: 15,
  confidence: 15,
  severity: 10,
  recoverySpeed: 10,
  effort: -5,
  strategic: 0,
};

export interface PriorityInput {
  key: string;
  spend: number;
  bidRequests: number;
  rpmbr: number;
  eligibleSpendAtRisk: number | null;
  confidence: EvidenceConfidence;
  /** 0–1 where known, else null. */
  severity: number | null;
  recoverySpeed: number | null;
  effort: number | null;
  strategic: number | null;
}

export interface PriorityResult {
  key: string;
  score: number;
  confidence: EvidenceConfidence;
  inputsKnown: number;
  inputsTotal: number;
}

const minMax = (values: number[]) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return (v: number) => (hi === lo ? (hi > 0 ? 1 : 0) : (v - lo) / (hi - lo));
};

/**
 * Transparent normalized score (0–100). Financial exposure uses validated spend at risk only.
 * Ranking orders by evidence-confidence tier first, so a low-confidence issue never ranks level with
 * confirmed exposure, then by score.
 */
export function prioritize(rows: PriorityInput[], w: PriorityWeights = DEFAULT_WEIGHTS): PriorityResult[] {
  if (!rows.length) return [];
  const nSpend = minMax(rows.map(r => r.eligibleSpendAtRisk ?? 0));
  const nBids = minMax(rows.map(r => Math.log10(1 + r.bidRequests)));
  const nRpm = minMax(rows.map(r => r.rpmbr));
  const positive = Object.values(w).filter(x => x > 0).reduce((s, x) => s + x, 0) || 1;

  return rows
    .map(r => {
      const parts: [number, number | null][] = [
        [w.exposure, r.eligibleSpendAtRisk === null ? null : nSpend(r.eligibleSpendAtRisk)],
        [w.bidRequests, nBids(Math.log10(1 + r.bidRequests))],
        [w.rpmbr, nRpm(r.rpmbr)],
        [w.confidence, CONFIDENCE_TIER[r.confidence] / 4],
        [w.severity, r.severity],
        [w.recoverySpeed, r.recoverySpeed],
        [w.effort, r.effort],
        [w.strategic, r.strategic],
      ];
      const raw = parts.reduce((s, [wt, v]) => s + wt * (v ?? 0), 0);
      return {
        key: r.key,
        score: Math.max(0, Math.min(100, (raw / positive) * 100)),
        confidence: r.confidence,
        inputsKnown: parts.filter(([, v]) => v !== null).length,
        inputsTotal: parts.length,
      };
    })
    .sort((a, b) => CONFIDENCE_TIER[b.confidence] - CONFIDENCE_TIER[a.confidence] || b.score - a.score);
}
