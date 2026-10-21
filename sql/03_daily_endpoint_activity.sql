/* 03_daily_endpoint_activity.sql — Daily partner / seat activity by UTC day with coverage.
   Read-only. Executed statements below are verbatim, with the query ID returned by Snowflake. */

/* EXECUTED 2026-10-21T01:54:08Z · query_id 01c7de51-020c-f8bd-0000-08896b331022 · rows 1 · DAY_SCO_NODES coverage for partner 437
   Purpose: Daily retention actually available */
SELECT MIN(DAY) AS min_day, MAX(DAY) AS max_day, COUNT(DISTINCT DAY) AS days, SUM(BID_REQUESTS) AS br, SUM(TOTAL_PAID_PRICE_TRUE_COUNT) AS spend FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES WHERE PARTNER_ID = 437 AND DAY >= '2026-08-01';

/* EXECUTED 2026-10-21T01:54:32Z · query_id 01c7de52-020c-f86c-0000-08896b32f39a · rows 1 · DAY_DEMAND coverage for partner 437
   Purpose: Daily retention actually available */
SELECT MIN(DAY) AS min_day, MAX(DAY) AS max_day, COUNT(DISTINCT DAY) AS days FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_DEMAND WHERE PARTNER_ID = 437 AND DAY >= '2025-01-01';

/* EXECUTED 2026-10-21T01:55:16Z · query_id 01c7de52-020c-f8bd-0000-08896b331142 · rows 44 · Daily partner 437 activity, all networks
   Purpose: All-row daily series */
SELECT DAY, SUM(BID_REQUESTS) AS br, SUM(TOTAL_PAID_PRICE_TRUE_COUNT) AS spend, SUM(IMPRESSIONS_TRUE_COUNT) AS imps FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES WHERE PARTNER_ID = 437 AND DAY >= '2026-09-06' GROUP BY 1 ORDER BY 1;

/* EXECUTED 2026-10-21T01:59:58Z · query_id 01c7de57-020c-f8bc-0000-08896b33040e · rows 44 · Daily partner 437 activity, visible BOTH + INTERMEDIARY view
   Purpose: Portfolio daily baseline */
WITH st AS (SELECT seller_id, seller_type FROM ANALYTICS.PUBLIC.VIEW_SELLERS_JSON_NODES WHERE parent_domain = 'smartadserver.com' QUALIFY ROW_NUMBER() OVER (PARTITION BY seller_id ORDER BY last_modification_date DESC) = 1), d AS (SELECT DAY, NETWORK_ID, SUM(BID_REQUESTS) AS br, SUM(TOTAL_PAID_PRICE_TRUE_COUNT) AS spend FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES WHERE PARTNER_ID = 437 AND DAY >= '2026-09-06' GROUP BY 1, 2) SELECT TO_VARCHAR(d.DAY, 'YYYY-MM-DD') AS day, COUNT(*) AS networks, SUM(IFF(st.seller_type IN ('BOTH','INTERMEDIARY'), br, 0)) AS visible_br, SUM(IFF(st.seller_type IN ('BOTH','INTERMEDIARY'), spend, 0)) AS visible_spend, COUNT_IF(st.seller_type IN ('BOTH','INTERMEDIARY')) AS visible_networks FROM d LEFT JOIN st ON st.seller_id = TO_VARCHAR(d.NETWORK_ID) GROUP BY 1 ORDER BY 1;

/* EXECUTED 2026-10-21T01:57:04Z · query_id 01c7de54-020c-f8bd-0000-08896b331276 · rows 41 · Daily Amazon activity on network 5100 by partner
   Purpose: Investigation-scope daily series per seat */
SELECT DAY, PARTNER_ID, SUM(BID_REQUESTS) AS br, SUM(BIDS) AS bids, SUM(IMPRESSIONS_TRUE_COUNT) AS imps, SUM(TOTAL_PAID_PRICE_TRUE_COUNT) AS spend FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES WHERE NETWORK_ID = 5100 AND PARTNER_ID IN (437,489,490,491,492) AND DAY >= '2026-09-06' GROUP BY 1,2 ORDER BY 1,2;
