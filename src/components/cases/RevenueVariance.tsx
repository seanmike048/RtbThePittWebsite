import React from 'react';
import { cx } from '../ui.tsx';

export interface VarianceItem {
  id: string;
  label: string;
  /** USD; null when unavailable. */
  value: number | null;
  reason: string | null;
  role: 'total' | 'part' | 'measure';
  explain: string;
  state: 'Calculated' | 'Projected' | 'Observed' | 'Unavailable' | 'Illustrative';
}

const fmt = (n: number) => {
  const a = Math.abs(n);
  return (n < 0 ? '−' : '') + '$' + (a > 0 && a < 10 ? a.toFixed(2) : Math.round(a).toLocaleString('en-US'));
};

const PART_COLOR = ['bg-chart-removed', 'bg-chart-live', 'bg-chart-3', 'bg-chart-4'];

/**
 * Revenue variance: what the pre-cut week was made of, then each separate measure on its own line.
 * The composition bar is drawn only when the parts add up to the total; nothing is called "recovered".
 */
export const RevenueVariance: React.FC<{ items: VarianceItem[]; additive: boolean; caption: string; footnote?: React.ReactNode }> = ({ items, additive, caption, footnote }) => {
  const total = items.find((i) => i.role === 'total');
  const parts = items.filter((i) => i.role === 'part');
  const measures = items.filter((i) => i.role === 'measure');
  const t = total?.value ?? null;
  const scale = Math.max(t ?? 0, ...measures.map((m) => m.value ?? 0), 1);

  return (
    <figure className="space-y-5" aria-label={caption}>
      {total && (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-muted">{total.label}</p>
            <p className="num text-2xl font-semibold text-ink">{t == null ? 'Unavailable' : fmt(t)}</p>
          </div>
          {additive && t != null && t > 0 ? (
            <>
              <div className="mt-2 flex h-3 w-full overflow-hidden rounded-sm bg-surface-2" role="img" aria-label={parts.map((p) => `${p.label} ${p.value == null ? 'unavailable' : fmt(p.value)}`).join(', ')}>
                {parts.map((p, i) => (p.value ?? 0) > 0 && <div key={p.id} className={PART_COLOR[i]} style={{ width: `${((p.value ?? 0) / t) * 100}%` }} title={`${p.label}: ${fmt(p.value ?? 0)}`} />)}
              </div>
              <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {parts.map((p, i) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className={cx('h-2 w-2 shrink-0 rounded-sm', PART_COLOR[i])} aria-hidden /> {p.label}
                    </span>
                    <span className="num text-ink">{p.value == null ? 'Unavailable' : fmt(p.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted">{t == null ? total.reason : 'The parts do not add up to the total, so no split is drawn.'}</p>
          )}
          <p className="mt-1 text-xs text-muted">{total.explain} {parts.map((p) => p.label + ': ' + p.explain).join(' ')}</p>
        </div>
      )}

      <dl className="divide-y divide-line border-y border-line">
        {measures.map((m) => (
          <div key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)_8rem]">
            <dt className="text-sm font-medium text-ink">{m.label}</dt>
            <dd className="order-3 col-span-2 sm:order-none sm:col-span-1">
              {m.value != null ? (
                <div className="h-2 rounded-sm bg-surface-2" aria-hidden>
                  <div className={cx('h-2 rounded-sm', m.state === 'Illustrative' ? 'bg-chart-4/60' : 'bg-chart-measure')} style={{ width: `${Math.min(100, (m.value / scale) * 100)}%` }} />
                </div>
              ) : (
                <p className="text-xs text-muted">{m.reason}</p>
              )}
              <p className="mt-0.5 text-[11px] text-faint">{m.explain}</p>
            </dd>
            <dd className="text-right">
              <span className="num block text-sm font-semibold text-ink">{m.value == null ? '—' : fmt(m.value)}</span>
              <span className={cx('text-[11px]', m.state === 'Unavailable' ? 'text-faint' : m.state === 'Illustrative' ? 'text-warn-ink' : 'text-muted')}>{m.state}</span>
            </dd>
          </div>
        ))}
      </dl>
      <figcaption className="text-[11px] leading-relaxed text-muted">
        {caption}
        {footnote && <> {footnote}</>}
      </figcaption>
    </figure>
  );
};
