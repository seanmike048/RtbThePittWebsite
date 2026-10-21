/** Data availability matrix and data-health findings, from the discovery queries of 2026-10-21. */
import { COVERAGE } from './snapshot.data.ts';

export interface DatasetRow {
  dataset: string;
  status: 'available' | 'partial' | 'unavailable';
  source: string;
  grain: string;
  coverage: string;
  freshness: string;
  timezone: string;
  unit: string;
  currency: string;
  permissions: string;
  missing: string;
  enables: string;
}

export const AVAILABILITY: DatasetRow[] = [
  {
    dataset: 'Identity mapping',
    status: 'partial',
    source: 'ANALYTICS_EXPO.DATA_ESSENTIALS.DSP_NETWORK_CONNECTION_HISTORY (partner names); ANALYTICS.PUBLIC.VIEW_SELLERS_JSON_NODES (seller type)',
    grain: 'partner × network (current); seller_id latest row',
    coverage: 'Current state only',
    freshness: 'Read 2026-10-20',
    timezone: 'n/a',
    unit: 'n/a',
    currency: 'n/a',
    permissions: 'Snowflake role data analyst (read)',
    missing: 'Effective-dated DSP / endpoint / internal and external seat IDs; publisher group linking 5100 and 5524; historical seller types',
    enables: 'Scopes 437 vs 489–492; visible view',
  },
  {
    dataset: 'Daily demand activity',
    status: 'partial',
    source: 'ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES (bid requests + spend); DAY_DEMAND (spend, no bid requests)',
    grain: 'UTC day × network × partner × supply-chain node (aggregated to day × network × partner)',
    coverage: `DAY_SCO_NODES ${COVERAGE.DAY_SCO_NODES.from} → ${COVERAGE.DAY_SCO_NODES.to} (${COVERAGE.DAY_SCO_NODES.days} days); DAY_DEMAND ${COVERAGE.DAY_DEMAND.from} → ${COVERAGE.DAY_DEMAND.to} (${COVERAGE.DAY_DEMAND.days} days)`,
    freshness: 'Tables last altered 2026-10-21 02:38; complete through 2026-10-19',
    timezone: 'UTC (column comment)',
    unit: 'Bid requests; impressions; spend',
    currency: 'Column comment: Euro. Workbook shows $. Not Finance-validated.',
    permissions: 'Snowflake role data analyst (read)',
    missing: 'Eligible bids; 90 pre-incident days (retention is ~44 days); hourly data',
    enables: 'Daily baseline, RPMBr, run-rate projection',
  },
  {
    dataset: 'Monthly demand activity',
    status: 'available',
    source: 'MONTH_SCO_NODES; MONTH_DEMAND (“system of record for long-run history”)',
    grain: 'Month × network × partner (+ node or buyer)',
    coverage: 'Includes September 2026; the two tables agree for 437 (7,228,721.11 vs 7,228,721.12; impressions identical)',
    freshness: 'Last altered 2026-10-21',
    timezone: 'UTC months',
    unit: 'Bid requests (SCO only); spend; impressions',
    currency: 'Same as daily; MONTH_DEMAND also has a DSP-currency column (8,322,782.16 for 437 in September)',
    permissions: 'Snowflake role data analyst (read)',
    missing: '—',
    enables: 'Workbook reconciliation, funnel totals',
  },
  {
    dataset: 'Publisher supply activity',
    status: 'unavailable',
    source: 'ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SUPPLY (auctions at native grain)',
    grain: 'UTC day × network × site × format …',
    coverage: 'Query timed out (60 s connector limit)',
    freshness: '—',
    timezone: 'UTC (column comment)',
    unit: 'Auctions, impressions, spend',
    currency: 'Column comment: Euro',
    permissions: 'Readable; too slow through the connector',
    missing: 'All rows for 5100 / 5524. Supply comparison uses DAY_DEMAND spend instead.',
    enables: 'Supply decline and substitution controls',
  },
  {
    dataset: 'Connection history',
    status: 'available',
    source: 'ANALYTICS_DATA_HUB.EQT_SSP_MAPPING.MAPPING_NETWORK_PARTNER_CONNECTION_SCD; ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS',
    grain: 'Network × partner state interval (START_DATE, END_DATE)',
    coverage: 'Intervals from 2025; 437 cohort since 2025-10-19',
    freshness: 'Latest start 2026-10-20',
    timezone: 'TIMESTAMP_NTZ, no zone documented — shown as written',
    unit: 'State, documented reason code, comment, actor',
    currency: 'Alert view revenue uses PUBLIC.DAILY_REPORT spend, same unit question',
    permissions: 'Snowflake role data analyst (read)',
    missing: 'Event IDs; authorization of reconnects',
    enables: 'Incident episodes, reconnection cohort',
  },
  {
    dataset: 'Filtering and quality',
    status: 'unavailable',
    source: 'Not found (column search for filter / blocking reasons found only BLOCKING_REASON)',
    grain: '—',
    coverage: '—',
    freshness: '—',
    timezone: '—',
    unit: '—',
    currency: '—',
    permissions: '—',
    missing: 'Counts and denominators behind PASS labels, 75.68% and 19.66%',
    enables: 'Explaining operational changes without inventing cause',
  },
  {
    dataset: 'Related supply paths',
    status: 'partial',
    source: 'DAY_DEMAND (5100 and 5524 spend by day, all DSPs and Amazon)',
    grain: 'UTC day × network',
    coverage: '2026-09-06 → 2026-10-19 (5100 has no rows after 2026-10-14)',
    freshness: 'Read 2026-10-21',
    timezone: 'UTC',
    unit: 'Spend',
    currency: 'Column comment: Euro; not Finance-validated',
    permissions: 'Snowflake role data analyst (read)',
    missing: 'Verified publisher group and overlapping inventory for 5100 / 5524',
    enables: 'Detecting redistribution rather than new revenue',
  },
  {
    dataset: 'Workflow executions',
    status: 'unavailable',
    source: 'n8n execution store — not reachable from this role',
    grain: '—',
    coverage: 'One pasted narrative (no execution ID, no timestamps)',
    freshness: '—',
    timezone: '—',
    unit: '—',
    currency: '—',
    permissions: '—',
    missing: 'Execution ID, detected / investigated / approved / resolved timestamps, retries, errors',
    enables: 'Detection latency, workflow reliability',
  },
  {
    dataset: 'Human effort',
    status: 'unavailable',
    source: 'None',
    grain: '—',
    coverage: '—',
    freshness: '—',
    timezone: '—',
    unit: 'Active minutes by role and task',
    currency: '—',
    permissions: '—',
    missing: 'Manual comparison cases; Pitt-assisted touch time; review and rework',
    enables: 'Net human hours released',
  },
  {
    dataset: 'Resolution outcomes',
    status: 'partial',
    source: 'Connection SCD (reconnections only)',
    grain: 'Cut episode',
    coverage: 'Partner 437 cuts 2025-10-19 → 2026-09-18 with ≥ 30 days follow-up',
    freshness: 'Read 2026-10-21',
    timezone: 'NTZ',
    unit: 'Counts',
    currency: '—',
    permissions: 'Snowflake role data analyst (read)',
    missing: 'Which reconnections were authorized fixes, sustained recovery, spend after reconnection',
    enables: 'Recovery probability and delay — not yet',
  },
  {
    dataset: 'Finance inputs',
    status: 'unavailable',
    source: 'None',
    grain: '—',
    coverage: '—',
    freshness: '—',
    timezone: '—',
    unit: '—',
    currency: 'Validation pending',
    permissions: '—',
    missing: 'Currency, FX source / date, contribution or take-rate definition, costs, cash savings, discount rate',
    enables: 'Contribution, ROI, payback, NPV',
  },
];

export interface HealthIssue {
  severity: 'blocking' | 'advisory';
  title: string;
  detail: string;
  blocks: string;
  scope: 'both' | 'portfolio' | 'case';
}

export const HEALTH: HealthIssue[] = [
  { severity: 'blocking', title: 'Currency not Finance-validated', detail: 'Warehouse comments say Euro; the workbook shows $. Amounts are labelled source currency units.', blocks: 'Official monetary totals, contribution, ROI, payback, NPV, capacity value', scope: 'both' },
  { severity: 'blocking', title: 'No approved scenario inputs', detail: 'Restoration fraction, success probability, ramp, target volume and comparator are blank until entered. Illustrative values are labelled and never approved.', blocks: 'Approved conditional and expected spend', scope: 'both' },
  { severity: 'blocking', title: 'No human-effort measurements', detail: 'No active-minutes data for manual or Pitt-assisted investigations.', blocks: 'Net hours released, capacity value', scope: 'both' },
  { severity: 'blocking', title: 'No Finance cash-flow inputs', detail: 'No contribution definition, implementation or operating costs, cash savings or discount rate.', blocks: 'Net benefit, ROI, payback, NPV, IRR', scope: 'both' },
  { severity: 'blocking', title: 'Recoverability requires review', detail: 'The log records a planned internal phase-out (“Reauct phase out”). No authorized owner has approved remediation.', blocks: 'Inclusion of #5100 in approved recoverable totals', scope: 'case' },
  { severity: 'blocking', title: 'Root cause in conflict, unreviewed', detail: 'Workflow hypothesis (DSP-side cut) vs connection log (Equativ user, internal phase-out).', blocks: 'Any causal claim', scope: 'case' },
  { severity: 'advisory', title: 'Short daily retention', detail: `DAY_SCO_NODES starts ${COVERAGE.DAY_SCO_NODES.from}; 90 pre-incident days are not available. Projections are run-rate scenarios from 28 days.`, blocks: 'Statistical forecast, prediction intervals', scope: 'both' },
  { severity: 'advisory', title: 'DAY_SUPPLY query failed', detail: 'Timed out after 60 s. Supply-path comparison uses DAY_DEMAND spend; auctions at supply grain are missing.', blocks: 'Supply-decline control', scope: 'case' },
  { severity: 'advisory', title: 'Network 5100 has no rows after 2026-10-14', detail: 'Shown as missing, not zero.', blocks: '—', scope: 'case' },
  { severity: 'advisory', title: 'Seller types are current, not historical', detail: 'sellers.json seller types (latest row) are applied to every day; the visible view has 317 rows vs 316 in the workbook.', blocks: '—', scope: 'portfolio' },
  { severity: 'advisory', title: 'Connection timestamps have no zone', detail: 'START_DATE / END_DATE are TIMESTAMP_NTZ without a documented timezone; they are shown as written.', blocks: 'Hour-level alignment with UTC activity', scope: 'case' },
  { severity: 'advisory', title: 'Quality percentages not revalidated', detail: 'No source table for 75.68% (BlockedByPartnerSetupIncompatibleInventory) or 19.66% (uncrawled ads.txt) was found.', blocks: 'Quality explanation', scope: 'case' },
];
