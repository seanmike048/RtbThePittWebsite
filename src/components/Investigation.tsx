import React from 'react';
import { BookOpen, Brain, CheckCircle2, FileSearch, HelpCircle, Lightbulb, ListChecks, Target, Users } from 'lucide-react';
import type { RTBViewModel } from '../lib/adapter/types.ts';
import { Badge, Card, EmptyNote, Eyebrow, SectionHeading } from './ui.tsx';

const Block: React.FC<{ icon: React.ReactNode; title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  icon,
  title,
  aside,
  children,
  className = '',
}) => (
  <div className={`rounded-2xl border border-line bg-surface-2/60 p-5 ${className}`}>
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        {icon}
        {title}
      </h3>
      {aside}
    </div>
    {children}
  </div>
);

export const Investigation: React.FC<{ model: RTBViewModel }> = ({ model }) => {
  const inv = model.investigation;
  const isRaw = model.sourceType === 'sample_input';

  return (
    <Card className="p-6 sm:p-8">
      <SectionHeading
        icon={<Brain className="h-5 w-5" />}
        eyebrow="Investigation"
        title="What we know, what we don't, and what to do"
        description="Deterministic facts, generated narrative and validation stay in separate lanes — hypotheses are never shown as causes."
        aside={isRaw ? <Badge tone="warn" dot>Raw input mode</Badge> : <Badge tone="ok" dot>Validated report</Badge>}
      />

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Block
          icon={<CheckCircle2 className="h-4 w-4 text-ok" />}
          title="Confirmed facts"
          aside={<span className="text-xs text-muted">Deterministic</span>}
        >
          <ol className="space-y-3">
            {inv.confirmedFacts.map((f, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok-soft text-[11px] font-semibold text-ok-ink">
                  {i + 1}
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ol>
        </Block>

        <Block
          icon={<FileSearch className="h-4 w-4 text-accent" />}
          title="Selected evidence"
          aside={<span className="text-xs text-muted">Max 3</span>}
        >
          <ul className="space-y-3">
            {inv.selectedEvidence.map((ev, i) => (
              <li key={i} className="rounded-xl border border-line bg-surface p-4">
                <p className="text-sm font-semibold text-ink">{ev.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{ev.detail}</p>
                <p className="num mt-2 break-all text-[11px] text-muted">{ev.source}</p>
              </li>
            ))}
          </ul>
        </Block>

        <Block icon={<HelpCircle className="h-4 w-4 text-muted" />} title="Unknowns & data-quality limits">
          <ul className="space-y-2.5">
            {inv.unknowns.map((u, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />
                {u}
              </li>
            ))}
          </ul>
        </Block>

        <div className="rounded-2xl border border-warn/30 bg-warn-soft p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-warn-ink">
              <Lightbulb className="h-4 w-4" />
              Unconfirmed hypotheses
            </h3>
            <Badge tone="warn">Not a confirmed cause</Badge>
          </div>
          <p className="text-xs leading-relaxed text-ink-2">
            A working hypothesis only. It never counts as a root cause and never affects priority.
          </p>
          <div className="mt-4 space-y-3">
            {inv.hypotheses.length ? (
              inv.hypotheses.map((h, i) => (
                <blockquote key={i} className="rounded-xl border border-warn/25 bg-surface p-4">
                  <p className="text-[15px] italic leading-relaxed text-ink">“{h.statement}”</p>
                  <p className="mt-2 text-xs text-muted">{h.note}</p>
                </blockquote>
              ))
            ) : (
              <EmptyNote>No hypotheses supplied.</EmptyNote>
            )}
          </div>
          <p className="mt-4 text-sm text-ink-2">
            Confirmed disconnection reason:{' '}
            <strong className="text-ink">{inv.confirmedReason || 'none confirmed'}</strong>
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 rounded-2xl border border-line p-5 sm:p-6">
        <Eyebrow>Action directives & ownership</Eyebrow>
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Target className="h-4 w-4 text-accent" /> Primary action
            </h3>
            {inv.primaryAction ? (
              <p className="mt-2 rounded-xl border-l-4 border-accent bg-accent-soft px-4 py-3 text-[15px] font-medium leading-relaxed text-ink">
                {inv.primaryAction}
              </p>
            ) : (
              <EmptyNote className="mt-2">Generated when the workflow report is finalized — unavailable in raw input.</EmptyNote>
            )}

            {inv.ownerActions.length > 0 && (
              <>
                <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-ink">
                  <ListChecks className="h-4 w-4 text-accent" /> Owner checklist
                </h3>
                <ul className="mt-3 space-y-2">
                  {inv.ownerActions.map((a, i) => (
                    <li key={i}>
                      <label className="flex cursor-pointer gap-3 rounded-lg px-2 py-1.5 text-sm leading-relaxed text-ink-2 hover:bg-surface-2">
                        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                        <span>{a}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Users className="h-4 w-4 text-accent" /> Contacts
              </h3>
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                {inv.contacts.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-3">
                    <span className="text-sm font-medium text-ink">{c.role}</span>
                    <span className="text-sm text-muted">{c.nameOrTeam}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <BookOpen className="h-4 w-4 text-accent" /> References
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {inv.availableReferences.map(r => (
                  <span key={r} className="num rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink-2">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
