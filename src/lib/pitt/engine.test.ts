import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RUN_2026_10_21, SYNTHETIC } from './data.ts';
import {
  NO_FILTERS, applyFilters, bucketOf, cohortVariance, deriveRows, fmtMoney, fmtNum, funnel, kpis, priorFilters, priorityOf, rankedHypotheses, reconcile, riskTable,
  sankey, trafficContext, whatIf,
} from './engine.ts';
import { bundledRun } from '../cases/bundled.ts';
import { runRemovedTotal } from '../cases/financials.ts';
import type { Dataset, Disconnection } from './types.ts';

const row = (o: Partial<Disconnection>): Disconnection => ({
  PARTNER_ID: 437, PARTNER_NAME: 'x', PUBLISHER: 'p', NETWORK_ID: 1, BUSINESS_UNIT: null, USERNAME: null, CUT_AT: '2026-10-20 10:00', RECONNECTED_AT: null, SPEND_7D_BEFORE: null, ...o,
});

test('Priority rules: P0, P1, P2 exactly as briefed', () => {
  assert.equal(priorityOf(row({ SPEND_7D_BEFORE: 10_000 }), null), 'P0');
  assert.equal(priorityOf(row({ SPEND_7D_BEFORE: 10_000, RECONNECTED_AT: '2026-10-21' }), null), 'P1'); // P0 needs still disconnected
  assert.equal(priorityOf(row({ SPEND_7D_BEFORE: 1_000 }), null), 'P1');
  assert.equal(priorityOf(row({ SPEND_7D_BEFORE: 200 }), -60), 'P1'); // revenue drop >= 50%
  assert.equal(priorityOf(row({ SPEND_7D_BEFORE: null }), null), 'P2'); // still disconnected, missing revenue
  assert.equal(priorityOf(row({ SPEND_7D_BEFORE: 200 }), null), null);
});

test('Age buckets: Current, 1–7, 8–30, 31–90, 90+', () => {
  assert.deepEqual([0, 1, 7, 8, 30, 31, 90, 91].map(bucketOf), ['current', '1-7', '1-7', '8-30', '8-30', '31-90', '31-90', '90+']);
});

for (const ds of [SYNTHETIC, RUN_2026_10_21]) {
  test('Reconciliation OK on ' + ds.label + ', unfiltered and filtered', () => {
    const rows = deriveRows(ds);
    assert.ok(reconcile(ds, rows).ok, reconcile(ds, rows).message);
    for (const pid of [437, 489, 491]) {
      const f = applyFilters(rows, { ...NO_FILTERS, partnerId: pid });
      assert.ok(reconcile(ds, f).ok, reconcile(ds, f).message);
    }
  });
}

test('The real 21 Oct run: USD at risk equals the case layer total (same snapshot, converted day by day)', () => {
  const rows = deriveRows(RUN_2026_10_21);
  const k = kpis(RUN_2026_10_21, rows, null);
  const usd = runRemovedTotal(bundledRun().cases);
  assert.equal(usd.kind, 'usd');
  assert.ok(Math.abs(k.find((x) => x.id === 'atRisk')!.value! - (usd as { usd: number }).usd) < 0.05);
  assert.equal(k.find((x) => x.id === 'networks')!.value, 3);
  assert.equal(k.find((x) => x.id === 'saved')!.value, null); // no saves in the run: "No data", not 0
  assert.equal(fmtMoney(k.find((x) => x.id === 'saved')!.value), 'No data');
  assert.equal(RUN_2026_10_21.currency.code, 'USD');
  assert.equal(SYNTHETIC.currency.code, 'USD');
});

test('Filters apply before every derivation: KPI, Sankey and table follow the same cohort', () => {
  const rows = deriveRows(SYNTHETIC);
  const f = applyFilters(rows, { ...NO_FILTERS, businessUnit: 'Ad Networks' });
  assert.ok(f.length > 0 && f.length < rows.length);
  assert.ok(f.every((r) => r.BUSINESS_UNIT === 'Ad Networks'));
  const r = reconcile(SYNTHETIC, f);
  assert.ok(r.ok);
  assert.ok(sankey(f).nodes.filter((n) => n.column === 0).every((n) => n.name === 'Ad Networks'));
});

test('Prior period is the equal-length window just before', () => {
  assert.deepEqual(priorFilters({ ...NO_FILTERS, from: '2026-10-01', to: '2026-10-10' }), { ...NO_FILTERS, from: '2026-09-21', to: '2026-09-30' });
  assert.equal(priorFilters(NO_FILTERS), null);
});

test('NO_DATA is never a pass; hypotheses keep source order with no confidence; missing refs are unverified', () => {
  const ds: Dataset = {
    ...RUN_2026_10_21,
    checks: [{ network_id: 1, check: 'IVT', window: 'AFTER', result: 'NO_DATA', evidence_ref: 'r1', detail: '' }],
    investigations: [{ network_id: 1, hypotheses: [{ label: 'first', evidence_refs: ['r1', 'nope'], missing_info: [] }, { label: 'second', evidence_refs: [], missing_info: [] }], draft_message: null, validation: { passed: null, ai_output_accepted: null, fallback_fields: null } }],
  };
  const hs = rankedHypotheses(ds, 1);
  assert.deepEqual(hs.map((h) => h.label), ['first', 'second']);
  assert.deepEqual(hs[0].unverified, ['nope']);
  assert.ok(!('confidence' in hs[0]) && !('shownConfidence' in hs[0]));
  const k = kpis(ds, deriveRows({ ...ds, disconnections: [row({ NETWORK_ID: 1 })] }), null);
  assert.equal(k.find((x) => x.id === 'failing')!.value, 0);
});

test('"Drop is Amazon-specific" only when auctions are stable and Amazon bid requests dropped', () => {
  const ids = [...new Set(SYNTHETIC.traffic.map((t) => t.network_id))];
  const flags = ids.map((id) => ({ id, ...trafficContext(SYNTHETIC, id) }));
  for (const f of flags) {
    const a = f.metrics.find((m) => m.metric === 'network_auctions_per_day')!.change!;
    const b = f.metrics.find((m) => m.metric === 'amazon_bid_requests_per_day')!.change!;
    assert.equal(f.amazonSpecific, Math.abs(a) <= 10 && b <= -50);
  }
  assert.ok(flags.some((f) => f.amazonSpecific) && flags.some((f) => !f.amazonSpecific));
  assert.equal(trafficContext(RUN_2026_10_21, 4883).amazonSpecific, false); // spend metric only: no banner
  assert.ok(!JSON.stringify([RUN_2026_10_21, SYNTHETIC]).match(/rpmbr|RPMBR|"confidence"|€/)); // removed from the product data
});

test('Funnel: intake, continued %, dropped and top 3 reasons; no funnel data gives no stages', () => {
  const rows = deriveRows(SYNTHETIC);
  const f = funnel(SYNTHETIC, rows, rows[0].NETWORK_ID);
  assert.equal(f.stages.length, 5);
  assert.ok(f.stages[1].reasons.length <= 3);
  assert.equal(f.stages[0].dropped, f.stages[0].intake! - f.stages[1].intake!);
  assert.equal(funnel(RUN_2026_10_21, deriveRows(RUN_2026_10_21), null).stages.length, 0);
});

test('Revenue variance: pre-cut = removed + reconnected seats; nothing is called recovered; missing measures are unavailable', () => {
  const rows = deriveRows(SYNTHETIC);
  const v = cohortVariance(rows);
  const val = (id: string) => v.find((x) => x.id === id)!.value!;
  assert.ok(Math.abs(val('precut') - val('removed') - val('reconnected')) < 1e-6);
  assert.ok(v.every((x) => !/recovered/i.test(x.label)));
  for (const id of ['runrate', 'projected', 'restored']) assert.equal(v.find((x) => x.id === id)!.value, null);
  assert.ok(v.every((x) => x.label.length <= 22)); // short labels, no seat names
});

test('What-if: fixing ads.txt projects revenue and lowers P0 only through the same rules', () => {
  const rows = deriveRows(SYNTHETIC);
  const none = whatIf(SYNTHETIC, rows, [], null);
  assert.equal(none.fixedNetworks, 0);
  assert.equal(none.p0After, none.p0Before);
  const all = whatIf(SYNTHETIC, rows, ['ADS_TXT', 'SCO', 'BLOCKED_INVENTORY', 'IVT'], null);
  assert.equal(all.fixedNetworks, all.fixableNetworks);
  assert.ok(all.p0After <= all.p0Before);
  assert.equal(whatIf(SYNTHETIC, rows, [], 2).fixedNetworks, 2);
});

test('Risk table: at-risk toggle and sorts', () => {
  const rows = deriveRows(SYNTHETIC);
  const t = riskTable(rows, 'value', true);
  assert.ok(t.every((r) => r.RECONNECTED_AT == null));
  for (let i = 1; i < t.length; i++) assert.ok((t[i - 1].SPEND_7D_BEFORE ?? -1) >= (t[i].SPEND_7D_BEFORE ?? -1));
  assert.equal(fmtNum(null), 'No data');
});

test('Room components render only engine output: no arithmetic on data in components', () => {
  const dir = 'src/components/room';
  for (const f of readdirSync(dir)) {
    const t = readFileSync(join(dir, f), 'utf8');
    assert.doesNotMatch(t, /from '\.\.\/\.\.\/lib\/pitt\/data\.ts'.*\n[\s\S]*\.reduce\(/, f);
    assert.doesNotMatch(t, /SPEND_7D_BEFORE\s*[*/+-]|\.reduce\(\(a, r\) => a \+ r\.SPEND/, f);
    // Built from parts so this test file does not trip the site-wide raw-HTML scan in finance.test.ts.
    assert.doesNotMatch(t, new RegExp(['dangerously', 'SetInner', 'HTML'].join('') + '|lorem ipsum', 'i'), f);
  }
});
