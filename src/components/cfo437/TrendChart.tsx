import React, { useState } from 'react';
import { LineChart } from 'lucide-react';
import { monthLabel, type TrendPoint } from '../../lib/cfo437/live.ts';
import { Badge, Card, cx, SectionHeading, TableShell, Th } from '../ui.tsx';
import { compact, fmt, SectionAnchor } from './shared.tsx';

const W = 720;
const H = 190;
const PAD = { l: 52, r: 12, t: 12, b: 28 };

/** "Nice" axis ceiling and 4 ticks, so labels name values the chart actually reaches. */
function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  return [0, 1, 2, 3, 4].map(i => i * step);
}

const short = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

const Panel: React.FC<{
  points: TrendPoint[];
  value: (p: TrendPoint) => number;
  ghost?: (p: TrendPoint) => number;
  kind: 'bar' | 'line';
  unit: string;
  active: string;
  hover: string | null;
  onHover: (m: string | null) => void;
  label: string;
}> = ({ points, value, ghost, kind, unit, active, hover, onHover, label }) => {
  const max = Math.max(...points.map(p => Math.max(value(p), ghost ? ghost(p) : 0)), 0);
  const tk = ticks(max);
  const top = tk[tk.length - 1] || 1;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(points.length, 1);
  const x = (i: number) => PAD.l + slot * i + slot / 2;
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(value(p)).toFixed(1)}`).join(' ');

  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-xs font-medium text-muted">{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {tk.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {compact(t)}
            </text>
          </g>
        ))}
        {kind === 'bar' &&
          points.map((p, i) => {
            const bw = Math.min(34, slot * 0.62);
            const v = value(p);
            const g = ghost ? ghost(p) : 0;
            const on = p.month === active;
            return (
              <g key={p.month}>
                {ghost && <rect x={x(i) - bw / 2} y={y(g)} width={bw} height={Math.max(0, y(0) - y(g))} rx={4} className="fill-line" />}
                <rect
                  x={x(i) - bw / 2}
                  y={y(v)}
                  width={bw}
                  height={Math.max(0, y(0) - y(v))}
                  rx={4}
                  className={cx(on ? 'fill-accent' : 'fill-accent/55', hover === p.month && 'fill-accent')}
                />
              </g>
            );
          })}
        {kind === 'line' && (
          <>
            <path d={`${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} className="fill-ok/10" />
            <path d={line} fill="none" className="stroke-ok" strokeWidth={2.5} strokeLinejoin="round" />
            {points.map((p, i) => (
              <circle key={p.month} cx={x(i)} cy={y(value(p))} r={p.month === active ? 5 : 3} className={p.month === active ? 'fill-ok' : 'fill-surface stroke-ok'} strokeWidth={2} />
            ))}
          </>
        )}
        {points.map((p, i) => (
          <g key={p.month}>
            <text x={x(i)} y={H - 8} textAnchor="middle" className={cx('text-[11px]', p.month === active ? 'fill-ink font-semibold' : 'fill-muted')}>
              {short(p.month)}
            </text>
            <rect
              x={PAD.l + slot * i}
              y={PAD.t}
              width={slot}
              height={ih}
              fill="transparent"
              onMouseEnter={() => onHover(p.month)}
              onMouseLeave={() => onHover(null)}
            >
              <title>{`${monthLabel(p.month)}: ${fmt(value(p), unit === 'SCU' ? 2 : 0)} ${unit}`}</title>
            </rect>
          </g>
        ))}
      </svg>
    </figure>
  );
};

export const TrendChart: React.FC<{ trend: TrendPoint[]; source: 'snapshot' | 'live'; asOf: string; activeMonth: string }> = ({
  trend,
  source,
  asOf,
  activeMonth,
}) => {
  const [hover, setHover] = useState<string | null>(null);
  const points = trend.filter(p => p.spend > 0 || p.bidRequests > 0);
  const focus = points.find(p => p.month === (hover ?? activeMonth)) ?? points[points.length - 1];

  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-trend" />
      <SectionHeading
        icon={<LineChart className="h-5 w-5" />}
        eyebrow="Monthly trend"
        title="Endpoint-437 spend and bid requests by month"
        description="Amazon DSP partner 437, all months in Snowflake. Visible view = BOTH + INTERMEDIARY seller types (current sellers.json applied to every month)."
        aside={<Badge tone={source === 'live' ? 'ok' : 'neutral'} dot>{source === 'live' ? `Live · ${asOf}` : `Snapshot · ${asOf}`}</Badge>}
      />
      {focus && (
        <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span className="font-semibold text-ink">{monthLabel(focus.month)}</span>
          <span className="text-muted">
            Visible spend <strong className="num text-ink">{fmt(focus.visibleSpend, 2)}</strong> SCU
          </span>
          <span className="text-muted">
            All rows <strong className="num text-ink">{fmt(focus.spend, 2)}</strong> SCU
          </span>
          <span className="text-muted">
            Bid requests <strong className="num text-ink">{compact(focus.visibleBidRequests)}</strong> visible
          </span>
        </div>
      )}
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          points={points}
          value={p => p.visibleSpend}
          ghost={p => p.spend}
          kind="bar"
          unit="SCU"
          active={activeMonth}
          hover={hover}
          onHover={setHover}
          label="Gross spend, SCU · dark = visible view, light = all rows"
        />
        <Panel
          points={points}
          value={p => p.visibleBidRequests}
          kind="line"
          unit="bid requests"
          active={activeMonth}
          hover={hover}
          onHover={setHover}
          label="Bid requests, visible view"
        />
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-accent">Show the numbers</summary>
        <div className="mt-3">
          <TableShell minWidth="720px">
            <thead>
              <tr>
                <Th>Month</Th>
                <Th right>Visible networks</Th>
                <Th right>Visible bid requests</Th>
                <Th right>Visible spend (SCU)</Th>
                <Th right>RPMBr</Th>
                <Th right>All-row spend (SCU)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {points.map(p => (
                <tr key={p.month} className={cx(p.month === activeMonth && 'bg-accent-soft/60')}>
                  <td className="px-4 py-2 font-medium text-ink">{monthLabel(p.month)}</td>
                  <td className="num px-4 py-2 text-right text-ink-2">{fmt(p.visibleNetworks)}</td>
                  <td className="num px-4 py-2 text-right text-ink-2">{fmt(p.visibleBidRequests)}</td>
                  <td className="num px-4 py-2 text-right text-ink">{fmt(p.visibleSpend, 2)}</td>
                  <td className="num px-4 py-2 text-right text-ink-2">
                    {p.visibleBidRequests ? fmt((p.visibleSpend / p.visibleBidRequests) * 1_000_000, 2) : '—'}
                  </td>
                  <td className="num px-4 py-2 text-right text-muted">{fmt(p.spend, 2)}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      </details>
    </Card>
  );
};
