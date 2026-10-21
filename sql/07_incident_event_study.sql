/* 07_incident_event_study.sql — Comparable pre / post windows around the cut.
   Read-only. Executed statements below are verbatim, with the query ID returned by Snowflake. */

/* EXECUTED 2026-10-21T01:57:20Z · query_id 01c7de55-020c-f8bc-0000-08896b330382 · rows 2 · Amazon spend on 5100 by seat, full days 2026-09-18 to 2026-09-24
   Purpose: Full-day pre-cut window, compared with the alert view window */
SELECT PARTNER_ID, SUM(TOTAL_PAID_PRICE_TRUE_COUNT) AS spend, SUM(PAID_EQUATIV_NET_REVENUE) AS eqt_net, SUM(TOTAL_PAID_PRICE_DSP_CURRENCY_TRUE_COUNT) AS spend_dsp_ccy, MIN(DAY) AS d0, MAX(DAY) AS d1 FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_DEMAND WHERE NETWORK_ID = 5100 AND PARTNER_ID IN (437,489,490,491,492) AND DAY BETWEEN '2026-09-18' AND '2026-09-24' GROUP BY 1 ORDER BY 1;

/* TEMPLATE — same-weekday pre/post comparison with signed residuals (not executed as a single statement; the
   app computes it from 03's daily rows). Keep negative residuals. */
WITH d AS (
  SELECT day, SUM(total_paid_price_true_count) AS spend
  FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES
  WHERE network_id = :network_id AND partner_id IN (:partner_ids) AND day BETWEEN :pre_from AND :post_to
  GROUP BY 1
)
SELECT DAYOFWEEK(day) AS weekday,
       AVG(IFF(day < :cut_day, spend, NULL)) AS pre_mean,
       AVG(IFF(day > :cut_day, spend, NULL)) AS post_mean,          -- the partial cut day is reported separately
       MAX(IFF(day = :cut_day, spend, NULL)) AS cut_day_partial,
       AVG(IFF(day > :cut_day, spend, NULL)) - AVG(IFF(day < :cut_day, spend, NULL)) AS signed_residual
FROM d GROUP BY 1 ORDER BY 1;
