/**
 * Chart kit for the financial impact page. Single y-axis per chart, solid lines for actuals and dashed lines for
 * scenarios, nulls drawn as gaps (never as zero), keyboard-accessible readouts and a data table behind every chart.
 */
import React, { useId, useRef, useState } from 'react';
import { Database, Table2 } from 'lucide-react';
import type { QueryRecord } from '../../lib/finance/provenance.ts';
import { Badge, Card, cx, EmptyNote, TableShell, Th } from '../ui.tsx';

export type Classification = 'Measured' | 'Calculated' | 'Scenario · illustrative' | 'Scenario · user-entered' | 'Unavailable' | 'Narrative';

const CLASS_TONE: Record<Classification, 'ok' | 'info' | 'warn' | 'neutral' | 'accent'> = {
  Measured: 'ok',
  Calculated: 'info',
  'Scenario · illustrative': 'warn',
  'Scenario · user-entered': 'accent',
  Unavailable: 'neutral',
  Narrative: 'neutral',
};

export const ClassBadge: React.FC<{ c: Classification }> = ({ c }) => (
  <Badge tone={CLASS_TONE[c]} dot>
    {c}
  </Badge>
);

export interface TableSpec {
  columns: { label: string; right?: boolean }[];
  rows: (string | number)[][];
}

export const SourceDrawer: React.FC<{ queries: QueryRecord[]; note?: React.ReactNode }> = ({ queries, note }) => (
  <details className="group min-w-0 rounded-xl border border-line bg-surface-2/60">
    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-ink-2">
      <Database className="h-3.5 w-3.5 text-muted" /> Source and queries ({queries.length})
    </summary>
    <div className="space-y-3 border-t border-line px-3 py-3 text-xs text-muted">
      {note && <p className="leading-relaxed">{note}</p>}
      {queries.map(q => (
        <div key={q.key} className="min-w-0">
          <p className="text-ink-2">
            <span className="font-medium">{q.title}</span>{' '}
            {q.status === 'failed' ? (
              <Badge tone="danger">Failed</Badge>
            ) : (
              <span className="num">
                · {q.queryId} · {q.executedAt.replace('T', ' ').replace('Z', ' UTC')} · {q.rowCount} rows
              </span>
            )}
          </p>
          <p className="mt-0.5">
            <span className="num">sql/{q.file}</span>
            {q.error ? ` · ${q.error}` : ''}
          </p>
          {q.sql && (
            <pre className="num mt-1 max-h-40 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-slate-950 p-2 text-[11px] leading-relaxed text-slate-200">
              {q.sql}
            </pre>
          )}
        </div>
      ))}
    </div>
  </details>
);

export const DataTable: React.FC<{ table: TableSpec; caption: string }> = ({ table, caption }) => (
  <details className="min-w-0 rounded-xl border border-line">
    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-ink-2">
      <Table2 className="h-3.5 w-3.5 text-muted" /> Show the numbers
    </summary>
    <div className="border-t border-line p-2">
      <TableShell minWidth={`${Math.max(360, table.columns.length * 120)}px`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {table.columns.map(c => (
              <Th key={c.label} right={c.right}>
                {c.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={cx('px-4 py-1.5 text-ink-2', table.columns[j]?.right && 'num text-right')}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  </details>
);

/** Every chart answers one business question and carries its scope, period, unit, freshness and classification. */
export const ChartFrame: React.FC<{
  id?: string;
  priority?: 'P0' | 'P1' | 'P2';
  title: string;
  question: string;
  scope: string;
  period: string;
  unit: string;
  freshness: string;
  classification: Classification;
  queries: QueryRecord[];
  sourceNote?: React.ReactNode;
  table?: TableSpec;
  state?: { kind: 'unavailable' | 'empty' | 'error'; message: React.ReactNode };
  aside?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ id, priority, title, question, scope, period, unit, freshness, classification, queries, sourceNote, table, state, aside, children, className }) => (
  <Card className={cx('min-w-0 p-5 sm:p-6', className)}>
    <div id={id} className="scroll-mt-48" />
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold tracking-tight text-ink">{title}</h3>
          {priority && <span className="num rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{priority}</span>}
        </div>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">{question}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {aside}
        <ClassBadge c={state?.kind === 'unavailable' ? 'Unavailable' : classification} />
      </div>
    </div>
    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <dt className="inline font-medium text-ink-2">Scope </dt>
        <dd className="inline">{scope}</dd>
      </div>
      <div>
        <dt className="inline font-medium text-ink-2">Period </dt>
        <dd className="inline">{period}</dd>
      </div>
      <div>
        <dt className="inline font-medium text-ink-2">Unit </dt>
        <dd className="inline">{unit}</dd>
      </div>
      <div>
        <dt className="inline font-medium text-ink-2">Data </dt>
        <dd className="inline">{freshness}</dd>
      </div>
    </dl>
    <div className="mt-4">{state ? <EmptyNote className={state.kind === 'error' ? 'border-danger/40' : undefined}>{state.message}</EmptyNote> : children}</div>
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <SourceDrawer queries={queries} note={sourceNote} />
      {table && !state && <DataTable table={table} caption={title} />}
    </div>
  </Card>
);

/* ------------------------------------------------------------------ scales */

export function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(Math.abs(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v / step) * step);
  return out;
}

export const compactNum = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K` : a.toFixed(a >= 10 || a === 0 ? 0 : 1);
  return n < 0 ? `−${s}` : s;
};

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const STROKE: Record<SeriesColor, string> = { ink: 'stroke-ink', muted: 'stroke-muted', viz1: 'stroke-viz-1', viz2: 'stroke-viz-2', warn: 'stroke-warn' };
const FILL: Record<SeriesColor, string> = { ink: 'fill-ink', muted: 'fill-muted', viz1: 'fill-viz-1', viz2: 'fill-viz-2', warn: 'fill-warn' };
const BG: Record<SeriesColor, string> = { ink: 'bg-ink', muted: 'bg-muted', viz1: 'bg-viz-1', viz2: 'bg-viz-2', warn: 'bg-warn' };

export type SeriesColor = 'ink' | 'muted' | 'viz1' | 'viz2' | 'warn';

export interface Series {
  id: string;
  label: string;
  values: (number | null)[];
  color: SeriesColor;
  dash?: string;
}

export const LegendKey: React.FC<{ s: Pick<Series, 'label' | 'color' | 'dash'> }> = ({ s }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
    <svg width="22" height="8" aria-hidden>
      <line x1="1" x2="21" y1="4" y2="4" className={STROKE[s.color]} strokeWidth={2} strokeDasharray={s.dash} strokeLinecap="round" />
    </svg>
    {s.label}
  </span>
);

/** Multi-series line chart over consecutive days. */
export const LineChart: React.FC<{
  days: string[];
  series: Series[];
  marker?: { day: string; label: string } | null;
  format: (n: number) => string;
  height?: number;
  label: string;
  zeroLine?: boolean;
  compact?: boolean;
}> = ({ days, series, marker, format, height = 230, label, zeroLine, compact }) => {
  const W = 720;
  const H = height;
  const P = { l: 52, r: compact ? 12 : 104, t: 14, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const descId = useId();
  const all = series.flatMap(s => s.values.filter((v): v is number => v !== null));
  if (!days.length || !all.length) return <EmptyNote>No data points in this range.</EmptyNote>;
  const ticks = niceTicks(Math.min(0, ...all), Math.max(...all, 0));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const x = (i: number) => P.l + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v: number) => P.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const tickEvery = Math.max(1, Math.ceil(days.length / (compact ? 3 : 6)));
  const mi = marker ? days.indexOf(marker.day) : -1;
  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((px - P.l) / iw) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  };
  // Direct labels at the last non-null point, nudged apart so they do not collide.
  const ends = series
    .map(s => {
      let i = s.values.length - 1;
      while (i >= 0 && s.values[i] === null) i--;
      return i < 0 ? null : { s, i, y: y(s.values[i]!) };
    })
    .filter((e): e is { s: Series; i: number; y: number } => !!e)
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;

  return (
    <figure className="relative min-w-0">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1" aria-hidden={series.length < 2}>
        {series.length >= 2 && series.map(s => <LegendKey key={s.id} s={s} />)}
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
        role="img"
        aria-label={label}
        aria-describedby={descId}
        tabIndex={0}
        onMouseMove={e => pick(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={e => pick(e.touches[0].clientX)}
        onTouchMove={e => pick(e.touches[0].clientX)}
        onKeyDown={e => {
          if (e.key === 'ArrowRight') setHover(h => Math.min(days.length - 1, (h ?? -1) + 1));
          else if (e.key === 'ArrowLeft') setHover(h => Math.max(0, (h ?? days.length) - 1));
          else if (e.key === 'Escape') setHover(null);
          else return;
          e.preventDefault();
        }}
        onBlur={() => setHover(null)}
      >
        {ticks.map(t => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className={t === 0 && (zeroLine || lo < 0) ? 'stroke-line-strong' : 'stroke-line'} strokeWidth={1} />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {compactNum(t)}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          i % tickEvery === 0 ? (
            <text key={d} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted text-[11px]">
              {shortDay(d)}
            </text>
          ) : null,
        )}
        {mi >= 0 && (
          <g>
            <line x1={x(mi)} x2={x(mi)} y1={P.t} y2={P.t + ih} className="stroke-ink-2" strokeWidth={1} strokeDasharray="2 3" />
            <text x={x(mi) + 4} y={P.t + 10} className="fill-ink-2 text-[11px] font-medium">
              {marker!.label}
            </text>
          </g>
        )}
        {series.map(s => (
          <path key={s.id} d={path(s.values)} fill="none" className={STROKE[s.color]} strokeWidth={2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* Isolated points (a value with null neighbours) would be invisible as a path. */}
        {series.map(s =>
          s.values.map((v, i) =>
            v !== null && (s.values[i - 1] ?? null) === null && (s.values[i + 1] ?? null) === null ? (
              <circle key={`${s.id}-${i}`} cx={x(i)} cy={y(v)} r={3} className={FILL[s.color]} />
            ) : null,
          ),
        )}
        {!compact &&
          ends.map(e => (
            <text key={e.s.id} x={x(e.i) + 6} y={e.y + 4} className="fill-ink-2 text-[11px]">
              {e.s.label.length > 16 ? `${e.s.label.slice(0, 15)}…` : e.s.label}
            </text>
          ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={P.t + ih} className="stroke-faint" strokeWidth={1} />
            {series.map(s =>
              s.values[hover] === null ? null : (
                <circle key={s.id} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} className={cx(FILL[s.color], 'stroke-surface')} strokeWidth={2} />
              ),
            )}
          </g>
        )}
      </svg>
      <p id={descId} className="sr-only">
        Use left and right arrow keys to read values day by day.
      </p>
      {hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-8 z-10 min-w-44 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-xl"
          style={{ left: `${Math.min(70, Math.max(2, (x(hover) / W) * 100 - 10))}%` }}
        >
          <p className="font-semibold text-ink">{shortDay(days[hover])}, {days[hover].slice(0, 4)}</p>
          {series.map(s => (
            <p key={s.id} className="mt-1 flex items-center justify-between gap-3 text-ink-2">
              <span className="flex items-center gap-1.5">
                <span className={cx('h-0.5 w-3 rounded', BG[s.color])} />
                {s.label}
              </span>
              <span className="num text-ink">{s.values[hover] === null ? 'Missing' : format(s.values[hover]!)}</span>
            </p>
          ))}
        </div>
      )}
    </figure>
  );
};

/* ------------------------------------------------------------------ horizontal bars */

export interface BarRow {
  label: string;
  value: number | null;
  display: string;
  tone?: SeriesColor;
  note?: string;
  hatched?: boolean;
}

/** Horizontal bars on one axis starting at zero. Null values say why instead of drawing a zero bar. */
export const HBars: React.FC<{ rows: BarRow[]; label: string; max?: number; stacked?: boolean }> = ({ rows, label, max, stacked }) => {
  const m = max ?? Math.max(...rows.map(r => Math.abs(r.value ?? 0)), 1);
  const pid = useId();
  return (
    <figure aria-label={label} className="space-y-2.5">
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <pattern id={pid} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="fill-surface-2" />
            <line x1="0" y1="0" x2="0" y2="6" className="stroke-faint" strokeWidth="2" />
          </pattern>
        </defs>
      </svg>
      {rows.map(r => (
        <div key={r.label} className={cx('grid grid-cols-1 gap-1', !stacked && 'sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-center sm:gap-3')}>
          <span className="min-w-0 text-xs text-ink-2 [overflow-wrap:anywhere]">{r.label}</span>
          <div className="h-3.5 min-w-0 rounded bg-surface-2" title={r.note}>
            {r.value !== null && r.value !== 0 && (
              <svg className="h-full" style={{ width: `${Math.max(1, (Math.abs(r.value) / m) * 100)}%` }} preserveAspectRatio="none" viewBox="0 0 100 10" aria-hidden>
                <rect width="100" height="10" rx="2" className={r.hatched ? undefined : FILL[r.tone ?? 'viz1']} fill={r.hatched ? `url(#${pid})` : undefined} />
              </svg>
            )}
          </div>
          <span className={cx('num text-xs text-ink', stacked ? 'text-left' : 'text-right sm:min-w-28')}>
            {r.display}
            {r.note && <span className="block text-[11px] font-sans text-muted">{r.note}</span>}
          </span>
        </div>
      ))}
    </figure>
  );
};

/* ------------------------------------------------------------------ waterfall */

export const Waterfall: React.FC<{ steps: { label: string; value: number }[]; totalLabel: string; format: (n: number) => string; label: string }> = ({
  steps,
  totalLabel,
  format,
  label,
}) => {
  const W = 720;
  const H = 230;
  const P = { l: 56, r: 12, t: 22, b: 30 };
  let run = 0;
  const bars = steps.map(s => {
    const from = run;
    run += s.value;
    return { ...s, from, to: run };
  });
  const total = run;
  const extent = [0, total, ...bars.flatMap(b => [b.from, b.to])];
  const ticks = niceTicks(Math.min(...extent), Math.max(...extent));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const ih = H - P.t - P.b;
  const y = (v: number) => P.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const n = bars.length + 1;
  const slot = (W - P.l - P.r) / n;
  const bw = Math.min(90, slot * 0.56);
  const cxs = (i: number) => P.l + slot * i + slot / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-line-strong' : 'stroke-line'} />
          <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
            {compactNum(t)}
          </text>
        </g>
      ))}
      {bars.map((b, i) => (
        <g key={b.label}>
          <rect x={cxs(i) - bw / 2} y={Math.min(y(b.from), y(b.to))} width={bw} height={Math.max(1, Math.abs(y(b.from) - y(b.to)))} rx={3} className={b.value < 0 ? 'fill-viz-2' : 'fill-viz-1'}>
            <title>{`${b.label}: ${format(b.value)}`}</title>
          </rect>
          {i < bars.length - 1 && <line x1={cxs(i) + bw / 2} x2={cxs(i + 1) - bw / 2} y1={y(b.to)} y2={y(b.to)} className="stroke-faint" strokeDasharray="3 3" />}
          <text x={cxs(i)} y={Math.min(y(b.from), y(b.to)) - 6} textAnchor="middle" className="fill-ink text-[11px] num">
            {format(b.value)}
          </text>
          <text x={cxs(i)} y={H - 10} textAnchor="middle" className="fill-muted text-[11px]">
            {b.label}
          </text>
        </g>
      ))}
      <g>
        <rect x={cxs(n - 1) - bw / 2} y={Math.min(y(0), y(total))} width={bw} height={Math.max(1, Math.abs(y(0) - y(total)))} rx={3} className="fill-ink-2">
          <title>{`${totalLabel}: ${format(total)}`}</title>
        </rect>
        <text x={cxs(n - 1)} y={Math.min(y(0), y(total)) - 6} textAnchor="middle" className="fill-ink text-[11px] font-semibold num">
          {format(total)}
        </text>
        <text x={cxs(n - 1)} y={H - 10} textAnchor="middle" className="fill-ink-2 text-[11px] font-medium">
          {totalLabel}
        </text>
      </g>
    </svg>
  );
};

/* ------------------------------------------------------------------ tornado */

export const Tornado: React.FC<{ base: number; bars: { label: string; low: number | null; high: number | null; lowInput: string; highInput: string }[]; format: (n: number) => string }> = ({
  base,
  bars,
  format,
}) => {
  const span = Math.max(...bars.flatMap(b => [Math.abs((b.low ?? base) - base), Math.abs((b.high ?? base) - base)]), 1e-9);
  const sorted = [...bars].sort((a, b) => Math.abs((b.high ?? base) - (b.low ?? base)) - Math.abs((a.high ?? base) - (a.low ?? base)));
  const pos = (v: number) => 50 + ((v - base) / span) * 48;
  return (
    <div className="space-y-3" role="img" aria-label="Sensitivity of expected incremental spend to one input at a time">
      <p className="text-center text-xs text-muted">
        Centre line = base scenario, <span className="num text-ink">{format(base)}</span>
      </p>
      {sorted.map(b => {
        const lo = b.low ?? base;
        const hi = b.high ?? base;
        return (
          <div key={b.label} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-center sm:gap-3">
            <span className="text-xs text-ink-2">{b.label}</span>
            <div>
              <div className="relative h-4 rounded bg-surface-2">
                <div className="absolute inset-y-0 w-px bg-ink-2" style={{ left: '50%' }} />
                <div className="absolute inset-y-0.5 rounded-sm bg-viz-2" style={{ left: `${Math.min(pos(lo), 50)}%`, width: `${Math.abs(pos(lo) - 50)}%` }} title={`${b.lowInput}: ${format(lo)}`} />
                <div className="absolute inset-y-0.5 rounded-sm bg-viz-1" style={{ left: `${Math.min(pos(hi), 50)}%`, width: `${Math.abs(pos(hi) - 50)}%` }} title={`${b.highInput}: ${format(hi)}`} />
              </div>
              <div className="mt-0.5 flex justify-between text-[11px] text-muted">
                <span>
                  {b.lowInput} → <span className="num text-ink-2">{format(lo)}</span>
                </span>
                <span>
                  {b.highInput} → <span className="num text-ink-2">{format(hi)}</span>
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
