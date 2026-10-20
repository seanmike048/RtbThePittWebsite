import React, { useMemo, useState } from 'react';
import { GitCompare, Unlink } from 'lucide-react';
import { type AlertState, ALERT_SOURCE, type ConnectionState, SNAPSHOT_OLDER_CUTS } from '../../lib/cfo437/live.ts';
import { isVisible, type PublisherRow } from '../../lib/cfo437/publishers.ts';
import { Badge, Button, Card, cx, SectionHeading, TableShell, Th } from '../ui.tsx';
import { ClassTag, compact, fmt, Notice, SectionAnchor } from './shared.tsx';
import { useBaseline } from './baselineContext.tsx';

export const Disconnections437: React.FC<{
  connection: ConnectionState;
  rows: PublisherRow[];
  onUseSubset: (ids: string[]) => void;
  alerts: AlertState;
  days: number;
  onUseAlertExposure: (monthlyValue: number, weekly: number) => void;
}> = ({ connection, rows, onUseSubset, alerts, days, onUseAlertExposure }) => {
  const [showAll, setShowAll] = useState(false);
  const base = useBaseline();
  const mon = base.period.split(' ')[0].slice(0, 3);
  const byId = useMemo(() => new Map(rows.map(r => [r.publisherId, r])), [rows]);

  const joined = connection.networks.map(n => ({ n, row: byId.get(n.networkId) ?? null }));
  const inTab = joined.filter(j => j.row);
  const inVisible = inTab.filter(j => isVisible(j.row!));
  const tabSpend = inTab.reduce((s, j) => s + j.row!.spend, 0);
  const visibleSpend = inVisible.reduce((s, j) => s + j.row!.spend, 0);

  const flagged = rows.filter(r => r.sheetDisconnectedOn);
  const flaggedVisible = flagged.filter(isVisible);
  const flaggedSpend = flaggedVisible.reduce((s, r) => s + r.spend, 0);
  const flagDates = [...new Set(flagged.map(r => r.sheetDisconnectedOn))].join(', ');
  const overlap = flagged.filter(r => connection.networks.some(n => n.networkId === r.publisherId)).length;

  const list = showAll ? joined : joined.slice(0, 12);

  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-disconnections" />
      <SectionHeading
        icon={<Unlink className="h-5 w-5" />}
        eyebrow="Disconnections on endpoint 437"
        eyebrowTone="danger"
        title={`Which networks are cut, and what they spent in ${base.period}`}
        description={`Snowflake connection history joined to the ${base.source === 'live' ? 'live Snowflake rows' : 'workbook'} by network ID = PUBLISHER_ID. ${base.period} spend is historical spend, not lost revenue.`}
        aside={<Badge tone={connection.source === 'live' ? 'ok' : 'neutral'} dot>{connection.source === 'live' ? `Live · ${connection.asOf}` : `Snapshot · ${connection.asOf}`}</Badge>}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Disconnected networks', value: fmt(connection.disconnected), note: 'Snowflake · partner 437', c: 'observed' as const },
          { label: 'Connected networks', value: fmt(connection.connected), note: 'Snowflake · partner 437', c: 'observed' as const },
          { label: 'In the 437 tab', value: `${inTab.length}`, note: `${inVisible.length} in the visible view`, c: 'calculated' as const },
          { label: `Their ${mon} spend (visible)`, value: compact(visibleSpend), note: `SCU · ${compact(tabSpend)} across all rows`, c: 'calculated' as const },
        ].map(k => (
          <div key={k.label} className="rounded-2xl border border-line p-4">
            <p className="text-xs font-medium text-muted">{k.label}</p>
            <p className="num mt-2 text-2xl font-bold text-ink">{k.value}</p>
            <p className="mt-1 text-xs text-muted">{k.note}</p>
            <div className="mt-2">
              <ClassTag c={k.c} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!inVisible.length} onClick={() => onUseSubset(inVisible.map(j => j.row!.publisherId))}>
          Use {inVisible.length === 1 ? 'this visible network' : `these ${inVisible.length} visible networks`} as the publisher subset
        </Button>
        <span className="text-xs text-muted">Sets Spend impact to “Selected publisher subset” (demonstration, not issue-specific exposure).</span>
      </div>

      <div className="mt-6">
        <TableShell minWidth="720px">
          <thead>
            <tr>
              <Th>Network</Th>
              <Th>Cut at (UTC)</Th>
              <Th>Business unit</Th>
              <Th>In 437 tab</Th>
              <Th right>{mon} spend (SCU)</Th>
              <Th right>{mon} bid requests</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map(({ n, row }) => (
              <tr key={n.networkId} className={cx(row && 'bg-danger-soft/40')}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-ink">{n.networkName || '—'}</p>
                  <p className="num text-xs text-muted">#{n.networkId}</p>
                </td>
                <td className="num whitespace-nowrap px-4 py-2.5 text-ink-2">{n.cutAt ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-ink-2">{n.businessUnit}</td>
                <td className="px-4 py-2.5">
                  {row ? <Badge tone={isVisible(row) ? 'danger' : 'warn'}>{isVisible(row) ? `Yes · ${row.sellerType}` : `Yes · ${row.sellerType || 'no type'} (not visible)`}</Badge> : <span className="text-xs text-muted">No row</span>}
                </td>
                <td className="num px-4 py-2.5 text-right text-ink">{row ? fmt(row.spend, 2) : '—'}</td>
                <td className="num px-4 py-2.5 text-right text-ink-2">{row ? fmt(row.bidRequests) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          Showing {list.length} of {joined.length} listed networks
          {connection.source === 'snapshot' && ` · the snapshot lists the ${joined.length} most recent cuts; ${SNAPSHOT_OLDER_CUTS.count} more (cut ${SNAPSHOT_OLDER_CUTS.cutAt}) arrive with Refresh data`}
        </span>
        {joined.length > 12 && (
          <Button size="sm" variant="ghost" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Show fewer' : `Show all ${joined.length}`}
          </Button>
        )}
      </div>

      <div className="mt-8 rounded-2xl border border-line p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-ink">Open disconnection alerts · The Pitt alert view</h3>
            <p className="mt-1 text-xs text-muted">
              <span className="num break-all">{ALERT_SOURCE}</span> · partner 437 · not reconnected (reconnection date 2099-12-31) ·{' '}
              {alerts.source === 'live' ? `live ${alerts.asOf}` : `snapshot ${alerts.asOf}`}
            </p>
          </div>
          <div className="text-right">
            <p className="num text-2xl font-bold text-ink">{fmt(alerts.revenue7dTotal, 2)}</p>
            <p className="text-xs text-muted">SCU · 7-day revenue before cut · {fmt(alerts.total)} open alerts</p>
          </div>
        </div>
        <div className="mt-4">
          <TableShell minWidth="620px">
            <thead>
              <tr>
                <Th>Network</Th>
                <Th>Cut at</Th>
                <Th>Business unit</Th>
                <Th right>Revenue 7 days before (SCU)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {alerts.alerts.slice(0, showAll ? 200 : 8).map(a => (
                <tr key={`${a.networkId}-${a.cutAt}`}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink">{a.networkName || '—'}</p>
                    <p className="num text-xs text-muted">#{a.networkId}</p>
                  </td>
                  <td className="num whitespace-nowrap px-4 py-2.5 text-ink-2">{a.cutAt}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-2">{a.businessUnit}</td>
                  <td className="num px-4 py-2.5 text-right text-ink">{a.revenue7d === null ? '—' : fmt(a.revenue7d, 2)}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={alerts.revenue7dTotal <= 0} onClick={() => onUseAlertExposure((alerts.revenue7dTotal / 7) * days, alerts.revenue7dTotal)}>
            Use as eligible spend at risk ({fmt((alerts.revenue7dTotal / 7) * days, 2)} SCU / month)
          </Button>
          <span className="text-xs text-muted">
            Scales the 7-day pre-cut revenue to a {days}-day month (÷ 7 × {days}). Sets Spend impact to validated issue-specific
            spend; Finance still validates currency and the scaling.
          </span>
        </div>
      </div>

      {flagged.length > 0 && (
      <div className="mt-6">
        <Notice tone="warn" icon={<GitCompare className="h-4 w-4 text-warn" />}>
          <strong>Two sources, shown separately. </strong>
          The workbook's own “Disconected” column flags {fmt(flagged.length)} rows (dated {flagDates || '—'}),{' '}
          {fmt(flaggedVisible.length)} of them in the visible view with {fmt(flaggedSpend, 2)} SCU of {base.period} spend. Only {overlap} of those
          also appear in Snowflake's list above. The page does not merge or reconcile them; TechOps should confirm which list is
          authoritative.
        </Notice>
      </div>
      )}
    </Card>
  );
};
