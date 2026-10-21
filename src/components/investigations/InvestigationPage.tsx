import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Database,
  GitCompare,
  Lightbulb,
  Link2,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Unlink,
  Users,
  XCircle,
} from 'lucide-react';
import { isAmazon, type NetworkContext, REASON_CODE_SEEN, type SeatEvent } from '../../lib/investigations/context.ts';
import { sqlConnections, sqlDaily, sqlEvents, toContext } from '../../lib/investigations/live.ts';
import type { InvestigationReport } from '../../lib/investigations/report.ts';
import { Badge, Button, Card, CopyButton, cx, Eyebrow, SectionHeading, TableShell, Th } from '../ui.tsx';
import { compact, fmt, Notice, SectionAnchor } from '../cfo437/shared.tsx';
import { describeError, nowStamp, useSnowflake } from '../live/useSnowflake.ts';
import { DailyChart } from './DailyChart.tsx';

type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info' | 'accent';

const confTone = (c: string | null): Tone => {
  const v = (c ?? '').toLowerCase();
  return v === 'high' ? 'ok' : v === 'medium' ? 'info' : v === 'low' ? 'warn' : 'neutral';
};

const checkLabel: Record<string, string> = { ads_txt: 'ads.txt', sco: 'SCO', blocked_inventory: 'Blocked inventory', ivt: 'IVT' };

/** What Equativ's own connection log says about the cut the workflow investigated. */
function logFinding(report: InvestigationReport, ctx: NetworkContext | null) {
  if (!ctx) return null;
  const sameDay = ctx.events.filter(e => isAmazon(e.partnerId) && e.cutAt.startsWith(report.disconnectedOn));
  const logged = sameDay.filter(e => e.comment && e.updatedBy);
  if (!logged.length) return null;
  const comments = [...new Set(logged.map(e => e.comment))];
  const people = [...new Set(logged.map(e => e.updatedBy))];
  const internal = people.every(p => /@equativ\.com$/i.test(p ?? ''));
  return { seats: sameDay.length, logged: logged.length, comments, people, internal, at: logged[0].cutAt, code: logged[0].reasonCode };
}

/** Sentences in the workflow's actions that cite a measured figure. */
function citedEvidence(report: InvestigationReport) {
  const out: { team: string; sentence: string }[] = [];
  for (const a of report.actions) {
    for (const s of a.text.split(/(?<=\.)\s+/)) if (/\d+(\.\d+)?%/.test(s)) out.push({ team: a.team, sentence: s.trim() });
  }
  return out;
}

export const InvestigationPage: React.FC<{
  reports: InvestigationReport[];
  selected: number;
  onSelect: (i: number) => void;
  contexts: Record<string, NetworkContext>;
  onContext: (c: NetworkContext) => void;
  onOpenImport: () => void;
}> = ({ reports, selected, onSelect, contexts, onContext, onOpenImport }) => {
  const report = reports[selected];
  const ctx = contexts[report.networkId] ?? null;
  const { available, query } = useSnowflake();
  const [status, setStatus] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; text?: string }>({ state: 'idle' });
  const [showAllEvents, setShowAllEvents] = useState(false);

  const finding = useMemo(() => logFinding(report, ctx), [report, ctx]);
  const evidence = useMemo(() => citedEvidence(report), [report]);
  const amazonCut = ctx?.events.filter(e => isAmazon(e.partnerId) && e.cutAt.startsWith(report.disconnectedOn)) ?? [];
  const reconciledRevenue = amazonCut.reduce((s, e) => s + (e.revenue7d ?? 0), 0);
  const revenueMatches = report.revenue7d.amount !== null && amazonCut.length > 0 && Math.round(reconciledRevenue) === Math.round(report.revenue7d.amount);

  const refresh = async () => {
    if (!ctx && !report.networkId) return;
    setStatus({ state: 'loading', text: 'Querying Snowflake…' });
    try {
      const base: NetworkContext =
        ctx ??
        ({
          networkId: report.networkId,
          networkName: report.network,
          asOf: '',
          source: 'live',
          owners: { kam: null, techOps: null, demandOps: null, businessUnit: null },
          connections: { connected: 0, disconnected: 0, partners: 0 },
          events: [],
          daily: [],
          related: [],
        } as NetworkContext);
      const [c, e, d] = await Promise.all([query(sqlConnections(report.networkId)), query(sqlEvents(report.networkId)), query(sqlDaily(report.networkId))]);
      const at = nowStamp();
      onContext(toContext(base, c, e, d, at));
      setStatus({ state: 'ok', text: `Refreshed ${at}` });
    } catch (err) {
      setStatus({ state: 'error', text: describeError(err) });
    }
  };

  const onCutDay = (e: SeatEvent) => e.cutAt.startsWith(report.disconnectedOn);
  // The investigated cut first, then everything else newest first.
  const events = (ctx?.events ?? [])
    .slice()
    .sort((a, b) => Number(onCutDay(b)) - Number(onCutDay(a)) || b.cutAt.localeCompare(a.cutAt));
  const shownEvents = showAllEvents ? events : events.slice(0, 10);
  const cluster = onCutDay;

  return (
    <div className="space-y-6">
      {reports.length > 1 && (
        <nav aria-label="Investigations" className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1">
          {reports.map((r, i) => (
            <button
              key={`${r.networkId}-${i}`}
              type="button"
              onClick={() => onSelect(i)}
              className={cx(
                'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                i === selected ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-muted hover:text-ink',
              )}
            >
              {r.network} · #{r.networkId}
            </button>
          ))}
        </nav>
      )}

      {/* Case header */}
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-gradient-to-br from-rose-500/15 via-indigo-500/10 to-transparent blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="ok" dot>
                <ClipboardCheck className="h-3 w-3" /> {report.status || 'Investigation'}
              </Badge>
              <Badge tone="danger">Priority: {report.priority || '—'}</Badge>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{report.network}</h1>
            <p className="num mt-1 text-sm text-muted">
              Network #{report.networkId} · {report.dsp} · disconnected {report.disconnectedOn}
              {amazonCut[0] ? ` at ${amazonCut[0].cutAt.slice(11)}` : ''}
            </p>
            {report.approval && (
              <p className="mt-4 flex items-center gap-2 text-sm text-ok-ink">
                <ShieldCheck className="h-4 w-4" /> {report.approval}
              </p>
            )}
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={refresh} disabled={!available || status.state === 'loading'}>
                {status.state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh context
              </Button>
            </div>
            <span className={cx('text-right text-[11px]', status.state === 'error' ? 'text-danger-ink' : 'text-muted')}>
              {status.text ??
                (ctx
                  ? `Context: Snowflake ${ctx.source === 'live' ? 'live' : 'snapshot'} · ${ctx.asOf}`
                  : available === null
                    ? 'Live context needs claude.ai with the Snowflake connector'
                    : 'No context loaded yet')}
            </span>
          </div>
        </div>
      </Card>

      {/* Log finding */}
      {finding && (
        <Notice tone={finding.internal ? 'danger' : 'warn'} icon={<GitCompare className={cx('h-4 w-4', finding.internal ? 'text-danger' : 'text-warn')} />}>
          <strong>Equativ's connection log records a reason for this cut. </strong>
          On {finding.at}, {finding.logged} of {finding.seats} Amazon seats were switched off with blocking reason {finding.code ?? '—'} and the comment “
          {finding.comments.join('”, “')}”, entered by {finding.people.join(', ')}.{' '}
          {finding.internal
            ? 'That points to an internal Equativ change rather than a DSP-side cut, which contradicts the leading hypothesis below. '
            : ''}
          The workflow output is shown unchanged; confirm with {finding.people[0]} before contacting the DSP.
        </Notice>
      )}

      {/* Executive summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card xl:col-span-2">
          <p className="text-xs font-medium text-muted">Revenue in the 7 days before disconnection</p>
          <p className="num mt-2 text-3xl font-bold text-ink">{report.revenue7d.amount === null ? '—' : fmt(report.revenue7d.amount)}</p>
          <p className="mt-1 text-xs text-warn-ink">{report.revenue7d.note ?? 'Currency unverified'}</p>
          {amazonCut.length > 0 && (
            <p className={cx('mt-3 flex items-start gap-1.5 border-t border-line pt-3 text-xs', revenueMatches ? 'text-ok-ink' : 'text-ink-2')}>
              {revenueMatches ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>
                {revenueMatches ? 'Reconciles to the alert view: ' : 'Alert view total: '}
                {amazonCut
                  .filter(e => (e.revenue7d ?? 0) > 0)
                  .map(e => `${e.partnerName.replace('Amazon DSP ', '')} ${fmt(e.revenue7d!, 2)}`)
                  .join(' + ') || '0'}
                {revenueMatches ? '' : ` = ${fmt(reconciledRevenue, 2)}`}
              </span>
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p className="text-xs font-medium text-muted">Quality checks</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {report.checks.map(c => (
              <span
                key={c.name}
                className={cx(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
                  c.result === 'PASS' ? 'border-ok/25 bg-ok-soft text-ok-ink' : c.result === 'FAIL' ? 'border-danger/30 bg-danger-soft text-danger-ink' : 'border-line bg-surface-2 text-muted',
                )}
              >
                {c.result === 'PASS' ? <CheckCircle2 className="h-3 w-3" /> : c.result === 'FAIL' ? <XCircle className="h-3 w-3" /> : null}
                {checkLabel[c.name] ?? c.name}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            {report.checks.every(c => c.result === 'PASS') ? 'All passed: no SSP quality failure explains the cut.' : 'At least one check did not pass.'}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p className="text-xs font-medium text-muted">Confidence</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-2">Evidence</dt>
              <dd>
                <Badge tone={confTone(report.evidenceConfidence)}>{report.evidenceConfidence ?? '—'}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-2">Root cause</dt>
              <dd>
                <Badge tone={confTone(report.rootCauseConfidence)}>{report.rootCauseConfidence ?? '—'}</Badge>
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p className="text-xs font-medium text-muted">Exact disconnection reason</p>
          <p className="mt-2 text-lg font-bold text-danger-ink">{report.exactReason ?? '—'}</p>
          <p className="mt-1 text-xs text-muted">per the workflow</p>
          {finding && <p className="mt-3 border-t border-line pt-3 text-xs text-ink-2">Connection log: “{finding.comments[0]}”</p>}
        </div>
      </div>

      {/* Hypothesis + evidence */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-warn/30 bg-warn-soft p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-warn-ink">
              <Lightbulb className="h-4 w-4" /> Leading hypothesis
            </h2>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="warn">Not a confirmed cause</Badge>
              {finding?.internal && <Badge tone="danger">Contradicted by connection log</Badge>}
            </div>
          </div>
          <p className="mt-3 text-lg font-medium text-ink">{report.leadingHypothesis ?? '—'}</p>
        </div>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <Database className="h-4 w-4 text-accent" /> Evidence cited by the workflow
          </h2>
          <ul className="mt-3 space-y-2.5">
            {evidence.map((e, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                <Badge tone="neutral" className="mt-0.5 shrink-0">
                  {e.team}
                </Badge>
                <span className="min-w-0 [overflow-wrap:anywhere]">{e.sentence}</span>
              </li>
            ))}
            {!evidence.length && <li className="text-sm text-muted">No measured figures cited.</li>}
          </ul>
        </Card>
      </div>

      {/* Traffic around the cut */}
      {ctx && ctx.daily.length > 0 && (
        <Card className="p-6 sm:p-8">
          <SectionAnchor id="inv-traffic" />
          <SectionHeading
            icon={<Unlink className="h-5 w-5" />}
            eyebrow="Traffic around the cut"
            title="What happened to bid requests and spend"
            description="Daily, from ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES. Spend in source currency units (currency unverified)."
            aside={<Badge tone={ctx.source === 'live' ? 'ok' : 'neutral'} dot>{ctx.source === 'live' ? `Live · ${ctx.asOf}` : `Snapshot · ${ctx.asOf}`}</Badge>}
          />
          <div className="mt-6 grid grid-cols-1 gap-8 xl:grid-cols-2">
            <DailyChart
              data={ctx.daily}
              cutDay={report.disconnectedOn}
              unit="bid requests"
              title={`Amazon DSP bid requests · #${report.networkId}`}
              series={[{ key: 'amzbr', label: 'Amazon seats', value: d => d.amazonBidRequests, kind: 'bar', className: 'fill-accent/70', swatch: 'bg-accent/70' }]}
            />
            <DailyChart
              data={ctx.daily}
              cutDay={report.disconnectedOn}
              unit="SCU"
              title="Spend, all DSPs"
              series={[
                { key: 'net', label: `#${report.networkId} ${report.network}`, value: d => d.networkSpend, kind: 'line', className: 'stroke-danger', swatch: 'bg-danger' },
                ...(ctx.related[0]
                  ? [{ key: 'rel', label: `#${ctx.related[0].networkId} ${ctx.related[0].name}`, value: (d: (typeof ctx.daily)[0]) => d.relatedNetworkSpend, kind: 'line' as const, className: 'stroke-ok', swatch: 'bg-ok' }]
                  : []),
              ]}
            />
          </div>
          {ctx.related[0] && (
            <p className="mt-4 text-sm leading-relaxed text-ink-2">
              Amazon traffic to #{report.networkId} stopped after the cut. Over the same weeks, spend on the related network #{ctx.related[0].networkId}{' '}
              {ctx.related[0].name} grew while #{report.networkId}'s fell, which fits a planned move of supply to another path. Amazon's own spend on #
              {ctx.related[0].networkId} stayed small, so this is context, not proof that the revenue moved.
            </p>
          )}
        </Card>
      )}

      {/* Cut or being cut */}
      {ctx && (
        <Card className="p-6 sm:p-8">
          <SectionAnchor id="inv-seats" />
          <SectionHeading
            icon={<Link2 className="h-5 w-5" />}
            eyebrow="Cut or being cut"
            eyebrowTone="danger"
            title={`DSP connections for ${ctx.networkName}`}
            description="Every connection change since early September, with the reason Equativ logged. Revenue is the alert view's 7 days before each cut."
          />
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'DSP partners connected', value: fmt(ctx.connections.connected), tone: 'text-ink' },
              { label: 'Disconnected', value: fmt(ctx.connections.disconnected), tone: 'text-danger' },
              { label: 'Cuts in the window', value: fmt(events.filter(e => !e.reconnectedAt).length), tone: 'text-ink' },
              {
                label: '7-day revenue on still-cut seats',
                value: compact(events.filter(e => !e.reconnectedAt).reduce((s, e) => s + (e.revenue7d ?? 0), 0)),
                tone: 'text-ink',
              },
            ].map(k => (
              <div key={k.label} className="rounded-2xl border border-line p-4">
                <p className="text-xs font-medium text-muted">{k.label}</p>
                <p className={cx('num mt-2 text-2xl font-bold', k.tone)}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <TableShell minWidth="900px">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>DSP seat</Th>
                  <Th>Status</Th>
                  <Th right>7d revenue before</Th>
                  <Th>Logged reason</Th>
                  <Th>By</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shownEvents.map(e => (
                  <tr key={`${e.partnerId}-${e.cutAt}`} className={cx(cluster(e) && 'bg-danger-soft/40')}>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-ink-2">{e.cutAt}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink">{e.partnerName}</p>
                      <p className="num text-xs text-muted">
                        #{e.partnerId}
                        {isAmazon(e.partnerId) ? ' · Amazon' : ''}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      {e.reconnectedAt ? <Badge tone="ok">Reconnected {e.reconnectedAt}</Badge> : <Badge tone="danger">Cut</Badge>}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-ink">{e.revenue7d === null ? '—' : fmt(e.revenue7d, 2)}</td>
                    <td className="px-4 py-2.5 text-sm text-ink-2">
                      {e.reasonCode !== null && (
                        <span className="num mr-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted" title={REASON_CODE_SEEN[e.reasonCode] ?? 'Undocumented code'}>
                          {e.reasonCode}
                        </span>
                      )}
                      <span className="[overflow-wrap:anywhere]">{e.comment ?? <span className="text-muted">No comment</span>}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">{e.updatedBy ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              Highlighted rows were cut on {report.disconnectedOn} and are listed first. Reason codes come from MAPPING_NETWORK_PARTNER_CONNECTION_SCD; hover a code for its documented
              label (column comment on BLOCKING_REASON).
            </span>
            {events.length > 10 && (
              <Button size="sm" variant="ghost" onClick={() => setShowAllEvents(s => !s)}>
                {showAllEvents ? 'Show fewer' : `Show all ${events.length}`}
              </Button>
            )}
          </div>

          {ctx.related.length > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {ctx.related.map(r => (
                <div key={r.networkId} className={cx('rounded-2xl border p-5', r.riskSeat ? 'border-warn/30 bg-warn-soft' : 'border-line')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">
                      Related network · {r.name} <span className="num text-sm font-normal text-muted">#{r.networkId}</span>
                    </p>
                    <Badge tone="ok">{r.amazonSeatsConnected} Amazon seats connected</Badge>
                  </div>
                  <p className="mt-2 text-sm text-ink-2">{r.note}</p>
                  {r.riskSeat && (
                    <p className="mt-3 flex items-start gap-2 text-sm text-warn-ink">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Being cut risk: {r.riskSeat.partnerName} ran at RPMBr {fmt(r.riskSeat.rpmbr7d, 3)} over the last 7 days ({compact(r.riskSeat.bidRequests7d)} bid
                        requests, {fmt(r.riskSeat.spend7d, 2)} SCU). Other cuts in the log used “Under $0.10 RPMBR”.
                      </span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Actions */}
      <Card className="p-6 sm:p-8">
        <SectionHeading icon={<Users className="h-5 w-5" />} eyebrow="Recommended internal actions" title="Who does what next" />
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {report.actions.map(a => {
            const note =
              finding?.internal && /partnership/i.test(a.team)
                ? `Before contacting the DSP: the log shows “${finding.comments[0]}” by ${finding.people[0]}.`
                : finding?.internal && /techops/i.test(a.team)
                  ? `The connection log names ${finding.people[0]} as the person who switched the seats off.`
                  : null;
            return (
              <div key={a.team} className="flex flex-col rounded-2xl border border-line p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Eyebrow tone="accent">{a.team}</Eyebrow>
                    <p className={cx('mt-1 text-sm font-medium [overflow-wrap:anywhere]', a.ownerIsPerson ? 'text-ink' : 'text-warn-ink')}>{a.owner}</p>
                  </div>
                  {a.confidence && <Badge tone={confTone(a.confidence)}>Confidence {a.confidence}</Badge>}
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{a.text}</p>
                {note && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-ink">{note}</p>}
                <div className="mt-4 flex justify-end">
                  <CopyButton text={`${a.team} → ${a.owner}\n${a.text}${a.confidence ? ` Confidence: ${a.confidence}.` : ''}`} label="Copy" />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Draft */}
      {report.publisherDraft && (
        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow tone="warn">Publisher communication</Eyebrow>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-ink">
                <Mail className="h-5 w-5 text-accent" /> Draft only, not sent
              </h2>
              {report.publisherDraft.reviewer && <p className="mt-1 text-sm text-muted">For {report.publisherDraft.reviewer} to review</p>}
            </div>
            <CopyButton text={report.publisherDraft.text} label="Copy draft" />
          </div>
          <blockquote className="mt-4 rounded-xl border border-line bg-surface-2 p-5 text-[15px] leading-relaxed text-ink-2">{report.publisherDraft.text}</blockquote>
          {finding?.internal && (
            <p className="mt-3 text-xs text-warn-ink">
              The draft asks the publisher about Amazon. Since the connection log records an internal change, review the wording before it goes out.
            </p>
          )}
        </Card>
      )}

      <details className="group rounded-2xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 [&::-webkit-details-marker]:hidden">
          <span className="font-medium text-ink">Workflow output (verbatim)</span>
          <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line p-5">
          <div className="mb-2 flex justify-end">
            <CopyButton text={report.raw} label="Copy output" />
          </div>
          <pre className="num overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-200">{report.raw}</pre>
        </div>
      </details>
    </div>
  );
};
