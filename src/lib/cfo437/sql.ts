/** Snowflake SQL appendix. Validation status reflects read-only INFORMATION_SCHEMA checks on 2026-10-20. */

export type CheckStatus = 'validated' | 'unverified' | 'missing';

export interface SqlCheck {
  item: string;
  status: CheckStatus;
  note: string;
}

export interface SqlEntry {
  id: string;
  title: string;
  purpose: string;
  sql: string;
  checks: SqlCheck[];
}

export const SQL_ENTRIES: SqlEntry[] = [
  {
    id: 'baseline',
    title: 'Endpoint-437 publisher baseline',
    purpose: 'Reproduces the workbook baseline in Snowflake once the source table is identified. Row-level RPMBr is computed in a CTE so the median is valid.',
    sql: `WITH rows_437 AS (
    SELECT
        PUBLISHER_ID,
        SELLER_TYPE,
        BID_REQUEST_COUNT,
        SPEND_GROSS_PARTNER_REVENUE,
        SPEND_GROSS_PARTNER_REVENUE
            / NULLIF(BID_REQUEST_COUNT, 0) * 1000000 AS row_rpmbr
    FROM <validated_endpoint_437_publisher_table>   -- placeholder: source not found in ANALYTICS_EXPO
    WHERE ENDPOINT = 437
      AND INVENTORY_TYPE = 'DISPLAY'
      AND SELLER_TYPE IN ('BOTH', 'INTERMEDIARY')
      AND MONTH = '2026-09'
)
SELECT
    COUNT(*) AS publisher_rows,
    COUNT_IF(SPEND_GROSS_PARTNER_REVENUE > 0) AS positive_spend_publishers,
    COUNT_IF(COALESCE(SPEND_GROSS_PARTNER_REVENUE, 0) <= 0) AS zero_spend_publishers,
    SUM(BID_REQUEST_COUNT) AS bid_request_count,
    SUM(SPEND_GROSS_PARTNER_REVENUE) AS spend_gross_partner_revenue,   -- source currency units
    SUM(SPEND_GROSS_PARTNER_REVENUE)
        / NULLIF(SUM(BID_REQUEST_COUNT), 0) * 1000000 AS weighted_rpmbr,
    MEDIAN(IFF(SPEND_GROSS_PARTNER_REVENUE > 0, row_rpmbr, NULL)) AS median_positive_rpmbr
FROM rows_437;`,
    checks: [
      { item: 'AMAZON_DSP_PER_PUBLISHER_ID_SEPTEMBER_2026', status: 'missing', note: 'Not found in ANALYTICS_EXPO. Replaced with a placeholder.' },
      { item: 'BID_REQUEST_COUNT, SPEND_GROSS_PARTNER_REVENUE', status: 'missing', note: 'No ANALYTICS_EXPO table has these columns.' },
      { item: 'ENDPOINT, INVENTORY_TYPE, SELLER_TYPE, MONTH', status: 'unverified', note: 'Workbook column names; Snowflake names unknown.' },
      { item: 'Median of row-level RPMBr', status: 'validated', note: 'Fixes the original query, which took a median of an aggregate alias.' },
    ],
  },
  {
    id: 'ssp-context',
    title: 'A · Historical Equativ SSP activity context',
    purpose: 'General SSP context for September. Not an endpoint-437 replacement and reported in EUR, so never mixed with workbook SCU values.',
    sql: `WITH pub AS (
    SELECT
        o.network_id,
        o.network_name,
        SUM(o.auctions) AS auctions,
        SUM(o.total_paid_price_true_count) AS gross
    FROM ANALYTICS_EXPO.CORTEX_ANALYST.EQUATIV_SSP_OVERALL_ACTIVITY AS o
    WHERE o.day >= '2026-09-01'
      AND o.day <= '2026-09-30'
    GROUP BY 1, 2
), ranked AS (
    SELECT
        *,
        gross / NULLIF(auctions, 0) * 1000 AS gross_rpma,
        ROW_NUMBER() OVER (ORDER BY gross DESC) AS spend_rank
    FROM pub
)
SELECT
    COUNT(*) AS publishers,
    COUNT_IF(gross > 0) AS positive_spend_publishers,
    COUNT_IF(COALESCE(gross, 0) <= 0) AS zero_spend_publishers,
    ROUND(SUM(gross), 2) AS total_gross_eur,
    SUM(auctions) AS total_auctions,
    ROUND(SUM(IFF(spend_rank <= 16, gross, 0)) / NULLIF(SUM(gross), 0) * 100, 2) AS top16_share_pct,
    ROUND(SUM(gross) / NULLIF(SUM(auctions), 0) * 1000, 4) AS pooled_gross_rpma_eur,
    ROUND(MEDIAN(IFF(gross > 0, gross_rpma, NULL)), 4) AS median_positive_gross_rpma_eur
FROM ranked;`,
    checks: [
      { item: 'CORTEX_ANALYST.EQUATIV_SSP_OVERALL_ACTIVITY', status: 'validated', note: 'Table exists.' },
      { item: 'DAY, NETWORK_ID, NETWORK_NAME, AUCTIONS, TOTAL_PAID_PRICE_TRUE_COUNT', status: 'validated', note: 'Columns exist.' },
      { item: 'DSP_ID = 437 filter', status: 'unverified', note: 'DSP_ID exists but its mapping to endpoint 437 is not confirmed; not applied.' },
      { item: 'Bid requests', status: 'missing', note: 'No bid-request column, so RPMBr cannot be derived here (RPMA is per 1,000 auctions).' },
    ],
  },
  {
    id: 'connection-history',
    title: 'B · Amazon DSP connection history · endpoint 437',
    purpose: 'Lists networks connected to or disconnected from partner 437.',
    sql: `SELECT
    partner_name,
    partner_id,
    network_name,
    network_id,
    status,
    date_disconnection,
    date_utc,
    supply_business_unit
FROM ANALYTICS_EXPO.DATA_ESSENTIALS.DSP_NETWORK_CONNECTION_HISTORY
WHERE partner_name ILIKE '%amazon%'
  AND partner_id = 437
ORDER BY date_disconnection DESC NULLS LAST;`,
    checks: [
      { item: 'DATA_ESSENTIALS.DSP_NETWORK_CONNECTION_HISTORY', status: 'validated', note: 'Table and all selected columns exist.' },
      { item: 'partner_id = 437', status: 'validated', note: '437 = “Amazon DSP AMER Display B”: 2,174 connected, 104 disconnected.' },
      { item: 'Time series', status: 'unverified', note: 'Current-state snapshot, not a daily history.' },
    ],
  },
  {
    id: 'issue-cases',
    title: 'C · Amazon DSP issue-case aggregation',
    purpose: 'Template only. Runs once a validated issue-case table exists.',
    sql: `SELECT
    partner_id, network_id, network_name, case_id,
    disconnection_timestamp, revenue_at_risk, revenue_lookback_days, currency,
    data_origin, evidence_source,
    ads_txt_status, sco_status, blocked_inventory_status, ivt_status,
    bid_request_change, network_traffic_change,
    evidence_confidence, cause_confidence, priority, approval_status
FROM <validated_issue_case_table>
WHERE partner_id = 437
  AND inventory_type = 'DISPLAY'
ORDER BY disconnection_timestamp DESC;`,
    checks: [
      { item: '<validated_issue_case_table>', status: 'missing', note: 'No table with REVENUE_AT_RISK or EVIDENCE_CONFIDENCE in ANALYTICS_EXPO. CASE_ID exists only in *_ACTIVITY_BEHAVIOUR_EVAL tables, which are not issue cases.' },
      { item: 'All columns', status: 'unverified', note: 'Resolve through dbt or the semantic model before running.' },
    ],
  },
  {
    id: 'ads-txt',
    title: 'D · Ads.txt diagnostic context',
    purpose: 'Network-level ads.txt compliance for affected networks. Not proof of a DSP disconnection cause; Not Crawled is not proof a seller line is missing.',
    sql: `SELECT
    network_id,
    network_name,
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
    SUM(auctions_non_compliance_not_crawled_str) AS not_crawled_auctions_str
FROM ANALYTICS_EXPO.DATA_ESSENTIALS.DAILY_ADS_TXT_COMPLIANCE
WHERE day_utc BETWEEN '2026-09-01' AND '2026-09-30'
  AND network_id IN (<validated endpoint-437 affected networks>)
GROUP BY 1, 2;`,
    checks: [
      { item: 'DATA_ESSENTIALS.DAILY_ADS_TXT_COMPLIANCE', status: 'validated', note: 'Table and all referenced columns exist.' },
      { item: 'network_id type', status: 'unverified', note: 'NETWORK_ID is TEXT here but NUMBER in connection history; cast when joining.' },
      { item: '<validated endpoint-437 affected networks>', status: 'missing', note: 'Needs the affected-network list from Partnerships / TechOps.' },
    ],
  },
];
