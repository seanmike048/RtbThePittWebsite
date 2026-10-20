import React from 'react';
import { Clock, Gauge, Hourglass, Layers3, ShieldAlert, Sigma, TrendingUp, Users } from 'lucide-react';
import { type AssumptionId, type AssumptionSet, SCENARIO_IDS, SCENARIO_LABELS, type ScenarioId } from '../../lib/cfo437/assumptions.ts';
import { RPMBR_FORMULA, SPEND_UNIT } from '../../lib/cfo437/baseline.ts';
import { useBaseline } from './baselineContext.tsx';
import {
  type EligibleMode,
  horizonRunRates,
  OVERLAP_LABELS,
  type OverlapStatus,
  type Result,
  ROI_UNAVAILABLE,
} from '../../lib/cfo437/model.ts';
import type { ScenarioOutputs } from '../../lib/cfo437/scenario.ts';
import { Badge, Card, CopyButton, cx, SectionHeading, SegmentedControl, TableShell, Th } from '../ui.tsx';
import { AssumptionInput, ClassTag, compact, fmt, Notice, ResultValue, SectionAnchor } from './shared.tsx';

type Edit = (scenario: ScenarioId, id: AssumptionId, v: number | null) => void;

const ScenarioPicker: React.FC<{ value: ScenarioId; onChange: (s: ScenarioId) => void }> = ({ value, onChange }) => (
  <SegmentedControl<ScenarioId>
    ariaLabel="Scenario"
    value={value}
    onChange={onChange}
    options={SCENARIO_IDS.map(id => ({ value: id, label: SCENARIO_LABELS[id] }))}
  />
);

const Output: React.FC<{ label: string; r: Result; unit: string; note?: string; digits?: number; highlight?: boolean }> = ({
  label,
  r,
  unit,
  note,
  digits = 2,
  highlight,
}) => (
  <div className={cx('rounded-2xl border p-4', highlight ? 'border-accent/25 bg-accent-soft' : 'border-line')}>
    <p className={cx('text-xs font-medium', highlight ? 'text-accent-ink' : 'text-muted')}>{label}</p>
    <div className="mt-2">
      <ResultValue r={r} unit={unit} digits={digits} size="lg" />
    </div>
    {r.value === null && r.reason && <p className="mt-1 text-xs leading-relaxed text-muted">{r.reason}</p>}
    {note && r.value !== null && <p className="mt-1 text-xs text-muted">{note}</p>}
  </div>
);

/* ---------------- Spend impact ---------------- */

export const SpendImpact: React.FC<{
  scenario: ScenarioId;
  onScenario: (s: ScenarioId) => void;
  a: AssumptionSet;
  out: ScenarioOutputs;
  edit: Edit;
  mode: EligibleMode;
  onMode: (m: EligibleMode) => void;
  hasRows: boolean;
  subsetCount: number;
  overlap: OverlapStatus;
  onOverlap: (o: OverlapStatus) => void;
  overlapConfirmed: boolean;
  onOverlapConfirmed: (v: boolean) => void;
  currencyValidated: boolean;
}> = p => {
  const { a, out } = p;
  const base = useBaseline();
  const set = (id: AssumptionId) => (v: number | null) => p.edit(p.scenario, id, v);
  const bothValues = out.recovered.value !== null && out.fromBids.value !== null;
  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-impact" />
      <SectionHeading
        icon={<TrendingUp className="h-5 w-5" />}
        eyebrow="Spend impact when issues are solved"
        title="Scenario recovered spend"
        description="Scenario recovered spend, not confirmed recovered revenue. Every input is visible and editable."
        aside={<ScenarioPicker value={p.scenario} onChange={p.onScenario} />}
      />

      <div className="mt-6">
        <p className="text-sm font-medium text-ink">Eligible spend at risk</p>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
          {(
            [
              ['all_visible', 'All visible endpoint spend', 'Demonstration only'],
              ['subset', 'Selected publisher subset', p.hasRows ? `${p.subsetCount} publishers selected` : 'Needs workbook rows'],
              ['validated', 'Validated issue-specific spend', 'Issue-specific financial exposure'],
            ] as [EligibleMode, string, string][]
          ).map(([m, label, note]) => (
            <button
              key={m}
              type="button"
              onClick={() => p.onMode(m)}
              aria-pressed={p.mode === m}
              className={cx(
                'rounded-xl border p-3 text-left transition-colors cursor-pointer',
                p.mode === m ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong',
              )}
            >
              <span className="block text-sm font-medium text-ink">{label}</span>
              <span className={cx('mt-0.5 block text-xs', m === 'validated' ? 'text-ok-ink' : 'text-warn-ink')}>{note}</span>
            </button>
          ))}
        </div>
        <p className={cx('mt-2 text-xs', out.exposure.isIssueSpecific ? 'text-ok-ink' : 'text-warn-ink')}>{out.exposure.label}</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          {p.mode === 'validated' && (
            <>
              <AssumptionInput idPrefix="c4i" a={a.eligibleSpend} onChange={set('eligibleSpend')} />
              <AssumptionInput idPrefix="c4i" a={a.eligibleBidRequests} onChange={set('eligibleBidRequests')} />
              <AssumptionInput idPrefix="c4i" a={a.eligiblePublishers} onChange={set('eligiblePublishers')} />
            </>
          )}
          <AssumptionInput idPrefix="c4i" a={a.coveragePct} onChange={set('coveragePct')} />
          <AssumptionInput idPrefix="c4i" a={a.recoveryRatePct} onChange={set('recoveryRatePct')} />
          <AssumptionInput idPrefix="c4i" a={a.bidRecoveryRatePct} onChange={set('bidRecoveryRatePct')} />
          <AssumptionInput idPrefix="c4i" a={a.recoveryProbabilityPct} onChange={set('recoveryProbabilityPct')} />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Output
              label="Eligible spend at risk"
              r={out.exposure.spend === null ? { value: null, status: 'unavailable', reason: 'Requires validation' } : { value: out.exposure.spend, status: 'ok' }}
              unit="SCU"
            />
            <Output label="Scenario recovered spend" r={out.recovered} unit="SCU" highlight note="eligible × coverage × recovery × probability" />
            <Output label="Scenario spend after resolution" r={out.after} unit="SCU" note={`baseline ${compact(base.view.spend)} (${base.period}) + recovered`} />
            <Output label="Incremental spend" r={out.incremental} unit="% of baseline" digits={3} />
            <Output label="Recovered bid requests" r={out.recoveredBids} unit="bid requests" digits={0} />
            <Output label="Spend from recovered bid requests" r={out.fromBids} unit="SCU" note="recovered bids × RPMBr ÷ 1,000,000" />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Currency:</span>
            <Badge tone={p.currencyValidated ? 'ok' : 'warn'}>{p.currencyValidated ? 'Validated' : 'Requires Finance validation'}</Badge>
            <span>Confidence:</span>
            <Badge tone={out.exposure.isIssueSpecific ? 'info' : 'warn'}>{out.exposure.isIssueSpecific ? 'Per inputs' : 'Demonstration'}</Badge>
            <span>Label: Scenario run-rate arithmetic — not a forecast.</span>
          </div>

          <div className="rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShieldAlert className="h-4 w-4 text-warn" /> Double-counting check
              </p>
              <Badge tone={p.overlap === 'validated_non_overlapping' ? 'ok' : p.overlap === 'potential_overlap' ? 'warn' : 'neutral'} dot>
                {OVERLAP_LABELS[p.overlap]}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-2">
              Recovered spend, spend from recovered bid requests, faster-detection value and any RPMBr improvement come from the same
              eligible base. They are only summed once overlapping value has been removed and confirmed.
            </p>
            {bothValues && p.overlap !== 'validated_non_overlapping' && (
              <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-ink">
                Recovered spend and spend from recovered bid requests are both available. They are not added together.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {(['not_evaluated', 'potential_overlap'] as OverlapStatus[]).map(o => (
                <button
                  key={o}
                  type="button"
                  onClick={() => p.onOverlap(o)}
                  className={cx(
                    'rounded-full border px-3 py-1 text-xs font-medium cursor-pointer',
                    p.overlap === o ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-muted hover:text-ink',
                  )}
                >
                  {OVERLAP_LABELS[o]}
                </button>
              ))}
              <button
                type="button"
                disabled={!p.overlapConfirmed}
                onClick={() => p.onOverlap('validated_non_overlapping')}
                className={cx(
                  'rounded-full border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
                  p.overlap === 'validated_non_overlapping' ? 'border-ok bg-ok-soft text-ok-ink' : 'border-line text-muted hover:text-ink',
                )}
              >
                {OVERLAP_LABELS.validated_non_overlapping}
              </button>
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-ink-2">
              <input
                id="c4-overlap-confirm"
                type="checkbox"
                checked={p.overlapConfirmed}
                onChange={e => {
                  p.onOverlapConfirmed(e.target.checked);
                  if (!e.target.checked && p.overlap === 'validated_non_overlapping') p.onOverlap('potential_overlap');
                }}
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              I confirm overlapping value between these components has been removed.
            </label>
          </div>
        </div>
      </div>
    </Card>
  );
};

/* ---------------- Faster detection ---------------- */

export const FasterDetection: React.FC<{ scenario: ScenarioId; onScenario: (s: ScenarioId) => void; a: AssumptionSet; out: ScenarioOutputs; edit: Edit }> = ({
  scenario,
  onScenario,
  a,
  out,
  edit,
}) => {
  const set = (id: AssumptionId) => (v: number | null) => edit(scenario, id, v);
  const base = useBaseline();
  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-detection" />
      <SectionHeading
        icon={<Clock className="h-5 w-5" />}
        eyebrow="Faster detection & recovery"
        title="Value protected by detecting sooner"
        description={`Historical daily spend at risk = eligible spend ÷ ${base.days} days (${base.period}). Value protected = daily spend × days saved × historical recovery probability.`}
        aside={<ScenarioPicker value={scenario} onChange={onScenario} />}
      />
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <AssumptionInput idPrefix="c4d" a={a.historicalDetectionDays} onChange={set('historicalDetectionDays')} />
          <AssumptionInput idPrefix="c4d" a={a.expectedDetectionDays} onChange={set('expectedDetectionDays')} />
          <AssumptionInput idPrefix="c4d" a={a.daysSaved} onChange={set('daysSaved')} />
          <AssumptionInput idPrefix="c4d" a={a.historicalRecoveryProbabilityPct} onChange={set('historicalRecoveryProbabilityPct')} />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Output
              label="Historical daily spend at risk"
              r={out.exposure.spend === null ? { value: null, status: 'unavailable', reason: 'Requires eligible spend at risk' } : { value: out.exposure.spend / base.days, status: 'ok' }}
              unit="SCU / day"
            />
            <Output label="Days saved" r={out.daysSaved} unit="days" digits={1} note={a.daysSaved.value === null ? 'historical − expected detection' : 'entered directly'} />
            <Output label="Scenario value protected" r={out.protectedValue} unit="SCU" highlight />
          </div>
          {out.protectedValue.value === null && (
            <Notice tone="warn" icon={<Hourglass className="h-4 w-4 text-warn" />}>
              <strong>Value protected unavailable until historical detection and recovery data are provided. </strong>
              Days saved are never estimated silently.
            </Notice>
          )}
        </div>
      </div>
    </Card>
  );
};

/* ---------------- Human time ---------------- */

export const HumanTime: React.FC<{ scenario: ScenarioId; onScenario: (s: ScenarioId) => void; a: AssumptionSet; out: ScenarioOutputs; edit: Edit }> = ({
  scenario,
  onScenario,
  a,
  out,
  edit,
}) => {
  const set = (id: AssumptionId) => (v: number | null) => edit(scenario, id, v);
  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-time" />
      <SectionHeading
        icon={<Users className="h-5 w-5" />}
        eyebrow="Human time saved"
        title="Direct cash vs capacity released"
        description="Released capacity is not a cash saving. Only the cash-realization share of hours counts as direct cost reduction."
        aside={<ScenarioPicker value={scenario} onChange={onScenario} />}
      />
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <AssumptionInput idPrefix="c4h" a={a.investigations} onChange={set('investigations')} />
          <AssumptionInput idPrefix="c4h" a={a.automatedPct} onChange={set('automatedPct')} />
          <AssumptionInput idPrefix="c4h" a={a.hoursPerInvestigation} onChange={set('hoursPerInvestigation')} />
          <AssumptionInput idPrefix="c4h" a={a.loadedHourlyCost} onChange={set('loadedHourlyCost')} />
          <AssumptionInput idPrefix="c4h" a={a.cashRealizationPct} onChange={set('cashRealizationPct')} />
          <p className="text-xs text-muted">Owner: Finance / Ops.</p>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Output label="Hours saved" r={out.hours} unit="hours / month" digits={1} note="investigations × % automated × hours" />
            <Output label="Capacity released" r={out.hours} unit="hours / month" digits={1} note="time freed, not cash" />
            <Output label="Direct cost reduction" r={out.directCash} unit="cost units / month" highlight note="hours × loaded cost × cash realization" />
            <Output label="Capacity value" r={out.capacity} unit="cost units / month" note="hours × loaded cost · not cash" />
          </div>
          {out.hours.value === null && (
            <Notice tone="warn" icon={<Hourglass className="h-4 w-4 text-warn" />}>
              <strong>Operational value unavailable until labor-rate and investigation-time inputs are validated.</strong>
            </Notice>
          )}
        </div>
      </div>
    </Card>
  );
};

/* ---------------- Scenarios ---------------- */

const resultText = (r: Result, digits = 2) => (r.value === null ? 'Requires validation' : fmt(r.value, digits));

export const Scenarios: React.FC<{
  sets: Record<ScenarioId, AssumptionSet>;
  outs: Record<ScenarioId, ScenarioOutputs>;
  active: ScenarioId;
  onActive: (s: ScenarioId) => void;
}> = ({ sets, outs, active, onActive }) => {
  const av = (s: ScenarioId, id: AssumptionId, unit = '') => {
    const v = sets[s][id].value;
    return v === null ? 'Requires validation' : `${fmt(v, v % 1 ? 2 : 0)}${unit}`;
  };
  const fields: { label: string; unit: string; get: (s: ScenarioId) => string }[] = [
    { label: 'Eligible affected publishers', unit: 'publishers', get: s => (outs[s].exposure.publishers === null ? 'Requires validation' : fmt(outs[s].exposure.publishers!)) },
    { label: 'Eligible spend at risk', unit: 'SCU', get: s => (outs[s].exposure.spend === null ? 'Requires validation' : fmt(outs[s].exposure.spend!, 2)) },
    { label: 'Eligible bid requests', unit: 'bid requests', get: s => (outs[s].exposure.bidRequests === null ? 'Requires validation' : fmt(outs[s].exposure.bidRequests!)) },
    { label: 'Issue resolution coverage', unit: '%', get: s => av(s, 'coveragePct', '%') },
    { label: 'Recovery rate', unit: '%', get: s => av(s, 'recoveryRatePct', '%') },
    { label: 'Bid-request recovery rate', unit: '%', get: s => av(s, 'bidRecoveryRatePct', '%') },
    { label: 'Recovery probability', unit: '%', get: s => av(s, 'recoveryProbabilityPct', '%') },
    { label: 'Days saved', unit: 'days', get: s => resultText(outs[s].daysSaved, 1) },
    { label: 'Hours saved', unit: 'hours / month', get: s => resultText(outs[s].hours, 1) },
    { label: 'Loaded hourly cost', unit: 'cost units / hour', get: s => av(s, 'loadedHourlyCost') },
    { label: 'Implementation cost', unit: 'cost units', get: s => av(s, 'implementationCost') },
    { label: 'Ongoing operating cost', unit: 'cost units / month', get: s => av(s, 'operatingCost') },
    { label: 'Scenario recovered spend', unit: 'SCU', get: s => resultText(outs[s].recovered) },
    { label: 'Scenario spend after resolution', unit: 'SCU', get: s => resultText(outs[s].after) },
    { label: 'Value protected from faster detection', unit: 'SCU', get: s => resultText(outs[s].protectedValue) },
    { label: 'Direct operational value', unit: 'cost units / month', get: s => resultText(outs[s].directCash) },
    { label: 'Capacity released', unit: 'hours / month', get: s => resultText(outs[s].hours, 1) },
    { label: 'Total scenario benefit', unit: 'mixed units', get: s => resultText(outs[s].benefit.total) },
    { label: 'Net benefit', unit: 'mixed units', get: s => resultText(outs[s].financial.netBenefit) },
    { label: 'ROI status', unit: '', get: s => (outs[s].financial.roi.value === null ? 'Unavailable' : `${fmt(outs[s].financial.roi.value!, 1)}%`) },
    { label: 'Payback status', unit: '', get: s => (outs[s].financial.payback.value === null ? 'Unavailable' : `${fmt(outs[s].financial.payback.value!, 1)} months`) },
  ];

  const tsv = ['Field\tUnit\t' + SCENARIO_IDS.map(s => SCENARIO_LABELS[s]).join('\t'), ...fields.map(f => [f.label, f.unit, ...SCENARIO_IDS.map(f.get)].join('\t'))].join('\n');
  const json = JSON.stringify(
    Object.fromEntries(SCENARIO_IDS.map(s => [SCENARIO_LABELS[s], Object.fromEntries(fields.map(f => [f.label, f.get(s)]))])),
    null,
    2,
  );

  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-scenarios" />
      <SectionHeading
        icon={<Layers3 className="h-5 w-5" />}
        eyebrow="Scenarios"
        title="Conservative, base case and upside"
        description="Rate defaults are scenario assumptions and are editable in each section or in the assumptions appendix. Everything else stays blank until validated."
        aside={
          <div className="flex flex-wrap gap-2">
            <CopyButton text={tsv} label="Copy table (TSV)" />
            <CopyButton text={json} label="Copy JSON" />
          </div>
        }
      />
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {SCENARIO_IDS.map(s => {
          const o = outs[s];
          return (
            <article
              key={s}
              className={cx(
                'rounded-2xl border p-5 transition-colors',
                active === s ? 'border-accent bg-accent-soft' : 'border-line',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-ink">{SCENARIO_LABELS[s]}</h3>
                <button
                  type="button"
                  onClick={() => onActive(s)}
                  aria-pressed={active === s}
                  className={cx(
                    'rounded-full border px-2.5 py-0.5 text-xs font-medium cursor-pointer',
                    active === s ? 'border-accent bg-surface text-accent-ink' : 'border-line text-muted hover:text-ink',
                  )}
                >
                  {active === s ? 'Shown in sections' : 'Show in sections'}
                </button>
              </div>
              {!o.exposure.isIssueSpecific && (
                <p className="mt-2 text-xs font-medium text-warn-ink">Demonstration exposure · not issue-specific</p>
              )}
              <p className="num mt-2 text-xs text-muted">
                {sets[s].coveragePct.value ?? '—'}% coverage · {sets[s].recoveryRatePct.value ?? '—'}% recovery · {sets[s].recoveryProbabilityPct.value ?? '—'}% probability
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted">Recovered spend</dt>
                  <dd>
                    <ResultValue r={o.recovered} unit="SCU" compactNum />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted">Spend after resolution</dt>
                  <dd>
                    <ResultValue r={o.after} unit="SCU" compactNum />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted">Total benefit</dt>
                  <dd>
                    <ResultValue r={o.benefit.total} unit="mixed" compactNum />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted">ROI</dt>
                  <dd className="text-xs font-medium text-danger-ink">{o.financial.roi.value === null ? 'Unavailable' : `${fmt(o.financial.roi.value, 1)}%`}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <ClassTag c="scenario_assumption">Scenario assumptions</ClassTag>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6">
        <TableShell minWidth="720px">
          <thead>
            <tr>
              <Th>Field</Th>
              <Th>Unit</Th>
              {SCENARIO_IDS.map(s => (
                <Th key={s} right>
                  {SCENARIO_LABELS[s]}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {fields.map(f => (
              <tr key={f.label}>
                <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">{f.label}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">{f.unit}</td>
                {SCENARIO_IDS.map(s => {
                  const v = f.get(s);
                  const pending = v === 'Requires validation' || v === 'Unavailable';
                  return (
                    <td key={s} className={cx('num whitespace-nowrap px-4 py-2.5 text-right', pending ? 'font-sans text-xs italic text-muted' : 'text-ink', active === s && 'bg-accent-soft/60')}>
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </TableShell>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        “Mixed units” totals combine SCU spend with cost-unit labour value; they are only meaningful once Finance validates both
        currencies. Eligible spend follows the exposure mode chosen in Spend impact.
      </p>
    </Card>
  );
};

/* ---------------- Horizons ---------------- */

export const Horizons: React.FC<{ scenario: ScenarioId; onScenario: (s: ScenarioId) => void; out: ScenarioOutputs; currencyValidated: boolean }> = ({
  scenario,
  onScenario,
  out,
  currencyValidated,
}) => {
  const base = useBaseline();
  const rows = horizonRunRates(out.recovered, base.view.spend, base.days);
  const max = rows[rows.length - 1].after.value ?? rows[rows.length - 1].baselineSpend;
  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-horizons" />
      <SectionHeading
        icon={<Gauge className="h-5 w-5" />}
        eyebrow="Scenario horizons"
        title="7-day to 12-month run-rate views"
        description={`Scenario run-rate arithmetic based on historical endpoint-437 display data. Not a forecast. Daily rate = ${base.period} total ÷ ${base.days} days; lifetime totals are never used as daily values.`}
        aside={<ScenarioPicker value={scenario} onChange={onScenario} />}
      />
      <div className="mt-6 space-y-3">
        {rows.map(r => (
          <div key={r.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
            <span className="text-sm font-medium text-ink">{r.label}</span>
            <div>
              <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-accent/70" style={{ width: `${(r.baselineSpend / max) * 100}%` }} />
                {r.recovered.value !== null && <div className="h-full bg-ok" style={{ width: `${Math.max(0.4, (r.recovered.value / max) * 100)}%` }} />}
              </div>
              <p className="num mt-1 text-[11px] text-muted">
                baseline {compact(r.baselineSpend)} SCU{r.recovered.value !== null && ` + recovered ${compact(r.recovered.value)} SCU`}
              </p>
            </div>
          </div>
        ))}
        <p className="flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-accent/70" /> Historical baseline (SCU)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-ok" /> Scenario recovered spend (SCU)
          </span>
        </p>
      </div>
      <div className="mt-6">
        <TableShell minWidth="900px">
          <thead>
            <tr>
              <Th>Horizon</Th>
              <Th>Historical baseline used</Th>
              <Th right>Days used</Th>
              <Th right>Baseline spend</Th>
              <Th right>Recovered spend</Th>
              <Th right>Spend after resolution</Th>
              <Th right>Incremental</Th>
              <Th>Currency</Th>
              <Th>Confidence</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(r => (
              <tr key={r.label}>
                <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">{r.label}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">{base.period} visible view{base.source === 'live' ? ' (live)' : ''}</td>
                <td className="num px-4 py-2.5 text-right text-ink-2">{r.historicalDaysUsed}</td>
                <td className="num px-4 py-2.5 text-right text-ink">{fmt(r.baselineSpend, 2)}</td>
                <td className="px-4 py-2.5 text-right"><ResultValue r={r.recovered} unit="" digits={2} /></td>
                <td className="px-4 py-2.5 text-right"><ResultValue r={r.after} unit="" digits={2} /></td>
                <td className="px-4 py-2.5 text-right"><ResultValue r={r.incremental} unit="%" digits={3} /></td>
                <td className="px-4 py-2.5"><Badge tone={currencyValidated ? 'ok' : 'warn'}>{currencyValidated ? 'Validated' : 'SCU · unvalidated'}</Badge></td>
                <td className="px-4 py-2.5"><Badge tone="neutral">{out.exposure.isIssueSpecific ? 'Per inputs' : 'Demonstration'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </div>
      <p className="mt-3 text-xs text-muted">
        Methodology: horizon value = ({base.period} value ÷ {base.days}) × horizon days. Recovered spend scales the same way. Assumes
        that month's daily run rate holds, which is an arithmetic convention, not an expectation.
      </p>
    </Card>
  );
};

/* ---------------- Sensitivity ---------------- */

export const Sensitivity: React.FC<{ scenario: ScenarioId; onScenario: (s: ScenarioId) => void; a: AssumptionSet; out: ScenarioOutputs }> = ({
  scenario,
  onScenario,
  a,
  out,
}) => {
  const coverages = [25, 50, 75, 100];
  const rates = [10, 25, 50, 75];
  const prob = (a.recoveryProbabilityPct.value ?? 0) / 100;
  const spend = out.exposure.spend;
  const share = (c: number, r: number) => (c / 100) * (r / 100) * prob;
  const maxShare = share(100, 75) || 1;
  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-sensitivity" />
      <SectionHeading
        icon={<Sigma className="h-5 w-5" />}
        eyebrow="Sensitivity analysis"
        title="Recovered spend by coverage and recovery rate"
        description={`At ${a.recoveryProbabilityPct.value ?? '—'}% recovery probability (${SCENARIO_LABELS[scenario]}). ${
          spend === null ? 'Shown as % of eligible spend until eligible spend is validated.' : 'Values in SCU.'
        }`}
        aside={<ScenarioPicker value={scenario} onChange={onScenario} />}
      />
      <div className="mt-6">
        <TableShell minWidth="560px">
          <thead>
            <tr>
              <Th>Coverage \ recovery rate</Th>
              {rates.map(r => (
                <Th key={r} right>
                  {r}%
                </Th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {coverages.map(c => (
              <tr key={c}>
                <td className="num px-4 py-2 font-medium text-ink">{c}%</td>
                {rates.map(r => {
                  const sh = share(c, r);
                  const active = c === a.coveragePct.value && r === a.recoveryRatePct.value;
                  return (
                    <td key={r} className="px-2 py-1.5">
                      <div className={cx('num relative overflow-hidden rounded-lg px-3 py-2 text-right text-sm', active ? 'font-semibold text-ink ring-2 ring-accent' : 'text-ink-2')}>
                        <span aria-hidden className="absolute inset-0 bg-ok" style={{ opacity: 0.05 + (sh / maxShare) * 0.3 }} />
                        <span className="relative">{spend === null ? `${(sh * 100).toFixed(2)}%` : `${compact(spend * sh)}`}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </TableShell>
      </div>
    </Card>
  );
};

/* ---------------- ROI ---------------- */

export const RoiAvailability: React.FC<{ outs: Record<ScenarioId, ScenarioOutputs> }> = ({ outs }) => {
  const metrics: { key: keyof ScenarioOutputs['financial']; label: string; unit: string }[] = [
    { key: 'netBenefit', label: 'Net benefit (first month)', unit: 'mixed units' },
    { key: 'roi', label: 'ROI', unit: '%' },
    { key: 'payback', label: 'Payback', unit: 'months' },
    { key: 'npv', label: 'NPV', unit: '' },
    { key: 'irr', label: 'IRR', unit: '' },
  ];
  const allUnavailable = SCENARIO_IDS.every(s => outs[s].financial.roi.value === null);
  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-roi" />
      <SectionHeading icon={<ShieldAlert className="h-5 w-5" />} eyebrow="ROI & payback" eyebrowTone="danger" title="ROI and payback availability" />
      {allUnavailable && (
        <div className="mt-6">
          <Notice tone="danger">
            <strong>{ROI_UNAVAILABLE}</strong>
          </Notice>
        </div>
      )}
      <div className="mt-6">
        <TableShell minWidth="640px">
          <thead>
            <tr>
              <Th>Metric</Th>
              {SCENARIO_IDS.map(s => (
                <Th key={s}>{SCENARIO_LABELS[s]}</Th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {metrics.map(m => (
              <tr key={m.key}>
                <td className="px-4 py-3 font-medium text-ink">{m.label}</td>
                {SCENARIO_IDS.map(s => {
                  const r = outs[s].financial[m.key];
                  return (
                    <td key={s} className="px-4 py-3 text-sm">
                      {r.value === null ? (
                        <span className="text-xs text-muted" title={r.reason}>
                          <Badge tone="neutral">Unavailable</Badge>
                        </span>
                      ) : (
                        <span className="num font-semibold text-ink">
                          {fmt(r.value, 1)} {m.unit}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </TableShell>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        NPV and IRR also need dated cash flows and a Finance-approved discount rate, so they stay unavailable on this page. {RPMBR_FORMULA}.
        Spend in {SPEND_UNIT}.
      </p>
    </Card>
  );
};
