/**
 * Financial impact workspace for the endpoint-437 Display portfolio. Every figure is classified (measured, calculated,
 * scenario, unavailable) and sourced.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown, HeartPulse, RefreshCw } from 'lucide-react';
import { blankScenario, buildExport, illustrative, loadSaved, saveAll, SCENARIO_NAMES, type SavedScenario } from '../../lib/finance/assumptions.ts';
import { AVAILABILITY, HEALTH } from '../../lib/finance/availability.ts';
import { CASE_SNAPSHOT, PORTFOLIO_DAILY, toPortfolioDaily, type PortfolioDay } from '../../lib/finance/baseline.ts';
import { currencyBadge, WAREHOUSE_SPEND } from '../../lib/finance/currency.ts';
import { effortSummary, EFFORT_TASKS } from '../../lib/finance/effort.ts';
import { SQL_PORTFOLIO_DAILY, toPortfolioRaw } from '../../lib/finance/live.ts';
import { mergeRefresh, SNAPSHOT_VERSION } from '../../lib/finance/provenance.ts';
import { BASELINE_437_SEP, QUERY_LOG } from '../../lib/finance/snapshot.data.ts';
import { showVal, type Val } from '../../lib/finance/values.ts';
import { describeError, nowStamp, useSnowflake } from '../live/useSnowflake.ts';
import { Badge, Button, Card, cx, Modal, TableShell, Th } from '../ui.tsx';
import { AssumptionsPanel } from './AssumptionsPanel.tsx';
import { ClassBadge, SourceDrawer, type Classification } from './charts.tsx';
import { buildModel, type HorizonKey } from './model.ts';
import {
  CashFlowSection,
  CumulativeIncremental,
  EffortByTask,
  Funnel,
  money,
  OutcomeValidation,
  Pareto,
  PeriodComparison,
  SCU,
  scenarioClass,
  Section,
  Sensitivity,
  SpendAfterResolution,
  VolumeYield,
} from './sections.tsx';

/** The page covers the 437 Display portfolio only. Queries and datasets that served the retired #5100 case stay out of the appendix. */
const scope = 'portfolio' as const;
const CASE_ONLY_QUERIES = new Set(['episodes5100', 'seatDaily5100', 'networkDaily', 'preCutWindow', 'supplyDaily']);
const PORTFOLIO_QUERIES = QUERY_LOG.filter(q => !CASE_ONLY_QUERIES.has(q.key));
const PORTFOLIO_AVAILABILITY = AVAILABILITY.filter(r => r.dataset !== 'Related supply paths');

const initialScenarios = (): SavedScenario[] => {
  const saved = loadSaved();
  return SCENARIO_NAMES.map(n => saved.find(s => s.scope === scope && s.name === n) ?? blankScenario(scope, n));
};

/* ------------------------------------------------------------- executive card */

const Exec: React.FC<{ label: string; value: Val; format: (n: number) => string; unit: string; c: Classification; note: React.ReactNode; source: string }> = ({ label, value, format, unit, c, note, source }) => {
  const unavailable = value.kind === 'unavailable' || value.kind === 'missing';
  return (
    <Card as="div" className="flex min-w-0 flex-col p-4">
      <p className="text-xs font-medium leading-snug text-muted">{label}</p>
      <div className="mt-1.5">
        <ClassBadge c={unavailable ? 'Unavailable' : c} />
      </div>
      <p className={cx('mt-2', unavailable ? 'text-sm italic text-muted' : 'num text-xl font-semibold text-ink')}>
        {showVal(value, format)}
        {!unavailable && value.kind !== 'excluded' && <span className="ml-1 font-sans text-xs font-normal text-muted">{unit}</span>}
      </p>
      <p className="mt-1 flex-1 text-[11px] leading-snug text-muted [overflow-wrap:anywhere]">
        {value.kind === 'unavailable' || value.kind === 'excluded' || value.kind === 'missing' ? value.reason : note}
      </p>
      <p className="num mt-2 truncate text-[10px] text-faint" title={source}>
        {source}
      </p>
    </Card>
  );
};

/* ------------------------------------------------------------- page */

export const FinancePage: React.FC = () => {
  const [scenarios, setScenarios] = useState<SavedScenario[]>(initialScenarios);
  const [active, setActive] = useState<SavedScenario['name']>('Base case');
  const [horizon, setHorizon] = useState<HorizonKey>('30d');
  const [manualDate, setManualDate] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [healthOpen, setHealthOpen] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [portfolio, setPortfolio] = useState<{ data: PortfolioDay[]; source: 'snapshot' | 'live'; asOf: string; lastError: string | null }>({ data: PORTFOLIO_DAILY, source: 'snapshot', asOf: '2026-10-21 01:59 UTC', lastError: null });
  const [loading, setLoading] = useState(false);
  const sf = useSnowflake();

  // Keep the assumptions panel below the sticky header + scope bar.
  useEffect(() => {
    const set = () => document.documentElement.style.setProperty('--scope-top', `${document.querySelector('header')?.getBoundingClientRect().height ?? 108}px`);
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);

  const list = scenarios;
  const scenario = list.find(s => s.name === active)!;
  const update = (s: SavedScenario) => {
    setScenarios(prev => prev.map(x => (x.name === s.name ? s : x)));
    setSaveState('idle');
  };

  const vm = useMemo(
    // The model's case branch is not used here; CASE_SNAPSHOT only satisfies its signature.
    () => buildModel({ scope, scenario, horizon, portfolio: portfolio.data, caseData: CASE_SNAPSHOT, manualResolutionDate: manualDate }),
    [scenario, horizon, portfolio.data, manualDate],
  );
  const ok = vm.result?.status === 'ok';
  const total = vm.totals?.find(t => t.key === horizon) ?? null;
  const sClass = scenarioClass(scenario.meta.approval, ok);
  const hours = effortSummary(EFFORT_TASKS).total;

  const refresh = async () => {
    setLoading(true);
    const at = nowStamp();
    try {
      const rows = await sf.query(SQL_PORTFOLIO_DAILY);
      setPortfolio(p => ({ ...mergeRefresh(p, { ok: true, data: toPortfolioDaily(toPortfolioRaw(rows)), asOf: at }) }));
    } catch (e) {
      setPortfolio(p => ({ ...mergeRefresh(p, { ok: false, error: e instanceof Error ? e.message : describeError(e) }) }));
    }
    setLoading(false);
  };

  /** In claude.ai the file goes through the `downloads` capability (the viewer confirms); elsewhere a plain browser download. */
  const exportAssumptions = async () => {
    const bundle = buildExport(scenarios, new Date().toISOString());
    const filename = `pitt-scenario-assumptions-${new Date().toISOString().slice(0, 10)}.json`;
    const text = JSON.stringify(bundle, null, 2);
    const use = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude?.use;
    const downloads = use ? ((await use('downloads').catch(() => null)) as { save: (r: { filename: string; data: string }) => Promise<unknown> } | null) : null;
    if (downloads) {
      try {
        await downloads.save({ filename, data: text });
        setExportState('saved');
      } catch (e) {
        setExportState((e as { code?: string })?.code === 'declined' ? 'idle' : 'failed');
      }
      return;
    }
    if (use) {
      setExportState('failed');
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportState('saved');
  };

  const data = portfolio;
  const blocking = HEALTH.filter(h => h.severity === 'blocking' && h.scope !== 'case');
  const advisory = HEALTH.filter(h => h.severity === 'advisory' && h.scope !== 'case');

  /* ---------- executive values ---------- */
  const last28 = portfolio.data.slice(-28);
  const observed: Val = { kind: 'value', v: last28.reduce((a, d) => a + (d.spend ?? 0), 0) };

  return (
    <div className="space-y-6">
      {/* Sticky scope bar */}
      <div className="sticky z-30 -mx-4 border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" style={{ top: 'var(--scope-top, 108px)' }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-semibold text-ink">Portfolio · 437 Display</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="hidden sm:inline-flex">
              <Badge tone="warn" dot>
                {currencyBadge(WAREHOUSE_SPEND)}
              </Badge>
            </span>
            <span className="inline-flex sm:hidden">
              <Badge tone="warn" dot>
                SCU · not validated
              </Badge>
            </span>
            <span className="hidden lg:inline-flex">
              <Badge tone={data.source === 'live' ? 'ok' : 'neutral'} dot>
                {data.source === 'live' ? `Live · ${data.asOf}` : `Snapshot · ${data.asOf}`}
              </Badge>
            </span>
            <Button size="sm" onClick={() => setHealthOpen(true)}>
              <HeartPulse className="h-3.5 w-3.5" /> Data health
              <span className="num rounded-full bg-danger-soft px-1.5 text-[10px] text-danger-ink">{blocking.length}</span>
            </Button>
          </div>
          <dl className="hidden w-full flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted md:flex">
            {[
              ['DSP', 'Amazon DSP'],
              ['Endpoint', '437 AMER Display B'],
              ['Format', 'Banner (impression type 0)'],
              ['Geo', 'Americas'],
              ['Networks', 'Visible BOTH + INTERMEDIARY'],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="inline font-medium text-ink-2">{k} </dt>
                <dd className="inline [overflow-wrap:anywhere]">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="w-full truncate text-[11px] text-muted md:hidden">Amazon DSP · 437 AMER Display B · Banner · visible networks</p>
        </div>
      </div>

      {/* Title */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">Financial impact</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">What resolving an eligible issue is worth, and what is still unknown</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
            Observed data comes from Snowflake. Scenarios run only on inputs you enter or on clearly labelled illustrative values. Nothing here is Finance-approved, and amounts are in
            source currency units.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" onClick={refresh} disabled={!sf.available || loading} title={sf.available ? 'Re-read the daily series from Snowflake' : 'Disconnected'}>
            <RefreshCw className={cx('h-3.5 w-3.5', loading && 'animate-spin motion-reduce:animate-none')} /> {loading ? 'Refreshing…' : 'Refresh daily series'}
          </Button>
          <p className="max-w-xs text-right text-[11px] text-muted">
            {sf.available === undefined
              ? 'Checking for a Snowflake connector…'
              : sf.available
                ? 'Three fixed read-only queries through your Snowflake connector.'
                : `Disconnected: no Snowflake connector in this view. Showing the ${SNAPSHOT_VERSION} snapshot.`}
          </p>
          {data.lastError && (
            <p className="max-w-xs text-right text-[11px] text-danger-ink" role="alert">
              Refresh failed: {data.lastError} The previous data is kept.
            </p>
          )}
        </div>
      </div>

      {/* Evidence strip */}
      <div className="flex flex-wrap gap-2" aria-label="Evidence status">
        <Badge tone={data.source === 'live' ? 'ok' : 'neutral'} dot>
          {data.source === 'live' ? 'Live data' : 'Snapshot data'} · no synthetic rows
        </Badge>
        <Badge tone="info" dot>
          Activity: verified source records
        </Badge>
        <Badge tone="ok" dot>
          Current · data through {vm.dataThrough}
        </Badge>
      </div>

      {/* Executive row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Exec
          label="Observed spend · last 28 days"
          value={observed}
          format={money}
          unit={SCU}
          c="Measured"
          note={`${last28[0].day} → ${last28[last28.length - 1].day}. September 2026 workbook view: ${money(BASELINE_437_SEP.spend)}.`}
          source="DAY_SCO_NODES · 01c7de57…040e"
        />
        <Exec
          label={`Conditional spend after resolution · ${vm.horizonDays} days`}
          value={total?.S1 ?? { kind: 'unavailable', reason: vm.result?.status === 'unavailable' ? `Pending validation: ${[...vm.result.missing, ...vm.result.errors].slice(0, 2).join('; ')}${vm.result.missing.length + vm.result.errors.length > 2 ? '…' : ''}` : 'Needs scenario inputs.', needs: [] }}
          format={money}
          unit={SCU}
          c={sClass}
          note="If an approved fix succeeds (before p)."
          source={`Scenario · ${scenario.name}`}
        />
        <Exec
          label="Expected incremental spend vs no intervention"
          value={total?.expectedIncremental ?? { kind: 'unavailable', reason: 'Needs a complete scenario.', needs: [] }}
          format={money}
          unit={SCU}
          c={sClass}
          note={
            vm.acceleration.kind === 'value' || vm.acceleration.kind === 'negative' || vm.acceleration.kind === 'zero'
              ? `Of which faster resolution vs the manual date: ${showVal(vm.acceleration, money)} ${SCU} (already included).`
              : `p applied once. Faster-resolution share: ${vm.acceleration.kind === 'unavailable' ? vm.acceleration.reason : '—'}`
          }
          source={`Σ p × (S1 − S0) · ${scenario.name}`}
        />
        <Exec
          label="RPMBr change"
          value={vm.rpmbrChange}
          format={n => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`}
          unit={`${SCU} / 1M bid requests`}
          c={sClass}
          note="Pooled, conditional on success, horizon window. Signed."
          source="Σ S ÷ Σ B × 1,000,000"
        />
        <Exec label="Net human hours released" value={hours} format={n => n.toFixed(1)} unit="hours" c="Unavailable" note="" source="No effort source" />
      </div>

      {/* Primary chart + assumptions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <SpendAfterResolution vm={vm} approval={scenario.meta.approval} />
          <CumulativeIncremental vm={vm} approval={scenario.meta.approval} />
        </div>
        <AssumptionsPanel
          scope={scope}
          scenarios={list}
          active={active}
          onActive={setActive}
          onInputs={inputs => update({ ...scenario, inputs, meta: { ...scenario.meta, approval: scenario.meta.approval === 'blank' ? 'user-entered' : scenario.meta.approval === 'illustrative' ? 'user-entered' : scenario.meta.approval } })}
          onOwner={(owner, source) => update({ ...scenario, meta: { ...scenario.meta, owner, source } })}
          onIllustrative={() =>
            setScenarios(SCENARIO_NAMES.map(n => illustrative(scope, n, { meanBidRequests: vm.meanBidRequests, firstProjectedDay: vm.firstProjectedDay, preCutDailySpend: vm.preCutDailySpend })))
          }
          onReset={() => setScenarios(SCENARIO_NAMES.map(n => blankScenario(scope, n)))}
          onSave={() => setSaveState(saveAll(scenarios) ? 'saved' : 'failed')}
          saveState={saveState}
          onExport={exportAssumptions}
          exportState={exportState}
          horizon={horizon}
          onHorizon={setHorizon}
          manualDate={manualDate}
          onManualDate={setManualDate}
          result={vm.result}
          firstProjectedDay={vm.firstProjectedDay}
        />
      </div>

      <Section eyebrow="Attribution" title="Where the change comes from">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <VolumeYield vm={vm} approval={scenario.meta.approval} mode={scenario.inputs.mode} />
          <PeriodComparison vm={vm} portfolio={portfolio.data} caseData={CASE_SNAPSHOT} approval={scenario.meta.approval} />
        </div>
      </Section>

      <Section eyebrow="Operations" title="Effort behind each investigation">
        <div className="grid grid-cols-1 gap-6">
          <EffortByTask />
        </div>
      </Section>

      <Section eyebrow="Context" title="Funnel and concentration">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Funnel />
          <Pareto />
        </div>
      </Section>

      <Section eyebrow="Finance" title="Sensitivity and cash flow">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Sensitivity vm={vm} inputs={scenario.inputs} approval={scenario.meta.approval} />
          <CashFlowSection vm={vm} />
        </div>
      </Section>

      <Section eyebrow="Validation" title="Outcomes">
        <OutcomeValidation />
      </Section>

      <Section eyebrow="Appendix" title="Evidence, data and method">
        <Appendix />
      </Section>

      <Modal open={healthOpen} onClose={() => setHealthOpen(false)} title="Data health" subtitle={`${blocking.length} blocking · ${advisory.length} advisory · portfolio scope`} icon={<HeartPulse className="h-5 w-5" />} size="lg">
        <div className="space-y-5 p-5">
          {[
            { title: 'Blocking', items: blocking, icon: <AlertTriangle className="h-4 w-4 text-danger" /> },
            { title: 'Advisory', items: advisory, icon: <Activity className="h-4 w-4 text-warn" /> },
          ].map(g => (
            <div key={g.title}>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                {g.icon} {g.title}
              </p>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                {g.items.map(h => (
                  <li key={h.title} className="px-4 py-3">
                    <p className="text-sm font-medium text-ink">{h.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{h.detail}</p>
                    <p className="mt-1 text-[11px] text-ink-2">
                      <span className="font-medium">Blocks:</span> {h.blocks}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-muted">Partial results stay visible: a missing currency disables monetary aggregation but keeps the investigation history and the observed activity.</p>
        </div>
      </Modal>
    </div>
  );
};

/* ------------------------------------------------------------- appendix */

const Collapsible: React.FC<{ title: string; children: React.ReactNode; count?: string }> = ({ title, children, count }) => (
  <details className="group rounded-2xl border border-line bg-surface shadow-card">
    <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
      <span className="text-sm font-semibold text-ink">
        {title} {count && <span className="num ml-1 text-xs font-normal text-muted">{count}</span>}
      </span>
      <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
    </summary>
    <div className="border-t border-line px-5 py-4">{children}</div>
  </details>
);

const Appendix: React.FC = () => {
  return (
    <div className="space-y-3">
      <Collapsible title="Data availability matrix" count={`${PORTFOLIO_AVAILABILITY.length} datasets`}>
        <TableShell minWidth="1400px">
          <thead>
            <tr>
              {['Dataset', 'Status', 'Verified source', 'Grain', 'Coverage', 'Freshness', 'Timezone', 'Unit', 'Currency', 'Permissions', 'Missing', 'Enables'].map(h => (
                <Th key={h}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {PORTFOLIO_AVAILABILITY.map(r => (
              <tr key={r.dataset} className="align-top text-xs">
                <td className="px-4 py-2 font-medium text-ink">{r.dataset}</td>
                <td className="px-4 py-2">
                  <Badge tone={r.status === 'available' ? 'ok' : r.status === 'partial' ? 'warn' : 'neutral'}>{r.status}</Badge>
                </td>
                {[r.source, r.grain, r.coverage, r.freshness, r.timezone, r.unit, r.currency, r.permissions, r.missing, r.enables].map((v, i) => (
                  <td key={i} className="px-4 py-2 text-ink-2 [overflow-wrap:anywhere]">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </TableShell>
      </Collapsible>

      <Collapsible title="Executed SQL and provenance" count={`${PORTFOLIO_QUERIES.filter(q => q.status === 'ok').length} executed · ${PORTFOLIO_QUERIES.filter(q => q.status === 'failed').length} failed`}>
        <p className="mb-3 text-xs text-muted">
          Query files live in <span className="num">sql/01 … 10</span>; unexecuted statements there are labelled TEMPLATE. Failures are listed as failures, never as empty results.
        </p>
        <SourceDrawer queries={PORTFOLIO_QUERIES} />
      </Collapsible>

      <Collapsible title="Methodology and limitations">
        <div className="grid gap-4 text-xs leading-relaxed text-ink-2 md:grid-cols-2">
          <div className="space-y-2">
            <p className="font-semibold text-ink">Definitions</p>
            <p>RPMBr = spend ÷ bid requests × 1,000,000 (spend per 1M bid requests), as in the workbook. Pooled RPMBr is Σ spend ÷ Σ bid requests, never a mean of row yields. A zero denominator is unavailable.</p>
            <p>Historical pre-incident spend is observed spend, not confirmed lost revenue. Conditional spend assumes an approved fix succeeds; expected spend weights it by one success probability p. Incremental spend is expected minus no intervention at the same scope and dates.</p>
            <p>Gross buyer spend is not Equativ net revenue or profit. Released capacity is time, not cash.</p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-ink">Model</p>
            <p>
              Daily: S0 = B0 × Y0 / 1e6; B1 = B0 + q × max(Btarget − B0, 0) × r; S1 = B1 × Y1 / 1e6; E = S0 + p × (S1 − S0). One mode per scenario, never both.
            </p>
            <p>The no-intervention line is a run rate (same-weekday mean of the last 28 days), not a forecast; retention is about 44 days, so 90 pre-incident days and prediction intervals are not available. Scenario ranges are not confidence intervals.</p>
            <p>Faster-resolution value runs the same model with two resolution dates and is reported as part of the expected incremental, never added to it.</p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <p className="font-semibold text-ink">Not concluded</p>
            <p>
              The currency of every amount, and whether any reconnection was an authorized fix. These need the owners and sources listed in the data-health drawer.
            </p>
          </div>
        </div>
      </Collapsible>
    </div>
  );
};

