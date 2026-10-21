/** Browser-side types for The Pitt API (server/contracts.mjs). Route and field names are this app's own contract. */

export type DspStatus = 'supported' | 'read_only' | 'not_integrated';
export interface Seat { id: number; name: string; format: string | null; region: string | null }
export interface Dsp { key: string; name: string; status: DspStatus; note: string; seats: Seat[] }

export interface SessionInfo {
  user: { id: string; roles: string[] } | null;
  csrf?: string;
  auth_configured: boolean;
  missing?: string[];
  /** Signed-out only: names of the variables each feature still needs (never values). */
  setup?: { environment: string; auth: string[]; launch: string[]; snowflake: string[] };
}

export interface ServerStatus {
  environment: 'local' | 'dev' | 'staging' | 'production';
  launch: { configured: boolean; missing: string[] };
  snowflake: { configured: boolean; missing: string[] };
  manage: { writes_enabled: boolean; kill_switch: boolean };
  store: { kind: string; durable_across_instances: boolean };
}

export type RunState = 'queued' | 'dispatching' | 'running' | 'waiting_for_input' | 'succeeded' | 'partial' | 'failed' | 'dispatch_failed' | 'timed_out';

export interface CaseResult {
  case_id: string | null;
  status: string;
  network: { id: number; name: string | null };
  partner: { name: string | null; seat_ids_checked: number[] };
  disconnected_at: string | null;
  disconnected_at_timezone: null;
  priority: { code: string | null; label: string | null; provisional: boolean } | null;
  exposure: {
    label: string;
    weekly_before_cut: number | null;
    run_rate_not_realised_estimate: number | null;
    days_since_cut: number | null;
    basis: string | null;
    currency: { code: string | null; status: string; label: string | null; source?: string | null };
    rpmbr: { unit: string | null; partner: number | null; network_all_partners: number | null; window: { first_day: string | null; last_day: string | null; days_with_data: number | null }; note: string | null } | null;
  };
  checks: { name: string; result: 'pass' | 'fail' | 'unknown'; rule: string | null; metrics: Record<string, unknown> | null }[];
  evidence_confidence: { label: string | null; basis: string | null } | null;
  root_cause_confidence: string | null;
  confirmed_facts: { fact: string | null; refs: string[] }[];
  hypotheses: { id: string | null; title: string | null; likelihood: string | null; how_to_verify: string | null; confirmed: false }[];
  claim_review: { verdict: string | null; statement: string | null }[];
  open_items: { lever_id: string | null; category: string | null; owner: string | null; seat: string | null; status: string | null; signal: string | null; fix: string | null; escalate: string | null; evidence_ref: string | null }[];
  drafts: { audience: string | null; kind: string | null; message: string | null; sent: false }[];
  investigation_approval: { status: string | null; note: string };
  warnings: string[];
  raw: unknown;
}

export interface Run {
  run_id: string;
  request_id: string;
  environment: string;
  workflow_id: string | null;
  created_at: string;
  created_by: string;
  scope: { dsp_key: string; dsp_name: string; partner_ids: number[]; network_ids: number[]; timezone: string; window: string; snapshot_id: string | null };
  state: RunState;
  stage: string | null;
  execution_id?: string | null;
  dispatch_outcome: string | null;
  history: { at: string; state: string; source: string }[];
  /** 'n8n_push' when n8n sent the result on its own (no launch from this site). */
  source?: string;
  result:
    | { status: string; error: string | null; received_at: string; workflow: { id: string | null; execution_id: string | null }; cases: CaseResult[] }
    | { status: string; cases: number; summary_only: true }
    | null;
}

export interface RefreshJob {
  refresh_id: string;
  state: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';
  scope: { dsp_key: string; partner_ids: number[]; network_ids: number[]; from: string; to: string; timezone: string };
  created_at: string;
  snapshot_id: string | null;
  datasets: Record<string, { status: string; source: string; query_id: string | null; executed_at?: string; row_count?: number; error?: string; coverage?: { complete_through: string; days_expected: number; days_present: number; missing_days: string[] } }>;
}

export type OptState =
  | 'proposed' | 'validation_failed' | 'manual_required' | 'awaiting_approval' | 'rejected' | 'approved' | 'stale' | 'queued' | 'executing'
  | 'outcome_unknown' | 'configuration_verified' | 'verification_failed' | 'partially_applied' | 'rollback_requested' | 'rolled_back';

export interface Recommendation {
  recommendation_id: string;
  version: number;
  run_id: string;
  case_id: string | null;
  environment: string;
  scope: { dsp_key: string; network_id: number; network_name: string | null; partner_ids: number[]; seat: string | null };
  kind: 'task' | 'change';
  action_type: string;
  targets: { type: string; original: string; canonical: string; matching: string }[];
  owner: string | null;
  category: string | null;
  rationale: { signal: string | null; evidence_ref: string | null; note: string };
  next_step: string | null;
  escalate: string | null;
  evidence: { run_id: string; result_received_at: string; snapshot_id: string | null; evidence_hash: string };
  impact: { traffic: number | null; spend: number | null; note: string };
  reversibility: string;
  state: OptState;
  manual_reason?: string;
  stale_reason?: string;
  preview_id?: string;
  execution_id?: string;
  history: { at: string; state: string }[];
  created_at: string;
  capability: { status?: string; executable: boolean; reason: string; adapter_available?: boolean; ask?: { channel: string; text: string } };
}

export interface Preview {
  preview_id: string;
  recommendation_id: string;
  payload: { action: string; resource_id: string; native_scope: string; environment: string; add: { type: string; value: string; matching: string }[]; remove: { type: string; value: string }[] };
  payload_hash: string;
  before_state: { version: string | number; entries: { canonical: string }[]; consumers: unknown };
  already_present: string[];
  expires_at: string;
}

export interface ApiError { code: string; message: string; details?: { missing?: string[] } | null }
