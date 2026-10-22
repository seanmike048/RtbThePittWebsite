import React, { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { caseFinancials } from '../../lib/cases/financials.ts';
import { fmtUsd, showUsd } from '../../lib/cases/fx.ts';
import { BLANK, ILLUSTRATIVE, project, validate, type Scenario } from '../../lib/cases/projection.ts';
import type { CaseRecord } from '../../lib/cases/types.ts';
import { Button } from '../ui.tsx';
import { PageHeader, Prov, RequirePublisher, Section } from './bits.tsx';
import { useScenario } from './useScenario.ts';

export const SpendProjectionPage: React.FC = () => <RequirePublisher title="Spend Projection">{(c) => <Projection key={c.caseId} c={c} />}</RequirePublisher>;

const FIELDS: { k: keyof Omit<Scenario, 'origin'>; label: string; unit: string; help: string }[] = [
  { k: 'restorationPct', label: 'Restoration share', unit: '%', help: 'Share of the removed weekly spend that comes back.' },
  { k: 'probabilityPct', label: 'Probability the fix works', unit: '%', help: 'Applied once to the whole projection.' },
  { k: 'startDays', label: 'Days until spend returns', unit: 'days', help: 'From approval of the fix.' },
  { k: 'rampDays', label: 'Ramp', unit: 'days', help: 'Days to reach the full restoration share.' },
];

const Projection: React.FC<{ c: CaseRecord }> = ({ c }) => {
  const f = useMemo(() => caseFinancials(c), [c]);
  const [s, save] = useScenario(c.caseId);
  const pr = useMemo(() => project(f.removedAfterCut, s), [f, s]);
  const missing = validate(s);
  const set = (k: keyof Omit<Scenario, 'origin'>, v: string) => save({ ...s, [k]: v === '' ? null : Number(v), origin: 'entered' });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spend Projection"
        c={c}
        lead="What could come back for this publisher if an approved fix works. A scenario you enter, not a forecast; observed spend is never changed by it."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Section title="Scenario" aside={s.origin === 'illustrative' ? <Prov p="Illustrative" /> : s.origin === 'entered' ? <span className="text-[11px] text-muted">Entered, not approved</span> : <Prov p="Unavailable" />}>
          <p className="text-sm text-ink-2">
            Baseline: <span className="num font-semibold text-ink">{showUsd(f.removedAfterCut)}</span> per week removed by the cut <Prov p={f.removedAfterCut.kind === 'usd' ? 'Calculated' : 'Unavailable'} />
          </p>
          <div className="mt-3 space-y-3">
            {FIELDS.map((x) => (
              <label key={x.k} className="block">
                <span className="flex items-baseline justify-between text-sm text-ink">
                  {x.label} <span className="text-xs text-muted">{x.unit}</span>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={x.unit === '%' ? 100 : undefined}
                  value={s[x.k] ?? ''}
                  onChange={(e) => set(x.k, e.target.value)}
                  className="num mt-1 h-9 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
                <span className="text-[11px] text-muted">{x.help}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => save(ILLUSTRATIVE)}>
              Use illustrative values
            </Button>
            <Button size="sm" variant="ghost" onClick={() => save(BLANK)}>
              Clear
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted">Saved for {c.publisher} only, in this browser. Illustrative values are labelled everywhere and never count as approved.</p>
        </Section>

        <Section title="Projected spend back" aside={pr.kind === 'ok' ? <Prov p={pr.illustrative ? 'Illustrative' : 'Projected'} /> : <Prov p="Unavailable" />}>
          {pr.kind !== 'ok' ? (
            <div className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-2">
              <p className="font-medium text-ink">No projection yet</p>
              <p className="mt-1 text-muted">{pr.reason}</p>
              {missing.length > 0 && <p className="mt-1 text-muted">Missing: {missing.join(', ')}.</p>}
            </div>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {pr.totals.map((t) => (
                  <div key={t.days}>
                    <dt className="text-xs text-muted">Expected, first {t.days} days</dt>
                    <dd className="num mt-0.5 text-xl font-semibold text-ink">{fmtUsd(t.expected)}</dd>
                    <dd className="text-[11px] text-muted">{fmtUsd(t.ifSuccessful)} if the fix works</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-xs text-muted">Weekly, at full ramp</dt>
                  <dd className="num mt-0.5 text-xl font-semibold text-ink">{fmtUsd(pr.weeklyAtFullRamp)}</dd>
                  <dd className="text-[11px] text-muted">probability applied</dd>
                </div>
              </dl>
              <div className="mt-4 h-64" role="img" aria-label={`Cumulative expected spend back over 90 days: ${fmtUsd(pr.points[pr.points.length - 1].expected)}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pr.points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} ticks={[1, 30, 60, 90]} tickFormatter={(d) => `Day ${d}`} />
                    <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => fmtUsd(v as number)} />
                    <Tooltip
                      cursor={{ stroke: 'var(--line-strong)' }}
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: 6, fontSize: 12, color: 'var(--ink)' }}
                      labelStyle={{ color: 'var(--muted)' }}
                      labelFormatter={(d) => `Day ${d}`}
                      formatter={(v, name) => [fmtUsd(v as number), name === 'expected' ? 'Expected (× probability)' : 'If the fix works']}
                    />
                    <Area type="monotone" dataKey="ifSuccessful" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.12} strokeDasharray="4 3" isAnimationActive={false} />
                    <Area type="monotone" dataKey="expected" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.18} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted">Cumulative USD. Solid: expected (probability applied once). Dashed: if the fix works.</p>
            </>
          )}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-ink-2">Assumptions and method</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
              <li>Baseline is the removed weekly spend in USD ({f.window ? `${f.window.from} → ${f.window.to}` : 'source total'}), spread evenly per day.</li>
              <li>Spend back on day t = baseline × restoration × ramp(t); ramp grows linearly after the start delay.</li>
              <li>Expected = probability × spend back. Seats still live are not included: they were not lost.</li>
              <li>No Finance-approved inputs exist. The projection is never added to observed or confirmed spend.</li>
            </ul>
          </details>
        </Section>
      </div>
    </div>
  );
};
