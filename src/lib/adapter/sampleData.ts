/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * RTB Command Center · Equativ TechOps
 * Source file: src/lib/adapter/sampleData.ts
 * Faithfully represents the supplied workflow input and report schemas.
 */

/**
 * EXACT raw sample input supplied from n8n workflow:
 * "[TechOps] RTB-Checklist-Output-Generation"
 * 
 * Note: Some code in the workflow was truncated; priority, confidence, and Gemini
 * validation were NOT executed on this payload.
 */
export const RAW_SAMPLE_WORKFLOW_INPUT = {
  publisher: "Sample Publisher",
  network_id: 99999,
  publisher_id: 99999,
  module_window: {
    start: "2026-10-01",
    end: "2026-10-08",
    timezone: "Europe/Paris"
  },
  traffic_metric: {
    metric: "bid_requests",
    before: 12400000,
    after: 297600,
    change_pct: -97.6,
    period: "2026-09-28..10-04 vs 2026-10-06..10-12",
    source: "Equativ AdServer Log Stream"
  },
  disconnections: [
    {
      partner_id: 437,
      partner_name: "Amazon DSP US (437)",
      cut_at: "2026-10-05T09:14:00",
      reconnected_at: null,
      status: "still_disconnected",
      spend_7d_before: 4812.55,
      currency: null,
      notes: "Amazon DSP US seat disconnected; 7d revenue prior to cut was 4812.55 (currency not provided)."
    },
    {
      partner_id: 489,
      partner_name: "Amazon DSP EMEA (489)",
      cut_at: "2026-10-05T09:14:00",
      reconnected_at: null,
      status: "still_disconnected",
      spend_7d_before: 1203.10,
      currency: null,
      notes: "Amazon DSP EMEA seat disconnected; 7d revenue prior to cut was 1203.10 (currency not provided)."
    }
  ],
  hypothesis: "The pattern may be related to ads.txt compliance.",
  owner_context: {
    team: "Equativ TechOps",
    role: "Yield Operations & Technical Support Specialist",
    channel: "#equativ-techops-rtb"
  },
  // Note: finalized fields (priority, confidence, finding, slack_text, validation) are NOT present in this raw sample input!
};

/**
 * A representative finalized executed workflow report.
 * Demonstrates the full Boundary A (Deterministic), Boundary B (Gemini), and Boundary C (Validation) schema.
 */
export const SAMPLE_FINALIZED_REPORT = {
  report_type: "finalized_executed_report",
  execution_id: "exec_20261020_0914_rtb_check",
  completed_at: "2026-10-20T10:15:00Z",
  deterministic: {
    priority: "P0",
    confidence: "HIGH",
    facts: [
      "Network ID 99999 experienced concurrent disconnections across Amazon DSP seats 437 (US) and 489 (EMEA) on 2026-10-05 at 09:14:00 (Europe/Paris).",
      "Bid requests collapsed by -97.6% (from 12,400,000 to 297,600) between metric baseline 2026-09-28..10-04 and post-cut period 2026-10-06..10-12.",
      "Historical 7-day pre-cut spend recorded at 4,812.55 for seat 437 and 1,203.10 for seat 489 with unconfirmed currency code.",
      "Both Amazon DSP partner seats remain in 'still_disconnected' status with no recorded reconnection timestamp."
    ],
    selected_evidence: [
      {
        title: "Bid Request Telemetry",
        detail: "Severe -97.6% drop from 12.40M to 297.6K bid requests verified in Equativ AdServer Log Stream.",
        source: "Equativ AdServer Log Stream"
      },
      {
        title: "Seat Disconnection Timestamps",
        detail: "Simultaneous cut across Seat 437 and Seat 489 on 2026-10-05T09:14:00 Europe/Paris.",
        source: "ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS"
      },
      {
        title: "ads.txt Crawler Response",
        detail: "HTTP 404 on /ads.txt crawler check recorded post-cut on publisher apex domain.",
        source: "Amazon DSP Crawler Ingestion Feed"
      }
    ],
    unknowns: [
      "Exact currency denomination for historical pre-cut spend (value marked null in source alert view).",
      "Direct DNS record latency and whether secondary CDN subdomains return matching ads.txt declarations.",
      "Amazon DSP internal buyer seat error logs or pacing restrictions."
    ],
    hypotheses: [
      "The pattern may be related to ads.txt compliance following publisher CMS template migration."
    ],
    confirmed_reason: null, // Note: ads.txt is an unconfirmed hypothesis, not a confirmed cause!
    primary_action: "Audit publisher root ads.txt to confirm DIRECT declaration for Equativ and trigger an expedited Amazon crawler re-check.",
    owner_actions: [
      "TechOps specialist to contact publisher AdOps lead regarding ads.txt status.",
      "Verify sellers.json entry sid matches publisher network ID 99999.",
      "File priority crawler re-audit ticket once ads.txt HTTP 200 is verified."
    ],
    contacts: [
      { role: "Yield Specialist", nameOrTeam: "Equativ TechOps Tier 2", source: "Workflow Registry" },
      { role: "Account Lead", nameOrTeam: "Americas Publisher Partner Management", source: "Salesforce Ops" }
    ],
    references: [
      "IABSellerJsonSpec-1.0",
      "AmazonDSPIntegrationGuide-2026",
      "EquativAdsTxtDeclarationGuide"
    ]
  },
  gemini_formatting: {
    finding: "Amazon DSP bid requests for Sample Publisher (#99999) collapsed by -97.6% following simultaneous disconnections on US (437) and EMEA (489) seats on October 5. Technical evidence points to unverified ads.txt declarations as a potential driver.",
    client_message: "Hello Sample Publisher AdOps Team,\n\nOur automated RTB monitoring flagged a 97.6% reduction in Amazon DSP bid requests for Network ID 99999 beginning October 5, 2026.\n\nPreliminary diagnostics show concurrent disconnections across Amazon DSP US and EMEA seats. Evidence suggests this may be related to an ads.txt crawl anomaly.\n\nPlease ensure your root ads.txt contains the direct declaration 'equativ.com, 99999, DIRECT, 00b0c441' and returns HTTP 200. Let us know once updated so we can request an expedited Amazon DSP recrawl.\n\nBest regards,\nEquativ TechOps",
    owner_actions: "1. Inspect root ads.txt at publisher domain.\n2. Confirm no 404 or CDN redirect loops exist.\n3. Request expedited crawler run via Amazon partner console."
  },
  validation: {
    passed: true,
    ai_output_accepted: true,
    issues: [],
    fallback_fields: [],
    slack_text: "🚨 *[P0 URGENT] Amazon DSP Disconnection Alert*\n*Publisher:* Sample Publisher (#99999)\n*Impact:* -97.6% bid requests (12.4M ➔ 297.6K)\n*Seats Cut:* Amazon DSP US (437) & EMEA (489) on 2026-10-05T09:14:00 (Europe/Paris)\n*Historical 7d Run-Rate:* 4,812.55 (Seat 437) + 1,203.10 (Seat 489) [Currency not provided]\n*Evidence:* Severe drop concurrent with potential ads.txt 404 crawl failure.\n*Action:* Audit publisher ads.txt and trigger crawler re-verification.\n*Owner:* Equativ TechOps (#equativ-techops-rtb)"
  }
};
