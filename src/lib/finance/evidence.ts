/**
 * Evidence for the Tubi TV STR (#5100) case: the workflow output kept as immutable source evidence, the warehouse
 * records that support or contradict it, and the reconciliation between them. Nothing here promotes a narrative
 * statement into a warehouse fact.
 */
import { parseInvestigation, type InvestigationReport } from '../investigations/report.ts';
import { aggregateMoney, NARRATIVE, WAREHOUSE_SPEND, type CurrencyStatus } from './currency.ts';
import { sha256Hex } from './hash.ts';
import { excluded, unavailable, val, type Val } from './values.ts';
import { EPISODES_5100, PRE_CUT_FULL_DAYS } from './snapshot.data.ts';

export const PARSER_VERSION = 'pitt-narrative/2';

export interface IngestedCase {
  /** App-local key derived from the payload hash; the workflow supplied no case or execution ID. */
  localKey: string;
  contentHash: string;
  ingestedAt: string;
  parserVersion: string;
  executionId: string | null;
  workflowVersion: string | null;
  raw: string;
  report: InvestigationReport;
  synthetic: boolean;
}

/** Idempotent: the same payload always yields the same key and hash; the raw text is frozen unchanged. */
export function ingest(raw: string, ingestedAt: string, opts: { synthetic?: boolean; executionId?: string | null; workflowVersion?: string | null } = {}): IngestedCase {
  const contentHash = sha256Hex(raw);
  return Object.freeze({
    localKey: `local:${contentHash.slice(0, 12)}`,
    contentHash,
    ingestedAt,
    parserVersion: PARSER_VERSION,
    executionId: opts.executionId ?? null,
    workflowVersion: opts.workflowVersion ?? null,
    raw,
    report: Object.freeze(parseInvestigation(raw)) as InvestigationReport,
    synthetic: opts.synthetic ?? false,
  });
}

/** Store keyed by content hash; re-importing the same text is a no-op. */
export function addCase(store: IngestedCase[], c: IngestedCase): IngestedCase[] {
  return store.some(s => s.contentHash === c.contentHash) ? store : [...store, c];
}

/* ---------------- Revenue window reconciliation ---------------- */

/** VIEW_DISCONNECTION_ALERT_365DAYS.REVENUE_7_DAYS_BEFORE per seat (detailed values). */
export const ALERT_SEAT_REVENUE = [
  { partnerId: 492, name: 'Amazon DSP CTV B', format: 'CTV', amount: 11267.006179 },
  { partnerId: 491, name: 'Amazon DSP Video B', format: 'Video', amount: 4770.186127 },
  { partnerId: 437, name: 'Amazon DSP AMER Display B', format: 'Display', amount: 0 },
  { partnerId: 489, name: 'Amazon DSP EMEA/APAC Display B', format: 'Display', amount: 0 },
  { partnerId: 490, name: 'Amazon DSP Native B', format: 'Native', amount: 0 },
] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function reconcileRevenue(reported: number | null) {
  const detailed = ALERT_SEAT_REVENUE.reduce((a, s) => a + s.amount, 0);
  const displayedParts = ALERT_SEAT_REVENUE.map(s => round2(s.amount));
  const displayedSum = round2(displayedParts.reduce((a, b) => a + b, 0));
  const fullDays = PRE_CUT_FULL_DAYS[491].spend + PRE_CUT_FULL_DAYS[492].spend;
  return {
    reported,
    detailed,
    displayedSum,
    roundingDifference: reported === null ? null : round2(displayedSum - reported),
    reportedIsRoundedDetailed: reported !== null && Math.round(detailed) === reported,
    window: {
      alertView: 'DAY ≥ cut − 7 days and DAY ≤ cut, compared against a 08:11 timestamp: UTC days 2026-09-19 … 2026-09-25, which includes the partial cut day and leaves out 2026-09-18.',
      fullDays: { from: '2026-09-18', to: '2026-09-24', amount: fullDays, by: { 491: PRE_CUT_FULL_DAYS[491].spend, 492: PRE_CUT_FULL_DAYS[492].spend } },
    },
    endpoint437: 0,
  };
}

/** Portfolio (endpoint 437 Display) share of this case. The seat had no activity on 5100, so the case adds nothing. */
export function endpoint437Exposure(): Val {
  return excluded('Case amount is CTV B (492) and Video B (491); partner 437 had 0.00 in the window and no rows on 5100 from 2026-09-06.', 0);
}

/* ---------------- Assertions and conflicts ---------------- */

export type ClaimSource = 'workflow narrative' | 'connection log' | 'alert view' | 'activity tables' | 'page snapshot';

export interface Claim {
  topic: string;
  source: ClaimSource;
  statement: string;
  recordedAt: string | null;
  verified: 'source record' | 'narrative only' | 'not revalidated';
}

/** The documented legend on MAPPING_NETWORK_PARTNER_CONNECTION_SCD.BLOCKING_REASON (column comment). */
export const BLOCKING_REASON: Record<number, string> = {
  0: 'Connected',
  1: 'Other',
  2: 'LowProfitabilityBidder',
  3: 'LowProfitabilityEquativ',
  4: 'QualityIssueBidder',
  5: 'QualityIssuePublisher',
  6: 'DirectIntegrationBidder',
};

export function cutEpisodes() {
  return EPISODES_5100.filter(e => e.reason !== 0 && e.end === null).map(e => {
    const prior = EPISODES_5100.filter(p => p.partnerId === e.partnerId && p.end === e.start);
    return { ...e, reasonLabel: BLOCKING_REASON[e.reason] ?? 'Undocumented', priorComment: prior[0]?.comment ?? null, priorReason: prior[0]?.reason ?? null };
  });
}

export function claims(report: InvestigationReport, ingestedAt: string): Claim[] {
  const cuts = cutEpisodes();
  const actor = [...new Set(cuts.map(c => c.by))].join(', ');
  const comment = [...new Set(cuts.map(c => c.comment))].join(', ');
  return [
    { topic: 'Cause', source: 'workflow narrative', statement: `Leading hypothesis: ${report.leadingHypothesis ?? '—'} (not a confirmed cause). Exact reason: ${report.exactReason ?? '—'}.`, recordedAt: ingestedAt, verified: 'narrative only' },
    { topic: 'Cause', source: 'connection log', statement: `${cuts.length} Amazon seats moved to BLOCKING_REASON ${cuts[0]?.reason} (“${BLOCKING_REASON[cuts[0]?.reason ?? 1]}”), comment “${comment}”, set by ${actor}. The prior connected states were labelled “${[...new Set(cuts.map(c => c.priorComment).filter(Boolean))].join('”, “')}”.`, recordedAt: cuts[0]?.start ?? null, verified: 'source record' },
    { topic: 'Seven-day revenue', source: 'workflow narrative', statement: `${report.revenue7d.amount?.toLocaleString('en-US') ?? '—'} (${report.revenue7d.note ?? 'no note'})`, recordedAt: ingestedAt, verified: 'narrative only' },
    { topic: 'Seven-day revenue', source: 'alert view', statement: '492: 11,267.01 · 491: 4,770.19 · 437, 489, 490: 0.00. Window includes the partial cut day.', recordedAt: null, verified: 'source record' },
    { topic: 'Quality', source: 'workflow narrative', statement: 'ads_txt, sco, blocked_inventory, ivt: PASS; 75.68% of pre-cut calls filtered (BlockedByPartnerSetupIncompatibleInventory); 19.66% of post-cut auctions had uncrawled ads.txt.', recordedAt: ingestedAt, verified: 'not revalidated' },
    { topic: 'Decline', source: 'workflow narrative', statement: 'Amazon bid requests fell 99.5%.', recordedAt: ingestedAt, verified: 'narrative only' },
    { topic: 'Related network', source: 'page snapshot', statement: 'Network 5524 “Tubi” shown as another supply path whose all-DSP spend rose.', recordedAt: '2026-10-20', verified: 'not revalidated' },
  ];
}

export type ConflictStatus = 'conflict · unreviewed' | 'consistent' | 'reviewed';

/** The workflow points at a DSP-side commercial cut; the log shows an Equativ user setting an internal phase-out. */
export function causeConflict(): { status: ConflictStatus; summary: string } {
  const cuts = cutEpisodes();
  const internal = cuts.every(c => /@equativ\.com$/i.test(c.by) && /phase out/i.test(c.comment));
  return internal
    ? {
        status: 'conflict · unreviewed',
        summary: 'The workflow’s leading hypothesis is a DSP-side commercial or seat-level cut. The connection log records an Equativ user setting “Reauct phase out” on all five seats in the same second. Human approval of the workflow does not settle which is right.',
      }
    : { status: 'consistent', summary: 'No contradicting connection-log record.' };
}

/* ---------------- Recoverability and the approved aggregate ---------------- */

export type Recoverability = 'approved' | 'requires review' | 'not recoverable';

export interface CaseFinancials {
  key: string;
  label: string;
  recoverability: Recoverability;
  reason: string;
  /** The amount shown for diagnosis (e.g. pre-cut revenue); never counted unless approved. */
  diagnosticAmount: number | null;
  currency: CurrencyStatus;
  synthetic: boolean;
}

export const TUBI_FINANCIALS: CaseFinancials = {
  key: 'tubi-5100',
  label: 'Tubi TV STR #5100 · Amazon DSP',
  recoverability: 'requires review',
  reason: 'Connection log records a planned internal phase-out; no authorized business owner has approved remediation.',
  diagnosticAmount: 11267.006179 + 4770.186127,
  currency: WAREHOUSE_SPEND,
  synthetic: false,
};

export function approvedRecoverable(cases: CaseFinancials[]) {
  const included = cases.filter(c => c.recoverability === 'approved' && !c.synthetic);
  const excludedCases = cases.filter(c => !included.includes(c));
  const total: Val = included.length
    ? aggregateMoney(included.map(c => ({ label: c.label, amount: c.diagnosticAmount === null ? unavailable('No amount') : val(c.diagnosticAmount), currency: c.currency, synthetic: c.synthetic })), { official: true })
    : unavailable(`No case is approved as recoverable (${excludedCases.length} excluded: ${excludedCases.map(c => c.recoverability).join(', ')}).`, ['authorized business-owner approval']);
  return { total, included, excluded: excludedCases.map(c => ({ ...c, shown: c.diagnosticAmount === null ? unavailable('No amount') : excluded(c.reason, c.diagnosticAmount) })) };
}

export { NARRATIVE };
