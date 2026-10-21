import test from 'node:test';
import assert from 'node:assert/strict';
import { isCard, parseInvestigation } from './report.ts';
import { TUBI_CONTEXT, TUBI_REPORT_TEXT } from './tubi5100.ts';
import { CARD_5100_TEXT } from './card5100.ts';
import { sqlDaily, sqlEvents } from './live.ts';
import { isAmazon } from './context.ts';

test('Parses the approved Tubi investigation without changing values', () => {
  const r = parseInvestigation(TUBI_REPORT_TEXT);
  assert.equal(r.status, 'APPROVED INVESTIGATION');
  assert.equal(r.network, 'Tubi TV STR');
  assert.equal(r.networkId, '5100');
  assert.equal(r.dsp, 'Amazon DSP');
  assert.equal(r.disconnectedOn, '2026-09-25');
  assert.equal(r.priority, 'HIGHEST');
  assert.equal(r.revenue7d.amount, 16037);
  assert.equal(r.revenue7d.note, 'currency unverified; not confirmed lost revenue');
  assert.deepEqual(r.checks.map(c => `${c.name}:${c.result}`), ['ads_txt:PASS', 'sco:PASS', 'blocked_inventory:PASS', 'ivt:PASS']);
  assert.equal(r.evidenceConfidence, 'MEDIUM');
  assert.equal(r.rootCauseConfidence, 'low');
  assert.equal(r.exactReason, 'NOT CONFIRMED');
  assert.equal(r.leadingHypothesis, 'Commercial or seat-level DSP cut');
  assert.equal(r.actions.length, 3);
  assert.equal(r.actions[0].team, 'TechOps');
  assert.equal(r.actions[0].owner, 'msteitieh@equativ.com');
  assert.equal(r.actions[0].confidence, 'low');
  assert.ok(r.actions[0].text.includes('75.68%'));
  assert.equal(r.actions[1].ownerIsPerson, false);
  assert.equal(r.actions[2].confidence, null);
  assert.equal(r.publisherDraft?.reviewer, 'sreiter@equativ.com');
  assert.ok(r.publisherDraft?.text.startsWith('We observed'));
  assert.ok(r.approval?.includes('No external publisher message was sent'));
});

test('The narrative format keeps its parser and gets empty v4.6-only fields', () => {
  const r = parseInvestigation(TUBI_REPORT_TEXT);
  assert.equal(isCard(TUBI_REPORT_TEXT), false);
  assert.equal(r.format, 'narrative');
  assert.equal(r.rpmbr, null);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.actions.every(a => a.items.length === 0));
});

test('Parses the Investigator v4.6 card, including RPMBr and the stated revenue currency', () => {
  const r = parseInvestigation(CARD_5100_TEXT);
  assert.equal(r.format, 'v4.6-card');
  assert.equal(r.raw, CARD_5100_TEXT);
  assert.equal(r.network, 'Tubi TV STR');
  assert.equal(r.networkId, '5100');
  assert.equal(r.dsp, 'Amazon DSP');
  assert.equal(r.disconnectedOn, '2026-09-25');
  assert.equal(r.meta.disconnectedTime, '08:11');
  assert.equal(r.meta.timezone, null, 'the card states no zone for the cut time');
  assert.equal(r.priority, 'P0 HIGHEST');
  assert.equal(r.status, 'Investigation complete');

  assert.equal(r.revenue7d.amount, 16037);
  assert.equal(r.revenue7d.note, 'TechOps disconnection alert · EUR, source-documented, not Finance-validated');
  assert.equal(r.meta.revenueCurrency, 'EUR');
  assert.equal(r.meta.revenueCurrencyStated, true);
  assert.equal(r.meta.revenueCurrencyStatus, 'source-documented, not Finance-validated');

  assert.deepEqual(
    { ...r.rpmbr, text: undefined },
    { partner: 19.45, network: 2.55, currency: 'EUR', windowStart: '2026-09-18', windowEnd: '2026-09-24', basis: 'gross exchange price', text: undefined },
  );

  assert.deepEqual(r.checks.map(c => `${c.name}:${c.result}`), ['ads_txt:PASS', 'sco:PASS', 'blocked_inventory:PASS', 'ivt:PASS']);
  assert.equal(r.exactReason, 'no operator or reason in the connection log');
  assert.equal(r.rootCauseConfidence, 'low');
  assert.equal(r.evidenceConfidence, null, 'the card does not carry evidence confidence');
  assert.equal(r.leadingHypothesis, 'Internal seat phase-out on the Equativ side (not confirmed)');
  assert.equal(r.meta.hypothesisConfirmed, false);
  assert.equal(r.meta.hypothesisLikelihood, 'medium');

  assert.deepEqual(
    r.actions.map(a => [a.team, a.owner, a.ownerIsPerson, a.items.length]),
    [
      ['TechOps', 'msteitieh@equativ.com', true, 2],
      ['Partnerships', '', false, 2],
      ['Publisher KAM', 'sreiter@equativ.com', true, 0],
    ],
  );
  const limiter = r.actions[0].items[0];
  assert.ok(limiter.signal.startsWith('Amazon DSP CTV B (seat 492): DiscardedByLimitator on 74.75% of pre-cut calls'));
  assert.ok(limiter.next?.startsWith('Ask #help-call-limiter whether limitation is expected'));
  assert.equal(r.actions[1].items[1].signal, 'Evidence gap: Ask Amazon DSP whether the 5 seats were cut on their side.');
  assert.equal(r.actions[1].items[1].next, null);
  assert.ok(r.actions[0].text.includes('74.75%'), 'open items stay searchable as text');

  assert.equal(r.publisherDraft?.reviewer, 'sreiter@equativ.com');
  assert.ok(r.publisherDraft?.text.startsWith('Hi, we see that your network has been disconnected from Amazon DSP since 2026-09-25.'));
  assert.ok(r.publisherDraft?.text.endsWith('around that date?'));
  assert.equal(r.meta.draftSent, false);
  assert.equal(r.approval, null, 'the card is the approval request, not an approval');
  assert.deepEqual(r.warnings, ['Numbers not found in the evidence: 42%']);
});

test('A v4.6 card copied out of Slack (markup already rendered) parses the same', () => {
  const rendered = CARD_5100_TEXT.replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/(^|\s)_([^_\n]+)_(?=$|\s)/gm, '$1$2')
    .replace(':white_check_mark: ', '✅ ')
    .replace(':warning: ', '⚠️ ');
  assert.notEqual(rendered, CARD_5100_TEXT);
  const { raw: _a, ...fromSlack } = parseInvestigation(rendered);
  const { raw: _b, ...fromCard } = parseInvestigation(CARD_5100_TEXT);
  assert.deepEqual(fromSlack, fromCard);
});

test('No currency is read from the euro sign alone, and an n/a RPMBr stays unknown', () => {
  // The card as node 15 wrote it before the currency statement was added: the "€" is printed whatever the source.
  const older = CARD_5100_TEXT.replace(' · EUR, source-documented, not Finance-validated', '').replace(
    /• RPMBr before the cut: .*$/m,
    '• RPMBr before the cut: n/a (no Amazon DSP bid requests in the 7 full days before the cut day)',
  );
  const r = parseInvestigation(older);
  assert.equal(r.revenue7d.amount, 16037);
  assert.equal(r.revenue7d.note, 'TechOps disconnection alert');
  assert.equal(r.meta.revenueCurrency, null);
  assert.equal(r.meta.revenueCurrencyStated, false);
  assert.equal(r.rpmbr?.partner, null);
  assert.equal(r.rpmbr?.network, null);
  assert.equal(r.rpmbr?.currency, null);

  const noLine = parseInvestigation(CARD_5100_TEXT.replace(/• RPMBr before the cut: .*\n/, ''));
  assert.equal(noLine.rpmbr, null);
});

test('A card whose AI investigation was rejected keeps the data and shows why', () => {
  const invalid = CARD_5100_TEXT.replace(':white_check_mark: Investigation complete', ':warning: AI investigation unavailable - open items below come from the data')
    .replace(/\n\n\*Leading hypothesis\*.*\n/, '\n')
    .replace(':warning: Numbers not found in the evidence: 42%', ':warning: AI investigation unavailable: LLM output is not valid JSON');
  const r = parseInvestigation(invalid);
  assert.equal(r.status, 'AI investigation unavailable - open items below come from the data');
  assert.equal(r.leadingHypothesis, null);
  assert.deepEqual(r.warnings, ['AI investigation unavailable: LLM output is not valid JSON']);
  assert.equal(r.actions[0].items.length, 2, 'open items come from code and stay visible');
});

test('The v4.6 card revenue reconciles to the alert view (Amazon CTV + Video seats)', () => {
  const r = parseInvestigation(CARD_5100_TEXT);
  const amazon = TUBI_CONTEXT.events.filter(e => isAmazon(e.partnerId) && e.cutAt.startsWith(r.disconnectedOn));
  assert.equal(Math.round(amazon.reduce((s, e) => s + (e.revenue7d ?? 0), 0)), r.revenue7d.amount);
});

test('Workflow revenue reconciles to the alert view (Amazon CTV + Video seats)', () => {
  const amazon = TUBI_CONTEXT.events.filter(e => isAmazon(e.partnerId) && e.cutAt.startsWith('2026-09-25'));
  assert.equal(amazon.length, 5);
  const total = amazon.reduce((s, e) => s + (e.revenue7d ?? 0), 0);
  assert.equal(Math.round(total), 16037);
});

test('Context SQL refuses non-numeric network ids', () => {
  assert.ok(sqlDaily('5100').includes('network_id = 5100'));
  assert.throws(() => sqlEvents('5100 OR 1=1'));
});
