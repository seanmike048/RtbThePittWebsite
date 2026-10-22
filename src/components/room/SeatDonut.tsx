import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { fmtMoney, type SeatShare } from '../../lib/pitt/engine.ts';
import { chartTooltip, theme } from '../../lib/theme.ts';
import { StateNote } from '../ui.tsx';

/** Revenue at risk by Amazon seat: thick ring (~30% of the radius), square-dot legend on the right, Maestro style. */
export const SeatDonut: React.FC<{ data: SeatShare[]; symbol: string }> = ({ data, symbol }) => {
  if (!data.length) return <StateNote kind="empty" title="No seat at risk">No still-disconnected seat has a recorded spend in this cohort.</StateNote>;
  const color = (i: number, id: string) => (id === 'other' ? theme.chart.other : theme.chart.series[i % theme.chart.series.length]);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="h-40 w-40 shrink-0" role="img" aria-label={'Revenue at risk by Amazon seat: ' + data.map((d) => `${d.label} ${fmtMoney(d.value, symbol)}`).join(', ')}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="100%" stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.id} fill={color(i, d.id)} />
              ))}
            </Pie>
            <Tooltip {...chartTooltip} formatter={(v, n) => [fmtMoney(v as number, symbol), n as string]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[13px]">
        {data.map((d, i) => (
          <li key={d.id} className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-ink-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(i, d.id) }} aria-hidden />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="num shrink-0 text-ink">
              {fmtMoney(d.value, symbol)} <span className="text-xs text-muted">{d.share.toFixed(0)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
