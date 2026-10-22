/**
 * Semantic theme contract. Raw light and dark values live once, in src/index.css; everything here is a reference to
 * those CSS variables, so every route, chart, tooltip and modal resolves the same theme (data-theme on <html>).
 * Use these where a class cannot be used (chart libraries, inline SVG). Never put a raw colour here.
 */
export const theme = {
  color: {
    background: 'var(--canvas)',
    surface: 'var(--surface)',
    surfaceRaised: 'var(--surface-raised)',
    textPrimary: 'var(--ink)',
    textSecondary: 'var(--ink-2)',
    textMuted: 'var(--muted)',
    border: 'var(--line)',
    borderStrong: 'var(--line-strong)',
    divider: 'var(--divider)',
    actionPrimary: 'var(--accent)',
    onAction: 'var(--on-accent)',
    focus: 'var(--focus)',
    success: 'var(--ok)',
    warning: 'var(--warn)',
    error: 'var(--danger)',
    info: 'var(--info)',
  },
  chart: {
    /** Categorical series, in order. */
    series: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'],
    /** Roles with a fixed meaning: do not reuse them for unrelated series. */
    removed: 'var(--chart-removed)',
    live: 'var(--chart-live)',
    measure: 'var(--chart-measure)',
    positive: 'var(--ok)',
    neutral: 'var(--faint)',
    grid: 'var(--chart-grid)',
    axisText: 'var(--muted)',
    axisLine: 'var(--line)',
    label: 'var(--ink)',
  },
} as const;

/** Axis ticks: subordinate to the data. */
export const axisTick = { fill: theme.chart.axisText, fontSize: 11 } as const;

/** One tooltip for every chart: raised surface, readable text, the same in both themes. */
export const chartTooltip = {
  contentStyle: {
    background: 'var(--tooltip)',
    border: '1px solid var(--tooltip-line)',
    borderRadius: 6,
    boxShadow: 'var(--shadow)',
    color: 'var(--tooltip-ink)',
    fontSize: 12,
    padding: '6px 10px',
  },
  labelStyle: { color: 'var(--muted)', marginBottom: 2 },
  itemStyle: { color: 'var(--tooltip-ink)', padding: 0 },
  cursor: { fill: 'var(--surface-2)', stroke: 'var(--line-strong)' },
} as const;
