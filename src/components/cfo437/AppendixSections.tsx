import React from 'react';
import { CheckCircle2, ChevronDown, CircleHelp, ClipboardList, Database, ShieldAlert, XCircle } from 'lucide-react';
import { type AssumptionId, type AssumptionSet, SCENARIO_IDS, SCENARIO_LABELS, type ScenarioId } from '../../lib/cfo437/assumptions.ts';
import { CURRENCY_WARNING, SPEND_UNIT } from '../../lib/cfo437/baseline.ts';
import { SQL_ENTRIES, type CheckStatus } from '../../lib/cfo437/sql.ts';
import { Badge, Card, CopyButton, cx, SectionHeading, TableShell, Th } from '../ui.tsx';
import { AssumptionInput, ClassTag, SectionAnchor } from './shared.tsx';

export const DataQuality: React.FC = () => (
  <Card className="p-6 sm:p-8">
    <SectionAnchor id="c4-quality" />
    <SectionHeading icon={<ShieldAlert className="h-5 w-5" />} eyebrow="Data quality & limitations" eyebrowTone="warn" title="What to keep in mind" />
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ul className="space-y-3 text-sm leading-relaxed text-ink-2">
        {[
          `${CURRENCY_WARNING} All workbook amounts are ${SPEND_UNIT}; nothing is converted or labelled EUR or USD.`,
          'The primary baseline is the visible filtered view (BOTH + INTERMEDIARY), not the In Scope = 1 flag.',
          'An earlier validation (187 positive / 129 zero, RPMBr ≈ 43.73) differs from the latest workbook (205 / 111, 35.9558). The latest is used; both are shown.',
          'September 2026 is a single aggregate period. There is no time series, so the page has no line charts and horizons are run-rate arithmetic.',
          'Treating all endpoint spend as at risk is a demonstration only. Issue-specific exposure needs validated spend at risk.',
        ].map(t => (
          <li key={t} className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
            {t}
          </li>
        ))}
      </ul>
      <ul className="space-y-3 text-sm leading-relaxed text-ink-2">
        {[
          'No validated issue-case table exists in Snowflake, so revenue at risk, evidence confidence and approval status are not sourced.',
          'The workbook source table is not in ANALYTICS_EXPO, so the baseline cannot yet be reproduced in SQL.',
          'Ads.txt failures and Not Crawled results are observations, not proof of a DSP disconnection cause.',
          'Endpoint-437 values are never mixed with endpoint 489, Native, Video or the SSP-wide EUR context below.',
          "Two disconnection sources disagree: Snowflake's connection history for partner 437 and the workbook's own Disconected column. Both are shown; neither overrides the other.",
          'The worksheet formats spend with a $ sign. Formatting is not documentation, so currency stays unvalidated.',
          'ROI, NPV, payback and IRR need validated implementation cost, operating cost, labour cost and currency.',
        ].map(t => (
          <li key={t} className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  </Card>
);

const CHECK_META: Record<CheckStatus, { icon: React.ReactNode; tone: 'ok' | 'warn' | 'danger'; label: string }> = {
  validated: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, tone: 'ok', label: 'Validated' },
  unverified: { icon: <CircleHelp className="h-3.5 w-3.5" />, tone: 'warn', label: 'Unverified' },
  missing: { icon: <XCircle className="h-3.5 w-3.5" />, tone: 'danger', label: 'Not found' },
};

export const SqlAppendix: React.FC = () => (
  <Card className="p-6 sm:p-8">
    <SectionAnchor id="c4-sql" />
    <SectionHeading
      icon={<Database className="h-5 w-5" />}
      eyebrow="Snowflake SQL appendix"
      title="Queries and their validation status"
      description="Table and column names were checked read-only against ANALYTICS_EXPO.INFORMATION_SCHEMA on 2026-10-20. Anything not confirmed is marked."
    />
    <div className="mt-6 space-y-3">
      {SQL_ENTRIES.map((q, i) => (
        <details key={q.id} open={i === 0} className="group rounded-2xl border border-line">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span className="font-medium text-ink">{q.title}</span>
            <span className="flex items-center gap-2">
              {(['validated', 'unverified', 'missing'] as CheckStatus[]).map(s => {
                const n = q.checks.filter(c => c.status === s).length;
                return n ? (
                  <Badge key={s} tone={CHECK_META[s].tone}>
                    {n} {CHECK_META[s].label.toLowerCase()}
                  </Badge>
                ) : null;
              })}
              <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="space-y-4 border-t border-line px-5 pb-5 pt-4">
            <p className="text-sm text-ink-2">{q.purpose}</p>
            <ul className="space-y-1.5">
              {q.checks.map(c => (
                <li key={c.item} className="flex flex-wrap items-start gap-2 text-xs">
                  <Badge tone={CHECK_META[c.status].tone}>
                    {CHECK_META[c.status].icon}
                    {CHECK_META[c.status].label}
                  </Badge>
                  <span className="num text-ink">{c.item}</span>
                  <span className="text-muted">— {c.note}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <CopyButton text={q.sql} label="Copy SQL" />
            </div>
            <pre className="num overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-200">{q.sql}</pre>
          </div>
        </details>
      ))}
    </div>
    <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-xs leading-relaxed text-ink-2">
      <p className="font-medium text-ink">Calculation formulas</p>
      <p className="num mt-1">RPMBr = spend ÷ bid requests × 1,000,000</p>
      <p className="num">Incremental spend = recovered bid requests × RPMBr ÷ 1,000,000</p>
      <p className="num">Recovered spend = eligible spend × coverage × recovery rate × probability</p>
      <p className="num">Value protected = (eligible spend ÷ 30) × days saved × historical recovery probability</p>
      <p className="num">Direct cost reduction = hours saved × loaded hourly cost × cash-realization rate</p>
    </div>
  </Card>
);

export const AssumptionsAppendix: React.FC<{
  sets: Record<ScenarioId, AssumptionSet>;
  edit: (s: ScenarioId, id: AssumptionId, v: number | null) => void;
}> = ({ sets, edit }) => {
  const ids = Object.keys(sets.base) as AssumptionId[];
  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-assumptions" />
      <SectionHeading
        icon={<ClipboardList className="h-5 w-5" />}
        eyebrow="Assumptions appendix"
        title="Every input, its owner and status"
        description="Edit any value here or in the sections above. Blank means Requires validation. Edits are kept for this visit only."
      />
      <div className="mt-6">
        <TableShell minWidth="1100px">
          <thead>
            <tr>
              <Th>Assumption</Th>
              {SCENARIO_IDS.map(s => (
                <Th key={s}>{SCENARIO_LABELS[s]}</Th>
              ))}
              <Th>Unit</Th>
              <Th>Source</Th>
              <Th>Owner</Th>
              <Th>Confidence</Th>
              <Th>Updated</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ids.map(id => {
              const b = sets.base[id];
              return (
                <tr key={id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{b.label}</p>
                    <p className="text-[11px] text-muted">{b.group}</p>
                  </td>
                  {SCENARIO_IDS.map(s => (
                    <td key={s} className="w-40 px-2 py-2">
                      <AssumptionInput compactMode idPrefix={`c4a-${s}`} a={sets[s][id]} onChange={v => edit(s, id, v)} />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{b.unit}</td>
                  <td className="px-4 py-3 text-xs text-ink-2">{sets.base[id].source}</td>
                  <td className="px-4 py-3 text-xs text-ink-2">{b.owner}</td>
                  <td className={cx('px-4 py-3 text-xs', b.confidence === 'None' ? 'text-muted' : 'text-ink-2')}>{sets.base[id].confidence}</td>
                  <td className="num whitespace-nowrap px-4 py-3 text-xs text-muted">{sets.base[id].lastUpdated}</td>
                  <td className="px-4 py-3">
                    <ClassTag c={sets.base[id].status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </div>
      <p className="mt-3 text-xs text-muted">Source, confidence and status columns show the Base case; each scenario's own values are in its column.</p>
    </Card>
  );
};
