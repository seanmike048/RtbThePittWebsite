/* 08_workflow_effort.sql — Workflow lifecycle durations and measured human touch time.
   Read-only. Executed statements below are verbatim, with the query ID returned by Snowflake. */

/* TEMPLATE — NOT EXECUTED. Workflow execution logs (execution ID, detected / investigated / approved /
   assigned / resolved timestamps) and human touch time are not in any source visible to this role. Elapsed lifecycle
   time and active human minutes must stay separate columns. */
SELECT execution_id, case_id, case_version, trigger_at, detected_at, investigated_at, approved_at, assigned_at, resolved_at,
       retries, error_count
FROM :workflow_execution_source;   -- n8n execution store, to be provided

SELECT case_id, role, task, active_minutes, is_rework, is_follow_up, measured_by
FROM :effort_log_source;           -- time tracking or sampled observation, to be provided
