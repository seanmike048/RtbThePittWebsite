/**
 * Optimization proposals for one publisher, and the execution boundary.
 *
 * Proposals are Manage-side changes derived from the case's own action plan. Publisher-side asks (ads.txt, GPID)
 * stay in the action plan. Nothing here is based on RPMBr (those items are not in the action plan at all).
 *
 * No write integration exists yet. The only adapter is DRY_RUN: it builds the payload a future Manage API / MCP call
 * would send, and refuses to execute. Any future adapter must require an approval record with approver and scope.
 */
import { caseFinancials, seatLabel } from './financials.ts';
import type { Usd } from './fx.ts';
import type { CaseRecord } from './types.ts';

export type ProposalState = 'Suggested' | 'Needs review' | 'Approved' | 'Ready to execute' | 'Applied' | 'Failed' | 'Rolled back' | 'Unavailable';

export interface Proposal {
  id: string;
  caseId: string;
  publisher: string;
  networkId: number;
  dsp: string;
  endpoints: number[];
  title: string;
  currentState: string;
  proposedChange: string;
  evidence: string[];
  /** Weekly USD at stake on the affected seats (observed, not projected). */
  atStake: Usd;
  assumptions: string[];
  scope: string;
  window: string;
  risk: 'Low' | 'Medium' | 'High';
  reversibility: string;
  requiredApproval: string;
  /** Preconditions from the source that must be met first. */
  gate: string | null;
  state: ProposalState;
  sourceActionId: string;
}

export interface AuditEntry {
  at: string;
  proposalId: string;
  event: 'Previewed' | 'Marked for review' | 'Approved' | 'Approval withdrawn' | 'Execution refused';
  by: string | null;
  scope: string;
  payload: unknown;
  result: string;
  rollback: string | null;
}

export function proposalsFor(c: CaseRecord): Proposal[] {
  const f = caseFinancials(c);
  const cut = f.seats.filter((s) => s.state === 'Cut');
  const endpoints = cut.map((s) => s.partnerId);
  const window = f.window ? `Pre-cut window ${f.window.from} → ${f.window.to}` : 'No daily window';
  const out: Proposal[] = [];
  for (const a of c.actions) {
    const step = a.nextStep ?? '';
    if (/ask for reconnection/i.test(step) && endpoints.length) {
      out.push({
        id: `${c.caseId}:reconnect`,
        caseId: c.caseId,
        publisher: c.publisher,
        networkId: c.networkId,
        dsp: c.dsp,
        endpoints,
        title: 'Request reconnection of the cut seats',
        currentState: `Disconnected on ${endpoints.map(seatLabel).join(', ')} since ${c.disconnectedAt ?? 'the cut'}`,
        proposedChange: `Reconnect network ${c.networkId} to ${c.dsp} on ${endpoints.join(', ')}`,
        evidence: [a.observation],
        atStake: f.removedAfterCut,
        assumptions: ['TechOps confirms the publisher was not meant to be in TOPS-11471 wave 1.', 'Amazon accepts the reconnection request.'],
        scope: `Network ${c.networkId} × ${endpoints.length} ${c.dsp} seat(s)`,
        window,
        risk: 'Medium',
        reversibility: 'Reversible: the seats can be disconnected again in Manage.',
        requiredApproval: `TechOps${a.contacts.length ? ' (' + a.contacts.join(', ') + ', named in the source)' : ''}`,
        gate: step.match(/^[^.]+\./)?.[0] ?? null,
        state: 'Needs review',
        sourceActionId: a.id,
      });
    }
    if (/filter them before reconnection|identify the IVT sources/i.test(step) && endpoints.length) {
      out.push({
        id: `${c.caseId}:ivt-filter`,
        caseId: c.caseId,
        publisher: c.publisher,
        networkId: c.networkId,
        dsp: c.dsp,
        endpoints,
        title: 'Filter the IVT sources before any reconnection',
        currentState: a.observation,
        proposedChange: 'Block the IVT placements, bundles or IP ranges once identified',
        evidence: [a.observation],
        atStake: f.removedAfterCut,
        assumptions: ['The IVT sources can be identified from the post-cut requests.', 'IVT is context: it does not prove why the seats were cut.'],
        scope: `Network ${c.networkId} (sources to identify)`,
        window: 'Requests after the cut',
        risk: 'Low',
        reversibility: 'Reversible: blocks can be removed.',
        requiredApproval: 'TechOps',
        gate: 'The sources must be identified first; no list exists in the source.',
        state: 'Suggested',
        sourceActionId: a.id,
      });
    }
  }
  return out;
}

/** Why no proposal exists for a case, in the source's own terms. */
export function noProposalReason(c: CaseRecord): string | null {
  const intended = c.actions.find((a) => /treat the cut as intended/i.test(a.nextStep ?? ''));
  if (intended) return 'The source says to treat the cut as intended, with no reconnection request. No Manage change is proposed.';
  return proposalsFor(c).length ? null : 'The action plan has no Manage-side change for this publisher.';
}

/* ------------------------------------------------------------------ execution boundary */

export interface ExecutionAdapter {
  id: string;
  label: string;
  canExecute: false;
  reason: string;
  /** The request a future integration would send. Never sent. */
  dryRun(p: Proposal): { method: string; target: string; body: Record<string, unknown> };
  execute(p: Proposal, approval: { approver: string; scope: string } | null): Promise<never>;
}

export const DRY_RUN: ExecutionAdapter = {
  id: 'dry-run',
  label: 'Preview only',
  canExecute: false,
  reason: 'No verified Manage API or MCP write integration, authentication or permission is configured. Changes are previewed, never applied.',
  dryRun: (p) => ({
    method: 'PREVIEW',
    target: `manage://networks/${p.networkId}/demand-partners`,
    body: { action: p.id.split(':')[1], network_id: p.networkId, dsp: p.dsp, endpoints: p.endpoints, case_id: p.caseId },
  }),
  execute: async () => {
    throw new Error('Execution refused: no write integration is configured. Use the preview and the manual request.');
  },
};

/** Allowed manual transitions before execution. Applied / Failed / Rolled back need a real adapter. */
export const NEXT_STATES: Record<ProposalState, ProposalState[]> = {
  Suggested: ['Needs review'],
  'Needs review': ['Approved', 'Suggested'],
  Approved: ['Needs review'],
  'Ready to execute': [],
  Applied: [],
  Failed: [],
  'Rolled back': [],
  Unavailable: [],
};
