/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for RTB Command Center Parser & Decision Boundaries
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkflowPayload, countWords, getInitialSampleModel } from './parser.ts';
import { RAW_SAMPLE_WORKFLOW_INPUT, SAMPLE_FINALIZED_REPORT } from './sampleData.ts';

test('Boundary Preservation: Raw sample input leaves priority and confidence UNAVAILABLE', () => {
  const model = getInitialSampleModel();

  assert.equal(model.overview.priority, 'UNAVAILABLE', 'Raw sample input must not guess or infer priority');
  assert.equal(model.overview.confidence, 'UNAVAILABLE', 'Raw sample input must not guess or infer confidence');
  assert.equal(model.overview.prioritySource, 'unavailable_in_sample');
  assert.equal(model.isProductionData, false);
});

test('Currency Guardrail: Historical revenue without currency is NOT summed', () => {
  const model = getInitialSampleModel();

  assert.equal(model.overview.totalRevenuePrior7d, null, 'Revenue without currency must NOT be summed');
  assert.ok(model.overview.revenueNote.includes('Currency was not supplied'));
  assert.equal(model.disconnections[0].currency, null);
  assert.equal(model.disconnections[1].currency, null);
});

test('Hypothesis Guardrail: ads.txt is labeled as unconfirmed hypothesis, not confirmed cause', () => {
  const model = getInitialSampleModel();

  assert.equal(model.investigation.confirmedReason, null, 'ads.txt must not become a confirmed cause');
  assert.equal(model.investigation.hypotheses.length, 1);
  assert.equal(model.investigation.hypotheses[0].status, 'unconfirmed_hypothesis');
  assert.ok(model.investigation.hypotheses[0].statement.includes('ads.txt'));
});

test('Coverage Discrepancy: Metric window vs module window difference is detected and preserved', () => {
  const model = getInitialSampleModel();

  assert.equal(model.metadata.hasWindowCoverageDiscrepancy, true);
  assert.ok(model.metadata.windowDiscrepancyNotice.includes('differing date coverages are preserved'));
});

test('Safety Guardrail: n8n workflow pipeline definitions are rejected with explanatory message', () => {
  const fakeN8nWorkflow = {
    name: '[TechOps] RTB-Checklist-Output-Generation',
    nodes: [
      { name: 'Webhook', type: 'n8n-nodes-base.webhook' },
      { name: 'Gemini Formatting', type: 'n8n-nodes-base.code' }
    ],
    connections: {}
  };

  const res = parseWorkflowPayload(fakeN8nWorkflow);
  assert.equal(res.success, false);
  assert.equal(res.isN8nWorkflowDefinition, true);
  assert.ok(res.error?.includes('pipeline definition'));
});

test('Finalized Report: Preserves explicit backend priority P0 and confidence HIGH without override', () => {
  const res = parseWorkflowPayload(SAMPLE_FINALIZED_REPORT);
  assert.equal(res.success, true);
  assert.ok(res.model !== undefined);

  assert.equal(res.model?.overview.priority, 'P0');
  assert.equal(res.model?.overview.confidence, 'HIGH');
  assert.equal(res.model?.overview.prioritySource, 'explicit_backend');
  assert.ok(res.model?.investigation.finding !== null);
  assert.equal(res.model?.validation.isFinalizedReportSupplied, true);
});

test('Slack text word count & 200 word threshold check', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('Hello world from Equativ TechOps'), 5);

  const res = parseWorkflowPayload(SAMPLE_FINALIZED_REPORT);
  assert.ok(res.model !== undefined);
  assert.ok(res.model?.validation.slackWordCount > 0);
  assert.equal(res.model?.validation.isSlackExceeding200Words, false);
});
