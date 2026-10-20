import React, { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Search, SlidersHorizontal, Upload, Users } from 'lucide-react';
import { WORKBOOK } from '../../lib/cfo437/baseline.ts';
import {
  CONFIDENCE_TIER,
  DEFAULT_WEIGHTS,
  type EvidenceConfidence,
  prioritize,
  type PriorityWeights,
} from '../../lib/cfo437/model.ts';
import { parseWorkbookCsv, type PublisherRow } from '../../lib/cfo437/publishers.ts';
import { Badge, Button, Card, cx, EmptyNote, Modal, SectionHeading, TableShell, Th } from '../ui.tsx';
import { compact, fmt, Notice, SectionAnchor } from './shared.tsx';

export interface RowIssue {
  confidence: EvidenceConfidence;
  severity: number | null;
}

const CONF_TONE: Record<EvidenceConfidence, 'ok' | 'info' | 'accent' | 'warn' | 'neutral'> = {
  Confirmed: 'ok',
  High: 'info',
  Medium: 'accent',
  Low: 'warn',
  Unverified: 'neutral',
};

const WEIGHT_LABELS: Record<keyof PriorityWeights, string> = {
  exposure: 'Financial exposure',
  bidRequests: 'Bid-request volume',
  rpmbr: 'RPMBr',
  confidence: 'Evidence confidence',
  severity: 'Issue severity',
  recoverySpeed: 'Recovery speed',
  effort: 'Effort (negative)',
  strategic: 'Strategic importance',
};

export const ImportRowsModal: React.FC<{ open: boolean; onClose: () => void; onLoad: (rows: PublisherRow[]) => void }> = ({
  open,
  onClose,
  onLoad,
}) => {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (raw: string) => {
    const out = parseWorkbookCsv(raw);
    if (out.missingColumns.length) return setMsg(`Missing columns: ${out.missingColumns.join(', ')}. Export the worksheet with its header row.`);
    if (!out.rows.length) return setMsg('No publisher rows found under the header.');
    onLoad(out.rows);
    setMsg(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<FileSpreadsheet className="h-5 w-5" />}
      title="Load workbook rows"
      subtitle={`${WORKBOOK.primarySheet} · CSV or tab-separated paste from Google Sheets`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">Parsed in your browser. RPMBr is recomputed with the ×1,000,000 definition.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => apply(text)}>
              Load rows
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-sm leading-relaxed text-ink-2">
          In the workbook, open <strong className="text-ink">{WORKBOOK.primarySheet}</strong>, then File → Download → CSV, or select
          all cells and paste here. Required columns: publisher ID, seller type, <span className="num text-xs">BID_REQUEST_COUNT</span>,{' '}
          <span className="num text-xs">SPEND_GROSS_PARTNER_REVENUE</span>.
        </p>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload .csv
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,text/csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = ev => {
                const s = String(ev.target?.result ?? '');
                setText(s);
                apply(s);
              };
              r.readAsText(f);
              e.target.value = '';
            }}
          />
        </div>
        <textarea
          id="c4-rows-input"
          value={text}
          onChange={e => setText(e.target.value)}
          spellCheck={false}
          placeholder={'Publisher ID,Publisher Name,Seller Type,BID_REQUEST_COUNT,SPEND_GROSS_PARTNER_REVENUE\n…'}
          className="num h-56 w-full resize-y rounded-xl border border-line bg-surface-2 p-4 text-xs leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {msg && <Notice tone="warn">{msg}</Notice>}
      </div>
    </Modal>
  );
};

type SortKey = 'priority' | 'spend' | 'bidRequests' | 'rpmbr';

export const PublisherPrioritization: React.FC<{
  rows: PublisherRow[];
  issues: Record<string, RowIssue>;
  onIssue: (id: string, v: RowIssue) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpenImport: () => void;
  validatedExposure: number | null;
}> = ({ rows, issues, onIssue, selected, onToggle, onOpenImport, validatedExposure }) => {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('priority');
  const [weights, setWeights] = useState<PriorityWeights>(DEFAULT_WEIGHTS);
  const [limit, setLimit] = useState(25);
  const [showWeights, setShowWeights] = useState(false);

  const ranked = useMemo(() => {
    const scores = prioritize(
      rows.map(r => ({
        key: r.publisherId,
        spend: r.spend,
        bidRequests: r.bidRequests,
        rpmbr: r.rpmbr,
        eligibleSpendAtRisk: null,
        confidence: issues[r.publisherId]?.confidence ?? 'Unverified',
        severity: issues[r.publisherId]?.severity ?? null,
        recoverySpeed: null,
        effort: null,
        strategic: null,
      })),
      weights,
    );
    const pos = new Map(scores.map((s, i) => [s.key, { ...s, rank: i + 1 }]));
    return rows.map(r => ({ row: r, p: pos.get(r.publisherId)! }));
  }, [rows, issues, weights]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = ranked.filter(({ row }) => !q || row.publisherName.toLowerCase().includes(q) || row.publisherId.includes(q));
    const by: Record<SortKey, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      priority: (a, b) => a.p.rank - b.p.rank,
      spend: (a, b) => b.row.spend - a.row.spend,
      bidRequests: (a, b) => b.row.bidRequests - a.row.bidRequests,
      rpmbr: (a, b) => b.row.rpmbr - a.row.rpmbr,
    };
    return list.sort(by[sort]);
  }, [ranked, query, sort]);

  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-priority" />
      <SectionHeading
        icon={<Users className="h-5 w-5" />}
        eyebrow="Publisher prioritization"
        title="Which publishers to work first"
        description="Normalised 0–100 score with editable weights. Ranking orders by evidence confidence first, so a low-confidence issue never sits level with confirmed exposure."
        aside={
          <Button size="sm" variant={rows.length ? 'secondary' : 'primary'} onClick={onOpenImport}>
            <FileSpreadsheet className="h-4 w-4" /> {rows.length ? 'Reload workbook rows' : 'Load workbook rows'}
          </Button>
        }
      />

      <div className="mt-6 rounded-2xl border border-line bg-surface-2/60 p-4">
        <button
          type="button"
          onClick={() => setShowWeights(s => !s)}
          aria-expanded={showWeights}
          className="flex w-full items-center justify-between gap-2 text-sm font-medium text-ink cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-accent" /> Score weights
          </span>
          <span className="num hidden text-right text-xs text-muted md:inline">
            {Object.entries(weights)
              .filter(([, v]) => v !== 0)
              .map(([k, v]) => `${v}% ${WEIGHT_LABELS[k as keyof PriorityWeights].toLowerCase()}`)
              .join(' · ')}
          </span>
        </button>
        {showWeights && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(weights) as (keyof PriorityWeights)[]).map(k => (
              <label key={k} className="text-xs text-muted">
                {WEIGHT_LABELS[k]}
                <input
                  id={`c4-w-${k}`}
                  type="number"
                  value={weights[k]}
                  onChange={e => setWeights(w => ({ ...w, [k]: Number(e.target.value) || 0 }))}
                  className="num mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </label>
            ))}
            <p className="col-span-2 text-xs leading-relaxed text-muted sm:col-span-4">
              Financial exposure uses validated issue-specific spend at risk only ({validatedExposure === null ? 'not yet validated, scores 0' : 'validated'}
              ). Severity and confidence are set per publisher below; recovery speed, effort and strategic importance score 0 until
              provided. Each row shows how many of the 8 inputs are known.
            </p>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyNote className="mt-6">
          No workbook rows are loaded. Use Refresh data at the top of the page, or Load workbook rows with a CSV export of “
          {WORKBOOK.primarySheet}”.
        </EmptyNote>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block sm:w-80">
              <span className="sr-only">Search publishers</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                id="c4-search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search name or ID"
                className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              Rank by
              <select
                id="c4-sort"
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none cursor-pointer"
              >
                <option value="priority">Priority score</option>
                <option value="spend">Spend</option>
                <option value="bidRequests">Bid-request volume</option>
                <option value="rpmbr">RPMBr</option>
              </select>
            </label>
          </div>
          <div className="mt-4">
            <TableShell minWidth="980px">
              <thead>
                <tr>
                  <Th>Subset</Th>
                  <Th>#</Th>
                  <Th>Publisher</Th>
                  <Th>Seller type</Th>
                  <Th right>Spend (SCU)</Th>
                  <Th right>Bid requests</Th>
                  <Th right>RPMBr</Th>
                  <Th>Confidence</Th>
                  <Th>Severity</Th>
                  <Th right>Score</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.slice(0, limit).map(({ row, p }) => {
                  const iss = issues[row.publisherId] ?? { confidence: 'Unverified' as EvidenceConfidence, severity: null };
                  return (
                    <tr key={row.publisherId} className="hover:bg-surface-2">
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Include ${row.publisherName || row.publisherId} in subset`}
                          checked={selected.has(row.publisherId)}
                          onChange={() => onToggle(row.publisherId)}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </td>
                      <td className="num px-4 py-2.5 text-muted">{p.rank}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-ink">{row.publisherName || '—'}</p>
                        <p className="num text-xs text-muted">#{row.publisherId}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-2">{row.sellerType}</td>
                      <td className="num px-4 py-2.5 text-right font-semibold text-ink">{fmt(row.spend, 2)}</td>
                      <td className="num px-4 py-2.5 text-right text-ink-2">{compact(row.bidRequests)}</td>
                      <td className="num px-4 py-2.5 text-right text-ink-2">{fmt(row.rpmbr, 2)}</td>
                      <td className="px-4 py-2.5">
                        <select
                          aria-label="Evidence confidence"
                          value={iss.confidence}
                          onChange={e => onIssue(row.publisherId, { ...iss, confidence: e.target.value as EvidenceConfidence })}
                          className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink cursor-pointer"
                        >
                          {(Object.keys(CONFIDENCE_TIER) as EvidenceConfidence[]).map(c => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          aria-label="Issue severity"
                          value={iss.severity === null ? '' : String(iss.severity)}
                          onChange={e => onIssue(row.publisherId, { ...iss, severity: e.target.value === '' ? null : Number(e.target.value) })}
                          className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink cursor-pointer"
                        >
                          <option value="">Unknown</option>
                          <option value="1">Critical</option>
                          <option value="0.66">High</option>
                          <option value="0.33">Medium</option>
                          <option value="0">Low</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Badge tone={CONF_TONE[p.confidence]}>{p.confidence}</Badge>
                          <span className="num w-10 text-right font-semibold text-ink">{p.score.toFixed(0)}</span>
                        </div>
                        <p className={cx('num text-[11px]', p.inputsKnown < 5 ? 'text-warn-ink' : 'text-muted')}>
                          {p.inputsKnown}/{p.inputsTotal} inputs
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              Showing {Math.min(limit, shown.length)} of {shown.length} publishers · {selected.size} in subset
            </span>
            {limit < shown.length && (
              <Button size="sm" variant="ghost" onClick={() => setLimit(l => l + 50)}>
                Show 50 more
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
};
