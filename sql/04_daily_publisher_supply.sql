/* 04_daily_publisher_supply.sql — Daily all-DSP and Amazon spend per network at one row per day and network.
   Read-only. Executed statements below are verbatim, with the query ID returned by Snowflake. */

/* EXECUTED 2026-10-21T01:57:46Z · query_id 01c7de55-020c-f86c-0000-08896b32f552 · rows 83 · Daily all-DSP and Amazon spend, networks 5100 and 5524
   Purpose: Supply-path comparison (demand grain, one row per day and network) */
SELECT DAY, NETWORK_ID, SUM(TOTAL_PAID_PRICE_TRUE_COUNT) AS spend, SUM(IFF(PARTNER_ID IN (437,489,490,491,492), TOTAL_PAID_PRICE_TRUE_COUNT, 0)) AS amazon_spend FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_DEMAND WHERE NETWORK_ID IN (5100, 5524) AND DAY >= '2026-09-06' GROUP BY 1,2 ORDER BY 1,2;

/* TEMPLATE — attempted, FAILED (timed out after 60 s through the connector on 2026-10-21; no rows returned,
   nothing substituted). DAY_SUPPLY is the native supply grain (auctions are not split by partner). Re-run with a
   narrower date range or through a warehouse session with a longer timeout. */
SELECT day, network_id, SUM(auctions) AS auctions, SUM(impressions_true_count) AS impressions,
       SUM(total_paid_price_true_count) AS spend_source_units   -- column comment: "in Euro"; not Finance-validated
FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SUPPLY
WHERE network_id IN (:network_a, :network_b) AND day BETWEEN :from_day AND :to_day   -- DAY is UTC per column comment
GROUP BY 1, 2
ORDER BY 1, 2;
