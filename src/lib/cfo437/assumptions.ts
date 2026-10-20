import type { Classification } from './baseline.ts';

export type Confidence = 'High' | 'Medium' | 'Low' | 'None';
export type ScenarioId = 'conservative' | 'base' | 'upside';

export interface Assumption {
  id: AssumptionId;
  label: string;
  value: number | null;
  unit: string;
  source: string;
  owner: string;
  confidence: Confidence;
  lastUpdated: string;
  status: Classification;
  group: 'Exposure' | 'Recovery' | 'Detection' | 'Labour' | 'Cost';
}

export type AssumptionId =
  | 'eligiblePublishers'
  | 'eligibleSpend'
  | 'eligibleBidRequests'
  | 'coveragePct'
  | 'recoveryRatePct'
  | 'bidRecoveryRatePct'
  | 'recoveryProbabilityPct'
  | 'historicalDetectionDays'
  | 'expectedDetectionDays'
  | 'daysSaved'
  | 'historicalRecoveryProbabilityPct'
  | 'investigations'
  | 'automatedPct'
  | 'hoursPerInvestigation'
  | 'loadedHourlyCost'
  | 'cashRealizationPct'
  | 'implementationCost'
  | 'operatingCost';

export type AssumptionSet = Record<AssumptionId, Assumption>;

const UPDATED = '2026-10-20';

const pending = (
  id: AssumptionId,
  label: string,
  unit: string,
  owner: string,
  group: Assumption['group'],
): Assumption => ({
  id,
  label,
  value: null,
  unit,
  source: 'Requires validation',
  owner,
  confidence: 'None',
  lastUpdated: UPDATED,
  status: 'unavailable',
  group,
});

const scenarioRate = (id: AssumptionId, label: string, value: number, group: Assumption['group']): Assumption => ({
  id,
  label,
  value,
  unit: '%',
  source: 'Scenario assumption (editable)',
  owner: 'Finance + TechOps',
  confidence: 'Low',
  lastUpdated: UPDATED,
  status: 'scenario_assumption',
  group,
});

const RATES: Record<ScenarioId, { coverage: number; recovery: number; bidRecovery: number; probability: number }> = {
  conservative: { coverage: 25, recovery: 10, bidRecovery: 10, probability: 25 },
  base: { coverage: 50, recovery: 25, bidRecovery: 25, probability: 50 },
  upside: { coverage: 75, recovery: 50, bidRecovery: 50, probability: 75 },
};

export function defaultAssumptions(scenario: ScenarioId): AssumptionSet {
  const r = RATES[scenario];
  return {
    eligiblePublishers: pending('eligiblePublishers', 'Eligible affected publishers', 'publishers', 'Partnerships', 'Exposure'),
    eligibleSpend: pending('eligibleSpend', 'Eligible spend at risk', 'SCU / month', 'Finance + Partnerships', 'Exposure'),
    eligibleBidRequests: pending('eligibleBidRequests', 'Eligible bid requests', 'bid requests / month', 'TechOps', 'Exposure'),
    coveragePct: scenarioRate('coveragePct', 'Issue resolution coverage', r.coverage, 'Recovery'),
    recoveryRatePct: scenarioRate('recoveryRatePct', 'Spend recovery rate', r.recovery, 'Recovery'),
    bidRecoveryRatePct: scenarioRate('bidRecoveryRatePct', 'Bid-request recovery rate', r.bidRecovery, 'Recovery'),
    recoveryProbabilityPct: scenarioRate('recoveryProbabilityPct', 'Recovery probability', r.probability, 'Recovery'),
    historicalDetectionDays: pending('historicalDetectionDays', 'Historical detection time', 'days', 'TechOps', 'Detection'),
    expectedDetectionDays: pending('expectedDetectionDays', 'Expected detection time with The Pitt', 'days', 'TechOps + Product', 'Detection'),
    daysSaved: pending('daysSaved', 'Days saved', 'days', 'TechOps', 'Detection'),
    historicalRecoveryProbabilityPct: pending(
      'historicalRecoveryProbabilityPct',
      'Historical recovery probability',
      '%',
      'TechOps',
      'Detection',
    ),
    investigations: pending('investigations', 'Investigations per month', 'investigations', 'TechOps', 'Labour'),
    automatedPct: pending('automatedPct', 'Share automated or accelerated', '%', 'TechOps + Product', 'Labour'),
    hoursPerInvestigation: pending('hoursPerInvestigation', 'Hours per investigation', 'hours', 'TechOps', 'Labour'),
    loadedHourlyCost: pending('loadedHourlyCost', 'Loaded hourly cost', 'cost units / hour', 'Finance', 'Labour'),
    cashRealizationPct: pending('cashRealizationPct', 'Cash-realization rate', '%', 'Finance', 'Labour'),
    implementationCost: pending('implementationCost', 'Implementation cost', 'cost units', 'Finance + Product', 'Cost'),
    operatingCost: pending('operatingCost', 'Ongoing operating cost', 'cost units / month', 'Finance + Product', 'Cost'),
  };
}

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  conservative: 'Conservative',
  base: 'Base case',
  upside: 'Upside',
};

export const SCENARIO_IDS: ScenarioId[] = ['conservative', 'base', 'upside'];

/** Edits mark a value as a user-entered scenario assumption (or unavailable when cleared). */
export function editAssumption(a: Assumption, value: number | null, today = UPDATED): Assumption {
  if (value === null) return { ...a, value: null, status: 'unavailable', source: 'Requires validation', confidence: 'None', lastUpdated: today };
  return {
    ...a,
    value,
    status: a.status === 'unavailable' ? 'scenario_assumption' : a.status,
    source: a.status === 'unavailable' ? 'Entered on page (unvalidated)' : a.source,
    confidence: a.confidence === 'None' ? 'Low' : a.confidence,
    lastUpdated: today,
  };
}
