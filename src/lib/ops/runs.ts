/** Pure helpers for run tracking, labels and scope summaries. No network access here. */
import type { Dsp, OptState, RunState } from './types.ts';

export const RUN_TERMINAL: RunState[] = ['succeeded', 'partial', 'failed', 'dispatch_failed', 'timed_out'];
export const isTerminal = (s: RunState) => RUN_TERMINAL.includes(s);

type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'ok' | 'info';

export const RUN_LABEL: Record<RunState, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  dispatching: { label: 'Sending to n8n', tone: 'info' },
  running: { label: 'Running in n8n', tone: 'info' },
  waiting_for_input: { label: 'Waiting for input', tone: 'warn' },
  succeeded: { label: 'Result received', tone: 'ok' },
  partial: { label: 'Partial result', tone: 'warn' },
  failed: { label: 'Workflow failed', tone: 'danger' },
  dispatch_failed: { label: 'n8n did not accept the launch', tone: 'danger' },
  timed_out: { label: 'No result before timeout', tone: 'danger' },
};

export const OPT_LABEL: Record<OptState, { label: string; tone: Tone }> = {
  proposed: { label: 'Proposed', tone: 'neutral' },
  validation_failed: { label: 'Invalid target', tone: 'danger' },
  manual_required: { label: 'Manual action required', tone: 'warn' },
  awaiting_approval: { label: 'Awaiting your decision', tone: 'accent' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'info' },
  stale: { label: 'Stale: review again', tone: 'warn' },
  queued: { label: 'Queued for execution', tone: 'info' },
  executing: { label: 'Executing', tone: 'info' },
  outcome_unknown: { label: 'Outcome unknown: reconciling', tone: 'danger' },
  configuration_verified: { label: 'Configuration verified', tone: 'ok' },
  verification_failed: { label: 'Verification failed', tone: 'danger' },
  partially_applied: { label: 'Partially applied', tone: 'warn' },
  rollback_requested: { label: 'Rollback requested', tone: 'warn' },
  rolled_back: { label: 'Rolled back', tone: 'neutral' },
};

const KEY = 'pitt-tracked-runs';

/** Run IDs this browser is tracking, so a reload resumes them. The server stays the source of truth. */
export function trackedRuns(storage: Pick<Storage, 'getItem'> | null): string[] {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && /^run_[a-f0-9]{20}$/.test(x)).slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function track(storage: Pick<Storage, 'getItem' | 'setItem'> | null, runId: string, on: boolean) {
  try {
    const cur = trackedRuns(storage).filter((x) => x !== runId);
    storage?.setItem(KEY, JSON.stringify(on ? [runId, ...cur].slice(0, 20) : cur));
  } catch {
    /* storage unavailable: tracking only lasts for this page */
  }
}

/** Launch is enabled only for a supported DSP with at least one seat and one network. Each reason is shown to the user. */
export function launchBlockers(dsp: Dsp | null, seats: number[], networks: number[], opts: { configured: boolean; canLaunch: boolean; busy: boolean }): string[] {
  const out: string[] = [];
  if (!dsp) out.push('Choose a DSP.');
  else if (dsp.status !== 'supported') out.push(dsp.name + ' is not integrated for launch (' + (dsp.status === 'read_only' ? 'read-only' : 'not integrated') + '). Nothing will run on Amazon instead.');
  if (!seats.length) out.push('Choose at least one partner seat.');
  if (!networks.length) out.push('Enter at least one network ID.');
  if (!opts.configured) out.push('Launch is not configured on this server.');
  if (!opts.canLaunch) out.push('Your account does not have the launch permission.');
  if (opts.busy) out.push('A launch for this scope is being accepted.');
  return out;
}

/** "437, 489" etc. from free text: only positive integers, de-duplicated; anything else is reported, not guessed. */
export function parseNetworkIds(text: string): { ids: number[]; invalid: string[] } {
  const ids: number[] = [];
  const invalid: string[] = [];
  for (const p of text.split(/[\s,;]+/).filter(Boolean)) {
    if (/^\d{1,9}$/.test(p) && Number(p) > 0) ids.push(Number(p));
    else invalid.push(p);
  }
  return { ids: [...new Set(ids)].slice(0, 10), invalid };
}

export const idempotencyKey = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};

export function fmtMoney(n: number | null, currency: string | null): string {
  if (n == null) return 'n/a';
  const v = Math.round(n).toLocaleString('en-US');
  return currency === 'EUR' ? '€' + v : v + ' (currency unknown)';
}

/** Plain-language reason for a launch n8n did not accept, from the server's dispatch_outcome. */
export function dispatchHint(outcome: string | null): string | null {
  if (!outcome || outcome === 'accepted') return null;
  if (outcome === 'rejected_404') return 'n8n answered 404: the webhook was not listening. In n8n dev, press "Listen for test event" on W1, then launch within about 2 minutes.';
  if (outcome === 'rejected_403' || outcome === 'rejected_401') return 'n8n answered ' + outcome.slice(9) + ': the launch key did not match. W1\'s credential needs Name x-pitt-launch-key and the value of the pitt-n8n-launch-key secret.';
  if (outcome.startsWith('rejected_')) return 'n8n answered ' + outcome.slice(9) + '.';
  if (outcome === 'connection_failed') return 'n8n could not be reached from the server.';
  if (outcome === 'unknown_timeout') return 'n8n did not answer in time; the run may still have started, so it is not resent.';
  if (outcome === 'interrupted_no_answer') return 'The server never got an answer from n8n (the call was interrupted). Launch again.';
  if (outcome === 'destination_not_allowed') return 'The configured n8n host is not in PITT_ALLOWED_OUTBOUND_HOSTS.';
  return outcome;
}
