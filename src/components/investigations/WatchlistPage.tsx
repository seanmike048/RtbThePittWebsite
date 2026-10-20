import React, { useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Siren, Unlink } from 'lucide-react';
import { REASON_CODE_SEEN } from '../../lib/investigations/context.ts';
import { SQL_AT_RISK, SQL_RECENT_AMAZON_CUTS, toWatchlist } from '../../lib/investigations/live.ts';
import { AT_RISK_RULE, type Watchlist } from '../../lib/investigations/watchlist.ts';
import { Badge, Button, Card, cx, SectionHeading, TableShell, Th } from '../ui.tsx';
import { compact, fmt } from '../cfo437/shared.tsx';
import { describeError, nowStamp, useSnowflake } from '../live/useSnowflake.ts';

export const WatchlistPage: React.FC<{
  watchlist: Watchlist;
  onWatchlist: (w: Watchlist) => void;
  investigated: string[];
  onOpenInvestigation: (networkId: string) => void;
}> = ({ watchlist, onWatchlist, investigated, onOpenInvestigation }) => {
  const { available, query } = useSnowflake();
  const [status, setStatus] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; text?: string }>({ state: 'idle' });

  const refresh = async () => {
    setStatus({ state: 'loading', text: 'Querying Snowflake…' });
    try {
      const [cuts, risk] = await Promise.all([query(SQL_RECENT_AMAZON_CUTS), query(SQL_AT_RISK)]);
      const at = nowStamp();
      onWatchlist(toWatchlist(cuts, risk, at));
      setStatus({ state: 'ok', text: `Refreshed ${at}` });
    } catch (e) {
      setStatus({ state: 'error', text: describeError(e) });
    }
  };

  const rev = watchlist.cuts.reduce((s, c) => s + c.revenue7d, 0);
  const NetworkCell: React.FC<{ id: string; name: string }> = ({ id, name }) =>
    investigated.includes(id) ? (
      <button type="button" onClick={() => onOpenInvestigation(id)} className="text-left font-medium text-accent hover:underline cursor-pointer">
        {name} <span className="num text-xs">#{id}</span>
        <Badge tone="accent" className="ml-2">
          Investigated
        </Badge>
      </button>
    ) : (
      <span>
        <span className="font-medium text-ink">{name}</span> <span className="num text-xs text-muted">#{id}</span>
      </span>
    );

  return (
    <div className="space-y-6">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-danger">Amazon DSP watchlist</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Cut, or being cut</h1>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-2">
              Networks whose Amazon DSP seats were cut in the last 60 days, with the reason Equativ logged, and connected seats that show the
              signals that preceded past cuts.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Button variant="primary" onClick={refresh} disabled={!available || status.state === 'loading'}>
              {status.state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh data
            </Button>
            <span className={cx('text-[11px]', status.state === 'error' ? 'text-danger-ink' : 'text-muted')}>
              {status.text ?? (available === null ? 'Live refresh needs claude.ai with the Snowflake connector' : `Snowflake ${watchlist.source} · ${watchlist.asOf}`)}
            </span>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Networks cut (60 days)', value: fmt(watchlist.cuts.length) },
            { label: 'Seats cut', value: fmt(watchlist.cuts.reduce((s, c) => s + c.seats, 0)) },
            { label: '7-day revenue before cuts', value: compact(rev), note: 'SCU · currency unverified' },
            { label: 'Seats at risk now', value: fmt(watchlist.atRisk.length), note: `activity to ${watchlist.lastActivityDay}` },
          ].map(k => (
            <div key={k.label} className="rounded-2xl border border-line p-4">
              <p className="text-xs font-medium text-muted">{k.label}</p>
              <p className="num mt-2 text-2xl font-bold text-ink">{k.value}</p>
              {k.note && <p className="mt-1 text-xs text-muted">{k.note}</p>}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <SectionHeading
          icon={<Siren className="h-5 w-5" />}
          eyebrow="Being cut"
          eyebrowTone="warn"
          title="Connected Amazon seats at risk"
          description={AT_RISK_RULE}
        />
        <div className="mt-6">
          <TableShell minWidth="720px">
            <thead>
              <tr>
                <Th>Network</Th>
                <Th>Amazon seat</Th>
                <Th right>Bid requests (7d)</Th>
                <Th right>Spend (7d, SCU)</Th>
                <Th right>RPMBr</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {watchlist.atRisk.map(r => (
                <tr key={`${r.networkId}-${r.partnerId}`}>
                  <td className="px-4 py-3">
                    <NetworkCell id={r.networkId} name={r.networkName} />
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {r.partnerName} <span className="num text-xs text-muted">#{r.partnerId}</span>
                  </td>
                  <td className="num px-4 py-3 text-right text-ink-2">{compact(r.bidRequests7d)}</td>
                  <td className="num px-4 py-3 text-right text-ink">{fmt(r.spend7d, 2)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cx('num font-semibold', r.rpmbr7d === 0 ? 'text-danger-ink' : 'text-warn-ink')}>{fmt(r.rpmbr7d, 3)}</span>
                  </td>
                </tr>
              ))}
              {!watchlist.atRisk.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted">
                    No connected seat matches the rule.
                  </td>
                </tr>
              )}
            </tbody>
          </TableShell>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The threshold comes from comments on past cuts in the connection log. It is not an official policy, and a seat on this list may never be cut.
        </p>
      </Card>

      <Card className="p-6 sm:p-8">
        <SectionHeading
          icon={<Unlink className="h-5 w-5" />}
          eyebrow="Cut"
          eyebrowTone="danger"
          title="Amazon DSP cuts in the last 60 days"
          description="Still disconnected. Revenue is the alert view's 7 days before the cut; reason and author come from Equativ's connection log."
        />
        <div className="mt-6">
          <TableShell minWidth="960px">
            <thead>
              <tr>
                <Th>Network</Th>
                <Th>Cut at</Th>
                <Th right>Seats</Th>
                <Th right>7d revenue before</Th>
                <Th>Logged reason</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {watchlist.cuts.map(c => (
                <tr key={c.networkId}>
                  <td className="px-4 py-3">
                    <NetworkCell id={c.networkId} name={c.networkName} />
                  </td>
                  <td className="num whitespace-nowrap px-4 py-3 text-ink-2">{c.cutAt}</td>
                  <td className="num px-4 py-3 text-right text-ink-2" title={`Partners ${c.partners}`}>
                    {c.seats}
                  </td>
                  <td className="num px-4 py-3 text-right font-semibold text-ink">{fmt(c.revenue7d, 2)}</td>
                  <td className="px-4 py-3 text-sm text-ink-2">
                    {c.reasonCode !== null && (
                      <span className="num mr-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted" title={REASON_CODE_SEEN[c.reasonCode] ?? 'Undocumented code'}>
                        {c.reasonCode}
                      </span>
                    )}
                    <span className="[overflow-wrap:anywhere]">{c.comment ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{c.updatedBy ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      </Card>
    </div>
  );
};
