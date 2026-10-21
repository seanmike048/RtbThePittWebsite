/* 10_scenario_inputs.sql — Approved model inputs with provenance.
   Read-only. Executed statements below are verbatim, with the query ID returned by Snowflake. */

/* TEMPLATE — NOT EXECUTED. No approved scenario inputs exist. Inputs are never hidden inside SQL; this file only
   reads an approved-inputs table once Finance and the business owner maintain one. */
SELECT scope, scenario, input_key, value, unit, source, owner, effective_date, confidence, approval_status, approved_by, approved_at
FROM :approved_scenario_inputs
WHERE approval_status = 'approved';
