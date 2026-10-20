import React from 'react';
import { AlertTriangle, BarChart3, CalendarRange, Coins, Database, GitCompare, Layers, ListChecks } from 'lucide-react';
import {
  ALL_ROW_VIEW,
  BASELINE_METRICS,
  CURRENCY_WARNING,
  EARLIER_SNAPSHOT,
  RPMBR_FORMULA,
  SNOWFLAKE_MAPPING,
  SPEND_UNIT,
  VISIBLE_VIEW,
  WORKBOOK,
} from '../../lib/cfo437/baseline.ts';
import type { Aggregate } from '../../lib/cfo437/publishers.ts';
import type { ConnectionState } from '../../lib/cfo437/live.ts';
import { Badge, Card, cx, EmptyNote, SectionHeading, TableShell, Th } from '../ui.tsx';
import { ClassTag, compact, fmt, HBar, Notice, SectionAnchor } from './shared.tsx';
import { useBaseline } from './baselineContext.tsx';

export const ScopeBadge: React.FC = () => {
  const b = useBaseline();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        Amazon DSP · Endpoint 437 · Americas Display · {b.period}
      </span>
      <Badge tone={b.source === 'live' ? 'ok' : 'neutral'} dot>
        {b.source === 'live' ? 'Live Snowflake data' : 'Validated workbook data'}
      </Badge>
    </span>
  );
};

export const ExecutiveSummary: React.FC<{ currencyValidated: boolean; connection: ConnectionState }> = ({ currencyValidated, connection }) => {
  const b = useBaseline();
  const V = b.view;
  return (
  <section className="space-y-4">
    <SectionAnchor id="c4-summary" />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[
        { label: `Gross spend · ${b.period}`, value: compact(V.spend), unit: SPEND_UNIT, c: 'observed' as const },
        { label: 'Bid requests', value: compact(V.bidRequests), unit: 'bid requests', c: 'observed' as const },
        { label: 'Weighted RPMBr', value: fmt(V.weightedRpmbr, 4), unit: 'SCU per 1M bid requests', c: 'calculated' as const },
        { label: 'Top 16 concentration', value: `${V.top16SharePct.toFixed(2)}%`, unit: 'of visible spend', c: 'calculated' as const },
      ].map(k => (
        <div key={k.label} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-muted">{k.label}</p>
          </div>
          <p className="num mt-2 text-2xl font-bold tracking-tight text-ink">{k.value}</p>
          <p className="mt-1 text-xs text-muted">{k.unit}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <ClassTag c={k.c} />
            {b.source === 'live' && <Badge tone="ok">Live</Badge>}
          </div>
        </div>
      ))}
    </div>

    <Card className="p-6 sm:p-8">
      <SectionHeading icon={<ListChecks className="h-5 w-5" />} eyebrow="Executive CFO summary" title="What The Pitt can change on endpoint 437" />
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Notice tone="ok">
          <strong>{b.source === 'live' ? 'Live baseline. ' : 'Validated baseline. '}</strong>
          In {b.period}, the {fmt(V.rows)} visible publisher rows on Amazon DSP endpoint 437 (Americas Display) carried{' '}
          {fmt(V.spend, 2)} {SPEND_UNIT} of gross spend on {fmt(V.bidRequests)} bid requests, a weighted RPMBr of{' '}
          {fmt(V.weightedRpmbr, 4)}. {fmt(V.positiveRows)} rows had spend and {fmt(V.zeroRows)} had none.
        </Notice>
        <Notice tone="info">
          <strong>Where the money sits. </strong>
          The top 16 publishers hold {V.top16SharePct.toFixed(2)}% of visible spend, so resolving issues on a handful of
          publishers moves most of the value. Snowflake confirms partner 437 is “{SNOWFLAKE_MAPPING.partnerName}”, with{' '}
          {connection.disconnected} networks disconnected ({connection.source === 'live' ? 'live' : `as of ${connection.asOf}`}).
        </Notice>
        <Notice tone="warn">
          <strong>Not yet measurable. </strong>
          Issue-specific spend at risk, detection times, recovery history and labour inputs are not validated. Every impact figure
          on this page is scenario arithmetic until they are.
        </Notice>
        <Notice tone="danger">
          <strong>Currency and ROI. </strong>
          {currencyValidated ? 'Finance has marked the currency validated on this page. ' : `${CURRENCY_WARNING} `}
          ROI, NPV, payback and IRR stay unavailable until implementation cost, operating cost, labour cost and currency are
          validated.
        </Notice>
      </div>
    </Card>
  </section>
  );
};

export const ScopeAndFreshness: React.FC<{
  currencyValidated: boolean;
  onCurrencyValidated: (v: boolean) => void;
  currencyCode: string;
  onCurrencyCode: (v: string) => void;
  connection: ConnectionState;
}> = ({ currencyValidated, onCurrencyValidated, currencyCode, onCurrencyCode, connection }) => {
  const b = useBaseline();
  return (
  <Card className="p-6 sm:p-8">
    <SectionAnchor id="c4-scope" />
    <SectionHeading
      icon={<CalendarRange className="h-5 w-5" />}
      eyebrow="Scope & data freshness"
      title="What this page covers"
      description={
        <>
          Only Amazon DSP endpoint 437, Americas Display, {b.month}-01 to {b.month}-{b.days}. Endpoint 489, Native, Video and other
          DSP endpoints are excluded from every CFO calculation.
        </>
      }
    />
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-line p-5">
        <p className="text-xs font-medium text-muted">Primary source</p>
        <p className="mt-1 font-semibold text-ink">{WORKBOOK.name}</p>
        <p className="mt-1 text-sm text-ink-2">
          Worksheet <span className="num text-xs">{WORKBOOK.primarySheet}</span>, validated against{' '}
          <span className="num text-xs">{WORKBOOK.validationSheet}</span>.
        </p>
        <a href={WORKBOOK.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
          Open workbook ↗
        </a>
      </div>
      <div className="rounded-2xl border border-line p-5">
        <p className="text-xs font-medium text-muted">Baseline definition</p>
        <p className="mt-1 font-semibold text-ink">Visible filtered view</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          {WORKBOOK.visibleFilter}. This is the workbook's visible view. It is <strong className="text-ink">not</strong> the separate{' '}
          <span className="num text-xs">In Scope = 1</span> flag, which selects a different population.
        </p>
      </div>
      <div className="rounded-2xl border border-line p-5">
        <p className="text-xs font-medium text-muted">Endpoint mapping · Snowflake</p>
        <p className="mt-1 font-semibold text-ink">
          437 = {SNOWFLAKE_MAPPING.partnerName} <Badge tone="ok">Validated</Badge>
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          {fmt(connection.connected)} connected and {connection.disconnected} disconnected networks; latest cut{' '}
          {connection.latestCut ?? '—'}. {connection.source === 'live' ? `Refreshed ${connection.asOf}.` : `Snapshot ${connection.asOf}.`}
        </p>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Notice tone="warn" icon={<Coins className="h-4 w-4 text-warn" />}>
        <strong>{CURRENCY_WARNING} </strong>
        The workbook does not document the currency of <span className="num text-xs">SPEND_GROSS_PARTNER_REVENUE</span>. Values are
        shown as {SPEND_UNIT} (SCU), never converted, and never added to revenue-at-risk values from other sources. The worksheet
        formats these cells with a “$” sign; cell formatting is not documentation of the currency, so it stays unvalidated until
        Finance confirms it.
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              id="c4-currency-validated"
              type="checkbox"
              checked={currencyValidated}
              onChange={e => onCurrencyValidated(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Finance has validated the currency
          </label>
          {currencyValidated && (
            <input
              id="c4-currency-code"
              value={currencyCode}
              onChange={e => onCurrencyCode(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="ISO code"
              aria-label="Validated currency code"
              className="num w-24 rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none"
            />
          )}
        </div>
      </Notice>
      <Notice tone="info" icon={<Database className="h-4 w-4 text-info" />}>
        <strong>RPMBr definition. </strong>
        <span className="num text-xs">{RPMBR_FORMULA}</span>. RPMBr is spend per one million bid requests in this workbook, so every
        RPMBr-based calculation divides by 1,000,000, not 1,000.
      </Notice>
    </div>

    <h3 className="mt-8 flex items-center gap-2 font-semibold text-ink">
      <GitCompare className="h-4 w-4 text-warn" /> Snapshot discrepancy
    </h3>
    <p className="mt-1 text-sm text-muted">
      An earlier validation gave different figures. The latest workbook is used; the earlier snapshot is shown, not merged.
    </p>
    <div className="mt-3">
      <TableShell minWidth="560px">
        <thead>
          <tr>
            <Th>Snapshot</Th>
            <Th right>Rows</Th>
            <Th right>Positive</Th>
            <Th right>Zero</Th>
            <Th right>Weighted RPMBr</Th>
            <Th right>Median RPMBr</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          <tr className="text-muted">
            <td className="px-4 py-3">
              {EARLIER_SNAPSHOT.label} <Badge tone="neutral">Superseded</Badge>
            </td>
            <td className="num px-4 py-3 text-right">{EARLIER_SNAPSHOT.rows}</td>
            <td className="num px-4 py-3 text-right">{EARLIER_SNAPSHOT.positiveRows}</td>
            <td className="num px-4 py-3 text-right">{EARLIER_SNAPSHOT.zeroRows}</td>
            <td className="num px-4 py-3 text-right">≈ {EARLIER_SNAPSHOT.weightedRpmbr}</td>
            <td className="num px-4 py-3 text-right">≈ {EARLIER_SNAPSHOT.medianPositiveRpmbr}</td>
          </tr>
          <tr>
            <td className="px-4 py-3 font-medium text-ink">
              Latest workbook <Badge tone="ok">In use</Badge>
            </td>
            <td className="num px-4 py-3 text-right font-semibold text-ink">{VISIBLE_VIEW.rows}</td>
            <td className="num px-4 py-3 text-right font-semibold text-ink">{VISIBLE_VIEW.positiveRows}</td>
            <td className="num px-4 py-3 text-right font-semibold text-ink">{VISIBLE_VIEW.zeroRows}</td>
            <td className="num px-4 py-3 text-right font-semibold text-ink">{fmt(VISIBLE_VIEW.weightedRpmbr, 4)}</td>
            <td className="num px-4 py-3 text-right font-semibold text-ink">{fmt(VISIBLE_VIEW.medianPositiveRpmbr, 4)}</td>
          </tr>
        </tbody>
      </TableShell>
    </div>
  </Card>
  );
};

const ViewTable: React.FC<{ agg?: Aggregate | null; aggAll?: Aggregate | null; loadedLabel: string; compare: boolean }> = ({
  agg,
  aggAll,
  loadedLabel,
  compare,
}) => {
  const rows: { label: string; v: (x: typeof VISIBLE_VIEW) => string; a?: (x: Aggregate) => string }[] = [
    { label: 'Publisher rows', v: x => fmt(x.rows), a: x => fmt(x.rows) },
    { label: 'Positive-spend rows', v: x => fmt(x.positiveRows), a: x => fmt(x.positiveRows) },
    { label: 'Zero-spend rows', v: x => fmt(x.zeroRows), a: x => fmt(x.zeroRows) },
    { label: 'Bid requests', v: x => fmt(x.bidRequests), a: x => fmt(x.bidRequests) },
    { label: `Gross spend (${'SCU'})`, v: x => fmt(x.spend, 6), a: x => fmt(x.spend, 6) },
    { label: 'Weighted RPMBr', v: x => fmt(x.weightedRpmbr, 8), a: x => fmt(x.weightedRpmbr, 8) },
    { label: 'Median positive RPMBr', v: x => fmt(x.medianPositiveRpmbr, 8), a: x => fmt(x.medianPositiveRpmbr, 8) },
    { label: 'Top 16 concentration', v: x => `${x.top16SharePct.toFixed(6)}%`, a: x => `${x.top16SharePct.toFixed(6)}%` },
  ];
  return (
    <TableShell minWidth="640px">
      <thead>
        <tr>
          <Th>Metric</Th>
          <Th right>Visible view (primary)</Th>
          <Th right>All-row validation</Th>
          {agg && <Th right>{loadedLabel}</Th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map(r => {
          const recomputed = agg && r.a ? r.a(agg) : null;
          const match = !compare || recomputed === null || recomputed === r.v(VISIBLE_VIEW);
          return (
            <tr key={r.label}>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{r.label}</td>
              <td className="num px-4 py-3 text-right font-semibold text-ink">{r.v(VISIBLE_VIEW)}</td>
              <td className="num px-4 py-3 text-right text-muted">{r.v(ALL_ROW_VIEW)}</td>
              {agg && (
                <td className={cx('num px-4 py-3 text-right', !compare ? 'text-ink' : match ? 'text-ok-ink' : 'font-semibold text-warn-ink')}>
                  {recomputed} {compare ? (match ? '✓' : '≠') : ''}
                  {aggAll && r.a && <span className="block text-[11px] text-muted">all rows: {r.a(aggAll)}</span>}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
};

export const EndpointBaseline: React.FC<{ agg: Aggregate | null; aggAll: Aggregate | null; rowsLabel: string }> = ({ agg, aggAll, rowsLabel }) => {
  const b = useBaseline();
  const V = b.view;
  const metrics =
    b.source === 'validated'
      ? BASELINE_METRICS
      : [
          { label: 'Visible publisher rows', value: fmt(V.rows), unit: 'rows', classification: 'observed' as const, source: 'Snowflake, live' },
          { label: 'Positive-spend rows', value: fmt(V.positiveRows), unit: 'rows', classification: 'calculated' as const, source: 'Visible rows' },
          { label: 'Zero-spend rows', value: fmt(V.zeroRows), unit: 'rows', classification: 'calculated' as const, source: 'Visible rows' },
          { label: 'Bid requests', value: fmt(V.bidRequests), unit: 'bid requests', classification: 'observed' as const, source: 'MONTH_SCO_NODES.BID_REQUESTS' },
          { label: 'Gross spend', value: fmt(V.spend, 6), unit: SPEND_UNIT, classification: 'observed' as const, source: 'MONTH_SCO_NODES.TOTAL_PAID_PRICE_TRUE_COUNT' },
          { label: 'Weighted RPMBr', value: fmt(V.weightedRpmbr, 8), unit: 'SCU per 1M bid requests', classification: 'calculated' as const, source: 'spend ÷ bid requests × 1,000,000' },
          { label: 'Median positive RPMBr', value: fmt(V.medianPositiveRpmbr, 8), unit: 'SCU per 1M bid requests', classification: 'calculated' as const, source: 'Positive-spend visible rows' },
          { label: 'Top 16 spend concentration', value: `${V.top16SharePct.toFixed(6)}%`, unit: 'share of spend', classification: 'calculated' as const, source: 'Visible rows ranked by spend' },
        ];
  return (
  <Card className="p-6 sm:p-8">
    <SectionAnchor id="c4-baseline" />
    <SectionHeading
      icon={<Layers className="h-5 w-5" />}
      eyebrow="Endpoint-437 display baseline"
      title={`${b.period} financial baseline`}
      description={`Spend in ${SPEND_UNIT}. RPMBr in SCU per 1,000,000 bid requests.`}
      aside={b.source === 'live' ? <Badge tone="ok" dot>Live Snowflake values</Badge> : <ClassTag c="observed">Validated workbook values</ClassTag>}
    />
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {metrics.map(m => (
        <div key={m.label} className="rounded-2xl border border-line p-4">
          <p className="text-xs font-medium text-muted">{m.label}</p>
          <p className="num mt-2 break-all text-lg font-bold text-ink">{m.value}</p>
          <p className="text-xs text-muted">{m.unit}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ClassTag c={m.classification} />
          </div>
          <p className="mt-1.5 text-[11px] text-faint">{m.source}</p>
        </div>
      ))}
    </div>
    <h3 className="mt-8 font-semibold text-ink">Validated workbook vs loaded rows</h3>
    <p className="mt-1 text-sm text-muted">
      The validated columns are the September 2026 workbook (visible view and all {fmt(ALL_ROW_VIEW.rows)} rows). The last column
      recomputes the same metrics from the rows currently loaded ({rowsLabel}).
      {b.month === '2026-09' ? ' A ≠ marks a difference from the validated figure.' : ' It is a different month, so it is not compared.'}
    </p>
    <div className="mt-3">
      <ViewTable agg={agg} aggAll={aggAll} loadedLabel={`Loaded rows · ${rowsLabel}`} compare={b.month === '2026-09'} />
    </div>
  </Card>
  );
};

export const Concentration: React.FC<{ agg: Aggregate | null; top: { name: string; spend: number }[] }> = ({ agg, top }) => {
  const b = useBaseline();
  const V = b.view;
  const maxSpend = top[0]?.spend ?? 0;
  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-concentration" />
      <SectionHeading
        icon={<BarChart3 className="h-5 w-5" />}
        eyebrow="Spend concentration"
        title="How concentrated endpoint-437 spend is"
        description={`${b.period}, visible view. Horizontal bars for shares; the monthly trend below shows the time series.`}
        aside={<ClassTag c="calculated" />}
      />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-line p-5">
          <h3 className="text-sm font-semibold text-ink">Top 16 share of spend</h3>
          <p className="mt-1 text-xs text-muted">% of gross spend, SCU · source: {b.source === 'live' ? 'Snowflake, live' : 'workbook'}</p>
          <div className="mt-5 space-y-4">
            <HBar label="Visible view · top 16" value={V.top16SharePct} max={100} display={`${V.top16SharePct.toFixed(2)}%`} />
            <HBar label={`Visible view · remaining ${fmt(Math.max(0, V.rows - 16))} rows`} value={100 - V.top16SharePct} max={100} display={`${(100 - V.top16SharePct).toFixed(2)}%`} tone="muted" />
            {b.source === 'validated' && (
              <HBar label="All-row view · top 16 (workbook validation)" value={ALL_ROW_VIEW.top16SharePct} max={100} display={`${ALL_ROW_VIEW.top16SharePct.toFixed(2)}%`} tone="warn" />
            )}
          </div>
          <h3 className="mt-8 text-sm font-semibold text-ink">Seller-type mix</h3>
          <p className="mt-1 text-xs text-muted">Rows and spend by seller type, visible view</p>
          {agg ? (
            <div className="mt-4 space-y-4">
              {agg.sellerMix.map(m => (
                <HBar
                  key={m.sellerType}
                  label={`${m.sellerType} · ${fmt(m.rows)} rows`}
                  value={m.spend}
                  max={agg.spend}
                  display={`${((m.spend / agg.spend) * 100).toFixed(2)}% · ${compact(m.spend)} SCU`}
                />
              ))}
            </div>
          ) : (
            <EmptyNote className="mt-3">
              The visible view contains BOTH and INTERMEDIARY seller types. Their split appears once the workbook rows are loaded.
            </EmptyNote>
          )}
        </div>
        <div className="rounded-2xl border border-line p-5">
          <h3 className="text-sm font-semibold text-ink">Top 16 publishers by spend</h3>
          <p className="mt-1 text-xs text-muted">Gross spend, SCU · visible view</p>
          {top.length ? (
            <div className="mt-5 space-y-3">
              {top.map(p => (
                <HBar
                  key={p.name}
                  label={p.name}
                  value={p.spend}
                  max={maxSpend}
                  display={`${compact(p.spend)} SCU · ${((p.spend / V.spend) * 100).toFixed(2)}%`}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <EmptyNote>No workbook rows are loaded. Use Refresh data or Publisher prioritization → Load workbook rows.</EmptyNote>
              <Notice tone="info" icon={<AlertTriangle className="h-4 w-4 text-info" />}>
                The aggregate share ({V.top16SharePct.toFixed(2)}%) is known; only the per-publisher names wait on the rows.
              </Notice>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
