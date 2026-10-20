import React, { useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Cpu, FileCode, Shield, Sparkles } from 'lucide-react';
import { SAMPLE_FINALIZED_REPORT } from '../lib/adapter/sampleData.ts';
import { Card, CopyButton, SectionHeading, SegmentedControl } from './ui.tsx';

const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="num rounded bg-surface-2 px-1.5 py-0.5 text-[0.85em] text-accent-ink">{children}</code>
);

const BOUNDARIES = [
  { icon: <Cpu className="h-5 w-5" />, label: 'Boundary A', title: 'Rule-engine derivations', body: 'Derives priority (P0–P4, P?), confidence, confirmed facts, up to 3 evidence items, explicit unknowns and the primary owner action.' },
  { icon: <Sparkles className="h-5 w-5" />, label: 'Boundary B', title: 'Language synthesis', body: 'Gemini writes the finding, client message and owner actions — strictly constrained to the facts established by Boundary A.' },
  { icon: <Shield className="h-5 w-5" />, label: 'Boundary C', title: 'Truth enforcement', body: 'Rejects ungrounded claims, substitutes deterministic fallbacks, and keeps Slack text under 200 words.' },
];

const RULES = [
  { title: 'Explicit priority & confidence', body: <>Without an executed <Code>deterministic.priority</Code> and <Code>deterministic.confidence</Code>, both show as <Code>UNAVAILABLE</Code>. The client never guesses them.</> },
  { title: 'Currency guardrail on revenue', body: <>When spend arrives with <Code>currency: null</Code>, per-seat amounts are shown with a caveat and totals are suppressed to avoid mixed-currency sums.</> },
  { title: 'Hypothesis demarcation', body: <>Statements like “may be related to ads.txt compliance” are quarantined as unconfirmed hypotheses — never a root cause, never a priority input.</> },
  { title: 'Window coverage preservation', body: <>When the metric comparison period differs from the reporting window, the difference is surfaced — never silently aligned.</> },
];

const INVARIANTS = [
  ['Priority (P0–P4, P?)', 'A · Deterministic', 'Render exactly as provided', 'Recalculate or score'],
  ['Confidence', 'A · Deterministic', 'Render exactly as provided', 'Infer from hypotheses'],
  ['Confirmed facts', 'A · Deterministic', 'Numbered list', 'Mix with hypotheses'],
  ['Root-cause reason', 'A · Source evidence', 'Show only if verified by checks', 'Claim ads.txt without proof'],
  ['Findings & narrative', 'B · Gemini', 'Must pass Boundary C check', 'Bypass validation issues'],
  ['Slack communication', 'C · Assembly', 'Enforce ≤ 200 words', 'Send an unverified draft'],
];

export const Specs: React.FC = () => {
  const [tab, setTab] = useState<'adapter' | 'boundaries' | 'n8n' | 'schema'>('adapter');
  const schema = JSON.stringify(SAMPLE_FINALIZED_REPORT, null, 2);

  return (
    <Card className="p-6 sm:p-8">
      <SectionHeading
        icon={<BookOpen className="h-5 w-5" />}
        eyebrow="Technical documentation"
        title="Workflow report adapter"
        description="How The Pitt keeps deterministic logic, generative language and output validation strictly separated."
      />
      <div className="mt-6">
        <SegmentedControl<typeof tab>
          ariaLabel="Specification sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'adapter', label: 'Adapter contract' },
            { value: 'boundaries', label: 'Decision boundaries' },
            { value: 'n8n', label: 'n8n setup' },
            { value: 'schema', label: 'JSON schema' },
          ]}
        />
      </div>

      {tab === 'adapter' && (
        <div className="anim-fade-up mt-8 space-y-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {BOUNDARIES.map(b => (
              <div key={b.label} className="rounded-2xl border border-line p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">{b.icon}</div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-accent">{b.label}</p>
                <p className="mt-1 font-semibold text-ink">{b.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{b.body}</p>
              </div>
            ))}
          </div>
          <div>
            <h3 className="font-semibold text-ink">Ingestion rules</h3>
            <p className="mt-1 text-sm text-muted">
              <Code>src/lib/adapter/parser.ts</Code> accepts raw workflow inputs and finalized reports alike, applying:
            </p>
            <ol className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {RULES.map((r, i) => (
                <li key={r.title} className="rounded-2xl border border-line bg-surface-2/60 p-5">
                  <p className="flex items-center gap-2 font-medium text-ink">
                    <CheckCircle2 className="h-4 w-4 text-ok" /> {i + 1}. {r.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{r.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {tab === 'boundaries' && (
        <div className="anim-fade-up mt-8">
          <p className="text-sm text-muted">TechOps workflows need audit-grade traceability. These invariants always hold:</p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  {['Field', 'Authority', 'Frontend rule', 'Never'].map(h => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {INVARIANTS.map(row => (
                  <tr key={row[0]}>
                    <td className="px-4 py-3 font-medium text-ink">{row[0]}</td>
                    <td className="px-4 py-3 text-accent-ink">{row[1]}</td>
                    <td className="px-4 py-3 text-ink-2">{row[2]}</td>
                    <td className="px-4 py-3 text-danger-ink">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'n8n' && (
        <div className="anim-fade-up mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
          <div>
            <h3 className="font-semibold text-ink">Export an executed report from n8n</h3>
            <p className="mt-1 text-sm text-muted">
              Workflow: <Code>[TechOps] RTB-Checklist-Output-Generation</Code>
            </p>
            <ol className="mt-5 space-y-4">
              {[
                'Open the workflow canvas in n8n.',
                'Execute it with test or real Snowflake webhook events.',
                'Select the final node (e.g. “Validate & Assemble Output”).',
                'In the output pane, switch to the JSON tab.',
                'Copy the single JSON object and paste it into Import data.',
              ].map((s, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                  <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border border-warn/30 bg-warn-soft p-5">
            <p className="flex items-center gap-2 font-semibold text-warn-ink">
              <AlertTriangle className="h-4 w-4" /> Pipeline definitions are rejected
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              JSON with <Code>"nodes"</Code> or <Code>"connections"</Code> is workflow source code, not an executed report. The
              importer explains how to copy the node output instead.
            </p>
          </div>
        </div>
      )}

      {tab === 'schema' && (
        <div className="anim-fade-up mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-ink">
                <FileCode className="h-4 w-4 text-accent" /> Finalized executed report
              </h3>
              <p className="mt-1 text-sm text-muted">Full example covering Boundaries A, B and C.</p>
            </div>
            <CopyButton text={schema} label="Copy schema" />
          </div>
          <pre className="num mt-4 max-h-[520px] overflow-auto rounded-xl bg-slate-950 p-5 text-xs leading-relaxed text-slate-200">{schema}</pre>
        </div>
      )}
    </Card>
  );
};
