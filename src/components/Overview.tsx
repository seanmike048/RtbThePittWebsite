import React from 'react';
import { Activity, Building2, CheckCircle2, Coins, Radio, ShieldAlert, TrendingDown } from 'lucide-react';
import { PRIORITY_COLORS, PRIORITY_LABELS, type RTBViewModel } from '../lib/adapter/types.ts';
import { Badge, Card, cx, Eyebrow, formatAmount, formatCompact, formatTimestamp, InfoTip } from './ui.tsx';

/* ---------- Hero: incident headline ---------- */

export const IncidentHero: React.FC<{ model: RTBViewModel }> = ({ model }) => {
  const { overview, investigation, disconnections } = model;
  const pc = PRIORITY_COLORS[overview.priority] ?? PRIORITY_COLORS.UNAVAILABLE;
  const stillCut = disconnections.filter(d => d.status === 'still_disconnected').length;
  const cut = disconnections[0] ? formatTimestamp(disconnections[0].disconnectionTimestamp) : null;

  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-transparent blur-2xl"
      />
      <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="danger" dot>
              Amazon DSP disconnection
            </Badge>
            {stillCut > 0 && (
              <Badge tone="neutral">
                {stillCut} of {disconnections.length} seats still cut
              </Badge>
            )}
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{overview.publisherName}</h1>
          <p className="num mt-1 text-sm text-muted">
            Network #{overview.publisherId}
            {cut && (
              <>
                {' '}· cut {cut.date} at {cut.time} ({model.metadata.timezone})
              </>
            )}
          </p>

          {investigation.finding ? (
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-ink-2">{investigation.finding}</p>
          ) : (
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted">
              Bid requests fell <strong className="text-danger">{overview.reportedChangePct}%</strong> after Amazon DSP seats{' '}
              {overview.distinctPartnerIds.map(id => `#${id}`).join(' and ')} were cut. The validated finding appears once the
              workflow report is finalized.
            </p>
          )}
        </div>

        <div className="flex flex-row gap-3 lg:w-56 lg:flex-col">
          <div className={cx('flex-1 rounded-2xl border p-4', pc.bg, pc.border)}>
            <div className="flex items-center justify-between">
              <Eyebrow>Priority</Eyebrow>
              <InfoTip title="Backend priority boundary">
                Priority (P0–P4, P?) and confidence come only from deterministic backend nodes in executed reports. The
                frontend never recalculates, predicts or overrides them.
              </InfoTip>
            </div>
            <p className={cx('num mt-2 text-xl font-bold', pc.text)}>
              {overview.priority === 'UNAVAILABLE' ? 'Pending' : PRIORITY_LABELS[overview.priority]}
            </p>
            <p className="mt-1 text-xs text-muted">
              {overview.prioritySource === 'explicit_backend' ? 'From validated report' : 'Not in raw input'}
            </p>
          </div>
          <div className="flex-1 rounded-2xl border border-line bg-surface-2 p-4">
            <Eyebrow>Confidence</Eyebrow>
            <p className="num mt-2 text-xl font-bold text-ink">
              {overview.confidence === 'UNAVAILABLE' ? <span className="text-muted">Pending</span> : overview.confidence}
            </p>
            <p className="mt-1 text-xs text-muted">
              {overview.confidenceSource === 'explicit_backend' ? 'From validated report' : 'Awaiting execution'}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};

/* ---------- KPI row ---------- */

const Kpi: React.FC<{
  icon: React.ReactNode;
  label: string;
  tip: { title: string; body: string };
  footer: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, label, tip, footer, children }) => (
  <Card as="article" className="flex flex-col p-5">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <InfoTip title={tip.title}>{tip.body}</InfoTip>
    </div>
    <div className="mt-3 flex-1">{children}</div>
    <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">{footer}</p>
  </Card>
);

export const KpiRow: React.FC<{ model: RTBViewModel }> = ({ model }) => {
  const { overview, validation } = model;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        icon={<TrendingDown className="h-4 w-4" />}
        label="Bid-request change"
        tip={{
          title: 'Bid-request drop telemetry',
          body: `7-day pre-cut vs post-cut comparison: ${overview.bidRequestsBefore.toLocaleString()} → ${overview.bidRequestsAfter.toLocaleString()} requests.`,
        }}
        footer={<span className="num">{model.metadata.metricPeriod}</span>}
      >
        <p className="num text-3xl font-bold text-danger">
          {overview.reportedChangePct > 0 ? '+' : ''}
          {overview.reportedChangePct}%
        </p>
        <p className="num mt-1 text-sm text-muted">
          {formatCompact(overview.bidRequestsBefore)} → {formatCompact(overview.bidRequestsAfter)}
        </p>
      </Kpi>

      <Kpi
        icon={<Coins className="h-4 w-4" />}
        label="7-day pre-cut spend"
        tip={{
          title: 'Revenue guardrail',
          body: 'Historical run-rate only — never labelled as lost or recoverable revenue. Without a currency, amounts are shown per seat and never summed.',
        }}
        footer="Historical spend before the cut. Not lost revenue."
      >
        {overview.totalRevenuePrior7d !== null ? (
          <p className="num text-3xl font-bold text-ink">{formatAmount(overview.totalRevenuePrior7d)}</p>
        ) : (
          <ul className="space-y-1.5">
            {overview.revenuePrior7dDays.map(r => (
              <li key={r.partnerId} className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-muted">Seat #{r.partnerId}</span>
                <span className="num text-lg font-semibold text-ink">{formatAmount(r.amount)}</span>
              </li>
            ))}
            <li>
              <Badge tone="warn" className="mt-1">
                Currency not provided
              </Badge>
            </li>
          </ul>
        )}
      </Kpi>

      <Kpi
        icon={<Building2 className="h-4 w-4" />}
        label="Partner seats"
        tip={{
          title: 'Partner counting rule',
          body: 'Distinct partner IDs are separate buying seats under Amazon DSP (e.g. US and EMEA) — not distinct DSP companies.',
        }}
        footer={overview.partnerSeatsNote}
      >
        <p className="num text-3xl font-bold text-ink">{overview.distinctPartnerIds.length}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {overview.distinctPartnerIds.map(id => (
            <Badge key={id} tone="accent">
              <Radio className="h-3 w-3" />#{id}
            </Badge>
          ))}
        </div>
      </Kpi>

      <Kpi
        icon={<ShieldAlert className="h-4 w-4" />}
        label="Output validation"
        tip={{
          title: 'Boundary C',
          body: 'Generated language is checked against source facts. Issues and fallback fields are reported, never hidden.',
        }}
        footer={validation.isFinalizedReportSupplied ? 'Validated by Boundary C assembly' : 'Runs when the report is finalized'}
      >
        {validation.isFinalizedReportSupplied ? (
          <div className="flex items-center gap-2">
            {validation.issues.length === 0 ? (
              <CheckCircle2 className="h-7 w-7 text-ok" />
            ) : (
              <ShieldAlert className="h-7 w-7 text-danger" />
            )}
            <p className="text-2xl font-bold text-ink">
              {validation.issues.length === 0 ? 'Passed' : `${validation.issues.length} issues`}
            </p>
          </div>
        ) : (
          <p className="text-2xl font-bold text-muted">Not run</p>
        )}
        <p className="mt-1 text-sm text-muted">
          Fallback fields: {validation.fallbackFields.length ? validation.fallbackFields.join(', ') : 'none'}
        </p>
      </Kpi>
    </div>
  );
};

/* ---------- Collapse chart + timeline ---------- */

export const ImpactAndTimeline: React.FC<{ model: RTBViewModel }> = ({ model }) => {
  const { overview, metadata, disconnections } = model;
  const before = overview.bidRequestsBefore;
  const after = overview.bidRequestsAfter;
  const ratio = before > 0 ? (after / before) * 100 : 0;
  const [prePeriod, postPeriod] = metadata.metricPeriod.split(/\s+vs\s+/);
  const cut = disconnections[0];
  const seats = disconnections.map(d => d.partnerName).join(' and ');

  const steps = [
    {
      tone: 'accent' as const,
      title: 'Baseline period',
      when: prePeriod ?? '—',
      body: `${formatCompact(before)} bid requests across the Amazon DSP seats.`,
    },
    {
      tone: 'danger' as const,
      title: disconnections.length > 1 ? 'Simultaneous seat cut' : 'Seat cut',
      when: cut?.disconnectionTimestamp ?? '—',
      body: `${seats || 'Partner seats'} disconnected. ${
        disconnections.every(d => d.status === 'still_disconnected') ? 'No reconnection recorded.' : ''
      }`,
    },
    {
      tone: 'warn' as const,
      title: 'Post-cut measurement',
      when: postPeriod ?? '—',
      body: `${formatCompact(after)} residual bid requests (${overview.reportedChangePct}%).`,
    },
  ];

  const dot = { accent: 'bg-accent', danger: 'bg-danger', warn: 'bg-warn' };
  const ring = { accent: 'ring-accent/20', danger: 'ring-danger/20', warn: 'ring-warn/20' };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Card className="p-6 lg:col-span-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow tone="accent">Demand flow impact</Eyebrow>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Bid-request collapse</h2>
            <p className="mt-1 text-sm text-muted">Ad server request volume, 7 days before vs 7 days after the cut.</p>
          </div>
          <Badge tone="danger">
            <Activity className="h-3 w-3" />
            {Math.abs(overview.reportedChangePct)}% interruption
          </Badge>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink-2">Before</span>
              <span className="num text-2xl font-bold text-ink">{formatCompact(before)}</span>
            </div>
            <div className="mt-2 h-4 overflow-hidden rounded-full bg-surface-2">
              <div className="anim-grow-x h-full w-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
            </div>
            <p className="num mt-1.5 text-xs text-muted">{before.toLocaleString()} requests · {prePeriod}</p>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink-2">After</span>
              <span className="num text-2xl font-bold text-danger">{formatCompact(after)}</span>
            </div>
            <div className="mt-2 h-4 overflow-hidden rounded-full bg-surface-2">
              <div
                className="anim-grow-x h-full rounded-full bg-danger"
                style={{ width: `${Math.max(1.5, ratio)}%`, animationDelay: '0.2s' }}
              />
            </div>
            <p className="num mt-1.5 text-xs text-muted">
              {after.toLocaleString()} requests · {ratio.toFixed(1)}% of baseline · {postPeriod}
            </p>
          </div>
        </div>

        <p className="mt-6 border-t border-line pt-3 text-xs text-muted">Source: Equativ AdServer Log Stream</p>
      </Card>

      <Card className="p-6 lg:col-span-2">
        <Eyebrow tone="warn">Event sequence</Eyebrow>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Disconnection timeline</h2>
        <p className="mt-1 text-sm text-muted">Times shown in source timezone ({metadata.timezone}).</p>

        <ol className="relative mt-6 space-y-6 border-l border-line pl-6">
          {steps.map(s => (
            <li key={s.title} className="relative">
              <span className={cx('absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4', dot[s.tone], ring[s.tone])} />
              <p className={cx('text-sm font-semibold', s.tone === 'danger' ? 'text-danger' : 'text-ink')}>{s.title}</p>
              <p className="num mt-0.5 text-xs text-muted">{s.when}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
};
