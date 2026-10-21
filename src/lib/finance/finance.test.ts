/** Acceptance tests from §12 of the financial impact brief, plus the financial identities. Fixtures are unit-test math, not business data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { aggregateMoney, NARRATIVE, unitLabel, WAREHOUSE_SPEND, type CurrencyStatus } from './currency.ts';
import { pooledRpmbr, rpmbr, pctChange } from './metrics.ts';
import { accelerationValue, addDays, decompose, horizonTotals, runScenario, tornado, validateInputs, BLANK_INPUTS, type BaselineDay, type ScenarioInputs } from './scenario.ts';
import { caseBaseline, denseDays, networkSeries, PORTFOLIO_DAILY, projectBaseline, seatSeries, INSUFFICIENT_HISTORY } from './baseline.ts';
import { capacityValue, casesFromSeats, effortSummary, EFFORT_TASKS, netHours } from './effort.ts';
import { cashFlow, irr, ROI_NO_COSTS } from './cashflow.ts';
import { addCase, approvedRecoverable, causeConflict, claims, endpoint437Exposure, ingest, reconcileRevenue, TUBI_FINANCIALS } from './evidence.ts';
import { buildExport, illustrative, parseSaved } from './assumptions.ts';
import { mergeRefresh } from './provenance.ts';
import { sha256Hex } from './hash.ts';
import { num, sumVals, val, missing, excluded, unavailable } from './values.ts';
import { TUBI_REPORT_TEXT } from '../investigations/tubi5100.ts';
import { parseInvestigation } from '../investigations/report.ts';

const flat = (days: number, B0: number, Y0: number, start = '2026-11-01'): BaselineDay[] =>
  Array.from({ length: days }, (_, i) => ({ day: addDays(start, i), kind: 'projection' as const, B0, Y0: val(Y0), S0: (B0 * Y0) / 1e6 }));

const vy = (over: Partial<ScenarioInputs> = {}): ScenarioInputs => ({
  ...BLANK_INPUTS,
  mode: 'volume-yield',
  resolutionDate: '2026-11-01',
  rampDays: 0,
  q: 0.5,
  p: 0.4,
  targetBidRequestsPerDay: 2_000_000,
  yieldChange: 10,
  ...over,
});

test('endpoint 437 Display never inherits the 16,037 Tubi all-Amazon case amount', () => {
  const r = reconcileRevenue(16037);
  assert.equal(r.endpoint437, 0);
  const e = endpoint437Exposure();
  assert.equal(e.kind, 'excluded');
  assert.equal(num(e), null, 'an excluded amount is not usable arithmetic');
});

test('11,267.01 + 4,770.19 reconcile to 16,037.20, not exactly 16,037; rounding provenance kept', () => {
  const r = reconcileRevenue(parseInvestigation(TUBI_REPORT_TEXT).revenue7d.amount);
  assert.equal(r.displayedSum, 16037.2);
  assert.notEqual(r.displayedSum, 16037);
  assert.equal(r.roundingDifference, 0.2);
  assert.equal(r.reportedIsRoundedDetailed, true);
  assert.ok(Math.abs(r.detailed - 16037.192306) < 1e-6);
  assert.ok(Math.abs(r.window.fullDays.amount - 18076.611634) < 1e-5, 'full-day window differs and is kept separately');
});

test('a zero pre-period for 437 creates no unsupported recovery value; a comparator must be explicit', () => {
  const days: BaselineDay[] = Array.from({ length: 10 }, (_, i) => ({ day: addDays('2026-11-01', i), kind: 'projection', B0: 0, Y0: rpmbr(0, 0), S0: 0 }));
  const noComparator = runScenario(days, vy());
  assert.equal(noComparator.status, 'unavailable');
  assert.ok(noComparator.status === 'unavailable' && noComparator.missing.some(m => /Comparator yield/.test(m)));
  const gap = runScenario(days, { ...vy(), mode: 'spend-gap', counterfactualSpendPerDay: 0 });
  assert.equal(gap.status, 'ok');
  assert.equal(gap.status === 'ok' && gap.rows.every(r => r.uplift === 0), true);
});

test('a planned phase-out / unresolved authorization is excluded from approved totals but stays visible', () => {
  const a = approvedRecoverable([TUBI_FINANCIALS]);
  assert.equal(a.total.kind, 'unavailable');
  assert.equal(a.excluded.length, 1);
  assert.equal(a.excluded[0].shown.kind, 'excluded');
  assert.ok(a.excluded[0].diagnosticAmount! > 16000);
  assert.notEqual(a.total.kind, 'zero');
});

test('missing currency prevents cross-case sums and symbols; synthetic cases never enter official totals', () => {
  const items = [
    { label: 'Case A', amount: val(10), currency: WAREHOUSE_SPEND },
    { label: 'Case B', amount: val(5), currency: NARRATIVE },
  ];
  assert.equal(aggregateMoney(items, { official: false }).kind, 'unavailable');
  assert.equal(unitLabel(NARRATIVE), 'source currency units');
  assert.equal(unitLabel(WAREHOUSE_SPEND), 'source currency units', 'source-documented EUR is not shown as EUR');
  assert.doesNotMatch(unitLabel(WAREHOUSE_SPEND, true), /[€$]|EUR|USD/);
  const validated: CurrencyStatus = { code: 'EUR', basis: 'finance-validated', note: '' };
  assert.equal(unitLabel(validated), 'EUR');
  const synth = aggregateMoney([{ label: 'Demo', amount: val(1), currency: validated, synthetic: true }], { official: true });
  assert.equal(synth.kind, 'unavailable');
  assert.equal(num(aggregateMoney([{ label: 'A', amount: val(1), currency: validated }, { label: 'B', amount: val(2), currency: validated }], { official: true })), 3);
  assert.equal(aggregateMoney([{ label: 'A', amount: val(1), currency: WAREHOUSE_SPEND }], { official: true }).kind, 'unavailable');
});

test('evidence confidence MEDIUM is never converted into a success probability', () => {
  const r = parseInvestigation(TUBI_REPORT_TEXT);
  assert.equal(r.evidenceConfidence, 'MEDIUM');
  assert.equal(BLANK_INPUTS.p, null);
  const ps = (['Conservative', 'Base case', 'Upside'] as const).map(name => {
    const s = illustrative('case', name, { meanBidRequests: 1, firstProjectedDay: '2026-10-20', preCutDailySpend: 1 });
    assert.equal(s.meta.approval, 'illustrative');
    return s.inputs.p;
  });
  assert.deepEqual(ps, [0.25, 0.5, 0.75], 'illustrative p is a fixed, labelled demo value, not derived from evidence');
  for (const f of readdirSync('src/lib/finance').filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')))
    assert.doesNotMatch(readFileSync(join('src/lib/finance', f), 'utf8'), /evidenceConfidence/, `${f} must not read evidence confidence`);
});

test('a human-approved narrative can stay contradicted by later evidence; both kept with timestamps', () => {
  const c = ingest(TUBI_REPORT_TEXT, '2026-10-20T00:00:00Z');
  assert.equal(c.report.approval?.includes('Human approval completed'), true);
  const list = claims(c.report, c.ingestedAt);
  const cause = list.filter(x => x.topic === 'Cause');
  assert.equal(cause.length, 2);
  assert.equal(cause[0].source, 'workflow narrative');
  assert.equal(cause[1].source, 'connection log');
  assert.ok(cause[0].recordedAt && cause[1].recordedAt);
  assert.equal(causeConflict().status, 'conflict · unreviewed');
  assert.equal(c.raw, TUBI_REPORT_TEXT, 'raw payload unchanged');
  assert.ok(Object.isFrozen(c));
});

test('RPMBr: spend 100 over 1,000,000 bid requests is 100 per million', () => {
  assert.equal(num(rpmbr(100, 1_000_000)), 100);
});

test('pooled RPMBr is Σspend/ΣBR; zero denominators are unavailable, not 0 or Infinity', () => {
  const p = pooledRpmbr([
    { spend: 100, bidRequests: 1_000_000 },
    { spend: 0, bidRequests: 3_000_000 },
  ]);
  assert.equal(num(p), 25, 'not the mean of row yields (50)');
  assert.equal(pooledRpmbr([{ spend: 0, bidRequests: 0 }]).kind, 'unavailable');
  assert.equal(rpmbr(5, 0).kind, 'unavailable');
  assert.equal(pctChange(val(0), val(5)).kind, 'unavailable');
});

test('volume + yield + interaction equals the spend difference; probability applied once', () => {
  const d = decompose(1_000_000, 20, 1_500_000, 26);
  assert.ok(Math.abs(d.volume + d.yield + d.interaction - d.total) < 1e-9);
  assert.ok(Math.abs(d.total - (1_500_000 * 26 - 1_000_000 * 20) / 1e6) < 1e-9);
  const neg = decompose(1_000_000, 20, 1_000_000, 15);
  assert.ok(neg.yield < 0, 'signed values are kept');
  const r = runScenario(flat(5, 1_000_000, 20), vy());
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  for (const row of r.rows) {
    assert.ok(Math.abs(row.expectedIncremental - 0.4 * row.uplift) < 1e-9, 'p × uplift, not p²');
    assert.ok(Math.abs(row.volume! + row.yield! + row.interaction! - row.uplift) < 1e-9);
  }
});

test('faster-resolution value is a component, not added twice', () => {
  const base = flat(60, 1_000_000, 20);
  const inp = vy({ rampDays: 7 });
  const a = accelerationValue(base, inp, '2026-11-01', '2026-11-11', '2026-12-31');
  assert.equal(a.value.kind, 'value');
  const early = a.early!;
  const late = a.late!;
  const inWin = (r: { day: string }) => r.day >= '2026-11-01' && r.day < '2026-12-31';
  const lateInc = late.status === 'ok' ? late.rows.filter(inWin).reduce((s, r) => s + r.expectedIncremental, 0) : NaN;
  const earlyInc = early.status === 'ok' ? early.rows.filter(inWin).reduce((s, r) => s + r.expectedIncremental, 0) : NaN;
  assert.ok(Math.abs(lateInc + num(a.value)! - earlyInc) < 1e-6, 'early incremental already contains the acceleration');
  assert.equal(num(a.earlyIncremental!), earlyInc);
});

test('five seats in one workflow case are one investigation and one revenue window', () => {
  const seats = [437, 489, 490, 491, 492].map(p => ({ networkId: '5100', partnerId: p, cutAt: '2026-09-25 08:11:12' }));
  const c = casesFromSeats('local:x', '5100', seats);
  assert.equal(c.investigations, 1);
  assert.equal(c.seats, 5);
  assert.equal(c.revenueWindows, 1);
  const r = reconcileRevenue(16037);
  assert.ok(r.detailed < 16100, 'the window total is counted once');
  assert.equal(parseInvestigation(TUBI_REPORT_TEXT).meta.seatCount, 5);
});

test('zero, missing, negative, excluded and unavailable are distinct; missing days never render as observed zero', () => {
  const kinds = [val(0), val(-1), val(1), missing('m'), excluded('e', 3), unavailable('u')].map(v => v.kind);
  assert.deepEqual(kinds, ['zero', 'negative', 'value', 'missing', 'excluded', 'unavailable']);
  assert.equal(sumVals([val(1), missing('no row')]).kind, 'unavailable');
  const net = networkSeries(5100, '2026-10-13', '2026-10-19');
  assert.equal(net.find(d => d.day === '2026-10-14')!.allDsp.kind, 'value');
  assert.equal(net.find(d => d.day === '2026-10-15')!.allDsp.kind, 'missing');
  const seat = seatSeries(492, '2026-10-13', '2026-10-19');
  assert.equal(seat.find(d => d.day === '2026-10-14')!.state.kind, 'zero');
  assert.equal(seat.find(d => d.day === '2026-10-16')!.spend, null);
  const dense = denseDays([{ day: '2026-01-01', v: 1 }], '2026-01-01', '2026-01-03', day => ({ day, v: null as number | null }));
  assert.equal(dense[1].v, null);
});

test('actuals stay separate from projections; September-only data does not create a time series', () => {
  const monthly = [{ day: '2026-09-01', bidRequests: 201_042_845_839, spend: 7_228_721.11 }];
  const p = projectBaseline(monthly, '2026-12-31');
  assert.equal(p.status, 'unavailable');
  assert.equal(p.status === 'unavailable' && p.reason, INSUFFICIENT_HISTORY);
  const ok = projectBaseline(PORTFOLIO_DAILY, '2026-11-30');
  assert.equal(ok.status, 'ok');
  if (ok.status !== 'ok') return;
  assert.ok(ok.days.filter(d => d.kind === 'actual').every(d => d.day <= '2026-10-19'));
  assert.ok(ok.days.filter(d => d.kind === 'projection').every(d => d.day > '2026-10-19'));
  const bad = runScenario(ok.days, vy({ resolutionDate: '2026-10-10', targetBidRequestsPerDay: 7e9 }));
  assert.equal(bad.status, 'unavailable', 'a past resolution date cannot rewrite actuals');
});

test('related-network growth is not credited to recovery or The Pitt', () => {
  const base = caseBaseline('2026-12-31', '2026-10-19');
  const r = runScenario(base, { ...BLANK_INPUTS, mode: 'spend-gap', resolutionDate: '2026-10-20', rampDays: 0, q: 1, p: 1, counterfactualSpendPerDay: 100 });
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  // The case model reads only seats 491 + 492 on 5100; 5524 rows never enter it.
  assert.ok(r.rows.filter(x => x.kind === 'actual').every(x => x.S0 === 0));
  assert.equal(r.rows.find(x => x.day === '2026-10-20')!.uplift, 100);
});

test('missing costs block ROI; no break-even within the horizon is reported honestly', () => {
  const validated: CurrencyStatus = { code: 'EUR', basis: 'finance-validated', note: '' };
  const noCost = cashFlow({ periods: [{ label: 'M1', benefit: 10, cost: null }], discountRatePerPeriod: 0.01, currency: validated, benefitIsApprovedContribution: true });
  assert.equal(noCost.roi.kind, 'unavailable');
  assert.equal(noCost.roi.kind === 'unavailable' && noCost.roi.reason, ROI_NO_COSTS);
  const gross = cashFlow({ periods: [{ label: 'M1', benefit: 10, cost: 5 }], discountRatePerPeriod: 0.01, currency: validated, benefitIsApprovedContribution: false });
  assert.equal(gross.net.kind, 'unavailable');
  const never = cashFlow({
    periods: [
      { label: 'M1', benefit: 0, cost: 100 },
      { label: 'M2', benefit: 20, cost: 10 },
    ],
    discountRatePerPeriod: 0.01,
    currency: validated,
    benefitIsApprovedContribution: true,
  });
  assert.equal(never.payback.kind, 'not-reached');
  assert.equal(num(never.net), -90);
  const pays = cashFlow({ periods: [{ label: 'M1', benefit: 0, cost: 100 }, { label: 'M2', benefit: 150, cost: 0 }], discountRatePerPeriod: null, currency: validated, benefitIsApprovedContribution: true });
  assert.deepEqual(pays.payback, { kind: 'period', label: 'M2' });
  assert.equal(pays.npv.kind, 'unavailable');
  assert.equal(num(pays.roi), 50);
  assert.equal(irr([-100, 50, -10, 80]).kind, 'unavailable');
  assert.ok(Math.abs(num(irr([-100, 110]))! - 10) < 1e-6);
});

test('scenario percentages, date order, ramp and denominators are checked before arithmetic', () => {
  const b = flat(10, 1_000_000, 20);
  assert.ok(validateInputs(b, vy({ q: 1.2 })).errors.some(e => /between 0% and 100%/.test(e)));
  assert.ok(validateInputs(b, vy({ p: -0.1 })).errors.length > 0);
  assert.ok(validateInputs(b, vy({ rampDays: 2.5 })).errors.some(e => /whole number/.test(e)));
  assert.ok(validateInputs(b, vy({ resolutionDate: '2027-01-01' })).errors.some(e => /beyond/.test(e)));
  assert.ok(validateInputs([b[1], b[0]], vy()).errors.some(e => /out of order/.test(e)));
  assert.ok(validateInputs(b, BLANK_INPUTS).missing.length >= 4);
  assert.equal(runScenario(b, vy({ q: 2 })).status, 'unavailable');
  const run = runScenario(b, vy());
  assert.equal(run.status, 'ok');
  const h = horizonTotals(run.status === 'ok' ? run.rows : [], '2026-11-01');
  assert.equal(h.find(x => x.key === '7d')!.expected.kind, 'value');
  assert.equal(h.find(x => x.key === '30d')!.expected.kind, 'unavailable', 'a horizon beyond the projection is unavailable, not truncated');
  const t = tornado(flat(40, 1_000_000, 20), vy(), 30, [{ key: 'q', label: 'q', low: 0.25, high: 0.75, fmt: String }, { key: 'delay', label: 'delay', low: 0, high: 7, fmt: String }]);
  assert.ok(t && t.bars[0].low! < t.base && t.bars[0].high! > t.base);
  assert.ok(t && t.bars[1].high! < t.base, 'a later fix loses days inside the same window');
});

test('effort: net hours keep negatives, are unavailable when unmeasured, and capacity is not cash', () => {
  assert.equal(effortSummary(EFFORT_TASKS).total.kind, 'unavailable');
  assert.equal(num(netHours({ task: 't', role: 'r', manualMinutes: 30, pittMinutes: 90, basis: 'measured', sampleSize: 3 })), -1);
  assert.equal(capacityValue(val(10), null, null).kind, 'unavailable');
  assert.equal(capacityValue(val(10), 50, WAREHOUSE_SPEND).kind, 'unavailable');
});

test('parser: merged headings, Markdown links, missing currency / timezone, hypothesis, approval and unsent draft', () => {
  const merged =
    'THE PITT | APPROVED INVESTIGATION\nAcme | Network #42 | Some DSP\nDisconnected: 2026-01-02 | Priority: HIGH\n' +
    '**EXECUTIVE SUMMARY** • Revenue in the 7 days before disconnection: 1,234 (currency unverified) • Evidence confidence: LOW ' +
    'LEADING HYPOTHESIS — NOT A CONFIRMED CAUSE Floor change\nRECOMMENDED INTERNAL ACTIONS\nTechOps → [ops@example.com](mailto:ops@example.com)\n' +
    'On 2026-01-02 at 09:30, Some DSP disconnected 2 seats. Confidence: low.\n' +
    'PUBLISHER COMMUNICATION — DRAFT ONLY, NOT SENT For ops@example.com to review: Hello <script>alert(1)</script> Human approval completed. No external publisher message was sent.';
  const r = parseInvestigation(merged);
  assert.equal(r.networkId, '42');
  assert.equal(r.revenue7d.amount, 1234);
  assert.equal(r.evidenceConfidence, 'LOW');
  assert.equal(r.leadingHypothesis, 'Floor change');
  assert.equal(r.meta.hypothesisConfirmed, false);
  assert.equal(r.actions[0].owner, 'ops@example.com', 'Markdown link reduced to its text');
  assert.equal(r.meta.disconnectedTime, '09:30');
  assert.equal(r.meta.timezone, null, 'no zone is assumed');
  assert.equal(r.meta.revenueCurrency, null);
  assert.equal(r.meta.revenueCurrencyStated, false);
  assert.equal(r.meta.draftSent, false);
  assert.equal(r.meta.approvalCompleted, true);
  assert.equal(r.meta.externalMessageSent, false);
  assert.ok(r.publisherDraft!.text.includes('<script>'), 'kept as inert text; React escapes it');
  assert.equal(r.raw, merged);
  const tz = parseInvestigation(merged.replace('at 09:30,', 'at 09:30 UTC,'));
  assert.equal(tz.meta.timezone, 'UTC');
  const tubi = parseInvestigation(TUBI_REPORT_TEXT);
  assert.equal(tubi.meta.disconnectedTime, '08:11');
  assert.equal(tubi.meta.timezone, null);
  const missingFields = parseInvestigation('THE PITT | DRAFT\nSomething');
  assert.equal(missingFields.revenue7d.amount, null);
  assert.equal(missingFields.evidenceConfidence, null);
  assert.equal(missingFields.meta.approvalCompleted, null);
});

test('ingestion is idempotent and hashed', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  const a = ingest(TUBI_REPORT_TEXT, '2026-10-20T00:00:00Z');
  const b = ingest(TUBI_REPORT_TEXT, '2026-10-21T00:00:00Z');
  assert.equal(a.localKey, b.localKey);
  assert.equal(addCase([a], b).length, 1);
  assert.equal(a.executionId, null, 'no execution ID is invented');
});

test('query or schema errors never replace existing data with a fake zero result', () => {
  const prev = { data: [1, 2, 3], source: 'snapshot' as const, asOf: '2026-10-21' };
  const failed = mergeRefresh(prev, { ok: false, error: 'timeout' });
  assert.deepEqual(failed.data, [1, 2, 3]);
  assert.equal(failed.source, 'snapshot');
  assert.equal(failed.lastError, 'timeout');
  assert.equal(mergeRefresh(prev, { ok: true, data: [4], asOf: 'now' }).source, 'live');
});

test('saved scenarios: strict parse, no approval forged, export carries versions but no recipients or secrets', () => {
  const s = illustrative('portfolio', 'Base case', { meanBidRequests: 6e9, firstProjectedDay: '2026-10-20', preCutDailySpend: 1 });
  const forged = JSON.stringify([{ ...s, meta: { ...s.meta, approval: 'approved', owner: 'x' }, inputs: { ...s.inputs, q: 7 } }]);
  const back = parseSaved(forged);
  assert.equal(back[0].meta.approval, 'user-entered');
  assert.equal(back[0].inputs.q, null);
  assert.deepEqual(parseSaved('not json'), []);
  const ex = JSON.stringify(buildExport([s], '2026-10-21T00:00:00Z'));
  assert.ok(ex.includes('snowflake-2026-10-21'));
  assert.doesNotMatch(ex, /@equativ\.com/);
  assert.doesNotMatch(ex, /password|secret|token|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY/i);
});

test('imported content cannot execute; no credentials in the source or the client bundle', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|js|css|html)$/.test(f)) files.push(p);
    }
  };
  walk('src');
  if (existsSync('dist')) walk('dist');
  for (const f of files) {
    if (f.endsWith('finance.test.ts')) continue;
    const text = readFileSync(f, 'utf8');
    if (f.startsWith('src')) {
      assert.doesNotMatch(text, /dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(/, f);
    }
    assert.doesNotMatch(text, /BEGIN [A-Z ]*PRIVATE KEY|sk-ant-|AKIA[0-9A-Z]{16}|xox[bp]-|ghp_[A-Za-z0-9]{20,}/, f);
  }
});
