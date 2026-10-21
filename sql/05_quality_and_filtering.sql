/* 05_quality_and_filtering.sql — Quality and filtering counts with denominators by incident-relative period.
   Read-only. Executed statements below are verbatim, with the query ID returned by Snowflake. */

/* TEMPLATE — NOT EXECUTED. No filtering-reason table was found: a column search for %FILTER%REASON%,
   %BLOCK%REASON% and %FILTERING% in ANALYTICS_DATA_HUB returned only BLOCKING_REASON on the connection SCD
   (query 01c7dd5d-020c-ecd8-0000-08896b2daa66). The workflow's 75.68% (BlockedByPartnerSetupIncompatibleInventory)
   and 19.66% (uncrawled ads.txt) cannot be revalidated until the source of those counts is named.
   Required output, per incident-relative period (pre, cut day, post):
     check_name, status, numerator, denominator, population, period_start, period_end, timezone */
SELECT :check_name AS check_name, :period AS period, COUNT_IF(:condition) AS numerator, COUNT(*) AS denominator
FROM :filtering_source   -- to be discovered
WHERE network_id = :network_id AND partner_id IN (:partner_ids) AND event_time >= :from_ts AND event_time < :to_ts;
