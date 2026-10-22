import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Database,
  FileSearch,
  Info,
  ListChecks,
  ShieldAlert,
  Sigma,
  XCircle,
} from 'lucide-react';
import {
  ADS_TXT_LINES,
  BASELINE_AS_OF,
  CURRENT_WINDOW,
  fasterDetectionValue,
  ISSUE_SNAPSHOT,
  LIVE_CASES,
  PERIOD_COMPARISON,
  PRESET_SCENARIOS,
  type Provenance,
  recoveryArithmetic,
  SCENARIO_TRACKS,
  type ScenarioTrack,
  SOURCES,
  SQL_APPENDIX,
  STR_ISSUE_ROWS,
  SUMMARY,
  TOP_PUBLISHERS,
} from '../lib/analytics/data.ts';
import { Badge, Card, CopyButton, cx, Eyebrow, SectionHeading, SegmentedControl, TableShell, Th } from './ui.tsx';

const eur = (n: number, digits = 2) =>
  `€${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const int = (n: number) => Math.round(n).toLocaleString('en-US');

const PROVENANCE: Record<Provenance, { label: string; tone: 'ok' | 'info' | 'warn' | 'danger' | 'accent' }> = {
  observed: { label: 'Observed', tone: 'ok' },
  calculated: { label: 'Calculated', tone: 'info' },
  scenario: { label: 'Scenario only', tone: 'warn' },
  proxy: { label: 'Proxy', tone: 'accent' },
  currency_gap: { label: 'Currency gap', tone: 'danger' },
};

const DOT = { ok: 'bg-ok', info: 'bg-info', warn: 'bg-warn', danger: 'bg-danger', accent: 'bg-accent' };

const Tag: React.FC<{ kind: Provenance; children?: React.ReactNode }> = ({ kind, children }) => (
  <Badge tone={PROVENANCE[kind].tone} dot>
    {children ?? PROVENANCE[kind].label}
  </Badge>
);

const SECTIONS = [
  { id: 'an-summary', label: 'Summary' },
  { id: 'an-publishers', label: 'Publisher baseline' },
  { id: 'an-issues', label: 'DSP issues' },
  { id: 'an-adstxt', label: 'Ads.txt' },
  { id: 'an-scenarios', label: 'Scenario model' },
  { id: 'an-sql', label: 'SQL appendix' },
  { id: 'an-limits', label: 'Limitations' },
];

const Stat: React.FC<{ label: string; value: string; note: string; kind: Provenance; emphasis?: 'muted' }> = ({
  label,
  value,
  note,
  kind,
  emphasis,
}) => (
  <div className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', DOT[PROVENANCE[kind].tone])} title={PROVENANCE[kind].label} />
    </div>
    <p className={cx('num mt-2 text-2xl font-bold tracking-tight', emphasis === 'muted' ? 'text-muted' : 'text-ink')}>{value}</p>
    <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p>
  </div>
);

const Callout: React.FC<{ tone: 'ok' | 'accent' | 'warn' | 'danger'; title: string; children: React.ReactNode }> = ({
  tone,
  title,
  children,
}) => {
  const styles = {
    ok: 'border-ok/25 bg-ok-soft [&_strong]:text-ok-ink',
    accent: 'border-accent/25 bg-accent-soft [&_strong]:text-accent-ink',
    warn: 'border-warn/30 bg-warn-soft [&_strong]:text-warn-ink',
    danger: 'border-danger/25 bg-danger-soft [&_strong]:text-danger-ink',
  }[tone];
  return (
    <div className={cx('rounded-2xl border p-5', styles)}>
      <p className="text-sm font-semibold">
        <strong>{title}</strong>
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{children}</p>
    </div>
  );
};

/* ---------------- Scenario model ---------------- */

const NumberField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  max?: number;
  placeholder?: string;
}> = ({ id, label, value, onChange, suffix, max, placeholder }) => (
  <div>
    <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-2">
      {label}
    </label>
    <div className="flex items-center rounded-xl border border-line bg-surface focus-within:border-accent">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="num w-full min-w-0 rounded-xl bg-transparent px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none"
      />
      {suffix && <span className="pr-3 text-xs text-muted">{suffix}</span>}
    </div>
  </div>
);

const clampNum = (v: string, max?: number) => {
  const n = Math.max(0, Number(v) || 0);
  return max !== undefined ? Math.min(max, n) : n;
};

const ScenarioModel: React.FC = () => {
  const [track, setTrack] = useState<ScenarioTrack>('live');
  const [recovery, setRecovery] = useState('25');
  const [days, setDays] = useState('3');
  const [prob, setProb] = useState('50');
  const [impl, setImpl] = useState('');
  const [opex, setOpex] = useState('');

  const t = SCENARIO_TRACKS[track];
  const r = clampNum(recovery, 100);
  const d = clampNum(days, 30);
  const p = clampNum(prob, 100);
  const recovered = recoveryArithmetic(t.base, r);
  const protectedValue = fasterDetectionValue(t.base, d, p);
  const costsEntered = impl !== '' || opex !== '';

  const gridProbs = [25, 50, 75, 100];
  const gridDays = [1, 3, 7];
  const gridMax = fasterDetectionValue(t.base, 7, 100);

  return (
    <Card className="p-6 sm:p-8">
      <div id="an-scenarios" className="scroll-mt-36" />
      <SectionHeading
        icon={<Calculator className="h-5 w-5" />}
        eyebrow="Scenario model"
        eyebrowTone="warn"
        title="Editable scenario arithmetic"
        description="Test explicit assumptions. Outputs are arithmetic only, not a forecast. Live cases stay in source units because their currency is not documented."
        aside={<Tag kind="scenario">Not a forecast</Tag>}
      />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <SegmentedControl<ScenarioTrack>
            ariaLabel="Scenario track"
            value={track}
            onChange={setTrack}
            options={[
              { value: 'live', label: 'Live cases' },
              { value: 'synthetic', label: 'Synthetic demo' },
            ]}
          />
          <NumberField id="sc-recovery" label="Recovery rate" suffix="%" max={100} value={recovery} onChange={setRecovery} />
          <NumberField id="sc-days" label="Days saved by faster detection" suffix="days" max={30} value={days} onChange={setDays} />
          <NumberField id="sc-prob" label="Recovery probability" suffix="%" max={100} value={prob} onChange={setProb} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="sc-impl" label="Implementation cost" value={impl} onChange={setImpl} placeholder="Unavailable" />
            <NumberField id="sc-opex" label="Operating cost" value={opex} onChange={setOpex} placeholder="Unavailable" />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {PRESET_SCENARIOS.map(s => (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setRecovery(String(s.recoveryPct));
                  setDays(String(s.daysSaved));
                }}
                className={cx(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                  r === s.recoveryPct && d === s.daysSaved
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line text-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <p className="text-sm font-semibold text-ink">
              {t.name} <span className="font-normal text-muted">· {track === 'live' ? 'source units' : 'EUR proxy'}</span>
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-line p-4">
                <p className="text-xs font-medium text-muted">Baseline at risk</p>
                <p className="num mt-2 text-2xl font-bold text-ink">{int(t.base)}</p>
                <p className="mt-1 text-xs text-muted">{t.baseUnit}</p>
              </div>
              <div className="rounded-2xl border border-accent/25 bg-accent-soft p-4">
                <p className="text-xs font-medium text-accent-ink">Recovery arithmetic</p>
                <p className="num mt-2 text-2xl font-bold text-ink">{int(recovered)}</p>
                <p className="mt-1 text-xs text-muted">
                  {t.unit} at {r}% recovery
                </p>
              </div>
              <div className="rounded-2xl border border-accent/25 bg-accent-soft p-4">
                <p className="text-xs font-medium text-accent-ink">Faster-detection value</p>
                <p className="num mt-2 text-2xl font-bold text-ink">{int(protectedValue)}</p>
                <p className="mt-1 text-xs text-muted">
                  {t.unit} protected · {d} days · {p}% probability
                </p>
              </div>
            </div>
            <p className="num mt-2 text-xs text-muted">
              Faster-detection value = (baseline ÷ 7) × days saved × probability. Not confirmed revenue.
            </p>
          </div>

          <div className="flex gap-3 rounded-2xl border border-danger/25 bg-danger-soft p-4 text-sm leading-relaxed text-ink-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p>
              <strong className="text-danger-ink">ROI unavailable. </strong>
              {costsEntered
                ? 'Costs are recorded for this session only. Loaded labour cost, currency normalisation and historical recovery probability are still unvalidated, so no ROI, NPV or payback is computed.'
                : 'Implementation cost, operating cost, loaded labour cost, currency normalisation and historical recovery probability have not been validated.'}
            </p>
          </div>

          <TableShell minWidth="560px">
            <thead>
              <tr>
                <Th>Scenario</Th>
                <Th right>Recovery rate</Th>
                <Th right>Days saved</Th>
                <Th right>Recovery arithmetic</Th>
                <Th>Data status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PRESET_SCENARIOS.map(s => (
                <tr key={s.name}>
                  <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                  <td className="num px-4 py-3 text-right text-ink-2">{s.recoveryPct}%</td>
                  <td className="num px-4 py-3 text-right text-ink-2">{s.daysSaved}</td>
                  <td className="num px-4 py-3 text-right font-semibold text-ink">
                    {int(recoveryArithmetic(t.base, s.recoveryPct))} <span className="font-normal text-muted">{t.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      </div>

      <div className="mt-8 border-t border-line pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-ink">Sensitivity · faster-detection value</h3>
          <p className="text-xs text-muted">Recovery probability × days saved · {t.unit}</p>
        </div>
        <div className="mt-4">
          <TableShell minWidth="480px">
            <thead>
              <tr>
                <Th>Probability \ days saved</Th>
                {gridDays.map(dd => (
                  <Th key={dd} right>
                    {dd} {dd === 1 ? 'day' : 'days'}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {gridProbs.map(pp => (
                <tr key={pp}>
                  <td className="num px-4 py-3 font-medium text-ink">{pp}%</td>
                  {gridDays.map(dd => {
                    const v = fasterDetectionValue(t.base, dd, pp);
                    const active = pp === p && dd === d;
                    return (
                      <td key={dd} className="px-2 py-1.5">
                        <div
                          className={cx(
                            'num relative overflow-hidden rounded-lg px-3 py-2 text-right text-sm',
                            active ? 'font-semibold text-ink ring-2 ring-accent' : 'text-ink-2',
                          )}
                        >
                          <span
                            aria-hidden
                            className="absolute inset-0 bg-accent"
                            style={{ opacity: 0.06 + (v / gridMax) * 0.28 }}
                          />
                          <span className="relative">{int(v)}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      </div>
    </Card>
  );
};

/* ---------------- Page ---------------- */

export const Analytics: React.FC = () => {
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const live = LIVE_CASES.filter(c => c.kind === 'live');
  const liveTotal = live.reduce((s, c) => s + c.amount, 0);
  const maxShare = TOP_PUBLISHERS[0].sharePct;

  return (
    <div className="space-y-6">
      {/* Intro */}
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-28 h-72 w-72 rounded-full bg-gradient-to-br from-sky-500/15 via-indigo-500/10 to-transparent blur-2xl"
        />
        <div className="relative">
          <Eyebrow tone="accent">Equativ SSP only · evidence first</Eyebrow>
          <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight text-ink [text-wrap:balance] sm:text-4xl">
            Data analytics baseline & CFO scenario model
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink-2">
            Historical baseline through <strong className="text-ink">{BASELINE_AS_OF}</strong>. Observed data, calculated
            metrics, proxies and unavailable inputs are kept apart before any scenario arithmetic.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Tag kind="observed">Observed source data</Tag>
            <Tag kind="calculated" />
            <Tag kind="scenario" />
            <Tag kind="currency_gap">Currency gaps</Tag>
          </div>
          <div className="mt-6 flex gap-3 rounded-2xl border border-warn/30 bg-warn-soft p-4 text-sm leading-relaxed text-ink-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p>
              <strong className="text-warn-ink">Not a forecast or a confirmed ROI case. </strong>
              The scenario calculator is editable arithmetic for decision support. Live DSP-case amounts stay in source units
              because their currency is undocumented, and the synthetic EUR case is excluded from official live exposure.
            </p>
          </div>
        </div>
      </Card>

      {/* Section jump nav */}
      <nav aria-label="Analytics sections" className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            className="whitespace-nowrap rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-ink cursor-pointer"
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Summary */}
      <section id="an-summary" className="scroll-mt-36 space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="30-day gross revenue" value="€70.00M" note={`${eur(SUMMARY.grossRevenueEur)} · ${CURRENT_WINDOW}`} kind="observed" />
          <Stat
            label="Publishers with auctions"
            value={int(SUMMARY.publishersWithAuctions)}
            note={`${int(SUMMARY.positiveSpendPublishers)} with spend · ${SUMMARY.zeroSpendPublishers} at zero`}
            kind="observed"
          />
          <Stat label="Top 16 concentration" value={`${SUMMARY.top16SharePct}%`} note="Share of current gross revenue" kind="calculated" />
          <Stat
            label="Amazon DSP pairs cut"
            value={String(SUMMARY.amazonPairsDisconnected)}
            note={`Current snapshot across ${SUMMARY.amazonPartnerCount} Amazon partners`}
            kind="observed"
          />
          <Stat label="Live demo cases" value={int(SUMMARY.liveCaseUnits)} note="Displayed at-risk units · currency unconfirmed" kind="currency_gap" />
          <Stat label="ROI / payback" value="Unavailable" note="Implementation, operating and labour costs missing" kind="scenario" emphasis="muted" />
        </div>

        <Card className="p-6 sm:p-8">
          <SectionHeading icon={<ListChecks className="h-5 w-5" />} eyebrow="For the CFO" title="Executive readout" />
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Callout tone="ok" title="What is supported">
              Equativ SSP gross revenue was €69.999M in the current 30-day window, up 31.11% on the prior window. Auctions were
              essentially flat (−0.09%) while the pooled gross RPMA proxy rose from €0.0047 to €0.0062.
            </Callout>
            <Callout tone="accent" title="Where attention should go">
              The top 16 publishers hold 31.27% of current gross revenue. Seedtag and THUNDER MONETIZATION are the two largest;
              the latest live issue run flags Raptive STR as the largest displayed at-risk case.
            </Callout>
            <Callout tone="warn" title="What is not confirmed">
              The {live.length} live issue amounts total {int(liveTotal)} displayed units, but their currency is undocumented. The
              €18,000 Synthetic Network A amount is a demo proxy and is never combined with live cases.
            </Callout>
            <Callout tone="danger" title="Management implication">
              Do not publish a single recovered-revenue number, ROI, NPV or payback period until currency, implementation cost,
              operating cost, recovery history and loaded labour cost are validated.
            </Callout>
          </div>
        </Card>
      </section>

      {/* Publisher baseline */}
      <Card className="p-6 sm:p-8">
        <div id="an-publishers" className="scroll-mt-36" />
        <SectionHeading
          icon={<BarChart3 className="h-5 w-5" />}
          eyebrow="Publisher baseline"
          title="Current publisher financial baseline"
          description={
            <>
              Equativ SSP overall activity, all deal types including open auction, EUR, UTC. Gross RPMA is a proxy because the
              source exposes no bid-request counts. It is <strong className="text-ink-2">not RPMBr</strong>.
            </>
          }
          aside={
            <div className="flex gap-2">
              <Tag kind="observed" />
              <Tag kind="calculated" />
            </div>
          }
        />

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <TableShell minWidth="560px">
            <thead>
              <tr>
                <Th>Metric</Th>
                <Th right>Prior 30d</Th>
                <Th right>Current 30d</Th>
                <Th right>Change</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PERIOD_COMPARISON.map(row => (
                <tr key={row.metric}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{row.metric}</td>
                  <td className="num px-4 py-3 text-right text-muted">{row.prior}</td>
                  <td className="num px-4 py-3 text-right font-semibold text-ink">{row.current}</td>
                  <td
                    className={cx(
                      'num whitespace-nowrap px-4 py-3 text-right text-xs font-medium',
                      row.trend === 'up' ? 'text-ok-ink' : row.trend === 'down' ? 'text-danger-ink' : 'text-muted',
                    )}
                  >
                    {row.change}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>

          <div className="rounded-2xl border border-line p-5">
            <h3 className="text-sm font-semibold text-ink">Revenue concentration</h3>
            <p className="mt-1 text-xs text-muted">Each segment is one top-16 publisher's share of current gross revenue.</p>
            <div className="mt-5 flex h-6 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Top 16 publishers hold 31.27% of gross revenue">
              {TOP_PUBLISHERS.map((p, i) => (
                <span
                  key={p.id}
                  title={`${p.name}: ${p.sharePct}%`}
                  className="anim-grow-x h-full border-r border-surface bg-accent"
                  style={{ width: `${p.sharePct}%`, opacity: 1 - i * 0.04, animationDelay: `${i * 0.03}s` }}
                />
              ))}
            </div>
            <div className="num mt-2 flex justify-between text-xs text-muted">
              <span>0%</span>
              <span className="font-semibold text-accent-ink">Top 16 · 31.27%</span>
              <span>100%</span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
              {[
                ['Top 1', '3.85%'],
                ['Top 5', '14.49%'],
                ['Top 10', '23.23%'],
                ['Top 16', '31.27%'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k} cumulative</dt>
                  <dd className="num mt-0.5 text-lg font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <h3 className="mt-8 font-semibold text-ink">Top 16 publishers by current gross revenue</h3>
        <div className="mt-3">
          <TableShell minWidth="820px">
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Publisher</Th>
                <Th>Inventory type</Th>
                <Th right>Gross revenue</Th>
                <Th right>Gross RPMA</Th>
                <Th>Share</Th>
                <Th right>Cumulative</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {TOP_PUBLISHERS.map(p => (
                <tr key={p.id} className="transition-colors hover:bg-surface-2">
                  <td className="num px-4 py-3 text-muted">{p.rank}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{p.name}</p>
                    <p className="num text-xs text-muted">#{p.id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={p.type === 'Unmapped' ? 'warn' : 'neutral'}>{p.type}</Badge>
                  </td>
                  <td className="num px-4 py-3 text-right font-semibold text-ink">{eur(p.grossEur)}</td>
                  <td className={cx('num px-4 py-3 text-right', p.rpma > 1 ? 'font-semibold text-warn-ink' : 'text-ink-2')}>
                    {p.rpma.toFixed(4)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(p.sharePct / maxShare) * 100}%` }} />
                      </div>
                      <span className="num text-xs text-ink-2">{p.sharePct.toFixed(2)}%</span>
                    </div>
                  </td>
                  <td className="num px-4 py-3 text-right text-muted">{p.cumulativePct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
        <p className="mt-3 flex gap-2 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Inventory type is a Salesforce account attribute used as a stand-in for seller type, not the sellers.json seller type.
          Equativ 4247 is unmapped and has an outlier RPMA of 3.3281.
        </p>
      </Card>

      {/* DSP issues */}
      <Card className="p-6 sm:p-8">
        <div id="an-issues" className="scroll-mt-36" />
        <SectionHeading
          icon={<Database className="h-5 w-5" />}
          eyebrow="DSP issues"
          eyebrowTone="danger"
          title="DSP issue analytics baseline"
          description="The connection-history source is a current-state snapshot, not a daily series. It has partner, network, status and date fields, but no revenue at risk, currency, case ID, confidence or approval status."
          aside={<Tag kind="observed">Current snapshot</Tag>}
        />
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs font-medium text-muted">Amazon DSP partners</p>
            <p className="num mt-2 text-2xl font-bold text-ink">{ISSUE_SNAPSHOT.amazonPartnerIds.length}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {ISSUE_SNAPSHOT.amazonPartnerIds.map(id => (
                <span key={id} className="num rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
                  #{id}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs font-medium text-muted">Disconnected pairs</p>
            <p className="num mt-2 text-2xl font-bold text-danger">{ISSUE_SNAPSHOT.disconnectedPairs}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-danger"
                style={{ width: `${Math.max(2, (ISSUE_SNAPSHOT.disconnectedPairs / ISSUE_SNAPSHOT.totalPairs) * 100)}%` }}
              />
            </div>
            <p className="num mt-1.5 text-xs text-muted">
              of {int(ISSUE_SNAPSHOT.totalPairs)} current pairs ·{' '}
              {((ISSUE_SNAPSHOT.disconnectedPairs / ISSUE_SNAPSHOT.totalPairs) * 100).toFixed(2)}%
            </p>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs font-medium text-muted">Networks cut since 31 Aug</p>
            <p className="num mt-2 text-2xl font-bold text-ink">{ISSUE_SNAPSHOT.networksSince31Aug}</p>
            <p className="mt-1 text-xs text-muted">{ISSUE_SNAPSHOT.networksWithAdsTxtData} had ads.txt data in the latest 7 days</p>
          </div>
        </div>

        <h3 className="mt-8 font-semibold text-ink">Latest The Pitt run</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          {LIVE_CASES.map(c => (
            <article
              key={c.id}
              className={cx('rounded-2xl border p-5', c.kind === 'synthetic' ? 'border-dashed border-line-strong bg-surface-2/60' : 'border-line')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{c.name}</p>
                  <p className="num text-xs text-muted">#{c.id}</p>
                </div>
                {c.kind === 'live' ? <Tag kind="observed">Live alert view</Tag> : <Tag kind="proxy">Synthetic demo</Tag>}
              </div>
              <p className="num mt-4 text-2xl font-bold text-ink">{c.amountLabel}</p>
              <p className="text-xs text-muted">{c.kind === 'live' ? 'Displayed at risk · currency undocumented' : 'Excluded from the live total'}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {c.checks.map(ch => (
                  <span
                    key={ch.label}
                    className={cx(
                      'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
                      ch.result === 'PASS' ? 'border-ok/25 bg-ok-soft text-ok-ink' : 'border-danger/30 bg-danger-soft text-danger-ink',
                    )}
                  >
                    {ch.result === 'PASS' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {ch.label}
                  </span>
                ))}
              </div>
              <p className="mt-4 border-t border-line pt-3 text-sm leading-relaxed text-ink-2">{c.interpretation}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 flex gap-3 rounded-2xl border border-warn/30 bg-warn-soft p-4 text-sm leading-relaxed text-ink-2">
          <Sigma className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p>
            Live amounts are <strong className="text-warn-ink">displayed units</strong>, not euros: the latest output documents
            the live currency as unavailable. The live total is {int(liveTotal)} units; the synthetic EUR proxy is never added to
            it.
          </p>
        </div>
      </Card>

      {/* Ads.txt */}
      <Card className="p-6 sm:p-8">
        <div id="an-adstxt" className="scroll-mt-36" />
        <SectionHeading
          icon={<FileSearch className="h-5 w-5" />}
          eyebrow="Ads.txt"
          title="Ads.txt diagnostic for the disconnected cohort"
          description="103 of the 104 networks cut since 31 August had data in the 7-day ads.txt model. Results are network-level with no DSP dimension, so they cannot explain why Amazon disconnected a network."
          aside={<Tag kind="observed">7 days · 13–19 Oct · EUR</Tag>}
        />

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {ADS_TXT_LINES.map(l => (
            <div key={l.line} className="rounded-2xl border border-line p-5">
              <div className="flex items-baseline justify-between">
                <p className="font-semibold text-ink">{l.line} line</p>
                <p className="num text-xs text-muted">{l.auctions} auctions</p>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className={cx('num text-3xl font-bold', l.compliancePct >= 70 ? 'text-ok' : 'text-warn')}>
                  {l.compliancePct.toFixed(2)}%
                </span>
                <span className="text-sm text-muted">compliant</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cx('anim-grow-x h-full rounded-full', l.compliancePct >= 70 ? 'bg-ok' : 'bg-warn')}
                  style={{ width: `${l.compliancePct}%` }}
                />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
                <div>
                  <dt className="text-xs text-muted">Network not present</dt>
                  <dd className="num mt-0.5 text-ink">{l.nnpAuctions}</dd>
                  <dd className="num text-xs text-danger-ink">{eur(l.nnpEur)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Not crawled</dt>
                  <dd className="num mt-0.5 text-ink">{l.notCrawledAuctions}</dd>
                  <dd className="num text-xs text-warn-ink">{eur(l.notCrawledEur)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted">Gross revenue in cohort</dt>
                  <dd className="num mt-0.5 font-semibold text-ink">{eur(l.grossEur)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        <p className="mt-5 flex gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          “Not crawled” means the crawler did not retrieve the file. It does not prove a seller line is missing. Sharethrough SSP – Global Supply had no row
          in the window.
        </p>

        <h3 className="mt-8 font-semibold text-ink">Largest STR issue-revenue rows in the cohort</h3>
        <div className="mt-3">
          <TableShell minWidth="760px">
            <thead>
              <tr>
                <Th>Network</Th>
                <Th right>STR gross revenue</Th>
                <Th right>Not present</Th>
                <Th right>Not crawled</Th>
                <Th>STR compliance</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {STR_ISSUE_ROWS.map(r => (
                <tr key={r.id} className="transition-colors hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{r.name}</p>
                    <p className="num text-xs text-muted">#{r.id}</p>
                  </td>
                  <td className="num px-4 py-3 text-right font-semibold text-ink">{eur(r.strGrossEur)}</td>
                  <td className="num px-4 py-3 text-right text-ink-2">{eur(r.nnpEur)}</td>
                  <td className="num px-4 py-3 text-right text-ink-2">{eur(r.notCrawledEur)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={cx('h-full rounded-full', r.compliancePct >= 25 ? 'bg-warn' : 'bg-danger')}
                          style={{ width: `${Math.max(r.compliancePct, 1.5)}%` }}
                        />
                      </div>
                      <span className={cx('num text-xs', r.compliancePct === 0 ? 'font-semibold text-danger-ink' : 'text-ink-2')}>
                        {r.compliancePct.toFixed(2)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      </Card>

      <ScenarioModel />

      {/* SQL */}
      <Card className="p-6 sm:p-8">
        <div id="an-sql" className="scroll-mt-36" />
        <SectionHeading
          icon={<Database className="h-5 w-5" />}
          eyebrow="SQL appendix"
          title="Queries behind the baseline"
          description="Generated and executed through the connected Snowflake semantic models."
          aside={<Tag kind="calculated">Reproducible</Tag>}
        />
        <div className="mt-6 space-y-3">
          {SQL_APPENDIX.map((q, i) => (
            <details key={q.title} open={i === 0} className="group rounded-2xl border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                <span className="font-medium text-ink">{q.title}</span>
                <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-line px-5 pb-5 pt-4">
                <div className="mb-2 flex justify-end">
                  <CopyButton text={q.sql} label="Copy SQL" />
                </div>
                <pre className="num overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-200">{q.sql}</pre>
              </div>
            </details>
          ))}
        </div>
      </Card>

      {/* Limitations */}
      <Card className="p-6 sm:p-8">
        <div id="an-limits" className="scroll-mt-36" />
        <SectionHeading
          icon={<ShieldAlert className="h-5 w-5" />}
          eyebrow="Limitations"
          eyebrowTone="warn"
          title="Data quality, missing metrics and next inputs"
        />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            {[
              {
                kind: 'observed' as const,
                title: 'Validated and observed',
                body: '€69.999M current 30-day gross revenue, 1,524 publishers with auctions, 315 disconnected Amazon DSP pairs, 104 networks in the post-31-Aug cohort, and the latest 3 live issue cases with their displayed amounts.',
              },
              {
                kind: 'calculated' as const,
                title: 'Calculated',
                body: 'Top-16 share, period deltas, pooled and median gross RPMA, ads.txt compliance rates, and scenario arithmetic.',
              },
              {
                kind: 'proxy' as const,
                title: 'Proxy or synthetic',
                body: 'Gross RPMA is not RPMBr. The €18,000 Synthetic Network A amount is a gross exchange-price proxy in a demo scenario.',
              },
            ].map(b => (
              <div key={b.title}>
                <div className="flex items-center gap-2">
                  <Tag kind={b.kind} />
                  <h3 className="text-sm font-semibold text-ink">{b.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{b.body}</p>
              </div>
            ))}
          </div>
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-ink">Missing before a CFO ROI</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  'Live revenue currency',
                  'Implementation cost',
                  'Operating cost',
                  'Loaded labour rate',
                  'Investigation-time baseline',
                  'Historical recovery rate',
                  'Time to detection & recovery',
                  'Confirmed RPMBr definition',
                  'Deduplicated issue register',
                ].map(m => (
                  <span key={m} className="rounded-lg border border-dashed border-line-strong px-2.5 py-1 text-xs text-ink-2">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink">Next actions</h3>
              <ol className="mt-3 space-y-3">
                {[
                  'Normalise live case currency and reconcile each case to an official Snowflake revenue field.',
                  'Confirm whether the 104-network ads.txt cohort is the intended financial population.',
                  'Capture TechOps hours and loaded cost.',
                  'Validate thresholds and recovery outcomes on past disconnections.',
                  'Only then publish a currency-normalised benefit case.',
                ].map((s, i) => (
                  <li key={s} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                    <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
        <p className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-muted">
          <strong className="font-semibold text-ink-2">Sources: </strong>
          {SOURCES} Forecasts, definitive ROI, NPV, payback and cross-currency totals are excluded where inputs are not validated.
        </p>
      </Card>
    </div>
  );
};
