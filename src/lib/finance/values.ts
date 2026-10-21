/**
 * Value states. Zero, missing, negative, excluded and unavailable are different facts and never collapse into 0.
 * - value / negative / zero: an observed or computed number
 * - missing: the source should have a value and does not (e.g. no row for a day)
 * - excluded: a known amount deliberately kept out of a total (still shown for diagnosis)
 * - unavailable: cannot be computed until the listed inputs exist
 */
export type Val =
  | { kind: 'value'; v: number }
  | { kind: 'negative'; v: number }
  | { kind: 'zero' }
  | { kind: 'missing'; reason: string }
  | { kind: 'excluded'; reason: string; v: number | null }
  | { kind: 'unavailable'; reason: string; needs: string[] };

export const val = (v: number): Val => {
  if (!Number.isFinite(v)) return { kind: 'unavailable', reason: 'Not a finite number', needs: [] };
  if (v === 0) return { kind: 'zero' };
  return v < 0 ? { kind: 'negative', v } : { kind: 'value', v };
};
export const missing = (reason: string): Val => ({ kind: 'missing', reason });
export const excluded = (reason: string, v: number | null = null): Val => ({ kind: 'excluded', reason, v });
export const unavailable = (reason: string, needs: string[] = []): Val => ({ kind: 'unavailable', reason, needs });

/** The number behind a value, or null when there is none to use in arithmetic. Excluded amounts are not usable. */
export const num = (x: Val): number | null =>
  x.kind === 'value' || x.kind === 'negative' ? x.v : x.kind === 'zero' ? 0 : null;

export const isNumeric = (x: Val) => num(x) !== null;

export const STATE_LABEL: Record<Val['kind'], string> = {
  value: 'Value',
  negative: 'Negative',
  zero: 'Zero',
  missing: 'Missing',
  excluded: 'Excluded',
  unavailable: 'Unavailable',
};

/** Text for a value state; numbers use the caller's formatter so precision stays aligned per column. */
export function showVal(x: Val, format: (n: number) => string): string {
  switch (x.kind) {
    case 'value':
    case 'negative':
      return format(x.v);
    case 'zero':
      return format(0);
    case 'missing':
      return 'Missing';
    case 'excluded':
      return 'Excluded';
    case 'unavailable':
      return 'Unavailable';
  }
}

export const reasonOf = (x: Val): string | null =>
  x.kind === 'missing' || x.kind === 'excluded' || x.kind === 'unavailable' ? x.reason : null;

/** Sum that refuses to treat a missing or unavailable part as zero. */
export function sumVals(xs: Val[], what = 'a component'): Val {
  let total = 0;
  for (const x of xs) {
    const n = num(x);
    if (n === null) {
      if (x.kind === 'excluded') continue;
      return unavailable(`Cannot total: ${what} is ${STATE_LABEL[x.kind].toLowerCase()}${reasonOf(x) ? ` (${reasonOf(x)})` : ''}.`);
    }
    total += n;
  }
  return val(total);
}
