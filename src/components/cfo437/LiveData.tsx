import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Database, FileSpreadsheet, Loader2, PlugZap, RefreshCw, Unplug, XCircle } from 'lucide-react';
import { ALL_ROW_VIEW, VISIBLE_VIEW } from '../../lib/cfo437/baseline.ts';
import {
  type AlertState,
  base64ToBytes,
  type ConnectionState,
  DRIVE_DOWNLOAD_TOOL,
  DRIVE_METADATA_TOOL,
  DRIVE_SERVER,
  errorCopy,
  SHEETJS_URL,
  SNOWFLAKE_SERVER,
  SNOWFLAKE_TOOL,
  snowflakeRows,
  type SourceStatus,
  SQL_CONNECTION_SUMMARY,
  SQL_DISCONNECTED_NETWORKS,
  SQL_MONTHLY_TREND,
  SQL_OPEN_ALERTS,
  sqlPublisherRows,
  toAlerts,
  toConnectionState,
  toPublisherRows,
  toTrend,
  type TrendPoint,
  monthLabel,
  WORKBOOK_FILE_ID,
  WORKBOOK_SHEET,
  XLSX_MIME,
} from '../../lib/cfo437/live.ts';
import { aggregate, isVisible, parseSheetMatrix, type PublisherRow } from '../../lib/cfo437/publishers.ts';
import { Badge, Button, Card, cx, SegmentedControl } from '../ui.tsx';
import { fmt, SectionAnchor } from './shared.tsx';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Mcp = {
  callTool: (server: string, tool: string, input?: unknown, opts?: unknown) => Promise<{ payload?: unknown }>;
  listTools: (server?: string) => Promise<{ servers: { server: string; tools: { name: string }[] }[] }>;
};

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> };
    XLSX?: any;
  }
}

class LiveError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const codeOf = (e: unknown) => (e as { code?: string })?.code ?? (e instanceof LiveError ? e.code : 'upstream_error');

let sheetJs: Promise<any> | null = null;
function loadSheetJs(): Promise<any> {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  sheetJs ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SHEETJS_URL;
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new LiveError('parse_error', 'Spreadsheet reader did not load')));
    s.onerror = () => {
      sheetJs = null;
      reject(new LiveError('parse_error', 'Spreadsheet reader could not be loaded'));
    };
    document.head.appendChild(s);
  });
  return sheetJs;
}

/** One read with at most one retry for errors stamped retryable, per the connector failure design. */
async function read(mcp: Mcp, server: string, tool: string, input: unknown) {
  try {
    return await mcp.callTool(server, tool, input, { cache: false });
  } catch (e) {
    const err = e as { retryable?: boolean; retryAfterMs?: number };
    if (!err?.retryable) throw e;
    await new Promise(r => setTimeout(r, Math.min(err.retryAfterMs ?? 1500, 10000) + Math.random() * 500));
    return mcp.callTool(server, tool, input, { cache: false });
  }
}

const nowStamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

export interface LiveRefreshProps {
  connection: ConnectionState;
  onConnection: (c: ConnectionState) => void;
  onTrend: (t: TrendPoint[], asOf: string) => void;
  onAlerts: (a: AlertState) => void;
  month: string;
  months: string[];
  onMonth: (m: string) => void;
  onSnowflakeRows: (rows: PublisherRow[], month: string, asOf: string) => void;
  workbookModified: string;
  rowsSource: 'embedded' | 'live' | 'csv' | 'snowflake';
  rowsAsOf: string | null;
  onRows: (rows: PublisherRow[], modified: string) => void;
  useLive: boolean;
  canUseLive: boolean;
  onUseLive: (v: boolean) => void;
}

export const LiveRefresh: React.FC<LiveRefreshProps> = p => {
  const [mcp, setMcp] = useState<Mcp | null | undefined>(undefined);
  const [sf, setSf] = useState<SourceStatus>({ state: 'idle' });
  const [drive, setDrive] = useState<SourceStatus>({ state: 'idle' });
  const [check, setCheck] = useState<string | null>(null);
  const busy = sf.state === 'loading' || drive.state === 'loading';
  const names = useRef({ sf: SNOWFLAKE_SERVER, drive: DRIVE_SERVER });

  useEffect(() => {
    let alive = true;
    const use = window.claude?.use;
    if (!use) {
      setMcp(null);
      return;
    }
    use('mcp')
      .then(m => alive && setMcp((m as Mcp) ?? null))
      .catch(() => alive && setMcp(null));
    return () => {
      alive = false;
    };
  }, []);

  const resolveNames = useCallback(async (m: Mcp) => {
    try {
      const { servers } = await m.listTools();
      const find = (re: RegExp, fallback: string) => servers.find(s => s.server === fallback)?.server ?? servers.find(s => re.test(s.server))?.server ?? fallback;
      names.current = { sf: find(/snowflake.*analyst/i, SNOWFLAKE_SERVER), drive: find(/google\s*drive/i, DRIVE_SERVER) };
    } catch {
      /* keep declared names */
    }
  }, []);

  const refreshSnowflake = useCallback(
    async (m: Mcp, month: string) => {
      const server = names.current.sf;
      setSf({ state: 'loading', step: `Querying Snowflake for ${monthLabel(month)}…` });
      const q = (sql: string) => read(m, server, SNOWFLAKE_TOOL, { sql }).then(r => snowflakeRows(r.payload));
      const at = nowStamp();
      const [summary, list, rows, trend, alerts] = await Promise.allSettled([
        q(SQL_CONNECTION_SUMMARY),
        q(SQL_DISCONNECTED_NETWORKS),
        q(sqlPublisherRows(month)),
        q(SQL_MONTHLY_TREND),
        q(SQL_OPEN_ALERTS),
      ]);
      const failed: string[] = [];
      let firstCode: string | null = null;
      const fail = (label: string, r: PromiseSettledResult<unknown>) => {
        failed.push(label);
        if (r.status === 'rejected' && !firstCode) firstCode = codeOf(r.reason);
      };
      if (summary.status === 'fulfilled' && list.status === 'fulfilled') p.onConnection(toConnectionState(summary.value, list.value, at));
      else fail('connection history', summary.status === 'rejected' ? summary : list);
      if (rows.status === 'fulfilled' && rows.value.length) p.onSnowflakeRows(toPublisherRows(rows.value), month, at);
      else fail('publisher rows', rows);
      if (trend.status === 'fulfilled') p.onTrend(toTrend(trend.value), at);
      else fail('monthly trend', trend);
      if (alerts.status === 'fulfilled') p.onAlerts(toAlerts(alerts.value, at));
      else fail('open alerts', alerts);

      if (failed.length === 5) setSf({ state: 'error', code: firstCode ?? 'upstream_error', message: errorCopy(firstCode ?? 'upstream_error', 'Snowflake') });
      else
        setSf({
          state: 'ok',
          at,
          note: failed.length
            ? `Could not load: ${failed.join(', ')}. ${firstCode ? errorCopy(firstCode, 'Snowflake') : ''}`
            : `${monthLabel(month)} publisher rows, monthly trend, connection history and open alerts`,
        });
    },
    [p],
  );

  const refreshDrive = useCallback(
    async (m: Mcp) => {
      const server = names.current.drive;
      setDrive({ state: 'loading', step: 'Checking workbook…' });
      try {
        const meta = await read(m, server, DRIVE_METADATA_TOOL, { fileId: WORKBOOK_FILE_ID, excludeContentSnippets: true });
        const modified = String((meta.payload as { modifiedTime?: string })?.modifiedTime ?? '');
        setDrive({ state: 'loading', step: 'Downloading workbook…' });
        const [dl, XLSX] = await Promise.all([
          read(m, server, DRIVE_DOWNLOAD_TOOL, { fileId: WORKBOOK_FILE_ID, exportMimeType: XLSX_MIME }),
          loadSheetJs(),
        ]);
        const content = (dl.payload as { content?: string })?.content;
        if (!content) throw new LiveError('parse_error', 'No file content returned');
        setDrive({ state: 'loading', step: 'Reading 437 tab…' });
        const wb = XLSX.read(base64ToBytes(content), { type: 'array' });
        const ws = wb.Sheets[WORKBOOK_SHEET];
        if (!ws) throw new LiveError('parse_error', `Tab "${WORKBOOK_SHEET}" not found`);
        const out = parseSheetMatrix(XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }));
        if (!out.rows.length) throw new LiveError('parse_error', 'No publisher rows found');
        const vis = aggregate(out.rows.filter(isVisible));
        const all = aggregate(out.rows);
        const same =
          vis.rows === VISIBLE_VIEW.rows &&
          vis.positiveRows === VISIBLE_VIEW.positiveRows &&
          Math.abs(vis.spend - VISIBLE_VIEW.spend) < 0.01 &&
          all.rows === ALL_ROW_VIEW.rows;
        setCheck(
          same
            ? 'Workbook matches the validated baseline (316 / 205 / 111).'
            : `Workbook changed since validation: ${vis.rows} visible rows, ${vis.positiveRows} with spend, ${fmt(vis.spend, 2)} SCU.`,
        );
        p.onRows(out.rows, modified || p.workbookModified);
        setDrive({ state: 'ok', at: nowStamp(), note: `${out.rows.length} rows · workbook modified ${modified.slice(0, 16).replace('T', ' ') || 'unknown'}` });
      } catch (e) {
        const code = codeOf(e);
        setDrive({
          state: 'error',
          code,
          message: code === 'parse_error' ? `${errorCopy(code, 'Google Drive')} ${(e as Error).message}.` : errorCopy(code, 'Google Drive'),
        });
      }
    },
    [p],
  );

  const refreshAll = async () => {
    if (!mcp || busy) return;
    await resolveNames(mcp);
    await refreshSnowflake(mcp, p.month);
  };

  const Status: React.FC<{ status: SourceStatus }> = ({ status }) => (
    <>
      {status.state === 'loading' && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-accent-ink">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {status.step}
        </p>
      )}
      {status.state === 'ok' && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-ok-ink">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Refreshed {status.at}
          {status.note ? ` · ${status.note}` : ''}
        </p>
      )}
      {status.state === 'error' && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-danger-ink">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {status.message}
        </p>
      )}
    </>
  );

  const sourceLabel =
    p.rowsSource === 'snowflake'
      ? `Snowflake · live ${p.rowsAsOf ?? ''}`
      : p.rowsSource === 'live'
        ? 'Google Drive · live'
        : p.rowsSource === 'csv'
          ? 'CSV import'
          : 'Embedded workbook copy';

  return (
    <Card className="p-6 sm:p-8">
      <SectionAnchor id="c4-live" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            {mcp ? <PlugZap className="h-5 w-5" /> : <Unplug className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">Live data</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Load endpoint-437 data live from Snowflake</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
              One click queries Snowflake through your own connector, read-only. It loads the publisher rows for the month you pick, the
              monthly trend, Amazon DSP connection history and open disconnection alerts. Every section of this page then recalculates
              from the live numbers.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted">
              Month
              <select
                id="c4-live-month"
                value={p.month}
                onChange={e => {
                  const m = e.target.value;
                  p.onMonth(m);
                  if (mcp && !busy) resolveNames(mcp).then(() => refreshSnowflake(mcp, m));
                }}
                disabled={busy}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none cursor-pointer"
              >
                {p.months.map(m => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="primary" onClick={refreshAll} disabled={!mcp || busy} aria-busy={busy}>
              <RefreshCw className={cx('h-4 w-4', busy && 'animate-spin')} />
              {busy ? 'Refreshing…' : 'Refresh data'}
            </Button>
          </div>
          <span className="text-right text-[11px] text-muted">
            {mcp === undefined ? 'Checking connectors…' : mcp ? 'Snowflake connector available' : 'Live refresh unavailable in this view'}
          </span>
        </div>
      </div>

      {mcp === null && (
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink-2">
          Open this page in claude.ai with the Snowflake (role data analyst) connector to load live data. Until then every section shows
          the embedded snapshot read from Snowflake on 2026-10-20.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Baseline used by every section</p>
          <p className="mt-0.5 text-xs text-muted">
            Rows loaded: {sourceLabel}. {p.canUseLive ? '' : 'Refresh to enable the live baseline.'}
          </p>
        </div>
        <SegmentedControl<'validated' | 'live'>
          ariaLabel="Baseline"
          value={p.useLive && p.canUseLive ? 'live' : 'validated'}
          onChange={v => p.onUseLive(v === 'live')}
          options={[
            { value: 'validated', label: 'Validated workbook · Sep 2026' },
            { value: 'live', label: p.canUseLive ? `Live Snowflake · ${monthLabel(p.month)}` : 'Live Snowflake' },
          ]}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-line p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
            <Database className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-ink">Snowflake</p>
            <p className="mt-0.5 text-xs text-muted">
              Publisher rows, trend, connection history and alerts · {p.connection.source === 'live' ? `live ${p.connection.asOf}` : `snapshot ${p.connection.asOf}`}
            </p>
            <Status status={sf} />
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-line p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-ink">Workbook cross-check · optional</p>
              <p className="mt-0.5 text-xs text-muted">
                Google Drive · “{WORKBOOK_SHEET}” · modified {p.workbookModified.slice(0, 16).replace('T', ' ')}
              </p>
              <Status status={drive} />
            </div>
          </div>
          {mcp && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => resolveNames(mcp).then(() => refreshDrive(mcp))}>
              <RefreshCw className="h-3.5 w-3.5" /> Re-read workbook
            </Button>
          )}
        </div>
      </div>
      {check && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <Badge tone={check.startsWith('Workbook matches') ? 'ok' : 'warn'}>{check.startsWith('Workbook matches') ? 'Reconciled' : 'Changed'}</Badge>
          {check}
        </p>
      )}
    </Card>
  );
};
