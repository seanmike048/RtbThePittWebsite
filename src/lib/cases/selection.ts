/**
 * Selection, persistence and routing, as pure functions (the React store wraps them).
 * The selected publisher never falls back: an ID that is not in the current run resolves to null.
 */
import { bundledRun } from './bundled.ts';
import type { Run } from './types.ts';

export const TABS = ['overview', 'investigations', 'impact', 'projection', 'optimization'] as const;
export type Tab = (typeof TABS)[number];
export const TAB_LABEL: Record<Tab, string> = {
  overview: 'Disconnection Room',
  investigations: 'Investigations',
  impact: 'Financial Impact',
  projection: 'Spend Projection',
  optimization: 'Optimization',
};

export const STORAGE = { run: 'pitt-run', selected: 'pitt-publisher' } as const;

export interface Route {
  tab: Tab;
  caseId: string | null;
}

/** "#/impact?case=LIVE-5412-amazon_dsp" → { tab: 'impact', caseId }. Unknown tabs go to the overview. */
export function parseHash(hash: string): Route {
  const m = hash.replace(/^#\/?/, '').match(/^([a-z]+)?(?:\?(.*))?$/);
  const tab = (TABS as readonly string[]).includes(m?.[1] ?? '') ? (m![1] as Tab) : 'overview';
  const caseId = new URLSearchParams(m?.[2] ?? '').get('case');
  return { tab, caseId: caseId && /^[A-Za-z0-9_.:-]{1,80}$/.test(caseId) ? caseId : null };
}

export const toHash = (r: Route) => `#/${r.tab}${r.caseId ? '?case=' + encodeURIComponent(r.caseId) : ''}`;

/** The selected case if it is in this run; otherwise null (the page then asks to pick a publisher). */
export const resolveSelected = (caseId: string | null, run: Run) => (caseId && run.cases.some((c) => c.caseId === caseId) ? caseId : null);

/** Minimal shape check for a stored run; anything else is discarded and the bundled run is used. */
export function isRun(x: unknown): x is Run {
  const r = x as Run;
  return !!r && typeof r.id === 'string' && Array.isArray(r.cases) && r.cases.every((c) => typeof c.caseId === 'string' && typeof c.networkId === 'number' && Array.isArray(c.actions)) && !!r.report && !!r.context;
}

export function loadRun(read: (k: string) => string | null): Run {
  try {
    const raw = read(STORAGE.run);
    if (raw) {
      const r = JSON.parse(raw);
      if (isRun(r)) return r;
    }
  } catch {
    /* unreadable storage: use the bundled run */
  }
  return bundledRun();
}
