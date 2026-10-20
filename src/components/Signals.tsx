import React, { useState } from 'react';
import { CheckCircle2, CircleDashed, Globe2, Radio } from 'lucide-react';
import type { RTBViewModel } from '../lib/adapter/types.ts';
import { Badge, Card, cx, formatAmount, SectionHeading, SegmentedControl } from './ui.tsx';

const KNOWN_AMAZON_PARTNERS: Record<number, { name: string; region: string; description: string }> = {
  437: { name: 'Amazon DSP US', region: 'Americas', description: 'Primary North American bidding endpoint' },
  489: { name: 'Amazon DSP EMEA', region: 'EMEA', description: 'European regional buying gateway' },
  490: { name: 'Amazon DSP UK', region: 'EMEA', description: 'UK regional market seat' },
  491: { name: 'Amazon DSP APAC', region: 'APAC', description: 'Asia-Pacific regional buying gateway' },
  492: { name: 'Amazon DSP Global CTV', region: 'Global', description: 'Connected TV dedicated buying endpoint' },
};

const SIGNALS = [
  {
    title: 'IPv6 traffic',
    kind: 'Observed category',
    body: 'IPv6 is an acceptable transmission protocol. It is monitored as a traffic category, not flagged as a defect.',
    status: 'Not available in current alert view',
  },
  {
    title: 'Truncated IP',
    kind: 'Independent attribute',
    body: 'Kept separate from IP version — both IPv4 and IPv6 can be truncated or subnet-masked.',
    status: 'Not available in current alert view',
  },
  {
    title: 'Consent & non-consented traffic',
    kind: 'Policy framework',
    body: 'Non-consented impressions are analysed under context-aware rules, never treated as an automatic failure.',
    status: 'Not available in current alert view',
  },
  {
    title: 'ads.txt compliance',
    kind: 'Unconfirmed hypothesis',
    body: 'Cited by the workflow: “The pattern may be related to ads.txt compliance.” Not confirmed by backend evidence.',
    status: 'Unverified working hypothesis',
    warn: true,
  },
];

export const Signals: React.FC<{ model: RTBViewModel }> = ({ model }) => {
  const [tab, setTab] = useState<'partners' | 'signals' | 'checklist'>('partners');
  const present = model.overview.distinctPartnerIds;
  const absent = Object.keys(KNOWN_AMAZON_PARTNERS)
    .map(Number)
    .filter(id => !present.includes(id));

  return (
    <Card className="p-6 sm:p-8">
      <SectionHeading
        icon={<Radio className="h-5 w-5" />}
        eyebrow="Demand infrastructure"
        title="Partner seats & signal diagnostics"
        description="Seat mapping, OpenRTB signals and compliance benchmarks — without fabricating missing telemetry."
      />
      <div className="mt-6">
        <SegmentedControl<typeof tab>
          ariaLabel="Signal views"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'partners', label: 'Seat mapping' },
            { value: 'signals', label: 'Signal associations' },
            { value: 'checklist', label: 'Checklist & benchmarks' },
          ]}
        />
      </div>

      {tab === 'partners' && (
        <div className="anim-fade-up mt-6 space-y-8">
          <div>
            <h3 className="text-sm font-semibold text-ink">In this payload ({present.length})</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              {present.map(id => {
                const info = KNOWN_AMAZON_PARTNERS[id] ?? { name: `Amazon DSP partner (${id})`, region: 'Unknown', description: 'Validated partner seat' };
                const rec = model.disconnections.find(d => d.partnerId === id);
                return (
                  <div key={id} className="rounded-2xl border border-line p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{info.name}</p>
                        <p className="mt-0.5 text-sm text-muted">{info.description}</p>
                      </div>
                      <Badge tone="accent">#{id}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-sm">
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        <Globe2 className="h-4 w-4" /> {info.region}
                      </span>
                      {rec && (
                        <span className="text-muted">
                          7d spend <strong className="num text-ink">{formatAmount(rec.spend7dBefore)}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {absent.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-ink">Known seats not in this payload</h3>
              <p className="mt-1 text-sm text-muted">Not present in the queried alert view. No records are fabricated.</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {absent.map(id => (
                  <div key={id} className="rounded-xl border border-dashed border-line-strong p-4">
                    <p className="text-sm font-medium text-ink-2">{KNOWN_AMAZON_PARTNERS[id].name}</p>
                    <p className="num mt-0.5 text-xs text-muted">
                      #{id} · {KNOWN_AMAZON_PARTNERS[id].region}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'signals' && (
        <div className="anim-fade-up mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {SIGNALS.map(s => (
            <div key={s.title} className={cx('rounded-2xl border p-5', s.warn ? 'border-warn/30 bg-warn-soft' : 'border-line')}>
              <Badge tone={s.warn ? 'warn' : 'neutral'}>{s.kind}</Badge>
              <p className="mt-3 font-semibold text-ink">{s.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.body}</p>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
                <CircleDashed className="h-3.5 w-3.5" /> {s.status}
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === 'checklist' && (
        <ul className="anim-fade-up mt-6 divide-y divide-line rounded-2xl border border-line">
          {model.amazonDspAnalytics.signalChecklist.map(item => {
            const catTone = item.category === 'Policy Requirement' ? 'danger' : item.category === 'Internal Benchmark' ? 'warn' : 'info';
            const available = item.status !== 'NOT_AVAILABLE_IN_QUERY';
            return (
              <li key={item.signal} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
                <div className="mt-0.5 shrink-0">
                  {available ? <CheckCircle2 className="h-5 w-5 text-ok" /> : <CircleDashed className="h-5 w-5 text-faint" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{item.signal}</p>
                    <Badge tone={catTone}>{item.category}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.notes}</p>
                </div>
                <span className={cx('shrink-0 text-xs font-medium', available ? 'text-ok-ink' : 'text-muted')}>
                  {available ? 'Observed · acceptable' : 'Not in query'}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!model.amazonDspAnalytics.hasDetailedTelemetry && (
        <p className="mt-6 rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{model.amazonDspAnalytics.telemetryUnavailableReason}</p>
      )}
    </Card>
  );
};
