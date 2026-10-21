/**
 * Data contract of the Disconnection Room. Field names follow the brief exactly; the only additions are keys that tie
 * a row to its network (network_id on traffic, funnel, investigation and readiness rows) and REGION on networks.
 * null always means "not in the source": it renders as "No data", never as 0.
 */

/** A. Disconnections, one row per network x Amazon seat (source: ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS). */
export interface Disconnection {
  PARTNER_ID: number;
  PARTNER_NAME: string;
  PUBLISHER: string;
  NETWORK_ID: number;
  BUSINESS_UNIT: string | null;
  /** Owner as recorded in the source. Never inferred. */
  USERNAME: string | null;
  /** "YYYY-MM-DD HH:MM", time zone as stored (not documented). */
  CUT_AT: string;
  /** null = still disconnected. Never inferred. */
  RECONNECTED_AT: string | null;
  SPEND_7D_BEFORE: number | null;
}

/** Region per network, as written in the source (filter and display only). */
export interface NetworkMeta {
  NETWORK_ID: number;
  REGION: string | null;
}

export type CheckName = 'ADS_TXT' | 'SCO' | 'BLOCKED_INVENTORY' | 'IVT';
export type CheckWindow = 'BEFORE' | 'AFTER';
export type CheckResult = 'PASS' | 'FAIL' | 'NO_DATA';

/** B. One row per network per check per window. */
export interface Check {
  network_id: number;
  check: CheckName;
  window: CheckWindow;
  result: CheckResult;
  evidence_ref: string;
  detail: string;
}

/** C. Traffic context signal. change_pct null = derive from before/after in engine.ts. */
export interface TrafficMetric {
  network_id: number;
  metric: string;
  partner_name: string | null;
  partner_ids: number[];
  change_pct: number | null;
  before: number | null;
  after: number | null;
  period: string;
  source: string;
}

export interface DropReason {
  stage: string;
  reason: string;
  count: number;
}

/** D. Demand funnel per network. Missing stage = null. */
export interface DemandFunnel {
  network_id: number;
  auctions: number | null;
  bid_requests: number | null;
  bids: number | null;
  wins: number | null;
  impressions: number | null;
  drop_reasons: DropReason[];
}

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Hypothesis {
  label: string;
  /** null = the source does not state a confidence. */
  confidence: Confidence | null;
  evidence_refs: string[];
  missing_info: string[];
}

/** E. AI investigation per network. */
export interface AiInvestigation {
  network_id: number;
  hypotheses: Hypothesis[];
  draft_message: string | null;
  validation: { passed: boolean | null; ai_output_accepted: boolean | null; fallback_fields: string[] | null };
}

export type Presence = 'PRESENT' | 'ABSENT' | 'PARTIAL' | 'NO_DATA';

/** Amazon readiness: OpenRTB signals per network. */
export interface ReadinessSignal {
  network_id: number;
  signal: string;
  presence: Presence;
  detail: string | null;
}

/** Revenue kept: networks that stayed connected, or reconnected, after a fix. */
export interface Save {
  network_id: number;
  PUBLISHER: string;
  PARTNER_ID: number;
  kind: 'stayed_connected' | 'reconnected_after_fix';
  fixed_check: CheckName;
  fixed_at: string;
  SPEND_7D: number | null;
}

export interface Dataset {
  id: string;
  label: string;
  synthetic: boolean;
  /** Days since CUT_AT are counted to this date (YYYY-MM-DD). */
  asOf: string;
  currency: { symbol: string; note: string };
  source: string;
  disconnections: Disconnection[];
  networks: NetworkMeta[];
  checks: Check[];
  traffic: TrafficMetric[];
  funnels: DemandFunnel[];
  investigations: AiInvestigation[];
  readiness: ReadinessSignal[];
  saves: Save[];
}
