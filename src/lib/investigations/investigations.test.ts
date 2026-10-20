import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvestigation } from './report.ts';
import { TUBI_CONTEXT, TUBI_REPORT_TEXT } from './tubi5100.ts';
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
