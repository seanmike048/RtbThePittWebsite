import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtCompact, fmtMoney, waterfall, type Row } from '../../lib/pitt/engine.ts';
import { ChartTable, Panel } from './bits.tsx';

const COLOR = { total: '#7c83ff', loss: '#ff6b81', gain: '#3fd69b' } as const;

/** Revenue variance: weekly spend before the cut → per-seat cuts → recovered → current run rate. */
export const WaterfallPanel: React.FC<{ rows: Row[]; symbol: string }> = ({ rows, symbol }) => {
  const steps = useMemo(() => waterfall(rows), [rows]);
  const empty = steps[0].value === 0;
  return (
    <Panel id="waterfall" eyebrow="Revenue variance" title="Weekly Amazon spend of these networks, before and now" description="Seats without recorded spend are left out (No data).">
      {empty ? (
        <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm italic text-muted">No data: no seat in this cohort has a recorded spend.</p>
      ) : (
        <>
          <div className="h-64" role="img" aria-label={'Waterfall: ' + steps.map((s) => s.name + ' ' + fmtMoney(s.value, symbol)).join(', ')}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={steps} margin={{ top: 8, right: 8, bottom: 40, left: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="name" interval={0} tick={{ fill: 'var(--muted)', fontSize: 9.5 }} angle={-20} textAnchor="end" height={52} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
                <YAxis tickFormatter={(v) => fmtCompact(v as number)} tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 12 }}
                  formatter={(_v, name, p) => (name === 'size' ? [fmtMoney((p.payload as { value: number }).value, symbol), 'Change'] : [null, null])}
                />
                <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
                <Bar dataKey="size" stackId="w" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {steps.map((s) => (
                    <Cell key={s.name} fill={COLOR[s.kind]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartTable caption="Revenue variance steps" head={['Step', 'Change', 'Level after']} right={[1, 2]} rows={steps.map((s) => [s.name, fmtMoney(s.value, symbol), fmtMoney(s.end, symbol)])} />
        </>
      )}
    </Panel>
  );
};
