import type { AssumptionSet } from './assumptions.ts';
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
  },
): ScenarioOutputs {
  const exposure = resolveExposure(ctx.mode, a, ctx.subset);
  const recovered = recoveredSpend(exposure, a);
  const recoveredBids = recoveredBidRequests(exposure, a);
  const fromBids = spendFromBidRequests(recoveredBids);
  const protectedValue = valueProtected(exposure, a);
  const directCash = directCostReduction(a);
  const benefit = totalBenefit({ recovered, directCash, fromBidRequests: fromBids, protectedValue, overlap: ctx.overlap });
  return {
    exposure,
    recovered,
    after: spendAfterResolution(recovered),
    incremental: incrementalPct(recovered),
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
