/**
 * One store for the imported run, the selected publisher and the current page. Every page reads from here, so a
 * selection made on one page holds on all the others, across reloads and direct links (#/impact?case=…).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { bundledRun } from '../../lib/cases/bundled.ts';
import { loadRun, parseHash, resolveSelected, STORAGE, toHash, type Tab } from '../../lib/cases/selection.ts';
import type { CaseRecord, Run } from '../../lib/cases/types.ts';

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: state lives for this visit only */
  }
};

interface CasesState {
  run: Run;
  tab: Tab;
  selected: CaseRecord | null;
  /** The requested ID when it is not in the run (shown as "not in this run", never replaced). */
  missingId: string | null;
  go: (tab: Tab, caseId?: string | null) => void;
  select: (caseId: string | null) => void;
  importRun: (run: Run) => void;
  resetToBundled: () => void;
}

const Ctx = createContext<CasesState | null>(null);

export const CasesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [run, setRun] = useState<Run>(() => loadRun(safeGet));
  const initial = parseHash(window.location.hash);
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [caseId, setCaseId] = useState<string | null>(initial.caseId ?? safeGet(STORAGE.selected));

  // Back / forward and pasted links.
  useEffect(() => {
    const on = () => {
      const r = parseHash(window.location.hash);
      setTab(r.tab);
      if (r.caseId) setCaseId(r.caseId);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    const h = toHash({ tab, caseId });
    if (window.location.hash !== h) window.history.replaceState(null, '', h);
    safeSet(STORAGE.selected, caseId);
  }, [tab, caseId]);

  const go = useCallback((t: Tab, id?: string | null) => {
    if (id !== undefined) setCaseId(id);
    setTab(t);
    window.history.pushState(null, '', toHash({ tab: t, caseId: id === undefined ? caseId : id }));
    window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [caseId]);

  const importRun = useCallback((r: Run) => {
    setRun(r);
    safeSet(STORAGE.run, JSON.stringify(r));
    // Keep the selection only if the same case is in the new run.
    setCaseId((id) => resolveSelected(id, r));
  }, []);

  const resetToBundled = useCallback(() => {
    safeSet(STORAGE.run, null);
    const r = bundledRun();
    setRun(r);
    setCaseId((id) => resolveSelected(id, r));
  }, []);

  const value = useMemo<CasesState>(() => {
    const id = resolveSelected(caseId, run);
    return {
      run,
      tab,
      selected: id ? run.cases.find((c) => c.caseId === id)! : null,
      missingId: caseId && !id ? caseId : null,
      go,
      select: setCaseId,
      importRun,
      resetToBundled,
    };
  }, [run, tab, caseId, go, importRun, resetToBundled]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useCases(): CasesState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCases outside CasesProvider');
  return v;
}
