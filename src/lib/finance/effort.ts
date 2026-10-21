/**
 * Human effort. Net hours released per case = manual comparison touch hours − Pitt-assisted touch hours, by task.
 * Workflow runtime is not effort. Negative savings stay negative. Capacity value is not cash.
 */
import { type CurrencyStatus } from './currency.ts';
import { unavailable, val, type Val } from './values.ts';

export type EffortBasis = 'measured' | 'assumed' | 'missing';

export interface EffortTask {
  task: string;
  role: string;
  manualMinutes: number | null;
  pittMinutes: number | null;
  basis: EffortBasis;
  sampleSize: number | null;
}

/** Tasks the workflow output implies a person still does; minutes stay blank until measured. */
export const EFFORT_TASKS: EffortTask[] = [
  { task: 'Detect the cut and open a case', role: 'Demand Ops', manualMinutes: null, pittMinutes: null, basis: 'missing', sampleSize: null },
  { task: 'Pull activity, connection log and quality checks', role: 'TechOps', manualMinutes: null, pittMinutes: null, basis: 'missing', sampleSize: null },
  { task: 'Write the diagnosis and route actions', role: 'TechOps', manualMinutes: null, pittMinutes: null, basis: 'missing', sampleSize: null },
  { task: 'Review and approve the investigation', role: 'Approver', manualMinutes: null, pittMinutes: null, basis: 'missing', sampleSize: null },
  { task: 'Rework and follow-up', role: 'KAM / Partnerships', manualMinutes: null, pittMinutes: null, basis: 'missing', sampleSize: null },
];

export function netHours(t: EffortTask): Val {
  if (t.manualMinutes === null || t.pittMinutes === null) return unavailable('Manual and Pitt-assisted minutes are both required.', ['manual minutes', 'Pitt-assisted minutes']);
  return val((t.manualMinutes - t.pittMinutes) / 60);
}

export function effortSummary(tasks: EffortTask[]) {
  const per = tasks.map(t => ({ ...t, net: netHours(t) }));
  const known = per.filter(p => p.net.kind !== 'unavailable');
  const total: Val = known.length === per.length
    ? val(known.reduce((a, p) => a + (p.net.kind === 'zero' ? 0 : (p.net as { v: number }).v), 0))
    : unavailable(`${per.length - known.length} of ${per.length} tasks have no measured or assumed minutes.`, ['active minutes by task and role']);
  const byRole = new Map<string, number>();
  for (const p of known) byRole.set(p.role, (byRole.get(p.role) ?? 0) + (p.net.kind === 'zero' ? 0 : (p.net as { v: number }).v));
  return { per, total, byRole: [...byRole.entries()], measured: per.every(p => p.basis === 'measured') };
}

/** Capacity value = net hours × validated loaded hourly cost. Shown apart from cash savings. */
export function capacityValue(hours: Val, loadedHourlyCost: number | null, currency: CurrencyStatus | null): Val {
  if (hours.kind === 'unavailable' || hours.kind === 'missing') return unavailable('Net hours released are unavailable.', ['effort by task']);
  if (loadedHourlyCost === null || !currency || currency.basis !== 'finance-validated')
    return unavailable('Hours can be shown; their value needs a Finance-validated loaded hourly cost.', ['loaded hourly cost', 'currency']);
  const h = hours.kind === 'zero' ? 0 : (hours as { v: number }).v;
  return val(h * loadedHourlyCost);
}

export interface SeatRecord {
  networkId: string;
  partnerId: number;
  cutAt: string;
}

/**
 * One investigation per workflow case, however many seats it covers. Seats cut on the same network within the same
 * minute and reported by one workflow output belong to that one case.
 */
export function casesFromSeats(caseKey: string, networkId: string, seats: SeatRecord[]) {
  const mine = seats.filter(s => s.networkId === networkId);
  const minutes = new Set(mine.map(s => s.cutAt.slice(0, 16)));
  return { investigations: 1, caseKey, seats: mine.length, distinctCutMinutes: minutes.size, revenueWindows: 1 };
}
