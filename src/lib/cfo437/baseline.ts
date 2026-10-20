/**
 * Amazon DSP · Endpoint 437 · Americas Display · September 2026.
 * Validated baseline from the workbook "Amazon DSP per Publisher ID - September 2026",
 * worksheet "437 (Americas Display)", validated against "Raw Data".
 * Workbook financial values are in undocumented source currency units.
 */

export type Classification = 'observed' | 'calculated' | 'estimated' | 'scenario_assumption' | 'unavailable';

export const SCOPE = {
  dsp: 'Amazon DSP',
  endpointId: 437,
  inventory: 'Americas Display',
  period: 'September 2026',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  historicalDays: 30,
  badge: 'Amazon DSP · Endpoint 437 · Americas Display · September 2026',
};

export const WORKBOOK = {
  name: 'Amazon DSP per Publisher ID - September 2026',
  url: 'https://docs.google.com/spreadsheets/d/1vjeIWfm0go39Q8i9ymRln40cjzgh1CrOpkLL_vIKoD0/edit?gid=2085734339#gid=2085734339',
  primarySheet: '437 (Americas Display)',
  validationSheet: 'Raw Data',
  visibleFilter: 'Seller Type = BOTH or INTERMEDIARY',
};

export const SPEND_UNIT = 'source currency units';
export const SPEND_UNIT_SHORT = 'SCU';
export const CURRENCY_WARNING = 'Currency requires Finance validation.';

export const RPMBR_FORMULA = 'RPMBr = SPEND_GROSS_PARTNER_REVENUE ÷ BID_REQUEST_COUNT × 1,000,000';

export interface BaselineView {
  label: string;
  rows: number;
  positiveRows: number;
  zeroRows: number;
  bidRequests: number;
  spend: number;
  weightedRpmbr: number;
  medianPositiveRpmbr: number;
  top16SharePct: number;
}

/** Primary baseline: the workbook's visible filtered view. Not the In Scope = 1 flag. */
export const VISIBLE_VIEW: BaselineView = {
  label: 'Visible filtered view (primary)',
  rows: 316,
  positiveRows: 205,
  zeroRows: 111,
  bidRequests: 198_616_733_575,
  spend: 7_141_421.720178,
  weightedRpmbr: 35.95579079,
  medianPositiveRpmbr: 12.26937425,
  top16SharePct: 80.444758,
};

/** All-row validation view: every publisher row on the worksheet, unfiltered. */
export const ALL_ROW_VIEW: BaselineView = {
  label: 'All-row validation view',
  rows: 861,
  positiveRows: 518,
  zeroRows: 343,
  bidRequests: 201_042_845_839,
  spend: 7_228_721.113683,
  weightedRpmbr: 35.95612211,
  medianPositiveRpmbr: 11.56914837,
  top16SharePct: 79.473248,
};

/** Earlier validation snapshot. Kept separate and never merged with the latest workbook. */
export const EARLIER_SNAPSHOT = {
  label: 'Earlier validation',
  rows: 316,
  positiveRows: 187,
  zeroRows: 129,
  weightedRpmbr: 43.73,
  medianPositiveRpmbr: 13.43,
  approximate: true,
};

export const BASELINE_METRICS: {
  label: string;
  value: string;
  unit: string;
  classification: Classification;
  source: string;
}[] = [
  { label: 'Visible publisher rows', value: '316', unit: 'rows', classification: 'observed', source: 'Workbook view' },
  { label: 'Positive-spend rows', value: '205', unit: 'rows', classification: 'calculated', source: 'Visible rows' },
  { label: 'Zero-spend rows', value: '111', unit: 'rows', classification: 'calculated', source: 'Visible rows' },
  { label: 'Bid requests', value: '198,616,733,575', unit: 'bid requests', classification: 'observed', source: 'BID_REQUEST_COUNT, visible rows' },
  { label: 'Gross spend', value: '7,141,421.720178', unit: SPEND_UNIT, classification: 'observed', source: 'SPEND_GROSS_PARTNER_REVENUE, visible rows' },
  { label: 'Weighted RPMBr', value: '35.95579079', unit: 'SCU per 1M bid requests', classification: 'calculated', source: 'Workbook formula' },
  { label: 'Median positive RPMBr', value: '12.26937425', unit: 'SCU per 1M bid requests', classification: 'calculated', source: 'Positive-spend visible rows' },
  { label: 'Top 16 spend concentration', value: '80.444758%', unit: 'share of spend', classification: 'calculated', source: 'Visible rows ranked by spend' },
];

/** Read-only Snowflake checks (ANALYTICS_EXPO), run 2026-10-20. */
export const SNOWFLAKE_MAPPING = {
  checkedOn: '2026-10-20',
  table: 'ANALYTICS_EXPO.DATA_ESSENTIALS.DSP_NETWORK_CONNECTION_HISTORY',
  partnerId: 437,
  partnerName: 'Amazon DSP AMER Display B',
  connectedNetworks: 2174,
  disconnectedNetworks: 104,
  latestDisconnection: '2026-10-01 08:28',
};

export const rpmbr = (spend: number, bidRequests: number) => (bidRequests > 0 ? (spend / bidRequests) * 1_000_000 : 0);
