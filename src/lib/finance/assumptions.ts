/**
 * Scenario inputs with their metadata. Defaults are blank. Illustrative values exist only behind an explicit user
 * action and are labelled as such. Saving a scenario in the browser is not Finance approval.
 */
import { BLANK_INPUTS, type ScenarioInputs } from './scenario.ts';
import { QUERY_LOG } from './snapshot.data.ts';
import { DATA_THROUGH, SNAPSHOT_VERSION } from './provenance.ts';
import { PARSER_VERSION } from './evidence.ts';

export type Approval = 'blank' | 'illustrative' | 'user-entered' | 'approved';
export type ScopeKey = 'portfolio' | 'case';

export interface InputMeta {
  key: keyof ScenarioInputs;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** Stored as a fraction, shown as a percentage. */
  percent?: boolean;
  modes: ScenarioInputs['mode'][];
  help: string;
}

export const INPUT_META: InputMeta[] = [
  { key: 'q', label: 'Restoration fraction q', unit: '%', min: 0, max: 1, step: 0.01, percent: true, modes: ['volume-yield', 'spend-gap'], help: 'Share of the eligible gap restored if the fix succeeds. Not a probability.' },
  { key: 'p', label: 'Success probability p', unit: '%', min: 0, max: 1, step: 0.01, percent: true, modes: ['volume-yield', 'spend-gap'], help: 'Applied once. Evidence-confidence labels are never converted into p.' },
  { key: 'rampDays', label: 'Ramp to full restoration', unit: 'days', min: 0, max: 365, step: 1, modes: ['volume-yield', 'spend-gap'], help: 'Linear ramp from the resolution date; 0 = immediate.' },
  { key: 'targetBidRequestsPerDay', label: 'Target bid requests per day (Btarget)', unit: 'bid requests', min: 0, max: 1e12, step: 1_000_000, modes: ['volume-yield'], help: 'Eligible daily volume after a successful fix, from matched history or a declared assumption.' },
  { key: 'yieldChange', label: 'Yield change (Δ RPMBr)', unit: 'SCU per 1M bid requests', min: -1000, max: 1000, step: 0.01, modes: ['volume-yield'], help: 'Signed; applied from the resolution date.' },
  { key: 'comparatorYield', label: 'Comparator yield', unit: 'SCU per 1M bid requests', min: 0, max: 1000, step: 0.01, modes: ['volume-yield'], help: 'Only when baseline bid requests are zero and yield is undefined. Must be justified separately.' },
  { key: 'counterfactualSpendPerDay', label: 'Validated spend comparator', unit: 'SCU per day', min: 0, max: 1e9, step: 1, modes: ['spend-gap'], help: 'Daily spend the seats would earn if restored. Requires validation.' },
];

export interface ScenarioMeta {
  approval: Approval;
  source: string;
  owner: string;
  effectiveDate: string | null;
  confidence: 'low' | 'medium' | 'high' | null;
}

export interface SavedScenario {
  version: 1;
  scope: ScopeKey;
  name: 'Conservative' | 'Base case' | 'Upside';
  inputs: ScenarioInputs;
  meta: ScenarioMeta;
}

export const SCENARIO_NAMES = ['Conservative', 'Base case', 'Upside'] as const;

export const BLANK_META: ScenarioMeta = { approval: 'blank', source: '', owner: '', effectiveDate: null, confidence: null };

export function blankScenario(scope: ScopeKey, name: SavedScenario['name']): SavedScenario {
  return { version: 1, scope, name, inputs: { ...BLANK_INPUTS, mode: scope === 'case' ? 'spend-gap' : 'volume-yield' }, meta: { ...BLANK_META } };
}

/**
 * Illustrative values: arithmetic demonstrations, not estimates. Portfolio: +1% / +2% / +3% of the trailing mean volume
 * at current yield. Case: the full-day pre-cut mean as the comparator (unvalidated) with low / mid / high q and p.
 */
export function illustrative(scope: ScopeKey, name: SavedScenario['name'], ctx: { meanBidRequests: number; firstProjectedDay: string; preCutDailySpend: number }): SavedScenario {
  const i = SCENARIO_NAMES.indexOf(name);
  const q = [0.25, 0.5, 0.75][i];
  const p = [0.25, 0.5, 0.75][i];
  const ramp = [21, 14, 7][i];
  const res = ctx.firstProjectedDay;
  const meta: ScenarioMeta = { approval: 'illustrative', source: 'Illustrative values chosen in the app to demonstrate the arithmetic. Not sourced from an approved historical cohort.', owner: 'Unassigned', effectiveDate: res, confidence: null };
  if (scope === 'portfolio')
    return {
      version: 1,
      scope,
      name,
      inputs: { ...BLANK_INPUTS, mode: 'volume-yield', resolutionDate: res, rampDays: ramp, q, p, targetBidRequestsPerDay: Math.round(ctx.meanBidRequests * (1 + 0.01 * (i + 1))), yieldChange: 0, comparatorYield: null },
      meta,
    };
  return { version: 1, scope, name, inputs: { ...BLANK_INPUTS, mode: 'spend-gap', resolutionDate: res, rampDays: ramp, q, p, counterfactualSpendPerDay: Math.round(ctx.preCutDailySpend * 100) / 100 }, meta };
}

const STORAGE_KEY = 'pitt-finance-scenarios/v1';

/** Per-viewer convenience only; failure to read or write never blocks the page. */
export function loadSaved(): SavedScenario[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? parseSaved(raw) : [];
  } catch {
    return [];
  }
}

export function saveAll(list: SavedScenario[]): boolean {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Strict parse: unknown keys are dropped, numbers are range-checked, a saved "approved" state is downgraded. */
export function parseSaved(raw: string): SavedScenario[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: SavedScenario[] = [];
  for (const d of data as Record<string, unknown>[]) {
    if (!d || d.version !== 1 || (d.scope !== 'portfolio' && d.scope !== 'case') || !SCENARIO_NAMES.includes(d.name as SavedScenario['name'])) continue;
    const src = (d.inputs ?? {}) as Record<string, unknown>;
    const inputs: ScenarioInputs = { ...BLANK_INPUTS, mode: src.mode === 'spend-gap' ? 'spend-gap' : 'volume-yield' };
    inputs.resolutionDate = typeof src.resolutionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.resolutionDate) ? src.resolutionDate : null;
    for (const m of INPUT_META) {
      const v = src[m.key];
      (inputs as unknown as Record<string, number | null>)[m.key] = typeof v === 'number' && Number.isFinite(v) && v >= m.min && v <= m.max ? v : null;
    }
    const mm = (d.meta ?? {}) as Record<string, unknown>;
    const approval: Approval = mm.approval === 'illustrative' || mm.approval === 'user-entered' ? mm.approval : 'user-entered';
    out.push({
      version: 1,
      scope: d.scope as ScopeKey,
      name: d.name as SavedScenario['name'],
      inputs,
      meta: { approval, source: String(mm.source ?? '').slice(0, 500), owner: String(mm.owner ?? '').slice(0, 120), effectiveDate: typeof mm.effectiveDate === 'string' ? mm.effectiveDate.slice(0, 10) : null, confidence: null },
    });
  }
  return out;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Export bundle: assumptions plus source and query versions. No credentials, no named recipients. */
export function buildExport(scenarios: SavedScenario[], exportedAt: string) {
  const bundle = {
    exportedAt,
    note: 'Scenario assumptions are not Finance approval. Amounts are in source currency units (documented EUR in warehouse comments; not Finance-validated).',
    snapshotVersion: SNAPSHOT_VERSION,
    dataThrough: DATA_THROUGH,
    parserVersion: PARSER_VERSION,
    scenarios,
    queries: QUERY_LOG.map(q => ({ key: q.key, queryId: q.queryId, file: q.file, executedAt: q.executedAt, rowCount: q.rowCount, status: q.status })),
  };
  return JSON.parse(JSON.stringify(bundle).replace(EMAIL, '[redacted]')) as typeof bundle;
}
