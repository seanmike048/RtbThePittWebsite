/**
 * Case layer: one normalized model for every page. An imported n8n/Slack run becomes a Run with run-level context
 * kept apart from per-publisher Cases. Money is stored in its source currency and converted to USD only through fx.ts.
 */

/** How a statement is known. Shown next to every claim; never collapsed into a score. */
export type Provenance =
  | 'Source' // the run text says it
  | 'Calculated' // this application computed it from stored data
  | 'Leading hypothesis — not confirmed'
  | 'Pending TechOps confirmation'
  | 'Recommendation'
  | 'Context, not proof';

/** Operational states used across the product instead of confidence. */
export type OpState = 'Observed' | 'Pending TechOps confirmation' | 'Leading hypothesis — not confirmed' | 'Draft only' | 'Unavailable' | 'Projected';

export interface SourceMoney {
  amount: number;
  currency: 'EUR' | 'USD' | 'unknown';
  /** What the amount covers, as written ("per week before the cut"). */
  basis: string;
}

export interface CaseAction {
  id: string;
  team: string;
  /** What the source observed (the bullet). */
  observation: string;
  nextStep: string | null;
  /** People named in the next step. They are contacts, not assigned owners. */
  contacts: string[];
  tickets: string[];
  status: 'Open';
  /** Publisher-facing asks wait for TechOps when the run holds publisher contact. */
  publisherContact: 'Held until TechOps confirms' | 'Internal action';
  source: string;
}

export interface ContextTicket {
  key: string;
  date: string | null;
  scope: string | null;
  summary: string;
}

export interface CaseRecord {
  caseId: string;
  /** Stable identity when the run has no case ID: publisher, network, DSP and disconnection event. */
  identity: string;
  publisher: string;
  networkId: number;
  dsp: string;
  disconnectedAt: string | null;
  meta: string | null;
  region: string | null;
  sourceSpend: SourceMoney | null;
  status: 'Pending TechOps confirmation' | 'Open';
  /** Short, source-backed distinctions ("Named in TOPS-11471", "Above the wave-1 cutoff"). */
  distinctions: string[];
  publisherContactHeld: boolean;
  summary: string | null;
  findings: string[];
  hypothesis: { text: string; verify: string | null } | null;
  actions: CaseAction[];
  context: ContextTicket[];
  drafts: { state: 'Draft only'; jira: 'Not created'; copies: number };
  provenance: {
    /** The case text exactly as received (may contain lines the product does not display). */
    raw: string;
    hash: string;
    /** Lines kept only in the stored source (RPMBr, priority scores). */
    sourceOnly: string[];
  };
}

export interface RunContext {
  headline: string | null;
  publishers: number | null;
  tickets: string[];
  /** Run-level facts that are not about any single publisher (for example a planned wave). */
  notes: string[];
  jira: 'Drafts generated · no ticket created';
  publisherContact: 'Held until TechOps confirms' | 'No hold stated';
}

export interface ImportReport {
  cases: number;
  actions: number;
  drafts: number;
  duplicatesRemoved: number;
  sourceOnlyLines: number;
  ignoredLines: number;
  excluded: string[];
  warnings: string[];
}

export interface Run {
  id: string;
  label: string;
  source: string;
  importedAt: string;
  hash: string;
  context: RunContext;
  cases: CaseRecord[];
  report: ImportReport;
}

/* ------------------------------------------------------------------ Snowflake snapshot */

export interface SpendSnapshot {
  read_at: string;
  role: string;
  queries: { id: string; what: string }[];
  spend_measure: string;
  fx: { table: string; base: string; column: string; reading: string; eur_per_usd: Record<string, number> };
  alert_cuts: { network_id: number; partner_id: number; cut_at: string; revenue_7d_before_eur: number }[];
  daily: { day: string; network_id: number; partner_id: number; spend_eur: number }[];
  coverage: { day: string; network_id: number; partners: number; all_dsp_eur: number; amazon_eur: number }[];
}
