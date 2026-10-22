import React, { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { cx } from '../ui.tsx';
import { PRIORITY_TONE, RESULT_TONE } from '../../lib/pitt/engine.ts';
import type { CheckResult, Presence } from '../../lib/pitt/types.ts';

export type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'ok' | 'info';
const TONE: Record<Tone, string> = {
  neutral: 'border-line bg-surface-2 text-ink-2',
  accent: 'border-accent/40 bg-accent-soft text-accent-ink',
  danger: 'border-danger/40 bg-danger-soft text-danger-ink',
  warn: 'border-warn/40 bg-warn-soft text-warn-ink',
  ok: 'border-ok/40 bg-ok-soft text-ok-ink',
  info: 'border-info/40 bg-info-soft text-info',
};

export const Chip: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string; title?: string }> = ({ tone = 'neutral', children, className, title }) => (
  <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold', TONE[tone], className)}>
    {children}
  </span>
);

export const PriorityChip: React.FC<{ p: 'P0' | 'P1' | 'P2' | null }> = ({ p }) => (
  <Chip tone={PRIORITY_TONE[p ?? 'none']} className="num min-w-8 justify-center" title={p ? 'Priority ' + p : 'No priority rule matched'}>
    {p ?? '—'}
  </Chip>
);

export const ResultChip: React.FC<{ r: CheckResult | null }> = ({ r }) => {
  const v = r ?? 'NO_DATA';
  return (
    <Chip tone={RESULT_TONE[v]} className="num">
      {v === 'NO_DATA' ? 'No data' : v}
    </Chip>
  );
};

export const PresenceChip: React.FC<{ p: Presence }> = ({ p }) => (
  <Chip tone={p === 'PRESENT' ? 'ok' : p === 'ABSENT' ? 'danger' : p === 'PARTIAL' ? 'warn' : 'neutral'}>{p === 'NO_DATA' ? 'No data' : p.toLowerCase()}</Chip>
);

/** A Maestro card: short 17px title (the eyebrow when given), the longer sentence as a muted subtitle, actions right. */
export const Panel: React.FC<{ id?: string; title: string; eyebrow?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; description?: React.ReactNode }> = ({
  id, title, eyebrow, aside, children, className, description,
}) => (
  <section id={id} aria-labelledby={id ? id + '-h' : undefined} className={cx('rounded-lg border border-line bg-surface', className)}>
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-3.5">
      <div className="min-w-0">
        <h2 id={id ? id + '-h' : undefined} className="text-[17px] font-normal leading-6 text-ink">
          {eyebrow ?? title}
        </h2>
        {(eyebrow || description) && (
          <p className="mt-0.5 max-w-3xl text-xs text-muted">
            {eyebrow ? title : null}
            {eyebrow && description ? '. ' : null}
            {description}
          </p>
        )}
      </div>
      {aside}
    </div>
    <div className="px-4 pb-4">{children}</div>
  </section>
);

/** Accessible tooltip: opens on hover and on focus, closes on Escape. */
export const Tip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="rounded p-0.5 text-faint hover:text-ink-2 cursor-pointer"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span role="tooltip" className="absolute left-1/2 top-full z-20 mt-1 w-64 -translate-x-1/2 rounded-md border border-tooltip-line bg-tooltip p-2.5 text-xs font-normal normal-case leading-relaxed tracking-normal text-tooltip-ink shadow-card">
          {children}
        </span>
      )}
    </span>
  );
};

/** Table equivalent of a chart, collapsed by default, for screen readers and keyboard users. */
export const ChartTable: React.FC<{ caption: string; head: string[]; rows: (string | number)[][]; right?: number[] }> = ({ caption, head, rows, right = [] }) => (
  <details className="mt-3 rounded-lg border border-line bg-surface-2 text-xs">
    <summary className="cursor-pointer px-3 py-2 font-medium text-ink-2">Show as table · {caption}</summary>
    <div className="overflow-x-auto px-3 pb-3">
      <table className="w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={cx('py-1.5 pr-3 font-medium text-muted', right.includes(i) && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cx('py-1.5 pr-3 text-ink-2', right.includes(j) && 'num text-right')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </details>
);

/** Count-up for KPI numbers. Respects reduced motion; the final text is the formatted value. */
export function useCountUp(target: number | null, ms = 700) {
  const [v, setV] = useState<number | null>(target);
  const raf = useRef(0);
  useEffect(() => {
    if (target == null) return setV(null);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || document.hidden) return setV(target);
    const t0 = performance.now();
    const step = (t: number) => {
      // A frame can carry a timestamp from before t0: clamp, so the count never goes below 0 or past the target.
      const k = Math.min(1, Math.max(0, (t - t0) / ms));
      setV(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    // Paused frames (hidden tab) must still end on the exact value.
    const done = window.setTimeout(() => setV(target), ms + 100);
    return () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(done);
    };
  }, [target, ms]);
  return v;
}

