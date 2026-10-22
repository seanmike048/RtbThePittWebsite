import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import { caseFinancials, isAdditive, varianceRows, type CaseFinancials } from '../../lib/cases/financials.ts';
import { eurPerUsd, FX_SOURCE, showUsd, usdValue } from '../../lib/cases/fx.ts';
import { project, projectedWeekly } from '../../lib/cases/projection.ts';
import { SPEND_SNAPSHOT } from '../../lib/cases/spend.data.ts';
import type { CaseRecord } from '../../lib/cases/types.ts';
import { Button } from '../ui.tsx';
import { PageHeader, RequirePublisher, Section } from './bits.tsx';
import { useCases } from './CasesContext.tsx';
import { RevenueVariance, type VarianceItem } from './RevenueVariance.tsx';
import { useScenario } from './useScenario.ts';

export const FinancialImpactPage: React.FC = () => <RequirePublisher title="Financial Impact">{(c) => <Impact key={c.caseId} c={c} />}</RequirePublisher>;

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));

/** Seat-level export for this publisher only: USD with the source EUR and the rate used per day. */
function exportCsv(c: CaseRecord, f: CaseFinancials) {
  const rows: (string | number)[][] = [['case_id', 'network_id', 'publisher', 'endpoint', 'seat_state', 'day', 'spend_eur_source', 'eur_per_usd', 'spend_usd', 'fx_table']];
  const ids = new Set(f.seats.map((s) => s.partnerId));
  for (const d of SPEND_SNAPSHOT.daily.filter((x) => x.network_id === c.networkId && ids.has(x.partner_id))) {
    const r = eurPerUsd(d.day);
    rows.push([c.caseId, c.networkId, c.publisher, d.partner_id, f.seats.find((s) => s.partnerId === d.partner_id)!.state, d.day, d.spend_eur, r ?? '', r ? (d.spend_eur / r).toFixed(6) : '', FX_SOURCE.table]);
  }
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `pitt-${c.caseId}-spend-usd.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const Impact: React.FC<{ c: CaseRecord }> = ({ c }) => {
  const { go } = useCases();
  const [scenario] = useScenario(c.caseId);
  const base = useMemo(() => caseFinancials(c), [c]);
  const pr = useMemo(() => project(base.removedAfterCut, scenario), [base, scenario]);
  const f = useMemo(() => caseFinancials(c, undefined, undefined, projectedWeekly(pr)), [c, pr]);
  const items: VarianceItem[] = varianceRows(f).map((r) => ({
    id: r.id,
    label: r.label,
    value: usdValue(r.value),
    reason: r.value.kind === 'unavailable' ? r.value.reason : null,
    role: r.role,
    explain: r.explain,
    state: r.value.kind === 'unavailable' ? 'Unavailable' : r.id === 'projected' ? (pr.kind === 'ok' && pr.illustrative ? 'Illustrative' : 'Projected') : r.id === 'restored' ? 'Observed' : 'Calculated',
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Impact"
        c={c}
        lead="Amazon DSP spend for this publisher, in USD. Observed, calculated, projected and confirmed values are kept apart."
        aside={
          f.basis === 'snapshot' && (
            <Button size="sm" onClick={() => exportCsv(c, f)}>
              <Download className="h-3.5 w-3.5" /> Export seat data (CSV)
            </Button>
          )
        }
      />

      <Section title="Revenue variance" note={f.window ? `Pre-cut week: ${f.window.from} → ${f.window.to}, the alert view's window. Latest loaded day: ${f.latestDay ?? 'none'}.` : f.notes[0]}>
        <RevenueVariance
          items={items}
          additive={isAdditive(f)}
          caption="USD. Daily EUR spend (DAY_DEMAND, documented in Euro) converted at each day's rate, then summed."
          footnote={
            <>
              Projected recovery comes from{' '}
              <button onClick={() => go('projection', c.caseId)} className="text-accent-ink hover:underline cursor-pointer">
                Spend Projection
              </button>
              ; it is not added to observed spend.
            </>
          }
        />
        {f.notes.map((n) => (
          <p key={n} className="mt-3 text-sm text-ink-2">
            {n}
          </p>
        ))}
      </Section>

      {f.seats.length > 0 && (
        <Section title="By seat">
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Spend by Amazon seat for {c.publisher}</caption>
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Endpoint</th>
                  <th scope="col" className="px-3 py-2 font-medium">State</th>
                  <th scope="col" className="px-3 py-2 font-medium">Cut at</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Pre-cut week</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{f.latestDay ?? 'Latest day'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {f.seats.map((s) => (
                  <tr key={s.partnerId}>
                    <td className="px-3 py-2 text-ink">{s.name}</td>
                    <td className={s.state === 'Cut' ? 'px-3 py-2 text-danger-ink' : 'px-3 py-2 text-ink-2'}>{s.state}</td>
                    <td className="num px-3 py-2 text-xs text-muted">{s.cutAt ?? '—'}</td>
                    <td className="num px-3 py-2 text-right text-ink">{showUsd(s.preCutWeek)}</td>
                    <td className="num px-3 py-2 text-right text-ink-2">{s.latestDay ? showUsd(s.latestDay) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">Seats that were not cut appear only with at least $1 in the window. Cut seats come from the alert view; a $0 cut seat had no recorded spend.</p>
        </Section>
      )}

      <Section title="Currency and sources">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Source amount</dt>
            <dd className="mt-0.5 text-ink-2">
              {c.sourceSpend ? `Stored as received (${c.sourceSpend.currency}, ${c.sourceSpend.basis}) and shown only in USD.` : 'Not stated in the run.'} The draft calls the currency undocumented; the Snowflake measure behind it is
              documented in Euro.
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">FX</dt>
            <dd className="mt-0.5 text-ink-2">
              {FX_SOURCE.table}, read {FX_SOURCE.readAt}
              {FX_SOURCE.queryId && <span className="num text-xs text-muted"> · {FX_SOURCE.queryId}</span>}. {FX_SOURCE.reading}
              {f.window && eurPerUsd(f.window.to) != null && <> Rate on {f.window.to}: 1 EUR = {(1 / eurPerUsd(f.window.to)!).toFixed(4)} USD.</>}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">Snowflake reads</dt>
            <dd className="mt-0.5 space-y-0.5 text-xs text-muted">
              {SPEND_SNAPSHOT.queries.map((q) => (
                <p key={q.id}>
                  <span className="num">{q.id}</span> · {q.what}
                </p>
              ))}
            </dd>
          </div>
        </dl>
      </Section>
    </div>
  );
};
