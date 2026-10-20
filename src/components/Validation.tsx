import React from 'react';
import { AlertTriangle, Lock, Mail, MessageSquare, ShieldCheck } from 'lucide-react';
import type { RTBViewModel } from '../lib/adapter/types.ts';
import { Badge, Card, CopyButton, EmptyNote, SectionHeading } from './ui.tsx';

/** Renders Slack mrkdwn *bold* segments so the preview reads like Slack. */
const SlackText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split('\n').map((line, i) => (
      <p key={i} className="min-h-[1em]">
        {line.split(/(\*[^*]+\*)/g).map((seg, j) =>
          seg.startsWith('*') && seg.endsWith('*') && seg.length > 2 ? (
            <strong key={j} className="font-semibold text-ink">
              {seg.slice(1, -1)}
            </strong>
          ) : (
            <React.Fragment key={j}>{seg}</React.Fragment>
          ),
        )}
      </p>
    ))}
  </>
);

export const Validation: React.FC<{ model: RTBViewModel }> = ({ model }) => {
  const v = model.validation;

  const stats = [
    {
      label: 'Finalized report',
      value: v.isFinalizedReportSupplied ? 'Yes' : 'No — raw input',
      tone: v.isFinalizedReportSupplied ? ('ok' as const) : ('warn' as const),
    },
    { label: 'Validation issues', value: String(v.issues.length), tone: v.issues.length ? ('danger' as const) : ('ok' as const) },
    { label: 'Fallback fields', value: v.fallbackFields.length ? v.fallbackFields.join(', ') : 'None replaced', tone: 'neutral' as const },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-6 sm:p-8">
        <SectionHeading
          icon={<ShieldCheck className="h-5 w-5" />}
          eyebrow="Boundary C · output validation"
          title="Communication & truth validation"
          description="Generated language is checked against source facts with deterministic fallbacks. Slack text is capped at 200 words."
          aside={
<CopyButton text={model.rawSourceJson} label="Copy report JSON" />
          }
        />
        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {stats.map(s => (
            <div key={s.label} className="rounded-xl border border-line p-4">
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className="mt-2">
                <Badge tone={s.tone} dot>
                  {s.value}
                </Badge>
              </dd>
            </div>
          ))}
        </dl>
        {v.issues.length > 0 && (
          <ul className="mt-4 space-y-2">
            {v.issues.map((iss, i) => (
              <li key={i} className="flex gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {iss}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-semibold text-ink">
              <MessageSquare className="h-4 w-4 text-accent" /> Slack broadcast
            </h3>
            <div className="flex items-center gap-2">
              <Badge tone={v.isSlackExceeding200Words ? 'danger' : 'neutral'}>
                <span className="num">{v.slackWordCount}</span> / 200 words
              </Badge>
              {v.slackText && <CopyButton text={v.slackText} />}
            </div>
          </div>
          {v.isSlackExceeding200Words && (
            <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              Exceeds the 200-word limit ({v.slackWordCount} words). Preserved exactly as supplied — not silently truncated.
            </p>
          )}
          <div className="mt-4 flex-1">
            {v.slackText ? (
              <div className="flex gap-3 rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
                  P
                </div>
                <div className="min-w-0 text-sm leading-relaxed text-ink-2">
                  <p className="mb-1 text-sm">
                    <strong className="text-ink">The Pitt</strong>{' '}
                    <span className="rounded bg-line px-1 text-[10px] font-semibold uppercase text-muted">App</span>
                  </p>
                  <SlackText text={v.slackText} />
                </div>
              </div>
            ) : (
              <EmptyNote>No validated Slack broadcast in raw input. It is assembled during report finalization.</EmptyNote>
            )}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
            <Lock className="h-3.5 w-3.5" /> Requires human approval in Slack — no automated send.
          </p>
        </Card>

        <Card className="flex flex-col p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-semibold text-ink">
              <Mail className="h-4 w-4 text-accent" /> Client communication
            </h3>
            {v.clientMessage && <CopyButton text={v.clientMessage} />}
          </div>
          <div className="mt-4 flex-1">
            {v.clientMessage ? (
              <div className="whitespace-pre-wrap rounded-xl border border-line bg-surface-2 p-5 text-sm leading-relaxed text-ink-2">
                {v.clientMessage}
              </div>
            ) : (
              <EmptyNote>No client message is generated in raw input mode.</EmptyNote>
            )}
          </div>
          <p className="mt-4 text-xs text-muted">Drafted by Gemini formatting, constrained to Boundary A facts.</p>
        </Card>
      </div>
    </div>
  );
};
