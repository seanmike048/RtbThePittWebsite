import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Database, FileSpreadsheet, Loader2, PlugZap, RefreshCw, Unplug, XCircle } from 'lucide-react';
import { ALL_ROW_VIEW, VISIBLE_VIEW } from '../../lib/cfo437/baseline.ts';
import {
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
  toConnectionState,
  WORKBOOK_FILE_ID,
  WORKBOOK_SHEET,
  XLSX_MIME,
} from '../../lib/cfo437/live.ts';
import { aggregate, isVisible, parseSheetMatrix, type PublisherRow } from '../../lib/cfo437/publishers.ts';
import { Badge, Button, Card, cx } from '../ui.tsx';
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
  workbookModified: string;
  rowsSource: 'embedded' | 'live' | 'csv';
  onRows: (rows: PublisherRow[], modified: string) => void;
}

export const LiveRefresh: React.FC<LiveRefreshProps> = ({ connection, onConnection, workbookModified, rowsSource, onRows }) => {
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
    async (m: Mcp) => {
      const server = names.current.sf;
      setSf({ state: 'loading', step: 'Querying connection history…' });
      try {
        const [a, b] = await Promise.all([
          read(m, server, SNOWFLAKE_TOOL, { sql: SQL_CONNECTION_SUMMARY }),
          read(m, server, SNOWFLAKE_TOOL, { sql: SQL_DISCONNECTED_NETWORKS }),
        ]);
        let state: ConnectionState;
        try {
          state = toConnectionState(snowflakeRows(a.payload), snowflakeRows(b.payload), nowStamp());
        } catch {
          throw new LiveError('parse_error', 'Unexpected Snowflake result');
        }
        onConnection(state);
        setSf({ state: 'ok', at: state.asOf, note: `${state.disconnected} disconnected · ${fmt(state.connected)} connected` });
      } catch (e) {
        const code = codeOf(e);
        setSf({ state: 'error', code, message: errorCopy(code, 'Snowflake') });
      }
    },
    [onConnection],
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
            ? 'Matches the validated baseline (316 / 205 / 111).'
            : `Workbook changed since validation: ${vis.rows} visible rows, ${vis.positiveRows} with spend, ${fmt(vis.spend, 2)} SCU. The validated baseline cards keep their values; the recomputed column shows the new figures.`,
        );
        onRows(out.rows, modified || workbookModified);
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
    [onRows, workbookModified],
  );

  const refreshAll = async () => {
    if (!mcp || busy) return;
    await resolveNames(mcp);
    await Promise.all([refreshSnowflake(mcp), refreshDrive(mcp)]);
  };

  const Row: React.FC<{ icon: React.ReactNode; title: string; asOf: string; source: string; status: SourceStatus; onOne?: () => void }> = ({
    icon,
    title,
    asOf,
    source,
    status,
    onOne,
  }) => (
    <div className="flex flex-col gap-3 rounded-2xl border border-line p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">{icon}</div>
        <div className="min-w-0">
          <p className="font-medium text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {source} · as of <span className="num">{asOf}</span>
          </p>
          {status.state === 'loading' && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-accent-ink">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {status.step}
            </p>
          )}
          {status.state === 'ok' && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ok-ink">
              <CheckCircle2 className="h-3.5 w-3.5" /> Refreshed {status.at}
              {status.note ? ` · ${status.note}` : ''}
            </p>
          )}
          {status.state === 'error' && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-danger-ink">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {status.message}
            </p>
          )}
        </div>
      </div>
      {onOne && mcp && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={onOne}>
          <RefreshCw className="h-3.5 w-3.5" /> This source
        </Button>
      )}
    </div>
  );

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
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Refresh from Snowflake and the workbook</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
              Pulls the latest endpoint-437 connection history from Snowflake and re-reads the “{WORKBOOK_SHEET}” tab through Google
              Drive, using your own connectors. Read-only. Refreshed data stays for this visit.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button variant="primary" onClick={refreshAll} disabled={!mcp || busy} aria-busy={busy}>
            <RefreshCw className={cx('h-4 w-4', busy && 'animate-spin')} />
            {busy ? 'Refreshing…' : 'Refresh data'}
          </Button>
          <span className="text-[11px] text-muted">
            {mcp === undefined ? 'Checking connectors…' : mcp ? 'Connectors available' : 'Live refresh unavailable in this view'}
          </span>
        </div>
      </div>

      {mcp === null && (
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink-2">
          Open this page in claude.ai with the Snowflake (role data analyst) and Google Drive connectors connected to refresh. Until
          then it shows the embedded snapshot below.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Row
          icon={<Database className="h-4 w-4" />}
          title="Amazon DSP connection history · partner 437"
          source={connection.source === 'live' ? 'Snowflake · live' : 'Snowflake · embedded snapshot'}
          asOf={connection.asOf}
          status={sf}
          onOne={() => mcp && resolveNames(mcp).then(() => refreshSnowflake(mcp))}
        />
        <Row
          icon={<FileSpreadsheet className="h-4 w-4" />}
          title={`Workbook · ${WORKBOOK_SHEET}`}
          source={rowsSource === 'live' ? 'Google Drive · live' : rowsSource === 'csv' ? 'CSV import' : 'Google Drive · embedded copy'}
          asOf={workbookModified.slice(0, 16).replace('T', ' ')}
          status={drive}
          onOne={() => mcp && resolveNames(mcp).then(() => refreshDrive(mcp))}
        />
      </div>
      {check && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <Badge tone={check.startsWith('Matches') ? 'ok' : 'warn'}>{check.startsWith('Matches') ? 'Reconciled' : 'Changed'}</Badge>
          {check}
        </p>
      )}
    </Card>
  );
};
