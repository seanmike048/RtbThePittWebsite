import React, { useEffect, useState } from 'react';
import { Download, FlaskConical, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { INPUT_META, SCENARIO_NAMES, type InputMeta, type SavedScenario, type ScopeKey } from '../../lib/finance/assumptions.ts';
import type { ScenarioInputs, ScenarioResult } from '../../lib/finance/scenario.ts';
import { Badge, Button, Card, cx, SegmentedControl } from '../ui.tsx';
import { HORIZONS } from '../../lib/finance/scenario.ts';
import type { HorizonKey } from './model.ts';

const APPROVAL_TONE = { blank: 'neutral', illustrative: 'warn', 'user-entered': 'accent', approved: 'ok' } as const;
const APPROVAL_LABEL = { blank: 'Blank', illustrative: 'Illustrative · not approved', 'user-entered': 'User-entered · pending validation', approved: 'Approved' } as const;

const NumberField: React.FC<{ meta: InputMeta; value: number | null; onChange: (v: number | null) => void; id: string }> = ({ meta, value, onChange, id }) => {
  const shown = (v: number | null) => (v === null ? '' : meta.percent ? String(Math.round(v * 10000) / 100) : String(v));
  const [text, setText] = useState(shown(value));
  useEffect(() => setText(shown(value)), [value]);
  const lo = meta.percent ? 0 : meta.min;
  const hi = meta.percent ? 100 : meta.max;
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-xs font-medium text-ink-2">
        <span>{meta.label}</span>
        <span className="font-normal text-muted">{meta.percent ? '%' : meta.unit}</span>
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={text}
        placeholder="Blank"
        aria-describedby={`${id}-help`}
        onChange={e => {
          setText(e.target.value);
          const raw = e.target.value.trim().replace(/,/g, '');
          if (raw === '') return onChange(null);
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(meta.percent ? n / 100 : n);
        }}
        className="num mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:font-sans placeholder:italic placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <p id={`${id}-help`} className="mt-0.5 text-[11px] leading-snug text-muted">
        {meta.help} Range {lo.toLocaleString('en-US')}–{hi.toLocaleString('en-US')}.
      </p>
    </div>
  );
};

export const AssumptionsPanel: React.FC<{
  scope: ScopeKey;
  scenarios: SavedScenario[];
  active: SavedScenario['name'];
  onActive: (n: SavedScenario['name']) => void;
  onInputs: (inputs: ScenarioInputs) => void;
  onOwner: (owner: string, source: string) => void;
  onIllustrative: () => void;
  onReset: () => void;
  onSave: () => void;
  saveState: 'idle' | 'saved' | 'failed';
  onExport: () => void;
  exportState: 'idle' | 'saved' | 'failed';
  horizon: HorizonKey;
  onHorizon: (h: HorizonKey) => void;
  manualDate: string | null;
  onManualDate: (d: string | null) => void;
  result: ScenarioResult | null;
  firstProjectedDay: string;
}> = p => {
  const sc = p.scenarios.find(s => s.name === p.active)!;
  const set = <K extends keyof ScenarioInputs>(k: K, v: ScenarioInputs[K]) => p.onInputs({ ...sc.inputs, [k]: v });
  const fields = INPUT_META.filter(m => m.modes.includes(sc.inputs.mode));
  const problems = p.result?.status === 'unavailable' ? p.result : null;

  return (
    <Card className="p-5 lg:sticky lg:top-[calc(var(--scope-top,7rem)+4.5rem)] lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-ink">Assumptions</h3>
        </div>
        <Badge tone={APPROVAL_TONE[sc.meta.approval]} dot>
          {APPROVAL_LABEL[sc.meta.approval]}
        </Badge>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Inputs start blank. Every value needs a source and an owner; saving here is not Finance approval.
      </p>

      <div className="mt-3">
        <SegmentedControl<SavedScenario['name']> value={p.active} onChange={p.onActive} ariaLabel="Scenario" options={SCENARIO_NAMES.map(n => ({ value: n, label: n }))} />
      </div>

      <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
        Mode: <strong>{sc.inputs.mode === 'spend-gap' ? 'Spend gap' : 'Volume and yield'}</strong>
        <span className="block text-muted">
          {sc.inputs.mode === 'spend-gap'
            ? 'Only a spend comparator exists for this case; volume / yield attribution is disabled.'
            : 'Bid requests and yield are modelled separately and reconcile exactly.'}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="fa-res" className="text-xs font-medium text-ink-2">
            Proposed resolution date
          </label>
          <input
            id="fa-res"
            type="date"
            min={p.firstProjectedDay}
            value={sc.inputs.resolutionDate ?? ''}
            onChange={e => set('resolutionDate', e.target.value || null)}
            className="num mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
          />
          <p className="mt-0.5 text-[11px] text-muted">On or after {p.firstProjectedDay}; observed days stay actuals.</p>
        </div>
        {fields.map(m => (
          <NumberField key={`${p.scope}-${p.active}-${m.key}`} id={`fa-${m.key}`} meta={m} value={sc.inputs[m.key] as number | null} onChange={v => set(m.key, v as never)} />
        ))}
        <div>
          <label htmlFor="fa-manual" className="text-xs font-medium text-ink-2">
            Manual-process resolution date (for faster-resolution value)
          </label>
          <input
            id="fa-manual"
            type="date"
            value={p.manualDate ?? ''}
            onChange={e => p.onManualDate(e.target.value || null)}
            className="num mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
          />
          <p className="mt-0.5 text-[11px] text-muted">Needs a validated manual timeline. Reported as part of the expected incremental, never added to it.</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <label className="text-xs font-medium text-ink-2" htmlFor="fa-owner">
            Owner
          </label>
          <input
            id="fa-owner"
            value={sc.meta.owner}
            placeholder="Who answers for these inputs"
            onChange={e => p.onOwner(e.target.value, sc.meta.source)}
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:italic placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <label className="text-xs font-medium text-ink-2" htmlFor="fa-source">
            Source or rationale
          </label>
          <textarea
            id="fa-source"
            rows={2}
            value={sc.meta.source}
            placeholder="Historical cohort, query ID, or the reason for the assumption"
            onChange={e => p.onOwner(sc.meta.owner, e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:italic placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {problems && (problems.errors.length > 0 || problems.missing.length > 0) && (
        <div className="mt-4 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn-ink" role="status">
          <p className="font-semibold">Pending validation — the scenario is not computed</p>
          {problems.errors.map(e => (
            <p key={e} className="mt-1">
              • {e}
            </p>
          ))}
          {problems.missing.length > 0 && <p className="mt-1">Missing: {problems.missing.join('; ')}.</p>}
        </div>
      )}

      <div className="mt-4">
        <p className="mb-1 text-xs font-medium text-ink-2">Horizon from the resolution date</p>
        <SegmentedControl<HorizonKey> value={p.horizon} onChange={p.onHorizon} ariaLabel="Horizon" options={HORIZONS.map(h => ({ value: h.key, label: h.key === '12m' ? '12 mo' : h.label.replace(' days', 'd') }))} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={p.onIllustrative}>
          <FlaskConical className="h-3.5 w-3.5" /> Load illustrative values
        </Button>
        <Button size="sm" variant="ghost" onClick={p.onReset}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset to blank
        </Button>
        <Button size="sm" variant="ghost" onClick={p.onSave}>
          <Save className="h-3.5 w-3.5" /> {p.saveState === 'saved' ? 'Saved in this browser' : p.saveState === 'failed' ? 'Browser storage unavailable' : 'Save in this browser'}
        </Button>
        <Button size="sm" variant="ghost" onClick={p.onExport}>
          <Download className="h-3.5 w-3.5" /> {p.exportState === 'saved' ? 'Exported' : p.exportState === 'failed' ? 'Export unavailable here' : 'Export assumptions'}
        </Button>
      </div>
      <p className={cx('mt-2 text-[11px] leading-snug text-muted')}>
        Illustrative values demonstrate the arithmetic (q and p of 25 / 50 / 75%, ramps of 21 / 14 / 7 days). They are not sourced from an approved
        historical cohort.
      </p>
    </Card>
  );
};
