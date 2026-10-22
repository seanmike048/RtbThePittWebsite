import React from 'react';
import type { CaseRecord } from '../../lib/cases/types.ts';
import { cx } from '../ui.tsx';

/**
 * Action plan & owners, exactly as the source assigns them: team from the "[Team]" tag, people only where the source
 * names them in the next step (as contacts, not as assignees). Case, action, draft and Jira states stay separate.
 */
export const ActionPlan: React.FC<{ c: CaseRecord }> = ({ c }) => (
  <div className="space-y-3">
    <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
      {[
        ['Case status', c.status],
        ['Publisher contact', c.publisherContactHeld ? 'Held until TechOps confirms' : 'No hold stated'],
        ['Draft', c.drafts.state + (c.drafts.copies > 1 ? ` · ${c.drafts.copies} copies merged` : '')],
        ['Jira', 'No ticket created'],
      ].map(([k, v]) => (
        <div key={k}>
          <dt className="text-muted">{k}</dt>
          <dd className={cx('mt-0.5 font-medium', /Held|Pending/.test(v) ? 'text-warn-ink' : 'text-ink')}>{v}</dd>
        </div>
      ))}
    </dl>
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Action plan and owners for {c.publisher}</caption>
        <thead className="bg-surface-2 text-xs text-muted">
          <tr>
            {['Team', 'Next step', 'Named in source', 'Status', 'Publisher contact', 'Ticket'].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line align-top">
          {c.actions.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap px-3 py-2.5 font-medium text-ink">{a.team}</td>
              <td className="px-3 py-2.5">
                <p className="text-ink">{a.nextStep ?? 'No next step stated'}</p>
                <p className="mt-0.5 text-xs text-muted">{a.observation}</p>
              </td>
              <td className="px-3 py-2.5 text-xs text-ink-2">{a.contacts.length ? a.contacts.join(', ') : <span className="text-faint">No one named</span>}</td>
              <td className="px-3 py-2.5 text-xs text-ink-2">{a.status}</td>
              <td className={cx('px-3 py-2.5 text-xs', a.publisherContact === 'Held until TechOps confirms' ? 'text-warn-ink' : 'text-muted')}>{a.publisherContact}</td>
              <td className="num px-3 py-2.5 text-xs text-ink-2">{a.tickets.join(', ') || '—'}</td>
            </tr>
          ))}
          {!c.actions.length && (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-sm text-muted">
                The source lists no open item for this publisher.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    <p className="text-[11px] text-muted">Source: the run's Jira draft, “Open items”. Owners are the teams the source tags; no action is reassigned here. Items on metrics the product does not analyse are kept in the stored source only.</p>
  </div>
);
