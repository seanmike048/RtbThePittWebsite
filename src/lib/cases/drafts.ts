/**
 * The draft shown in the product is rebuilt from the normalized case: USD only, no RPMBr, no priority score, no
 * confidence, explicit hold and Jira state. The verbatim source draft stays in the case provenance.
 */
import { caseFinancials } from './financials.ts';
import { fmtUsd, usdValue } from './fx.ts';
import type { CaseRecord } from './types.ts';

export function caseDraft(c: CaseRecord): { title: string; body: string } {
  const f = caseFinancials(c);
  const removed = usdValue(f.removedAfterCut);
  const seats = f.seats.filter((s) => s.state === 'Cut').map((s) => s.partnerId).join(', ');
  const title = `[The Pitt] ${c.publisher} (${c.networkId}) disconnected from ${c.dsp}`;
  const lines = [
    title,
    '',
    `Publisher: ${c.publisher} (network ${c.networkId})`,
    `Demand partner: ${c.dsp}${seats ? ` · endpoints ${seats}` : ''} · disconnected ${c.disconnectedAt ?? 'date not stated'}`,
    removed != null
      ? `Removed spend: ${fmtUsd(removed)} per week before the cut (USD, converted day by day from EUR; not a confirmed loss)`
      : 'Removed spend: unavailable in USD (no conversion possible)',
    ...(f.partialCut ? [`Still live: ${fmtUsd(usdValue(f.stillLive))} per week on seats that were not cut`] : []),
    `Status: ${c.status}${c.distinctions.length ? ' · ' + c.distinctions.join(' · ') : ''}`,
    ...(c.publisherContactHeld ? ['Publisher contact: held until TechOps confirms the TOPS-11471 status'] : []),
    ...(c.summary ? ['', c.summary] : []),
    '',
    'Action plan',
    ...c.actions.flatMap((a) => [`• [${a.team}] ${a.observation}`, ...(a.nextStep ? [`  Next step: ${a.nextStep}`] : []), ...(a.publisherContact === 'Held until TechOps confirms' ? ['  Held: publisher contact waits for TechOps'] : [])]),
    ...(c.hypothesis ? ['', 'Leading hypothesis — not confirmed', c.hypothesis.text, ...(c.hypothesis.verify ? ['Verify: ' + c.hypothesis.verify] : [])] : []),
    ...(c.context.length ? ['', 'Context, not proof: ' + c.context.map((t) => t.key).join(', ')] : []),
    '',
    `Case ${c.caseId} · Draft only · no Jira ticket created`,
  ];
  return { title, body: lines.join('\n') };
}
