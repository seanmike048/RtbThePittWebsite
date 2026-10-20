import React, { useState } from 'react';
import type { DailyPoint } from '../../lib/investigations/context.ts';
import { cx } from '../ui.tsx';
import { compact, fmt } from '../cfo437/shared.tsx';

const W = 760;
const H = 210;
const PAD = { l: 52, r: 12, t: 14, b: 26 };

function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  return [0, 1, 2, 3, 4].map(i => i * step);
}

interface Series {
  key: string;
  label: string;
  value: (d: DailyPoint) => number | null;
  kind: 'bar' | 'line';
  className: string;
  swatch: string;
}

/** Daily chart with a vertical marker on the cut date. Values share one axis per chart. */
export const DailyChart: React.FC<{ data: DailyPoint[]; series: Series[]; cutDay: string; unit: string; title: string }> = ({
  data,
  series,
  cutDay,
  unit,
  title,
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.flatMap(d => series.map(s => s.value(d) ?? 0)));
  const tk = ticks(max);
  const top = tk[tk.length - 1] || 1;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(data.length, 1);
  const x = (i: number) => PAD.l + slot * i + slot / 2;
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  const cutIdx = data.findIndex(d => d.day === cutDay);
  const labelEvery = Math.ceil(data.length / 8);
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="min-w-0">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="flex flex-wrap gap-3 text-xs text-muted">
          {series.map(s => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className={cx('h-2 w-3 rounded-sm', s.swatch)} />
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      <p className="num mt-1 h-4 text-xs text-muted">
        {h ? `${h.day} · ${series.map(s => `${s.label}: ${s.value(h) === null ? '—' : fmt(s.value(h)!, unit === 'SCU' ? 2 : 0)}`).join(' · ')}` : `Unit: ${unit}`}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-auto w-full" role="img" aria-label={title}>
        {tk.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {compact(t)}
            </text>
          </g>
        ))}
        {cutIdx >= 0 && (
          <g>
            <line x1={x(cutIdx)} x2={x(cutIdx)} y1={PAD.t} y2={PAD.t + ih} className="stroke-danger" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={x(cutIdx) + 5} y={PAD.t + 10} className="fill-danger text-[11px] font-semibold">
              Cut
            </text>
          </g>
        )}
        {series
          .filter(s => s.kind === 'bar')
          .map(s =>
            data.map((d, i) => {
              const v = s.value(d);
              if (v === null) return null;
              const bw = Math.max(2, slot * 0.6);
              return <rect key={`${s.key}-${d.day}`} x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0, y(0) - y(v))} rx={1.5} className={s.className} />;
            }),
          )}
        {series
          .filter(s => s.kind === 'line')
          .map(s => {
            let path = '';
            data.forEach((d, i) => {
              const v = s.value(d);
              if (v === null) return;
              path += `${path && data[i - 1] && s.value(data[i - 1]) !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
            });
            return <path key={s.key} d={path} fill="none" className={s.className} strokeWidth={2.25} strokeLinejoin="round" />;
          })}
        {data.map((d, i) => (
          <g key={d.day}>
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted text-[10px]">
                {d.day.slice(5)}
              </text>
            )}
            <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} className="stroke-faint" strokeWidth={1} />}
      </svg>
    </figure>
  );
};
