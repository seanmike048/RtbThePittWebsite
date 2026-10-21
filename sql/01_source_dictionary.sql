/* 01_source_dictionary.sql — Identifiers, fields, metric units, currencies, grain and source comments.
   Read-only. Executed statements below are verbatim, with the query ID returned by Snowflake. */

/* EXECUTED 2026-10-21T01:50:04Z · query_id 01c7de4e-020c-f8bc-0000-08896b330016 · rows 7 · Candidate activity tables and the connection-history table
   Purpose: Existence, row count and last_altered of each source */
SELECT table_catalog, table_schema, table_name, table_type, row_count, TO_VARCHAR(last_altered,'YYYY-MM-DD HH24:MI') last_altered, comment
FROM ANALYTICS_DATA_HUB.INFORMATION_SCHEMA.TABLES
WHERE (table_schema = 'EQT_SSP_ACTIVITY' AND table_name IN ('DAY_DEMAND','DAY_SUPPLY','DAY_DOMAIN','MONTH_DEMAND','DAY_SCO_NODES','MONTH_SCO_NODES'))
   OR table_name ILIKE '%NETWORK%PARTNER%CONNECTION%'
ORDER BY table_schema, table_name;

/* EXECUTED 2026-10-21T01:54:16Z · query_id 01c7de52-020c-f8bb-0000-08896b32dc5e · rows 4 · Column list of DAY_DEMAND, DAY_SCO_NODES, MONTH_DEMAND, MONTH_SCO_NODES
   Purpose: Real column names before any query is written */
SELECT TABLE_NAME, LISTAGG(COLUMN_NAME, ',') WITHIN GROUP (ORDER BY ORDINAL_POSITION) AS cols FROM ANALYTICS_DATA_HUB.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='EQT_SSP_ACTIVITY' AND TABLE_NAME IN ('MONTH_DEMAND','DAY_DEMAND','DAY_SCO_NODES','MONTH_SCO_NODES') GROUP BY 1;

/* EXECUTED 2026-10-21T01:50:29Z · query_id 01c7de4e-020c-f8bb-0000-08896b32d9ee · rows 12 · Column comments on SCO-node tables
   Purpose: Metric units, currency and timezone as documented in the warehouse */
SELECT table_name, column_name, comment FROM ANALYTICS_DATA_HUB.INFORMATION_SCHEMA.COLUMNS WHERE table_schema='EQT_SSP_ACTIVITY' AND table_name IN ('DAY_SCO_NODES','MONTH_SCO_NODES') AND column_name IN ('BID_REQUESTS','TOTAL_PAID_PRICE_TRUE_COUNT','PARTNER_ID','NETWORK_ID','DAY','MONTH','AUCTIONS') ORDER BY 1,2;

/* EXECUTED 2026-10-21T01:56:34Z · query_id 01c7de54-020c-f8bc-0000-08896b3302fe · rows 92 · Column comments on DAY_SUPPLY and the connection SCD
   Purpose: Impression type and inventory legends; documented blocking-reason legend; SCD timestamps carry no timezone */
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COMMENT FROM ANALYTICS_DATA_HUB.INFORMATION_SCHEMA.COLUMNS WHERE (TABLE_SCHEMA='EQT_SSP_ACTIVITY' AND TABLE_NAME='DAY_SUPPLY') OR (TABLE_SCHEMA='EQT_SSP_MAPPING' AND TABLE_NAME='MAPPING_NETWORK_PARTNER_CONNECTION_SCD') ORDER BY TABLE_NAME, ORDINAL_POSITION;

/* EXECUTED 2026-10-21T01:50:47Z · query_id 01c7de4e-020c-f86c-0000-08896b32f21e · rows 2 · MONTH_DEMAND vs MONTH_SCO_NODES, partner 437, September 2026
   Purpose: Fan-out check between the two grains, and DSP-currency total */
SELECT 'MONTH_DEMAND' src, SUM(total_paid_price_true_count) spend_eur_doc, SUM(total_paid_price_dsp_currency_true_count) spend_dsp_ccy, SUM(impressions_true_count) imps, NULL bid_requests FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.MONTH_DEMAND WHERE partner_id = 437 AND month = '2026-09-01'
UNION ALL SELECT 'MONTH_SCO_NODES', SUM(total_paid_price_true_count), NULL, SUM(impressions_true_count), SUM(bid_requests) FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.MONTH_SCO_NODES WHERE partner_id = 437 AND month = '2026-09-01';

/* EXECUTED 2026-10-21T01:54:42Z · query_id 01c7de52-020c-f8bc-0000-08896b33029a · rows 3 · Impression type and inventory mix, partner 437, September 2026
   Purpose: Confirms 437 is Banner (impression type 0) only */
SELECT IMPRESSION_TYPE, INVENTORY, SUM(IMPRESSIONS_TRUE_COUNT) AS imps, SUM(TOTAL_PAID_PRICE_TRUE_COUNT) AS spend, SUM(TOTAL_PAID_PRICE_DSP_CURRENCY_TRUE_COUNT) AS spend_dsp FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.MONTH_DEMAND WHERE PARTNER_ID = 437 AND MONTH = '2026-09-01' GROUP BY 1,2 ORDER BY 4 DESC LIMIT 20;
