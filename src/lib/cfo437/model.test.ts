import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAssumptions, editAssumption } from './assumptions.ts';
import { rpmbr, VISIBLE_VIEW, ALL_ROW_VIEW } from './baseline.ts';
import {
  capacityValue,
  directCostReduction,
  financialStatus,
  horizonRunRates,
  prioritize,
  recoveredBidRequests,
  recoveredSpend,
  resolveExposure,
  spendFromBidRequests,
  totalBenefit,
  valueProtected,
} from './model.ts';
import { aggregate, parseWorkbookCsv, type PublisherRow } from './publishers.ts';

test('RPMBr uses the workbook ×1,000,000 definition', () => {
  assert.ok(Math.abs(rpmbr(VISIBLE_VIEW.spend, VISIBLE_VIEW.bidRequests) - 35.95579079) < 1e-6);
  assert.ok(Math.abs(rpmbr(ALL_ROW_VIEW.spend, ALL_ROW_VIEW.bidRequests) - 35.95612211) < 1e-6);
});

test('Eligible spend defaults to Requires validation, so recovered spend is unavailable', () => {
  const a = defaultAssumptions('base');
  const e = resolveExposure('validated', a, null);
  assert.equal(e.spend, null);
  assert.equal(recoveredSpend(e, a).status, 'unavailable');
});

test('Only validated mode is issue-specific exposure', () => {
  const a = defaultAssumptions('base');
  assert.equal(resolveExposure('all_visible', a, null).isIssueSpecific, false);
  assert.equal(resolveExposure('subset', a, null).isIssueSpecific, false);
  assert.equal(resolveExposure('validated', a, null).isIssueSpecific, true);
});

test('Recovered spend multiplies coverage, recovery rate and probability', () => {
  const a = defaultAssumptions('base'); // 50% × 25% × 50%
  const e = resolveExposure('all_visible', a, null);
  const r = recoveredSpend(e, a);
  assert.ok(Math.abs(r.value! - VISIBLE_VIEW.spend * 0.0625) < 1e-6);
});

test('Spend from recovered bid requests divides by 1,000,000', () => {
  const a = defaultAssumptions('base');
  const e = resolveExposure('all_visible', a, null);
  const bids = recoveredBidRequests(e, a);
  const s = spendFromBidRequests(bids);
  assert.ok(Math.abs(s.value! - (bids.value! * VISIBLE_VIEW.weightedRpmbr) / 1_000_000) < 1e-6);
});

test('Double-counting guard blocks overlapping components until validated', () => {
  const a = defaultAssumptions('base');
  const e = resolveExposure('all_visible', a, null);
  const recovered = recoveredSpend(e, a);
  const fromBids = spendFromBidRequests(recoveredBidRequests(e, a));
  const base = { recovered, directCash: directCostReduction(a), fromBidRequests: fromBids, protectedValue: valueProtected(e, a) };
  const guarded = totalBenefit({ ...base, overlap: 'potential_overlap' });
  assert.equal(guarded.total.value, recovered.value);
  assert.ok(guarded.excluded.some(x => x.reason === 'Blocked by double-counting guard'));
  const validated = totalBenefit({ ...base, overlap: 'validated_non_overlapping' });
  assert.ok(Math.abs(validated.total.value! - (recovered.value! + fromBids.value!)) < 1e-6);
});

test('ROI, payback, NPV and IRR are unavailable without costs and currency', () => {
  const a = defaultAssumptions('base');
  const f = financialStatus({ value: 1000, status: 'ok' }, a, false);
  for (const k of ['netBenefit', 'roi', 'payback', 'npv', 'irr'] as const) assert.equal(f[k].status, 'unavailable');
});

test('Labour value splits direct cash from capacity', () => {
  let a = defaultAssumptions('base');
  assert.equal(directCostReduction(a).status, 'unavailable');
  a = {
    ...a,
    investigations: editAssumption(a.investigations, 40),
    automatedPct: editAssumption(a.automatedPct, 50),
    hoursPerInvestigation: editAssumption(a.hoursPerInvestigation, 3),
    loadedHourlyCost: editAssumption(a.loadedHourlyCost, 100),
    cashRealizationPct: editAssumption(a.cashRealizationPct, 20),
  };
  assert.equal(capacityValue(a).value, 6000);
  assert.equal(directCostReduction(a).value, 1200);
});

test('Horizons scale from the September daily average', () => {
  const rows = horizonRunRates({ value: 3000, status: 'ok' });
  const d7 = rows.find(r => r.days === 7)!;
  assert.ok(Math.abs(d7.baselineSpend - (VISIBLE_VIEW.spend / 30) * 7) < 1e-6);
  assert.equal(d7.recovered.value, 700);
  assert.equal(rows.find(r => r.days === 365)!.recovered.value, 36500);
});

test('A low-confidence issue never outranks confirmed exposure', () => {
  const ranked = prioritize([
    { key: 'big-low', spend: 1e6, bidRequests: 1e10, rpmbr: 90, eligibleSpendAtRisk: 1e6, confidence: 'Low', severity: 1, recoverySpeed: 1, effort: 0, strategic: 1 },
    { key: 'small-confirmed', spend: 10, bidRequests: 1e3, rpmbr: 1, eligibleSpendAtRisk: 10, confidence: 'Confirmed', severity: 0, recoverySpeed: 0, effort: 1, strategic: 0 },
  ]);
  assert.equal(ranked[0].key, 'small-confirmed');
});

test('aggregate() reproduces row counts and recomputes RPMBr', () => {
  const rows: PublisherRow[] = Array.from({ length: 316 }, (_, i) => ({
    publisherId: String(i),
    publisherName: `P${i}`,
    sellerType: i % 2 ? 'BOTH' : 'INTERMEDIARY',
    bidRequests: 1_000_000,
    spend: i < 205 ? 10 : 0,
    rpmbr: i < 205 ? 10 : 0,
    inScope: null,
  }));
  const agg = aggregate(rows);
  assert.equal(agg.rows, 316);
  assert.equal(agg.positiveRows, 205);
  assert.equal(agg.zeroRows, 111);
});

test('CSV parser maps workbook headers and recomputes RPMBr', () => {
  const csv = 'Publisher ID,Publisher Name,Seller Type,BID_REQUEST_COUNT,SPEND_GROSS_PARTNER_REVENUE,RPMBr\n1,"A, Inc",BOTH,"2,000,000",50,999\n';
  const out = parseWorkbookCsv(csv);
  assert.deepEqual(out.missingColumns, []);
  assert.equal(out.rows[0].publisherName, 'A, Inc');
  assert.equal(out.rows[0].rpmbr, 25);
});
