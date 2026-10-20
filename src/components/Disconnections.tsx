import React, { useEffect, useState } from 'react';
import { ChevronRight, Database, X } from 'lucide-react';
import type { DisconnectionPartnerRecord, RTBViewModel } from '../lib/adapter/types.ts';
import { Badge, Button, Card, CopyButton, cx, Eyebrow, formatAmount, formatTimestamp, SectionHeading } from './ui.tsx';

const StatusBadge: React.FC<{ status: DisconnectionPartnerRecord['status'] }> = ({ status }) =>
  status === 'still_disconnected' ? (
    <Badge tone="danger" dot>
      Still disconnected
    </Badge>
  ) : (
    <Badge tone="ok" dot>
      Reconnected
    </Badge>
  );

export const DisconnectionsTable: React.FC<{
  model: RTBViewModel;
  onSelect: (r: DisconnectionPartnerRecord) => void;
}> = ({ model, onSelect }) => {
  const [seat, setSeat] = useState<'ALL' | number>('ALL');
  const rows = model.disconnections.filter(d => seat === 'ALL' || d.partnerId === seat);

  return (
    <Card className="p-6 sm:p-8">
      <SectionHeading
        icon={<Database className="h-5 w-5" />}
        eyebrow="Disconnection ledger"
        eyebrowTone="danger"
        title="Partner seat disconnections"
        description={
          <>
            From <span className="num break-all text-xs">ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS</span>. Select a row for the full
            record.
          </>
        }
        aside={
          <label className="flex items-center gap-2 text-sm text-muted">
            Seat
            <select
              value={seat}
              onChange={e => setSeat(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none cursor-pointer"
            >
              <option value="ALL">All seats ({model.disconnections.length})</option>
              {model.overview.distinctPartnerIds.map(id => (
                <option key={id} value={id}>
                  #{id}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {/* Desktop table */}
      <div className="mt-6 hidden overflow-hidden rounded-xl border border-line md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs font-medium text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Publisher</th>
              <th className="px-4 py-3 font-medium">Partner seat</th>
              <th className="px-4 py-3 font-medium">Cut at</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">7d pre-cut spend</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(r => {
              const ts = formatTimestamp(r.disconnectionTimestamp);
              return (
                <tr
                  key={r.partnerId}
                  tabIndex={0}
                  onClick={() => onSelect(r)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(r))}
                  className="group cursor-pointer transition-colors hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                >
                  <td className="px-4 py-4">
                    <p className="font-medium text-ink">{model.overview.publisherName}</p>
                    <p className="num text-xs text-muted">#{model.overview.publisherId}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-ink">{r.partnerName}</p>
                    <p className="num text-xs text-muted">Seat #{r.partnerId}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="num text-ink">{ts.date}</p>
                    <p className="num text-xs text-muted">{ts.time} · {model.metadata.timezone}</p>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <p className="num font-semibold text-ink">{formatAmount(r.spend7dBefore)}</p>
                    <p className="text-xs text-warn-ink">{r.currency ?? 'No currency'}</p>
                  </td>
                  <td className="pr-4 text-faint transition-colors group-hover:text-ink">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="mt-6 space-y-3 md:hidden">
        {rows.map(r => (
          <li key={r.partnerId}>
            <button
              type="button"
              onClick={() => onSelect(r)}
              className="w-full rounded-xl border border-line p-4 text-left transition-colors hover:bg-surface-2 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{r.partnerName}</p>
                  <p className="num text-xs text-muted">{r.disconnectionTimestamp}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-xs text-muted">7d pre-cut spend</span>
                <span className="num font-semibold text-ink">{formatAmount(r.spend7dBefore)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
};

export const DetailDrawer: React.FC<{
  record: DisconnectionPartnerRecord | null;
  model: RTBViewModel;
  onClose: () => void;
}> = ({ record, model, onClose }) => {
  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [record, onClose]);

  if (!record) return null;
  const json = JSON.stringify(record, null, 2);
  const reasonTone = record.reasonType === 'confirmed' ? 'info' : record.reasonType === 'hypothesis' ? 'warn' : 'neutral';
  const reasonLabel =
    record.reasonType === 'confirmed' ? 'Confirmed reason' : record.reasonType === 'hypothesis' ? 'Hypothesis only' : 'Not provided';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Seat ${record.partnerId} details`}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="anim-slide-in relative flex h-full w-full max-w-lg flex-col border-l border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <Eyebrow tone="accent">Seat #{record.partnerId}</Eyebrow>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">{record.partnerName}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <dl className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-line p-4">
              <dt className="text-xs text-muted">Status</dt>
              <dd className="mt-2">
                <StatusBadge status={record.status} />
              </dd>
            </div>
            <div className="rounded-xl border border-line p-4">
              <dt className="text-xs text-muted">Cut at</dt>
              <dd className="num mt-2 text-sm text-ink">{record.disconnectionTimestamp}</dd>
              <dd className="mt-0.5 text-xs text-muted">{model.metadata.timezone}</dd>
            </div>
            <div className="col-span-2 rounded-xl border border-line p-4">
              <dt className="text-xs text-muted">7-day run-rate before disconnection</dt>
              <dd className="mt-2 flex items-baseline gap-2">
                <span className="num text-2xl font-bold text-ink">{formatAmount(record.spend7dBefore)}</span>
                <Badge tone="warn">{record.currency ?? 'Currency not provided'}</Badge>
              </dd>
              <dd className="mt-2 text-xs leading-relaxed text-muted">
                Preserved directly from the alert view. Never labelled as lost, projected or recoverable revenue.
              </dd>
            </div>
          </dl>

          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Disconnection reason</h3>
              <Badge tone={reasonTone}>{reasonLabel}</Badge>
            </div>
            <p className={cx('mt-2 text-sm leading-relaxed', record.reason ? 'text-ink-2' : 'italic text-muted')}>
              {record.reason ? `“${record.reason}”` : 'No reason string provided in the alert row.'}
            </p>
            <p className="mt-2 text-xs text-muted">Root causes are only displayed when verified by checks.</p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-ink">Data-quality notes</h3>
            <ul className="mt-2 space-y-2">
              {record.dataQualityNotes.map((n, i) => (
                <li key={i} className="flex gap-2.5 rounded-lg bg-warn-soft px-3 py-2 text-sm text-ink-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                  {n}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Raw record</h3>
              <CopyButton text={json} label="Copy JSON" />
            </div>
            <pre className="num mt-2 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-200">{json}</pre>
          </section>
        </div>

        <div className="border-t border-line px-6 py-4">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </aside>
    </div>
  );
};
