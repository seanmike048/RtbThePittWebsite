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

import { isVisible, parseSheetMatrix, WORKBOOK_ROWS } from './publishers.ts';
import { snowflakeRows, toConnectionState } from './live.ts';

test('Embedded workbook rows reproduce the validated visible and all-row baselines', () => {
  const vis = aggregate(WORKBOOK_ROWS.filter(isVisible));
  assert.equal(vis.rows, VISIBLE_VIEW.rows);
  assert.equal(vis.positiveRows, VISIBLE_VIEW.positiveRows);
  assert.equal(vis.zeroRows, VISIBLE_VIEW.zeroRows);
  assert.equal(vis.bidRequests, VISIBLE_VIEW.bidRequests);
  assert.ok(Math.abs(vis.spend - VISIBLE_VIEW.spend) < 1e-4);
  assert.ok(Math.abs(vis.weightedRpmbr - VISIBLE_VIEW.weightedRpmbr) < 1e-6);
  assert.ok(Math.abs(vis.medianPositiveRpmbr - VISIBLE_VIEW.medianPositiveRpmbr) < 1e-6);
  assert.ok(Math.abs(vis.top16SharePct - VISIBLE_VIEW.top16SharePct) < 1e-4);
  const all = aggregate(WORKBOOK_ROWS);
  assert.equal(all.rows, ALL_ROW_VIEW.rows);
  assert.equal(all.positiveRows, ALL_ROW_VIEW.positiveRows);
  assert.ok(Math.abs(all.spend - ALL_ROW_VIEW.spend) < 1e-4);
  assert.ok(Math.abs(all.medianPositiveRpmbr - ALL_ROW_VIEW.medianPositiveRpmbr) < 1e-6);
});

test('Sheet matrix parser finds the header row under the summary block', () => {
  const m = [
    [null, null, 'total', null, 10, 5],
    ['PUBLISHER_ID', 'Publisher Name', 'Seller Type', '% Reseller Supply', 'BID_REQUEST_COUNT', 'SPEND_GROSS_PARTNER_REVENUE', 'RPMBr', 'KAM', 'TAM', 'In Scope', 'Disconected'],
    [5026, 'Thunder', 'INTERMEDIARY', 1, 2_000_000, 50, 25, 'x', 'y', '1', null],
  ];
  const out = parseSheetMatrix(m);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].publisherId, '5026');
  assert.equal(out.rows[0].rpmbr, 25);
  assert.equal(out.rows[0].inScope, true);
  assert.equal(out.rows[0].resellerPct, 100);
});

test('Snowflake payload maps to connection state', () => {
  const summary = snowflakeRows({
    result_set: {
      data: [['Connected', '2174', null], ['Disconnected', '104', '2026-10-01 08:28:00.000']],
      resultSetMetaData: { rowType: [{ name: 'STATUS' }, { name: 'NETWORKS' }, { name: 'LATEST_CUT' }] },
    },
  });
  const list = snowflakeRows({
    result_set: {
      data: [['5339', 'Raptive STR', '2026-10-01 08:28:00.000', 'US']],
      resultSetMetaData: { rowType: [{ name: 'NETWORK_ID' }, { name: 'NETWORK_NAME' }, { name: 'DATE_DISCONNECTION' }, { name: 'SUPPLY_BUSINESS_UNIT' }] },
    },
  });
  const s = toConnectionState(summary, list, '2026-10-20T20:00Z');
  assert.equal(s.connected, 2174);
  assert.equal(s.disconnected, 104);
  assert.equal(s.latestCut, '2026-10-01 08:28');
  assert.equal(s.networks[0].networkName, 'Raptive STR');
  assert.throws(() => snowflakeRows({ nope: 1 }));
});

import { daysInMonth, sqlPublisherRows, toPublisherRows } from './live.ts';
import { horizonRunRates as hrr } from './model.ts';

test('Publisher SQL only accepts YYYY-MM months', () => {
  assert.ok(sqlPublisherRows('2026-09').includes("month = '2026-09-01'"));
  assert.throws(() => sqlPublisherRows("2026-09'; DROP TABLE x; --"));
  assert.throws(() => sqlPublisherRows('2026-13'));
});

test('Snowflake publisher rows recompute RPMBr with ×1,000,000', () => {
  const r = toPublisherRows([{ PUBLISHER_ID: '5026', PUBLISHER_NAME: 'T', SELLER_TYPE: 'INTERMEDIARY', BID_REQUESTS: '2000000', SPEND: '50' }]);
  assert.equal(r[0].rpmbr, 25);
  assert.equal(r[0].sellerType, 'INTERMEDIARY');
});

test('Horizons use the baseline month length', () => {
  assert.equal(daysInMonth('2026-08'), 31);
  assert.equal(daysInMonth('2026-02'), 28);
  const rows = hrr({ value: 3100, status: 'ok' }, 31000, 31);
  assert.equal(rows.find(r => r.days === 7)!.baselineSpend, 7000);
  assert.equal(rows.find(r => r.days === 7)!.recovered.value, 700);
});
