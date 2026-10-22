import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sankey as d3sankey, sankeyLinkHorizontal, type SankeyGraph } from 'd3-sankey';
import { SANKEY_COLUMNS, fmtMoney, type SankeyLink, type SankeyNode } from '../../lib/pitt/engine.ts';
import { ChartTable } from './bits.tsx';

type N = SankeyNode & { x0?: number; x1?: number; y0?: number; y1?: number; index?: number };
type L = { source: N; target: N; value: number; width?: number; y0?: number; y1?: number };

// Theme tokens only (index.css), so the flow follows light and dark like every other chart.
const COLUMN_COLORS = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-5)', 'var(--chart-2)', 'var(--chart-removed)'];
const colorOf = (n: N) => (n.column === 4 ? (n.name === 'Reconnected' ? 'var(--ok)' : 'var(--chart-removed)') : n.column === 3 && n.name === 'No failing check' ? 'var(--faint)' : COLUMN_COLORS[n.column]);

/**
 * Revenue at risk flow. Layout geometry comes from d3-sankey; every value and share comes from engine.sankey().
 * Keyboard: Tab to the chart, arrows step along the flow (left/right between columns, up/down within one), Escape exits.
 */
export const SankeyFlow: React.FC<{ nodes: SankeyNode[]; links: SankeyLink[]; symbol: string; undrawn: number }> = ({ nodes, links, symbol, undrawn }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(560, Math.round(e.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const height = Math.max(320, Math.min(720, nodes.filter((n) => n.column === 2).length * 22 + 60));

  const graph = useMemo(() => {
    if (!nodes.length) return null;
    const g = d3sankey<N, L>()
      .nodeId((d) => d.id)
      .nodeWidth(12)
      .nodePadding(8)
      .nodeSort((a, b) => b.value - a.value)
      .extent([[1, 18], [width - 1, height - 4]]);
    return g({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) } as unknown as SankeyGraph<N, L>) as unknown as { nodes: N[]; links: L[] };
  }, [nodes, links, width, height]);

  const byColumn = useMemo(() => {
    const m: N[][] = [[], [], [], [], []];
    for (const n of graph?.nodes ?? []) m[n.column].push(n);
    m.forEach((c) => c.sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0)));
    return m;
  }, [graph]);

  const current = graph?.nodes.find((n) => n.id === focus) ?? null;
  const related = useMemo(() => {
    if (!current || !graph) return null;
    // Highlight every path through the focused node (upstream and downstream).
    const ids = new Set<string>([current.id]);
    const walk = (id: string, dir: 'up' | 'down') => {
      for (const l of graph.links) {
        const [from, to] = dir === 'down' ? [l.source.id, l.target.id] : [l.target.id, l.source.id];
        if (from === id && !ids.has(to)) {
          ids.add(to);
          walk(to, dir);
        }
      }
    };
    walk(current.id, 'down');
    walk(current.id, 'up');
    return ids;
  }, [current, graph]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!graph) return;
    if (e.key === 'Escape') {
      setFocus(null);
      (e.currentTarget as HTMLElement).blur();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    if (!current) return setFocus(byColumn[0][0]?.id ?? null);
    const col = byColumn[current.column];
    const i = col.findIndex((n) => n.id === current.id);
    if (e.key === 'ArrowDown') return setFocus(col[Math.min(col.length - 1, i + 1)].id);
    if (e.key === 'ArrowUp') return setFocus(col[Math.max(0, i - 1)].id);
    const candidates = graph.links
      .filter((l) => (e.key === 'ArrowRight' ? l.source.id === current.id : l.target.id === current.id))
      .sort((a, b) => b.value - a.value)
      .map((l) => (e.key === 'ArrowRight' ? l.target : l.source));
    if (candidates[0]) setFocus(candidates[0].id);
  };

  if (!graph) return <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm italic text-muted">No data: no seat in this cohort has a recorded spend to draw.</p>;

  return (
    <div>
      <div ref={wrap} className="overflow-x-auto">
        <div
          tabIndex={0}
          role="group"
          aria-roledescription="flow diagram"
          aria-label="Revenue at risk flow. Use the arrow keys to step along the flow, Escape to exit."
          onKeyDown={onKey}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setFocus(null)}
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg width={width} height={height} className="block" aria-hidden>
            {SANKEY_COLUMNS.map((c, i) => {
              const x = byColumn[i][0]?.x0;
              return x == null ? null : (
                <text key={c} x={i === 4 ? x + 12 : x} y={11} textAnchor={i === 4 ? 'end' : 'start'} className="fill-[var(--muted)] text-[10px] font-semibold uppercase tracking-wider">
                  {c}
                </text>
              );
            })}
            <g fill="none">
              {graph.links.map((l, i) => {
                const on = !related || (related.has(l.source.id) && related.has(l.target.id));
                return (
                  <path
                    key={i}
                    d={sankeyLinkHorizontal()(l as never) ?? undefined}
                    stroke={colorOf(l.target)}
                    strokeOpacity={on ? 0.42 : 0.06}
                    strokeWidth={Math.max(1, l.width ?? 1)}
                    className="room-flow"
                    style={{ animationDelay: l.source.column * 120 + 'ms' }}
                  >
                    <title>
                      {l.source.name} → {l.target.name}: {fmtMoney(l.value, symbol)}
                    </title>
                  </path>
                );
              })}
            </g>
            {graph.nodes.map((n) => {
              const on = !related || related.has(n.id);
              const left = n.column < 4;
              return (
                <g key={n.id} opacity={on ? 1 : 0.25} onClick={() => setFocus(n.id === focus ? null : n.id)} className="cursor-pointer">
                  <rect x={n.x0} y={n.y0} width={(n.x1 ?? 0) - (n.x0 ?? 0)} height={Math.max(1, (n.y1 ?? 0) - (n.y0 ?? 0))} rx={2} fill={colorOf(n)} stroke={n.id === focus ? 'var(--ink)' : 'none'} strokeWidth={2} />
                  {((n.y1 ?? 0) - (n.y0 ?? 0) >= (n.column === 2 ? 15 : 11) || n.id === focus) && (
                    <text x={left ? (n.x1 ?? 0) + 5 : (n.x0 ?? 0) - 5} y={((n.y0 ?? 0) + (n.y1 ?? 0)) / 2} dy="0.35em" textAnchor={left ? 'start' : 'end'} className="fill-[var(--ink-2)] text-[10.5px]">
                      {n.name} · <tspan className="num fill-[var(--ink)] font-semibold">{fmtMoney(n.value, symbol)}</tspan> <tspan className="fill-[var(--muted)]">{n.share.toFixed(1)}%</tspan>
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {current ? SANKEY_COLUMNS[current.column] + ': ' + current.name + ', ' + fmtMoney(current.value, symbol) + ', ' + current.share.toFixed(1) + ' percent of the flow' : ''}
      </p>
      {current && (
        <p className="mt-2 text-xs text-ink-2">
          <span className="text-muted">{SANKEY_COLUMNS[current.column]}:</span> <strong className="text-ink">{current.name}</strong> · <span className="num">{fmtMoney(current.value, symbol)}</span> ·{' '}
          <span className="num">{current.share.toFixed(1)}%</span> of the drawn flow. Arrows to move, Escape to exit.
        </p>
      )}
      {undrawn > 0 && <p className="mt-2 text-xs text-muted">{undrawn} seat row(s) have no recorded spend (No data) and cannot be drawn; they still count in the table.</p>}
      <ChartTable
        caption="Revenue at risk flow, by node"
        head={['Column', 'Node', 'Weekly spend before the cut', 'Share of the flow']}
        right={[2, 3]}
        rows={graph.nodes
          .slice()
          .sort((a, b) => a.column - b.column || b.value - a.value)
          .map((n) => [SANKEY_COLUMNS[n.column], n.name, fmtMoney(n.value, symbol), n.share.toFixed(1) + '%'])}
      />
    </div>
  );
};
