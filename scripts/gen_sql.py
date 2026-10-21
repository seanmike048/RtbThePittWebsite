"""Write sql/01..10 from executed queries (verbatim SQL, with query IDs) plus clearly labelled templates."""
import json, os, sys

by_file = json.load(open(sys.argv[1]))
out_dir = sys.argv[2]
os.makedirs(out_dir, exist_ok=True)

FILES = {
    '01_source_dictionary.sql': 'Identifiers, fields, metric units, currencies, grain and source comments.',
    '02_connection_episodes.sql': 'Connection state transitions, actor, exact comments and reason codes; the alert view definition.',
    '03_daily_endpoint_activity.sql': 'Daily partner / seat activity by UTC day with coverage.',
    '04_daily_publisher_supply.sql': 'Daily all-DSP and Amazon spend per network at one row per day and network.',
    '05_quality_and_filtering.sql': 'Quality and filtering counts with denominators by incident-relative period.',
    '06_publisher_baseline.sql': 'Workbook reconciliation, concentration, pooled and median RPMBr, funnel totals.',
    '07_incident_event_study.sql': 'Comparable pre / post windows around the cut.',
    '08_workflow_effort.sql': 'Workflow lifecycle durations and measured human touch time.',
    '09_recovery_outcomes.sql': 'Disconnection cohort with follow-up, unresolved cuts included.',
    '10_scenario_inputs.sql': 'Approved model inputs with provenance.',
}

TEMPLATES = {
    '04_daily_publisher_supply.sql': '''/* TEMPLATE — attempted, FAILED (timed out after 60 s through the connector on 2026-10-21; no rows returned,
   nothing substituted). DAY_SUPPLY is the native supply grain (auctions are not split by partner). Re-run with a
   narrower date range or through a warehouse session with a longer timeout. */
SELECT day, network_id, SUM(auctions) AS auctions, SUM(impressions_true_count) AS impressions,
       SUM(total_paid_price_true_count) AS spend_source_units   -- column comment: "in Euro"; not Finance-validated
FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SUPPLY
WHERE network_id IN (:network_a, :network_b) AND day BETWEEN :from_day AND :to_day   -- DAY is UTC per column comment
GROUP BY 1, 2
ORDER BY 1, 2;
''',
    '05_quality_and_filtering.sql': '''/* TEMPLATE — NOT EXECUTED. No filtering-reason table was found: a column search for %FILTER%REASON%,
   %BLOCK%REASON% and %FILTERING% in ANALYTICS_DATA_HUB returned only BLOCKING_REASON on the connection SCD
   (query 01c7dd5d-020c-ecd8-0000-08896b2daa66). The workflow's 75.68% (BlockedByPartnerSetupIncompatibleInventory)
   and 19.66% (uncrawled ads.txt) cannot be revalidated until the source of those counts is named.
   Required output, per incident-relative period (pre, cut day, post):
     check_name, status, numerator, denominator, population, period_start, period_end, timezone */
SELECT :check_name AS check_name, :period AS period, COUNT_IF(:condition) AS numerator, COUNT(*) AS denominator
FROM :filtering_source   -- to be discovered
WHERE network_id = :network_id AND partner_id IN (:partner_ids) AND event_time >= :from_ts AND event_time < :to_ts;
''',
    '08_workflow_effort.sql': '''/* TEMPLATE — NOT EXECUTED. Workflow execution logs (execution ID, detected / investigated / approved /
   assigned / resolved timestamps) and human touch time are not in any source visible to this role. Elapsed lifecycle
   time and active human minutes must stay separate columns. */
SELECT execution_id, case_id, case_version, trigger_at, detected_at, investigated_at, approved_at, assigned_at, resolved_at,
       retries, error_count
FROM :workflow_execution_source;   -- n8n execution store, to be provided

SELECT case_id, role, task, active_minutes, is_rework, is_follow_up, measured_by
FROM :effort_log_source;           -- time tracking or sampled observation, to be provided
''',
    '10_scenario_inputs.sql': '''/* TEMPLATE — NOT EXECUTED. No approved scenario inputs exist. Inputs are never hidden inside SQL; this file only
   reads an approved-inputs table once Finance and the business owner maintain one. */
SELECT scope, scenario, input_key, value, unit, source, owner, effective_date, confidence, approval_status, approved_by, approved_at
FROM :approved_scenario_inputs
WHERE approval_status = 'approved';
''',
}

EXTRA = {
    '06_publisher_baseline.sql': '''
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
''',
    '07_incident_event_study.sql': '''
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
''',
}

for name, desc in FILES.items():
    parts = [f'/* {name} — {desc}\n   Read-only. Executed statements below are verbatim, with the query ID returned by Snowflake. */\n']
    for r in by_file.get(name, []):
        parts.append(f"\n/* EXECUTED {r['executedAt']} · query_id {r['queryId']} · rows {r['rowCount']} · {r['title']}\n   Purpose: {r['purpose']} */\n{r['sql'].strip()};\n")
    if name in TEMPLATES:
        parts.append('\n' + TEMPLATES[name])
    if name in EXTRA:
        parts.append(EXTRA[name])
    open(os.path.join(out_dir, name), 'w').write(''.join(parts))
    print(name, len(by_file.get(name, [])), 'executed')
