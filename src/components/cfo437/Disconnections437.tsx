import React, { useMemo, useState } from 'react';
import { GitCompare, Unlink } from 'lucide-react';
import { type ConnectionState, SNAPSHOT_OLDER_CUTS } from '../../lib/cfo437/live.ts';
import { isVisible, type PublisherRow } from '../../lib/cfo437/publishers.ts';
import { Badge, Button, Card, cx, SectionHeading, TableShell, Th } from '../ui.tsx';
import { ClassTag, compact, fmt, Notice, SectionAnchor } from './shared.tsx';

export const Disconnections437: React.FC<{
  connection: ConnectionState;
  rows: PublisherRow[];
  onUseSubset: (ids: string[]) => void;
}> = ({ connection, rows, onUseSubset }) => {
  const [showAll, setShowAll] = useState(false);
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
        title="Which networks are cut, and what they spent in September"
        description="Snowflake connection history joined to the workbook by network ID = PUBLISHER_ID. September spend is historical spend, not lost revenue."
        aside={<Badge tone={connection.source === 'live' ? 'ok' : 'neutral'} dot>{connection.source === 'live' ? `Live · ${connection.asOf}` : `Snapshot · ${connection.asOf}`}</Badge>}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Disconnected networks', value: fmt(connection.disconnected), note: 'Snowflake · partner 437', c: 'observed' as const },
          { label: 'Connected networks', value: fmt(connection.connected), note: 'Snowflake · partner 437', c: 'observed' as const },
          { label: 'In the 437 tab', value: `${inTab.length}`, note: `${inVisible.length} in the visible view`, c: 'calculated' as const },
          { label: 'Their Sep spend (visible)', value: compact(visibleSpend), note: `SCU · ${compact(tabSpend)} across all rows`, c: 'calculated' as const },
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
          Use these {inVisible.length} visible networks as the publisher subset
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
              <Th right>Sep spend (SCU)</Th>
              <Th right>Sep bid requests</Th>
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

      <div className="mt-6">
        <Notice tone="warn" icon={<GitCompare className="h-4 w-4 text-warn" />}>
          <strong>Two sources, shown separately. </strong>
          The workbook's own “Disconected” column flags {fmt(flagged.length)} rows (dated {flagDates || '—'}),{' '}
          {fmt(flaggedVisible.length)} of them in the visible view with {fmt(flaggedSpend, 2)} SCU of September spend. Only {overlap} of those
          also appear in Snowflake's list above. The page does not merge or reconcile them; TechOps should confirm which list is
          authoritative.
        </Notice>
      </div>
    </Card>
  );
};
