import React, { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FUNNEL_STAGES, fmtCompact, fmtNum, funnel, type Row } from '../../lib/pitt/engine.ts';
import type { Dataset } from '../../lib/pitt/types.ts';
import { ChartTable, Panel } from './bits.tsx';

/** Demand funnel: Auctions → Bid requests → Bids → Wins → Impressions, for the cohort or one network. */
export const FunnelPanel: React.FC<{ ds: Dataset; rows: Row[] }> = ({ ds, rows }) => {
  const nets = useMemo(() => [...new Map(rows.map((r) => [r.NETWORK_ID, r.PUBLISHER])).entries()], [rows]);
  const [nid, setNid] = useState<number | null>(null);
  const f = useMemo(() => funnel(ds, rows, nid != null && nets.some(([id]) => id === nid) ? nid : null), [ds, rows, nid, nets]);

  return (
    <Panel
      id="funnel"
      eyebrow="Demand funnel"
      title="Where requests stop before a sale"
      description={f.networks ? 'Summed over ' + f.networks + ' network(s) in the cohort.' : undefined}
      aside={
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Network
          <select className="h-7 rounded-md border border-line bg-surface-2 px-1.5 text-xs text-ink" value={nid ?? ''} onChange={(e) => setNid(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Whole cohort</option>
            {nets.map(([id, name]) => (
              <option key={id} value={id}>
                {name} · #{id}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {!f.stages.length ? (
        <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm italic text-muted">No data: this data set has no demand funnel for these networks.</p>
      ) : (
        <>
          <div className="h-52" role="img" aria-label={'Demand funnel: ' + f.stages.map((s) => s.stage + ' ' + fmtCompact(s.intake)).join(', ')}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={f.stages} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }}>
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="stage" width={88} tick={{ fill: 'var(--ink-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [fmtNum(v as number), 'Intake']}
                />
                <Bar dataKey="intake" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {f.stages.map((s, i) => (
                    <Cell key={s.stage} fill={['#7c83ff', '#6f8bff', '#5aa9ff', '#3fd69b', '#7ce8be'][i]} />
                  ))}
                  <LabelList dataKey="intake" position="right" formatter={(v) => fmtCompact(v as number)} style={{ fill: 'var(--ink)', fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ol className="mt-2 space-y-2">
            {f.stages.slice(0, -1).map((s, i) => (
              <li key={s.stage} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
                <p className="text-ink-2">
                  <strong className="text-ink">{s.stage}</strong> → {FUNNEL_STAGES[i + 1]}: <span className="num">{s.continuedPct == null ? 'No data' : s.continuedPct.toFixed(1) + '%'}</span> continued ·{' '}
                  <span className="num">{fmtCompact(s.dropped)}</span> dropped
                </p>
                {s.reasons.length > 0 && (
                  <p className="mt-0.5 text-muted">
                    Top reasons: {s.reasons.map((r) => r.reason + ' ' + fmtCompact(r.count)).join(' · ')}
                    {s.moreReasons > 0 && <span> · +{s.moreReasons} more</span>}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <ChartTable
            caption="Demand funnel by stage"
            head={['Stage', 'Intake', 'Continued', 'Dropped', 'Top drop reasons']}
            right={[1, 2, 3]}
            rows={f.stages.map((s) => [s.stage, fmtNum(s.intake), s.continuedPct == null ? '—' : s.continuedPct.toFixed(1) + '%', s.dropped == null ? '—' : fmtNum(s.dropped), s.reasons.map((r) => r.reason).join(', ') + (s.moreReasons ? ' +' + s.moreReasons + ' more' : '')])}
          />
        </>
      )}
    </Panel>
  );
};
