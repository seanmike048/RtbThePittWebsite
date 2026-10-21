/* 06_publisher_baseline.sql — Workbook reconciliation, concentration, pooled and median RPMBr, funnel totals.
   Read-only. Executed statements below are verbatim, with the query ID returned by Snowflake. */

/* EXECUTED 2026-10-21T01:59:05Z · query_id 01c7de56-020c-f8bc-0000-08896b3303fe · rows 1 · Partner 437 funnel totals, September 2026
   Purpose: Bid requests → bids → wins → impressions */
SELECT SUM(BID_REQUESTS) AS br, SUM(BIDS) AS bids, SUM(RTB_IMPRESSIONS) AS wins, SUM(CLIENT_SIDE_WINNING_BIDS) AS cs_winning_bids, SUM(IMPRESSIONS_TRUE_COUNT) AS imps, SUM(AUCTIONS) AS auctions, SUM(TOTAL_PAID_PRICE_TRUE_COUNT) AS spend, COUNT(DISTINCT IMPRESSION_TYPE) AS imp_types, MIN(IMPRESSION_TYPE) AS imp_type FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.MONTH_SCO_NODES WHERE PARTNER_ID = 437 AND MONTH = '2026-09-01';

/* EXECUTED 2026-10-20T21:17:07Z · query_id 01c7dd3c-020c-ed74-0000-08896b2c8e5a · rows 1 · Workbook reconciliation, visible view, September 2026
   Purpose: Rows, positive / zero spend, pooled and median RPMBr, top-16 share */
WITH pub AS (
  SELECT network_id, SUM(bid_requests) AS bid_requests, SUM(total_paid_price_true_count) AS spend
  FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.MONTH_SCO_NODES
  WHERE partner_id = 437 AND month = '2026-09-01'
  GROUP BY 1
), st AS (
  SELECT seller_id, seller_type, name
  FROM ANALYTICS.PUBLIC.VIEW_SELLERS_JSON_NODES
  WHERE parent_domain = 'smartadserver.com'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY seller_id ORDER BY last_modification_date DESC) = 1
), j AS (
  SELECT p.*, st.seller_type, st.name FROM pub p LEFT JOIN st ON st.seller_id = TO_VARCHAR(p.network_id)
), r AS (
  SELECT *, spend / NULLIF(bid_requests, 0) * 1000000 AS rpmbr, ROW_NUMBER() OVER (ORDER BY spend DESC) AS rnk
  FROM j WHERE seller_type IN ('BOTH', 'INTERMEDIARY')
)
SELECT COUNT(*) rows_, COUNT_IF(spend > 0) pos, COUNT_IF(COALESCE(spend,0) <= 0) zero, SUM(bid_requests) br, SUM(spend) spend,
  SUM(spend)/NULLIF(SUM(bid_requests),0)*1000000 rpmbr, MEDIAN(IFF(spend > 0, rpmbr, NULL)) med,
  SUM(IFF(rnk <= 16, spend, 0))/NULLIF(SUM(spend),0)*100 top16,
  (SELECT COUNT_IF(seller_type IS NULL) FROM j) untyped
FROM r;

/* EXECUTED 2026-10-20T21:20:41Z · query_id 01c7dd40-020c-ec72-0000-08896b2cda52 · rows 1 · All-row check, partner 437, September 2026
   Purpose: 861 networks; spend 7,228,721.11 */
WITH x AS (WITH st AS (
  SELECT seller_id, seller_type, name
  FROM ANALYTICS.PUBLIC.VIEW_SELLERS_JSON_NODES
  WHERE parent_domain = 'smartadserver.com'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY seller_id ORDER BY last_modification_date DESC) = 1
), pub AS (
  SELECT network_id, SUM(bid_requests) AS bid_requests, SUM(total_paid_price_true_count) AS spend
  FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.MONTH_SCO_NODES
  WHERE partner_id = 437 AND month = '2026-09-01'
  GROUP BY 1
)
SELECT TO_VARCHAR(p.network_id) AS publisher_id, COALESCE(st.name, '') AS publisher_name,
       COALESCE(st.seller_type, '') AS seller_type, p.bid_requests, p.spend
FROM pub p LEFT JOIN st ON st.seller_id = TO_VARCHAR(p.network_id))
SELECT COUNT(*), SUM(spend), COUNT_IF(seller_type=''), COUNT_IF(publisher_name=''), ANY_VALUE(IFF(seller_type IN ('BOTH','INTERMEDIARY') AND bid_requests = 1120903, publisher_id || ' ' || publisher_name, NULL)) FROM x;

/* TEMPLATE — application-side canonical baseline contract (proposed, not an existing table). Supply a validated
   scoped_daily CTE first: one row per day / network / partner / currency at the intended scope. Rows with unverified
   currency go to a separate audit output, not into these sums. */
WITH scoped_daily AS (
  SELECT day, network_id, partner_id, bid_requests, spend_value, currency_code, currency_verified
  FROM :validated_source
), publisher_totals AS (
  SELECT network_id, currency_code, SUM(bid_requests) AS bid_requests, SUM(spend_value) AS spend_value
  FROM scoped_daily WHERE currency_verified = TRUE AND currency_code IS NOT NULL
  GROUP BY network_id, currency_code
), ranked AS (
  SELECT *, spend_value / NULLIF(bid_requests, 0) * 1000000 AS spend_per_million_bid_requests,
         ROW_NUMBER() OVER (PARTITION BY currency_code ORDER BY spend_value DESC, network_id) AS spend_rank
  FROM publisher_totals
)
SELECT currency_code, COUNT(*) AS publisher_count,
       COUNT_IF(spend_value > 0) AS positive_spend_count, COUNT_IF(spend_value = 0) AS zero_spend_count,
       COUNT_IF(spend_value < 0) AS negative_spend_count, COUNT_IF(spend_value IS NULL) AS missing_spend_count,
       SUM(spend_value) AS total_spend, SUM(bid_requests) AS total_bid_requests,
       SUM(spend_value) / NULLIF(SUM(bid_requests), 0) * 1000000 AS pooled_spend_per_million_bid_requests,
       MEDIAN(IFF(spend_value > 0, spend_per_million_bid_requests, NULL)) AS median_positive_publisher_rpmbr,
       SUM(IFF(spend_rank <= 16, spend_value, 0)) / NULLIF(SUM(spend_value), 0) AS top_16_spend_share
FROM ranked GROUP BY currency_code;
