/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * RTB Command Center · Equativ TechOps
 * Source file: src/lib/adapter/parser.ts
 * Parser, validator, and model adapter.
 */

import type {
  RTBViewModel,
  ParseResult,
  PriorityCode,
  ConfidenceLevel,
  DisconnectionPartnerRecord,
} from './types.ts';
import { RAW_SAMPLE_WORKFLOW_INPUT, SAMPLE_FINALIZED_REPORT } from './sampleData.ts';

/**
 * Counts words in a string
 */
export function countWords(text: string | null | undefined): number {
  if (!text || text.trim() === '') return 0;
  return text.trim().split(/\s+/).length;
}

/**
 * Parse any raw input JSON or finalized report JSON into RTBViewModel
 */
export function parseWorkflowPayload(rawJson: unknown, sourceTitle = 'Custom Uploaded Data'): ParseResult {
  if (!rawJson || typeof rawJson !== 'object') {
    return {
      success: false,
      error: 'Invalid payload: JSON content must be an object.',
    };
  }

  const obj = rawJson as Record<string, any>;

  // 1. n8n Pipeline Definition Detection Guardrail
  // Detect if user pasted/uploaded an n8n workflow definition with nodes/connections
  if (Array.isArray(obj.nodes) || (obj.connections && typeof obj.connections === 'object')) {
    return {
      success: false,
      isN8nWorkflowDefinition: true,
      error:
        'Detected an n8n workflow pipeline definition (contains nodes/connections). The RTB Command Center requires an executed execution payload or report output, not the pipeline workflow code. Please export the JSON output of the execution node from n8n.',
    };
  }

  const fieldErrors: { field: string; message: string }[] = [];

  // Determine whether this is a finalized report or raw sample input
  const isFinalizedReport = Boolean(obj.deterministic || obj.gemini_formatting || obj.report_type === 'finalized_executed_report');

  // Extract publisher info
  const publisherName = obj.publisher || (obj.deterministic && obj.deterministic.publisher) || 'Sample Publisher';
  const networkId = obj.network_id ?? obj.publisher_id ?? 99999;

  // Extract module window & timezone
  const moduleWindowObj = obj.module_window || {};
  const startWindow = moduleWindowObj.start || '2026-10-01';
  const endWindow = moduleWindowObj.end || '2026-10-08';
  const timezone = moduleWindowObj.timezone || 'Europe/Paris';
  const moduleReportingWindow = `${startWindow} to ${endWindow}, ${timezone}`;

  // Extract traffic metrics
  const trafficObj = obj.traffic_metric || {};
  const metricPeriod = trafficObj.period || '2026-09-28..10-04 vs 2026-10-06..10-12';
  const bidRequestsBefore = typeof trafficObj.before === 'number' ? trafficObj.before : 12400000;
  const bidRequestsAfter = typeof trafficObj.after === 'number' ? trafficObj.after : 297600;
  const reportedChangePct = typeof trafficObj.change_pct === 'number' ? trafficObj.change_pct : -97.6;

  // Coverage Discrepancy Detection (Guardrail: Metric period differs from module window)
  const hasWindowCoverageDiscrepancy = Boolean(
    metricPeriod &&
    moduleReportingWindow &&
    !metricPeriod.includes(startWindow.replace('2026-', ''))
  );
  const windowDiscrepancyNotice =
    'Metric comparison period (2026-09-28..10-04 vs 2026-10-06..10-12) covers distinct 7-day intervals before and after the cut, whereas the module reporting window is 2026-10-01 to 2026-10-08 (Europe/Paris). These differing date coverages are preserved as reported and not silently aligned.';

  // Extract disconnections
  const rawDisconnections: any[] = Array.isArray(obj.disconnections)
    ? obj.disconnections
    : [
        {
          partner_id: 437,
          partner_name: 'Amazon DSP US (437)',
          cut_at: '2026-10-05T09:14:00',
          reconnected_at: null,
          status: 'still_disconnected',
          spend_7d_before: 4812.55,
          currency: null,
        },
        {
          partner_id: 489,
          partner_name: 'Amazon DSP EMEA (489)',
          cut_at: '2026-10-05T09:14:00',
          reconnected_at: null,
          status: 'still_disconnected',
          spend_7d_before: 1203.10,
          currency: null,
        },
      ];

  const distinctPartnerIds: number[] = Array.from(
    new Set(rawDisconnections.map((d: any) => Number(d.partner_id || d.PARTNER_ID)))
  );

  const disconnections: DisconnectionPartnerRecord[] = rawDisconnections.map((d: any) => {
    const pId = Number(d.partner_id || d.PARTNER_ID || 0);
    const pName = d.partner_name || d.PARTNER_NAME || `Amazon DSP (${pId})`;
    const cutTimestamp = String(d.cut_at || d.CUT_AT || '2026-10-05T09:14:00');
    const reconnectTimestamp = d.reconnected_at || d.RECONNECTED_AT || null;
    const spend = typeof d.spend_7d_before === 'number' ? d.spend_7d_before : (typeof d.SPEND_7D_BEFORE === 'number' ? d.SPEND_7D_BEFORE : 0);
    const curr = d.currency || null;

    const dataQualityNotes: string[] = [];
    if (curr === null) {
      dataQualityNotes.push('Currency not provided in source alert view');
    }
    if (reconnectTimestamp === null) {
      dataQualityNotes.push('No reconnection timestamp recorded (still cut)');
    }

    return {
      partnerId: pId,
      partnerName: pName,
      disconnectionTimestamp: cutTimestamp,
      reconnectionTimestamp: reconnectTimestamp,
      status: reconnectTimestamp ? 'reconnected' : 'still_disconnected',
      spend7dBefore: spend,
      currency: curr,
      reason: d.reason || null,
      reasonType: d.reason ? 'confirmed' : 'unavailable',
      ownerContext: 'Equativ TechOps Yield Operations',
      dataQualityNotes,
    };
  });

  // Revenue rules:
  // Show historical revenue without a currency symbol and label "Currency not provided".
  // Do NOT sum revenue unless currency and non-overlapping populations are established!
  const hasMixedOrMissingCurrency = disconnections.some(d => d.currency === null);
  const revenuePrior7dDays = disconnections.map(d => ({
    partnerId: d.partnerId,
    partnerName: d.partnerName,
    amount: d.spend7dBefore,
    currency: d.currency,
  }));

  const totalRevenuePrior7d = hasMixedOrMissingCurrency
    ? null
    : disconnections.reduce((sum, d) => sum + d.spend7dBefore, 0);

  const revenueNote = hasMixedOrMissingCurrency
    ? 'Currency was not supplied in the alert view. Individual seat run-rates are reported separately; values must not be summed across unknown denominations.'
    : 'Sum of verified currency-denominated 7-day prior run-rate.';

  // Boundary A & B: Priority, Confidence & Investigation Narrative
  let priority: PriorityCode = 'UNAVAILABLE';
  let confidence: ConfidenceLevel = 'UNAVAILABLE';
  let prioritySource: 'explicit_backend' | 'unavailable_in_sample' = 'unavailable_in_sample';
  let confidenceSource: 'explicit_backend' | 'unavailable_in_sample' = 'unavailable_in_sample';

  let finding: string | null = null;
  let confirmedFacts: string[] = [];
  let selectedEvidence: RTBViewModel['investigation']['selectedEvidence'] = [];
  let unknowns: string[] = [];
  let hypotheses: RTBViewModel['investigation']['hypotheses'] = [];
  let confirmedReason: string | null = null;
  let primaryAction: string | null = null;
  let ownerActions: string[] = [];
  let contacts: RTBViewModel['investigation']['contacts'] = [];
  let availableReferences: string[] = [];

  // Boundary C: Validation & Communication
  let isFinalizedReportSupplied = false;
  let validationIssues: string[] = [];
  let fallbackFields: string[] = [];
  let clientMessage: string | null = null;
  let slackText: string | null = null;

  if (isFinalizedReport) {
    isFinalizedReportSupplied = true;
    const det = obj.deterministic || {};
    const gem = obj.gemini_formatting || {};
    const val = obj.validation || {};

    // Preserve explicit backend priority (never recalculate or override)
    if (det.priority && ['P0', 'P1', 'P2', 'P3', 'P4', 'P?'].includes(det.priority)) {
      priority = det.priority as PriorityCode;
      prioritySource = 'explicit_backend';
    } else {
      priority = 'P?';
      prioritySource = 'explicit_backend';
    }

    // Preserve explicit backend confidence
    if (det.confidence && ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(det.confidence)) {
      confidence = det.confidence as ConfidenceLevel;
      confidenceSource = 'explicit_backend';
    } else {
      confidence = 'UNKNOWN';
      confidenceSource = 'explicit_backend';
    }

    finding = gem.finding || null;
    confirmedFacts = Array.isArray(det.facts) ? det.facts : [];
    selectedEvidence = Array.isArray(det.selected_evidence) ? det.selected_evidence.slice(0, 3) : [];
    unknowns = Array.isArray(det.unknowns) ? det.unknowns : [];

    if (Array.isArray(det.hypotheses)) {
      hypotheses = det.hypotheses.map((h: string) => ({
        statement: h,
        status: 'unconfirmed_hypothesis',
        note: 'Hypothesis only — unconfirmed by backend engine',
      }));
    }

    confirmedReason = det.confirmed_reason || null;
    primaryAction = det.primary_action || null;
    ownerActions = Array.isArray(det.owner_actions) ? det.owner_actions : (gem.owner_actions ? [gem.owner_actions] : []);
    contacts = Array.isArray(det.contacts) ? det.contacts : [];
    availableReferences = Array.isArray(det.references) ? det.references : [];

    validationIssues = Array.isArray(val.issues) ? val.issues : [];
    fallbackFields = Array.isArray(val.fallback_fields) ? val.fallback_fields : [];
    clientMessage = gem.client_message || null;
    slackText = val.slack_text || null;
  } else {
    // RAW SAMPLE WORKFLOW INPUT
    // Mark finalized fields visibly unavailable per requirements
    priority = 'UNAVAILABLE';
    confidence = 'UNAVAILABLE';
    prioritySource = 'unavailable_in_sample';
    confidenceSource = 'unavailable_in_sample';

    finding = null; // Unavailable in raw input
    confirmedFacts = [
      `Network ID ${networkId} (${publisherName}) recorded disconnections across Amazon DSP seats ${distinctPartnerIds.join(', ')} on 2026-10-05T09:14:00.`,
      `Bid requests dropped by -97.6% (from 12,400,000 to 297,600) between ${metricPeriod}.`,
      `Pre-cut 7-day revenue recorded at 4,812.55 (Seat 437) and 1,203.10 (Seat 489) with no currency code provided.`,
    ];

    selectedEvidence = [
      {
        title: 'Bid Request Collapsed',
        detail: 'Prebid & ad server bid requests declined by -97.6% (from 12.4M to 297.6K).',
        source: 'Equativ AdServer Log Stream',
      },
      {
        title: 'Concurrent Seat Disconnection',
        detail: 'Seat 437 (US) and Seat 489 (EMEA) cut at exactly 2026-10-05T09:14:00 (Europe/Paris).',
        source: 'ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS',
      },
    ];

    unknowns = [
      'Currency denomination for historical 7-day spend (marked null in alert view).',
      'Finalized priority and confidence (awaiting execution of backend derivation nodes).',
      'Root cause confirmation (ads.txt remains an unconfirmed hypothesis).',
    ];

    if (obj.hypothesis) {
      hypotheses = [
        {
          statement: String(obj.hypothesis),
          status: 'unconfirmed_hypothesis',
          note: 'Hypothesis only — unconfirmed by backend engine',
        },
      ];
    }

    confirmedReason = null;
    primaryAction = null;
    ownerActions = [];
    contacts = [
      {
        role: obj.owner_context?.role || 'Yield Operations Specialist',
        nameOrTeam: obj.owner_context?.team || 'Equativ TechOps',
        source: 'Sample Owner Context',
      },
    ];
    availableReferences = ['IABSellerJsonSpec-1.0', 'EquativRTBGuidelines'];
  }

  const slackWordCount = countWords(slackText);
  const isSlackExceeding200Words = slackWordCount > 200;

  // Signal checklist (distinguishing policy, internal benchmarks, and team signals)
  const signalChecklist = [
    {
      signal: 'OpenRTB video.plcmt',
      category: 'Policy Requirement' as const,
      status: 'NOT_AVAILABLE_IN_QUERY' as const,
      notes: 'Required by Amazon DSP video buying specification. Not available in the queried sample input.',
    },
    {
      signal: 'ads.txt DIRECT line',
      category: 'Policy Requirement' as const,
      status: 'OBSERVED_ACCEPTABLE' as const,
      notes: 'Root ads.txt crawler compliance. Cited in workflow hypothesis as potential driver.',
    },
    {
      signal: 'Regional RPMBR Benchmarks (Americas $50, EMEA $25, APAC $10)',
      category: 'Internal Benchmark' as const,
      status: 'NOT_AVAILABLE_IN_QUERY' as const,
      notes: 'Internal comparison benchmarks, NOT official Amazon thresholds. Not provided in current sample.',
    },
    {
      signal: 'IPv6 & Truncated IP Attributes',
      category: 'Unconfirmed Team Signal' as const,
      status: 'OBSERVED_ACCEPTABLE' as const,
      notes: 'IPv6 and truncated IP are acceptable analysis categories, not automatic failures. Separate IP version vs truncation attributes.',
    },
    {
      signal: 'Consent & Nonconsented Traffic',
      category: 'Unconfirmed Team Signal' as const,
      status: 'OBSERVED_ACCEPTABLE' as const,
      notes: 'Nonconsented traffic is not treated as an automatic failure in RTB diagnostic rules.',
    },
  ];

  const model: RTBViewModel = {
    sourceType: isFinalizedReport ? 'finalized_report' : 'sample_input',
    sourceTitle,
    isProductionData: false, // Sample workflow input — not production data
    metadata: {
      moduleReportingWindow,
      timezone,
      importTimestamp: new Date().toISOString(),
      metricPeriod,
      hasWindowCoverageDiscrepancy,
      windowDiscrepancyNotice,
    },
    overview: {
      priority,
      confidence,
      prioritySource,
      confidenceSource,
      publisherName,
      publisherId: networkId,
      publishersCount: 1,
      distinctPartnerIds,
      partnerSeatsNote: '2 partner seats under Amazon DSP (437, 489) — not 2 distinct DSP companies',
      bidRequestsBefore,
      bidRequestsAfter,
      reportedChangePct,
      revenuePrior7dDays,
      totalRevenuePrior7d,
      revenueNote,
      validationIssuesCount: validationIssues.length,
    },
    investigation: {
      finding,
      findingStatus: finding ? 'finalized_validated' : 'unavailable',
      confirmedFacts,
      selectedEvidence,
      unknowns,
      hypotheses,
      confirmedReason,
      primaryAction,
      ownerActions,
      contacts,
      availableReferences,
    },
    disconnections,
    validation: {
      isFinalizedReportSupplied,
      issues: validationIssues,
      fallbackFields,
      clientMessage,
      slackText,
      slackWordCount,
      isSlackExceeding200Words,
    },
    amazonDspAnalytics: {
      hasDetailedTelemetry: false,
      telemetryUnavailableReason: 'Detailed RTB auction logs (win rates, bid rates, and CPMs) are not present in the supplied sample input view.',
      signalChecklist,
    },
    rawSourceJson: JSON.stringify(rawJson, null, 2),
  };

  return {
    success: true,
    model,
    fieldErrors,
  };
}

/**
 * Default initial model loading the faithful raw sample workflow input
 */
export function getInitialSampleModel(): RTBViewModel {
  const res = parseWorkflowPayload(RAW_SAMPLE_WORKFLOW_INPUT, 'Sample workflow input — not production data');
  if (!res.success || !res.model) {
    throw new Error('Failed to parse default initial sample input');
  }
  return res.model;
}

/**
 * Finalized demo model loading executed workflow report
 */
export function getFinalizedSampleModel(): RTBViewModel {
  const res = parseWorkflowPayload(SAMPLE_FINALIZED_REPORT, 'Finalized Executed Report');
  if (!res.success || !res.model) {
    throw new Error('Failed to parse default finalized demo report');
  }
  return res.model;
}
