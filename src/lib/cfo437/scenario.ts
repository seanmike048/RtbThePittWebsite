import type { AssumptionSet } from './assumptions.ts';
import { type BaselineView, SCOPE, VISIBLE_VIEW } from './baseline.ts';
import {
  capacityValue,
  directCostReduction,
  effectiveDaysSaved,
  type EligibleMode,
  type Exposure,
  financialStatus,
  type FinancialStatus,
  hoursSaved,
  incrementalPct,
  type OverlapStatus,
  recoveredBidRequests,
  recoveredSpend,
  resolveExposure,
  type Result,
  spendAfterResolution,
  spendFromBidRequests,
  totalBenefit,
  type BenefitBreakdown,
  valueProtected,
} from './model.ts';

export interface ScenarioOutputs {
  exposure: Exposure;
  recovered: Result;
  after: Result;
  incremental: Result;
  recoveredBids: Result;
  fromBids: Result;
  daysSaved: Result;
  protectedValue: Result;
  hours: Result;
  directCash: Result;
  capacity: Result;
  benefit: BenefitBreakdown;
  financial: FinancialStatus;
}

export function runScenario(
  a: AssumptionSet,
  ctx: {
    mode: EligibleMode;
    subset: { spend: number; bidRequests: number; publishers: number } | null;
    overlap: OverlapStatus;
    currencyValidated: boolean;
    baseline?: BaselineView;
    historicalDays?: number;
  },
): ScenarioOutputs {
  const baseline = ctx.baseline ?? VISIBLE_VIEW;
  const days = ctx.historicalDays ?? SCOPE.historicalDays;
  const exposure = resolveExposure(ctx.mode, a, ctx.subset, baseline);
  const recovered = recoveredSpend(exposure, a);
  const recoveredBids = recoveredBidRequests(exposure, a);
  const fromBids = spendFromBidRequests(recoveredBids, baseline.weightedRpmbr);
  const protectedValue = valueProtected(exposure, a, days);
  const directCash = directCostReduction(a);
  const benefit = totalBenefit({ recovered, directCash, fromBidRequests: fromBids, protectedValue, overlap: ctx.overlap });
  return {
    exposure,
    recovered,
    after: spendAfterResolution(recovered, baseline.spend),
    incremental: incrementalPct(recovered, baseline.spend),
    recoveredBids,
    fromBids,
    daysSaved: effectiveDaysSaved(a),
    protectedValue,
    hours: hoursSaved(a),
    directCash,
    capacity: capacityValue(a),
    benefit,
    financial: financialStatus(benefit.total, a, ctx.currencyValidated),
  };
}
