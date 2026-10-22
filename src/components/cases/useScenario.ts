import { useCallback, useEffect, useState } from 'react';
import { BLANK, type Scenario } from '../../lib/cases/projection.ts';

const key = (caseId: string) => 'pitt-scenario:' + caseId;
const EVENT = 'pitt-scenario-change';

const read = (caseId: string): Scenario => {
  try {
    const raw = localStorage.getItem(key(caseId));
    const s = raw ? (JSON.parse(raw) as Scenario) : null;
    return s && typeof s === 'object' && 'origin' in s ? { ...BLANK, ...s } : BLANK;
  } catch {
    return BLANK;
  }
};

/** One scenario per publisher (case ID), shared by Spend Projection and Financial Impact; never across publishers. */
export function useScenario(caseId: string) {
  const [s, setS] = useState<Scenario>(() => read(caseId));
  useEffect(() => {
    setS(read(caseId));
    const on = () => setS(read(caseId));
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [caseId]);
  const save = useCallback(
    (next: Scenario) => {
      setS(next);
      try {
        localStorage.setItem(key(caseId), JSON.stringify(next));
      } catch {
        /* this visit only */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [caseId],
  );
  return [s, save] as const;
}
