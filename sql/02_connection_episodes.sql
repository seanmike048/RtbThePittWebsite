/* 02_connection_episodes.sql — Connection state transitions, actor, exact comments and reason codes; the alert view definition.
   Read-only. Executed statements below are verbatim, with the query ID returned by Snowflake. */

/* EXECUTED 2026-10-21T01:58:35Z · query_id 01c7de56-020c-f8bb-0000-08896b32df0e · rows 17 · Connection episodes, network 5100 × Amazon variants
   Purpose: Actual state transitions, actor and exact comments */
SELECT START_DATE, END_DATE, NETWORK_ID, PARTNER_ID, BLOCKING_REASON, COMMENT, LASTUPDATEDBY FROM ANALYTICS_DATA_HUB.EQT_SSP_MAPPING.MAPPING_NETWORK_PARTNER_CONNECTION_SCD WHERE NETWORK_ID = 5100 AND PARTNER_ID IN (437,489,490,491,492) ORDER BY PARTNER_ID, START_DATE;

/* EXECUTED 2026-10-21T01:57:19Z · query_id 01c7de55-020c-f8bb-0000-08896b32ddf6 · rows 1 · Definition of VIEW_DISCONNECTION_ALERT_365DAYS
   Purpose: How the workflow’s “7 days before” revenue window is computed */
SELECT GET_DDL('VIEW', 'ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS');

/* EXECUTED 2026-10-20T21:50:51Z · query_id 01c7dd5e-020c-ec72-0000-08896b2dd60e · rows 7 · Blocking-reason frequency in the connection SCD, 2026
   Purpose: Which codes are used and with what comments */
SELECT blocking_reason, COUNT(*) n, ANY_VALUE(comment) sample_comment FROM ANALYTICS_DATA_HUB.EQT_SSP_MAPPING.MAPPING_NETWORK_PARTNER_CONNECTION_SCD WHERE start_date >= '2026-01-01' GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
