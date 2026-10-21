/**
 * CFO economics from Finance-approved cash flows only. Gross buyer spend is not a profit numerator until a
 * Finance-approved contribution definition converts it.
 */
import { type CurrencyStatus } from './currency.ts';
import { unavailable, val, type Val } from './values.ts';

export interface CashPeriod {
  label: string;
  /** Approved monetary benefits: incremental contribution + evidenced cash savings. */
  benefit: number | null;
  /** Implementation, recurring infrastructure / model / operations and servicing costs. */
  cost: number | null;
}

export interface CashInputs {
  periods: CashPeriod[];
  /** Per-period discount rate, already converted to the period length. */
  discountRatePerPeriod: number | null;
  currency: CurrencyStatus;
  benefitIsApprovedContribution: boolean;
}

export const ROI_NO_COSTS = 'ROI unavailable until implementation and operating costs are provided.';
export const NOT_REACHED = 'Not reached within modeled horizon';

export interface CashResult {
  net: Val;
  roi: Val;
  payback: { kind: 'period'; label: string } | { kind: 'not-reached' } | { kind: 'unavailable'; reason: string };
  npv: Val;
  irr: Val;
  cumulative: { label: string; value: number }[] | null;
  blockers: string[];
}

export function cashFlow(inp: CashInputs): CashResult {
  const blockers: string[] = [];
  if (inp.currency.basis !== 'finance-validated') blockers.push('Finance-validated currency');
  if (!inp.benefitIsApprovedContribution) blockers.push('Finance-approved contribution definition (gross spend is not profit)');
  const costsKnown = inp.periods.length > 0 && inp.periods.every(p => p.cost !== null);
  const benefitsKnown = inp.periods.length > 0 && inp.periods.every(p => p.benefit !== null);
  if (!costsKnown) blockers.push('implementation and operating costs');
  if (!benefitsKnown) blockers.push('approved monetary benefits by period');

  const blocked = (reason: string): CashResult => ({
    net: unavailable(reason, blockers),
    roi: unavailable(!costsKnown ? ROI_NO_COSTS : reason, blockers),
    payback: { kind: 'unavailable', reason },
    npv: unavailable(reason, blockers),
    irr: unavailable(reason, blockers),
    cumulative: null,
    blockers,
  });
  if (blockers.length) return blocked(`Needs ${blockers.join('; ')}.`);

  const flows = inp.periods.map(p => p.benefit! - p.cost!);
  const totalCost = inp.periods.reduce((a, p) => a + p.cost!, 0);
  const net = flows.reduce((a, f) => a + f, 0);
  let cum = 0;
  const cumulative = inp.periods.map((p, i) => ({ label: p.label, value: (cum += flows[i]) }));
  const crossing = cumulative.find(c => c.value >= 0);
  const npv =
    inp.discountRatePerPeriod === null
      ? unavailable('NPV needs an approved discount rate.', ['discount rate'])
      : val(flows.reduce((a, f, i) => a + f / (1 + inp.discountRatePerPeriod!) ** (i + 1), 0));
  return {
    net: val(net),
    roi: totalCost > 0 ? val((net / totalCost) * 100) : unavailable(ROI_NO_COSTS, ['positive incremental costs']),
    payback: crossing ? { kind: 'period', label: crossing.label } : { kind: 'not-reached' },
    npv,
    irr: irr(flows),
    cumulative,
    blockers: [],
  };
}

/** IRR only when the flows change sign exactly once (a unique root); otherwise unavailable. */
export function irr(flows: number[]): Val {
  const signs = flows.filter(f => f !== 0).map(Math.sign);
  const changes = signs.filter((s, i) => i > 0 && s !== signs[i - 1]).length;
  if (changes !== 1) return unavailable('IRR is not interpretable: cash flows must change sign exactly once.');
  const npv = (r: number) => flows.reduce((a, f, i) => a + f / (1 + r) ** (i + 1), 0);
  let lo = -0.99;
  let hi = 10;
  if (Math.sign(npv(lo)) === Math.sign(npv(hi))) return unavailable('IRR outside the searchable range.');
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(npv(mid)) === Math.sign(npv(lo))) lo = mid;
    else hi = mid;
  }
  return val(((lo + hi) / 2) * 100);
}
