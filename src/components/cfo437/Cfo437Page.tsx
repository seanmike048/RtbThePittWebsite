import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Globe2 } from 'lucide-react';
import {
  type AssumptionId,
  type AssumptionSet,
  defaultAssumptions,
  editAssumption,
  SCENARIO_IDS,
  type ScenarioId,
} from '../../lib/cfo437/assumptions.ts';
import { CURRENCY_WARNING, SCOPE, VISIBLE_VIEW } from '../../lib/cfo437/baseline.ts';
import type { EligibleMode, OverlapStatus } from '../../lib/cfo437/model.ts';
import { aggregate, isVisible, type PublisherRow, WORKBOOK_ROWS } from '../../lib/cfo437/publishers.ts';
import { runScenario } from '../../lib/cfo437/scenario.ts';
import { Analytics } from '../Analytics.tsx';
import { Card } from '../ui.tsx';
import { AssumptionsAppendix, DataQuality, SqlAppendix } from './AppendixSections.tsx';
import { Concentration, EndpointBaseline, ExecutiveSummary, ScopeAndFreshness, ScopeBadge } from './BaselineSections.tsx';
import { FasterDetection, Horizons, HumanTime, RoiAvailability, Scenarios, Sensitivity, SpendImpact } from './ImpactSections.tsx';
import { ImportRowsModal, PublisherPrioritization, type RowIssue } from './PublisherSection.tsx';
import { Notice } from './shared.tsx';

const SECTIONS = [
  ['c4-summary', 'Summary'],
  ['c4-scope', 'Scope'],
  ['c4-baseline', 'Baseline'],
  ['c4-concentration', 'Concentration'],
  ['c4-priority', 'Prioritization'],
  ['c4-impact', 'Spend impact'],
  ['c4-detection', 'Detection'],
  ['c4-time', 'Time saved'],
  ['c4-scenarios', 'Scenarios'],
  ['c4-horizons', 'Horizons'],
  ['c4-sensitivity', 'Sensitivity'],
  ['c4-roi', 'ROI'],
  ['c4-quality', 'Data quality'],
  ['c4-sql', 'SQL'],
  ['c4-assumptions', 'Assumptions'],
  ['c4-context', 'SSP context'],
] as const;

export const Cfo437Page: React.FC = () => {
  const [sets, setSets] = useState<Record<ScenarioId, AssumptionSet>>(() =>
    Object.fromEntries(SCENARIO_IDS.map(s => [s, defaultAssumptions(s)])) as Record<ScenarioId, AssumptionSet>,
  );
  const [active, setActive] = useState<ScenarioId>('base');
  const [mode, setMode] = useState<EligibleMode>('validated');
  const [overlap, setOverlap] = useState<OverlapStatus>('potential_overlap');
  const [overlapConfirmed, setOverlapConfirmed] = useState(false);
  const [currencyValidated, setCurrencyValidated] = useState(false);
  const [currencyCode, setCurrencyCode] = useState('');
  const [rows, setRows] = useState<PublisherRow[]>(WORKBOOK_ROWS);
  const [issues, setIssues] = useState<Record<string, RowIssue>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  const edit = useCallback((s: ScenarioId, id: AssumptionId, v: number | null) => {
    const today = new Date().toISOString().slice(0, 10);
    setSets(prev => ({ ...prev, [s]: { ...prev[s], [id]: editAssumption(prev[s][id], v, today) } }));
  }, []);

  const visibleRows = useMemo(() => rows.filter(isVisible), [rows]);
  const agg = useMemo(() => (rows.length ? aggregate(visibleRows) : null), [rows, visibleRows]);
  const aggAll = useMemo(() => (rows.length ? aggregate(rows) : null), [rows]);
  const top16 = useMemo(
    () => [...visibleRows].sort((a, b) => b.spend - a.spend).slice(0, 16).map(r => ({ name: r.publisherName || `#${r.publisherId}`, spend: r.spend })),
    [visibleRows],
  );
  const subset = useMemo(() => {
    if (!selected.size) return null;
    const chosen = visibleRows.filter(r => selected.has(r.publisherId));
    return {
      spend: chosen.reduce((s, r) => s + r.spend, 0),
      bidRequests: chosen.reduce((s, r) => s + r.bidRequests, 0),
      publishers: chosen.length,
    };
  }, [selected, visibleRows]);

  const ctx = { mode, subset, overlap, currencyValidated };
  const outs = useMemo(
    () => Object.fromEntries(SCENARIO_IDS.map(s => [s, runScenario(sets[s], ctx)])) as Record<ScenarioId, ReturnType<typeof runScenario>>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sets, mode, subset, overlap, currencyValidated],
  );

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const shared = { scenario: active, onScenario: setActive, a: sets[active], out: outs[active], edit };

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-500/15 via-indigo-500/10 to-transparent blur-2xl"
        />
        <div className="relative">
          <ScopeBadge />
          <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-ink [text-wrap:balance] sm:text-4xl">
            CFO impact & scenario analysis
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink-2">
            What resolving issues faster on Amazon DSP endpoint {SCOPE.endpointId} could be worth, built only from the validated
            {' '}{SCOPE.period} workbook baseline and assumptions you can see and edit.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Notice tone="warn" icon={<AlertTriangle className="h-4 w-4 text-warn" />}>
              <strong>Scenario arithmetic, not a forecast. </strong>
              Impact figures are “scenario recovered spend”, never confirmed recovered revenue.
            </Notice>
            <Notice tone="danger" icon={<AlertTriangle className="h-4 w-4 text-danger" />}>
              <strong>{CURRENCY_WARNING} </strong>
              Spend is in source currency units (SCU): {VISIBLE_VIEW.rows} visible rows, {VISIBLE_VIEW.positiveRows} with spend,{' '}
              {VISIBLE_VIEW.zeroRows} without.
            </Notice>
          </div>
        </div>
      </Card>

      <nav aria-label="CFO analysis sections" className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => jump(id)}
            className="whitespace-nowrap rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-ink cursor-pointer"
          >
            {label}
          </button>
        ))}
      </nav>

      <ExecutiveSummary currencyValidated={currencyValidated} />
      <ScopeAndFreshness
        currencyValidated={currencyValidated}
        onCurrencyValidated={setCurrencyValidated}
        currencyCode={currencyCode}
        onCurrencyCode={setCurrencyCode}
      />
      <EndpointBaseline agg={agg} aggAll={aggAll} />
      <Concentration agg={agg} top={top16} />
      <PublisherPrioritization
        rows={visibleRows}
        issues={issues}
        onIssue={(id, v) => setIssues(prev => ({ ...prev, [id]: v }))}
        selected={selected}
        onToggle={id =>
          setSelected(prev => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
          })
        }
        onOpenImport={() => setImportOpen(true)}
        validatedExposure={sets[active].eligibleSpend.value}
      />
      <SpendImpact
        {...shared}
        mode={mode}
        onMode={setMode}
        hasRows={rows.length > 0}
        subsetCount={selected.size}
        overlap={overlap}
        onOverlap={setOverlap}
        overlapConfirmed={overlapConfirmed}
        onOverlapConfirmed={setOverlapConfirmed}
        currencyValidated={currencyValidated}
      />
      <FasterDetection {...shared} />
      <HumanTime {...shared} />
      <Scenarios sets={sets} outs={outs} active={active} onActive={setActive} />
      <Horizons scenario={active} onScenario={setActive} out={outs[active]} currencyValidated={currencyValidated} />
      <Sensitivity scenario={active} onScenario={setActive} a={sets[active]} out={outs[active]} />
      <RoiAvailability outs={outs} />
      <DataQuality />
      <SqlAppendix />
      <AssumptionsAppendix sets={sets} edit={edit} />

      <div id="c4-context" className="scroll-mt-36">
        <details className="group rounded-2xl border border-dashed border-line-strong bg-surface-2/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-5 [&::-webkit-details-marker]:hidden">
            <span className="flex items-start gap-3">
              <Globe2 className="mt-0.5 h-5 w-5 text-muted" />
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">SSP-wide context · not endpoint 437</span>
                <span className="mt-1 block font-semibold text-ink">Equativ SSP baseline, DSP issues and ads.txt (EUR, Sep 20 – Oct 19)</span>
                <span className="mt-0.5 block text-sm text-muted">
                  Kept for lineage. Different scope and currency, so never used in the endpoint-437 calculations above.
                </span>
              </span>
            </span>
            <ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-line p-4 sm:p-6">
            <Analytics />
          </div>
        </details>
      </div>

      <ImportRowsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onLoad={r => {
          setRows(r);
          setSelected(new Set());
        }}
      />
    </div>
  );
};
