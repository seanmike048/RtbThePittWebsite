/**
 * The Pitt — Data Analytics Baseline & CFO Scenario Model.
 * Equativ SSP only. Historical baseline through 19 October 2026 UTC.
 * Values are transcribed from the analytics export; nothing here is a forecast.
 */

export type Provenance = 'observed' | 'calculated' | 'scenario' | 'currency_gap' | 'proxy';

export const BASELINE_AS_OF = '19 October 2026 UTC';
export const CURRENT_WINDOW = '20 Sep – 19 Oct 2026';

export const SUMMARY = {
  grossRevenueEur: 69_998_814.97,
  publishersWithAuctions: 1524,
  positiveSpendPublishers: 1425,
  zeroSpendPublishers: 99,
  top16SharePct: 31.27,
  amazonPairsDisconnected: 315,
  amazonPartnerCount: 5,
  liveCaseUnits: 33_029,
};

export const PERIOD_COMPARISON: { metric: string; prior: string; current: string; change: string; trend: 'up' | 'down' | 'flat' }[] = [
  { metric: 'Gross revenue', prior: '€53,390,751.94', current: '€69,998,814.97', change: '+€16,608,063.03 · +31.11%', trend: 'up' },
  { metric: 'Total auctions', prior: '11,347,643,769,125', current: '11,337,102,582,905', change: '−0.09%', trend: 'flat' },
  { metric: 'Pooled gross RPMA', prior: '€0.0047', current: '€0.0062', change: '+€0.0015', trend: 'up' },
  { metric: 'Median positive gross RPMA', prior: '€0.0051', current: '€0.0060', change: '+€0.0009', trend: 'up' },
  { metric: 'Top 16 share', prior: '32.65%', current: '31.27%', change: '−1.38 pp', trend: 'down' },
  { metric: 'Publishers with auctions', prior: '1,512', current: '1,524', change: '+12', trend: 'up' },
];

export const TOP_PUBLISHERS: {
  rank: number;
  name: string;
  id: number;
  type: string;
  grossEur: number;
  rpma: number;
  sharePct: number;
  cumulativePct: number;
}[] = [
  { rank: 1, name: 'Seedtag', id: 3050, type: 'Premium Sales House', grossEur: 2_698_036.95, rpma: 0.0063, sharePct: 3.85, cumulativePct: 3.85 },
  { rank: 2, name: 'THUNDER MONETIZATION PTE. LTD.', id: 5026, type: 'Ad Network', grossEur: 2_654_396.34, rpma: 0.0069, sharePct: 3.79, cumulativePct: 7.65 },
  { rank: 3, name: 'Sony', id: 5001, type: 'Direct Publisher', grossEur: 1_725_323.97, rpma: 0.0358, sharePct: 2.46, cumulativePct: 10.11 },
  { rank: 4, name: 'Rise', id: 4284, type: 'Ad Network', grossEur: 1_634_565.76, rpma: 0.0092, sharePct: 2.34, cumulativePct: 12.45 },
  { rank: 5, name: 'Markapp Media', id: 5530, type: 'Ad Network', grossEur: 1_427_165.99, rpma: 0.0227, sharePct: 2.04, cumulativePct: 14.49 },
  { rank: 6, name: 'CMI Marketing, Inc. d/b/a Raptive', id: 4006, type: 'Premium Sales House', grossEur: 1_308_834.51, rpma: 0.0118, sharePct: 1.87, cumulativePct: 16.36 },
  { rank: 7, name: 'Overwolf', id: 3545, type: 'Direct Publisher', grossEur: 1_302_985.1, rpma: 0.003, sharePct: 1.86, cumulativePct: 18.22 },
  { rank: 8, name: 'wecallmedia', id: 5881, type: 'Ad Network', grossEur: 1_263_364.03, rpma: 0.0447, sharePct: 1.8, cumulativePct: 20.02 },
  { rank: 9, name: 'The Brave', id: 4343, type: 'Ad Network', grossEur: 1_234_282.52, rpma: 0.0024, sharePct: 1.76, cumulativePct: 21.78 },
  { rank: 10, name: 'AdaptMX', id: 3056, type: 'Premium Sales House', grossEur: 1_008_712.87, rpma: 0.0064, sharePct: 1.44, cumulativePct: 23.23 },
  { rank: 11, name: 'LoopMe Inc', id: 4625, type: 'Ad Network', grossEur: 986_573.06, rpma: 0.0035, sharePct: 1.41, cumulativePct: 24.64 },
  { rank: 12, name: 'AppStock', id: 4190, type: 'Ad Network', grossEur: 942_850.98, rpma: 0.0071, sharePct: 1.35, cumulativePct: 25.98 },
  { rank: 13, name: 'Mediavine', id: 3860, type: 'Ad Network', grossEur: 941_641.15, rpma: 0.0235, sharePct: 1.35, cumulativePct: 27.33 },
  { rank: 14, name: 'ShowHeroes SE', id: 2161, type: 'Premium Sales House', grossEur: 925_041.69, rpma: 0.0455, sharePct: 1.32, cumulativePct: 28.65 },
  { rank: 15, name: 'Equativ 4247', id: 4247, type: 'Unmapped', grossEur: 918_862.9, rpma: 3.3281, sharePct: 1.31, cumulativePct: 29.96 },
  { rank: 16, name: 'HONGKONG THUNDER SOLUTION LIMITED', id: 4762, type: 'Ad Network', grossEur: 916_611.54, rpma: 0.0049, sharePct: 1.31, cumulativePct: 31.27 },
];

export const ISSUE_SNAPSHOT = {
  amazonPartnerIds: [437, 489, 490, 491, 492],
  disconnectedPairs: 315,
  totalPairs: 10_669,
  networksSince31Aug: 104,
  networksWithAdsTxtData: 103,
};

export const LIVE_CASES: {
  name: string;
  id: string;
  kind: 'live' | 'synthetic';
  amountLabel: string;
  amount: number;
  checks: { label: string; result: 'PASS' | 'FAIL' }[];
  interpretation: string;
}[] = [
  {
    name: 'Tubi TV STR',
    id: '5100',
    kind: 'live',
    amountLabel: '16,037 units',
    amount: 16_037,
    checks: [
      { label: 'ads.txt', result: 'PASS' },
      { label: 'SCO', result: 'PASS' },
      { label: 'Blocked inv.', result: 'PASS' },
      { label: 'IVT', result: 'PASS' },
    ],
    interpretation: 'Cause unconfirmed. Amazon bid requests fell 99.5% while network auctions changed −1.3%.',
  },
  {
    name: 'Raptive STR',
    id: '5339',
    kind: 'live',
    amountLabel: '14,663 units',
    amount: 14_663,
    checks: [
      { label: 'ads.txt', result: 'PASS' },
      { label: 'SCO', result: 'PASS' },
      { label: 'Blocked inv.', result: 'PASS' },
      { label: 'IVT', result: 'PASS' },
    ],
    interpretation: 'Cause unconfirmed; currency not documented.',
  },
  {
    name: 'VIX Latam',
    id: '3600',
    kind: 'live',
    amountLabel: '2,329 units',
    amount: 2_329,
    checks: [
      { label: 'ads.txt', result: 'PASS' },
      { label: 'SCO', result: 'PASS' },
      { label: 'Blocked inv.', result: 'FAIL' },
      { label: 'IVT', result: 'PASS' },
    ],
    interpretation: 'The failed check is an observation, not proof of the DSP cause.',
  },
  {
    name: 'Synthetic Network A',
    id: 'DEMO1',
    kind: 'synthetic',
    amountLabel: '€18,000 proxy',
    amount: 18_000,
    checks: [
      { label: 'ads.txt', result: 'FAIL' },
      { label: 'SCO', result: 'PASS' },
      { label: 'Blocked inv.', result: 'PASS' },
      { label: 'IVT', result: 'PASS' },
    ],
    interpretation: 'Excluded from official live exposure; direct cause remains unrecorded.',
  },
];

export const ADS_TXT_LINES = [
  {
    line: 'EQT',
    auctions: '483,186,171,905',
    compliancePct: 78.32,
    nnpAuctions: '14,129,661,341',
    notCrawledAuctions: '90,624,163,364',
    grossEur: 3_749_050.05,
    nnpEur: 44_130.99,
    notCrawledEur: 1_708_713.2,
  },
  {
    line: 'STR',
    auctions: '483,186,171,905',
    compliancePct: 57.47,
    nnpAuctions: '107,886,307,447',
    notCrawledAuctions: '97,616,619,544',
    grossEur: 3_749_050.05,
    nnpEur: 639_105.63,
    notCrawledEur: 1_723_957.94,
  },
];

export const STR_ISSUE_ROWS: {
  name: string;
  id: number;
  strGrossEur: number;
  nnpEur: number;
  notCrawledEur: number;
  compliancePct: number;
}[] = [
  { name: 'Markapp Media', id: 5530, strGrossEur: 337_213.96, nnpEur: 174_722.25, notCrawledEur: 162_438.25, compliancePct: 7.29 },
  { name: 'wecallmedia', id: 5881, strGrossEur: 318_795.34, nnpEur: 32_182.35, notCrawledEur: 286_390.49, compliancePct: 5.97 },
  { name: 'BalloonLabsApps', id: 4408, strGrossEur: 312_123.9, nnpEur: 6.78, notCrawledEur: 312_117.12, compliancePct: 0 },
  { name: 'LoopMe Inc', id: 4625, strGrossEur: 336_884.27, nnpEur: 160_276.79, notCrawledEur: 131_656.98, compliancePct: 16.48 },
  { name: 'Added TV', id: 4587, strGrossEur: 259_500.32, nnpEur: 0.87, notCrawledEur: 164_529.65, compliancePct: 20.7 },
  { name: 'Pokkt', id: 6005, strGrossEur: 124_946.64, nnpEur: 0, notCrawledEur: 119_176.21, compliancePct: 7.32 },
  { name: 'JamX', id: 5382, strGrossEur: 110_830.71, nnpEur: 0, notCrawledEur: 110_830.71, compliancePct: 0 },
  { name: 'Connatix', id: 3630, strGrossEur: 68_592.92, nnpEur: 64_956.02, notCrawledEur: 1_788.34, compliancePct: 8.2 },
  { name: 'Aloha Ads', id: 5314, strGrossEur: 63_317.67, nnpEur: 0, notCrawledEur: 63_317.67, compliancePct: 0 },
  { name: 'Indicue', id: 5877, strGrossEur: 90_975.25, nnpEur: 317.31, notCrawledEur: 55_650.38, compliancePct: 16.48 },
  { name: 'Jungle Technology LLC', id: 5951, strGrossEur: 43_500.77, nnpEur: 22_407.6, notCrawledEur: 20_955.67, compliancePct: 1.22 },
  { name: 'Sun Media', id: 1999, strGrossEur: 147_728.25, nnpEur: 42_737.39, notCrawledEur: 588.7, compliancePct: 43.17 },
];

export const SCENARIO_TRACKS = {
  live: {
    name: 'Live cases',
    base: 33_029,
    baseUnit: 'displayed units · currency unconfirmed',
    unit: 'units',
    status: 'Scenario only; currency unconfirmed',
  },
  synthetic: {
    name: 'Synthetic demo',
    base: 18_000,
    baseUnit: 'EUR proxy · synthetic record',
    unit: 'EUR proxy',
    status: 'Synthetic / proxy',
  },
} as const;

export type ScenarioTrack = keyof typeof SCENARIO_TRACKS;

export const PRESET_SCENARIOS = [
  { name: 'Conservative', recoveryPct: 10, daysSaved: 1 },
  { name: 'Base case', recoveryPct: 25, daysSaved: 3 },
  { name: 'Upside', recoveryPct: 50, daysSaved: 7 },
];

/** Share of the at-risk base recovered at the given rate. */
export const recoveryArithmetic = (base: number, recoveryPct: number) => (base * recoveryPct) / 100;

/** Weekly at-risk base spread per day, times days saved, times recovery probability. */
export const fasterDetectionValue = (base: number, daysSaved: number, probabilityPct: number) =>
  (base / 7) * daysSaved * (probabilityPct / 100);

export const SQL_APPENDIX: { title: string; sql: string }[] = [
  {
    title: 'Publisher baseline and concentration',
    sql: `WITH pub AS (
  SELECT o.network_id, o.network_name,
         SUM(o.auctions) AS auctions,
         SUM(o.total_paid_price_true_count) AS gross
  FROM __equativ_ssp_overall_activity AS o
  WHERE o.day_utc >= '2026-09-20' AND o.day_utc <= '2026-10-19'
  GROUP BY 1, 2
), r AS (
  SELECT *, gross / NULLIF(auctions, 0) * 1000 AS rpma,
         ROW_NUMBER() OVER (ORDER BY gross DESC) AS rnk
  FROM pub
), meta AS (
  SELECT MIN(day_utc) AS min_day, MAX(day_utc) AS max_day,
         COUNT(*) AS source_rows
  FROM __equativ_ssp_overall_activity
  WHERE day_utc >= '2026-09-20' AND day_utc <= '2026-10-19'
)
SELECT ANY_VALUE(m.min_day) AS min_day,
       ANY_VALUE(m.max_day) AS max_day,
       ANY_VALUE(m.source_rows) AS source_rows,
       COUNT(*) AS publishers,
       COUNT_IF(r.gross > 0) AS positive_spend_publishers,
       COUNT_IF(COALESCE(r.gross, 0) <= 0) AS zero_spend_publishers,
       ROUND(SUM(r.gross), 2) AS total_gross_eur,
       SUM(r.auctions) AS total_auctions,
       ROUND(SUM(IFF(r.rnk <= 16, r.gross, 0)) / NULLIF(SUM(r.gross), 0) * 100, 2) AS top16_share_pct,
       ROUND(SUM(r.gross) / NULLIF(SUM(r.auctions), 0) * 1000, 4) AS pooled_gross_rpma_eur,
       ROUND(MEDIAN(IFF(r.gross > 0, r.rpma, NULL)), 4) AS median_positive_gross_rpma_eur
FROM r CROSS JOIN meta AS m;`,
  },
  {
    title: 'Amazon DSP disconnection snapshot',
    sql: `SELECT partner_name, partner_id, network_name, network_id,
       status, date_disconnection, date_utc, supply_business_unit
FROM ANALYTICS_EXPO.DATA_ESSENTIALS.DSP_NETWORK_CONNECTION_HISTORY
WHERE partner_name ILIKE '%amazon%'
  AND status = 'Disconnected'
ORDER BY date_disconnection DESC NULLS LAST;`,
  },
  {
    title: 'Ads.txt cohort diagnostic',
    sql: `SELECT network_id, network_name,
       MIN(day_utc) AS start_day,
       MAX(day_utc) AS end_day,
       COUNT(DISTINCT day_utc) AS days_with_data,
       SUM(auctions_ok_compliance_eqt) + SUM(auctions_non_compliance_eqt) AS total_auctions_eqt,
       SUM(auctions_ok_compliance_eqt) AS ok_auctions_eqt,
       SUM(auctions_non_compliance_network_not_present_eqt) AS nnp_auctions_eqt,
       SUM(auctions_non_compliance_not_crawled_eqt) AS not_crawled_auctions_eqt,
       SUM(auctions_ok_compliance_str) + SUM(auctions_non_compliance_str) AS total_auctions_str,
       SUM(auctions_ok_compliance_str) AS ok_auctions_str,
       SUM(auctions_non_compliance_network_not_present_str) AS nnp_auctions_str,
       SUM(auctions_non_compliance_not_crawled_str) AS not_crawled_auctions_str,
       SUM(equativ_gross_revenue_euro_ok_compliance_str)
         + SUM(equativ_gross_revenue_euro_non_compliance_str) AS gross_rev_eur_str_total
FROM __compliance
WHERE day_utc BETWEEN '2026-10-13' AND '2026-10-19'
  AND network_id IN (<104 network IDs from the disconnection extract>)
GROUP BY network_id, network_name;`,
  },
];

export const SOURCES =
  'Equativ SSP semantic activity model · Equativ DSP network connection history · Equativ ads.txt compliance model · Slack #the-pitt output and project-status messages.';
