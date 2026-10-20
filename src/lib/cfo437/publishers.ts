/**
 * Publisher-level rows from the workbook worksheet "437 (Americas Display)".
 * Embedded from the workbook (see publishers.data.ts); refreshable live from Google Drive or a CSV export.
 */
import { rpmbr } from './baseline.ts';
import { RAW_ROWS, type RawRow } from './publishers.data.ts';

export interface PublisherRow {
  publisherId: string;
  publisherName: string;
  sellerType: string;
  bidRequests: number;
  spend: number;
  rpmbr: number;
  inScope: boolean | null;
  resellerPct?: number | null;
  /** Value of the workbook's own "Disconected" column, when set. */
  sheetDisconnectedOn?: string | null;
}

export const VISIBLE_SELLER_TYPES = ['BOTH', 'INTERMEDIARY'];

export const isVisible = (r: PublisherRow) => VISIBLE_SELLER_TYPES.includes(r.sellerType.trim().toUpperCase());

/** Workbook column aliases, matched case-insensitively after removing spaces, dashes and underscores. */
const ALIASES: Record<Exclude<keyof PublisherRow, 'resellerPct' | 'sheetDisconnectedOn'>, string[]> = {
  publisherId: ['publisherid', 'networkid', 'pubid', 'publisher'],
  publisherName: ['publishername', 'networkname', 'name', 'publishername1'],
  sellerType: ['sellertype', 'type'],
  bidRequests: ['bidrequestcount', 'bidrequests', 'bidrequest'],
  spend: ['spendgrosspartnerrevenue', 'spend', 'grossspend', 'grosspartnerrevenue'],
  rpmbr: ['rpmbr'],
  inScope: ['inscope'],
};

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-().]/g, '');

/** Minimal RFC 4180 CSV / TSV splitter (quoted fields, escaped quotes). */
export function splitDelimited(text: string): string[][] {
  const delim = text.split('\n', 1)[0].includes('\t') ? '\t' : ',';
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(x => x.trim() !== '')) out.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim() !== '')) out.push(row);
  return out;
}

const toNum = (s: string | undefined) => {
  if (s === undefined) return 0;
  const n = Number(s.replace(/[^0-9.\-eE]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export interface ParseOutcome {
  rows: PublisherRow[];
  missingColumns: string[];
  mapped: Partial<Record<keyof PublisherRow, string>>;
}

export function parseWorkbookCsv(text: string): ParseOutcome {
  const table = splitDelimited(text.replace(/^﻿/, ''));
  if (table.length < 2) return { rows: [], missingColumns: ['header and data rows'], mapped: {} };
  const header = table[0].map(norm);
  const idx: Partial<Record<keyof PublisherRow, number>> = {};
  const mapped: Partial<Record<keyof PublisherRow, string>> = {};
  (Object.keys(ALIASES) as (keyof typeof ALIASES)[]).forEach(k => {
    const i = header.findIndex(h => ALIASES[k].includes(h));
    if (i >= 0) {
      idx[k] = i;
      mapped[k] = table[0][i];
    }
  });
  const required: (keyof PublisherRow)[] = ['publisherId', 'sellerType', 'bidRequests', 'spend'];
  const missingColumns = required.filter(k => idx[k] === undefined);
  if (missingColumns.length) return { rows: [], missingColumns, mapped };

  const rows = table.slice(1).map(cells => {
    const bidRequests = toNum(cells[idx.bidRequests!]);
    const spend = toNum(cells[idx.spend!]);
    const scopeCell = idx.inScope !== undefined ? cells[idx.inScope]?.trim() : undefined;
    return {
      publisherId: (cells[idx.publisherId!] ?? '').trim(),
      publisherName: idx.publisherName !== undefined ? (cells[idx.publisherName] ?? '').trim() : '',
      sellerType: (cells[idx.sellerType!] ?? '').trim(),
      bidRequests,
      spend,
      // Recompute with the workbook definition (×1,000,000) rather than trusting a pasted value.
      rpmbr: rpmbr(spend, bidRequests),
      inScope: scopeCell === undefined || scopeCell === '' ? null : scopeCell === '1' || scopeCell.toLowerCase() === 'true',
    };
  });
  return { rows: rows.filter(r => r.publisherId !== ''), missingColumns: [], mapped };
}

export interface Aggregate {
  rows: number;
  positiveRows: number;
  zeroRows: number;
  bidRequests: number;
  spend: number;
  weightedRpmbr: number;
  medianPositiveRpmbr: number;
  top16SharePct: number;
  sellerMix: { sellerType: string; rows: number; spend: number }[];
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function aggregate(rows: PublisherRow[]): Aggregate {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const bidRequests = rows.reduce((s, r) => s + r.bidRequests, 0);
  const positive = rows.filter(r => r.spend > 0);
  const top16 = [...rows].sort((a, b) => b.spend - a.spend).slice(0, 16).reduce((s, r) => s + r.spend, 0);
  const mix = new Map<string, { rows: number; spend: number }>();
  rows.forEach(r => {
    const k = r.sellerType.toUpperCase() || 'UNKNOWN';
    const m = mix.get(k) ?? { rows: 0, spend: 0 };
    m.rows++;
    m.spend += r.spend;
    mix.set(k, m);
  });
  return {
    rows: rows.length,
    positiveRows: positive.length,
    zeroRows: rows.length - positive.length,
    bidRequests,
    spend,
    weightedRpmbr: rpmbr(spend, bidRequests),
    medianPositiveRpmbr: median(positive.map(r => r.rpmbr)),
    top16SharePct: spend > 0 ? (top16 / spend) * 100 : 0,
    sellerMix: [...mix.entries()].map(([sellerType, v]) => ({ sellerType, ...v })).sort((a, b) => b.spend - a.spend),
  };
}

export const fromRaw = (r: RawRow): PublisherRow => ({
  publisherId: r[0],
  publisherName: r[1],
  sellerType: r[2],
  bidRequests: r[3],
  spend: r[4],
  rpmbr: rpmbr(r[4], r[3]),
  inScope: r[5] === 1,
  resellerPct: r[6],
  sheetDisconnectedOn: r[7],
});

/** Publisher rows embedded from the workbook (861 rows, all seller types). */
export const WORKBOOK_ROWS: PublisherRow[] = RAW_ROWS.map(fromRaw);

const cellNum = (v: unknown) => (typeof v === 'number' ? v : toNum(v === null || v === undefined ? undefined : String(v)));

const cellDate = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // Spreadsheet serial date
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

/**
 * Parses the "437 (Americas Display)" worksheet as a matrix of cell values
 * (e.g. SheetJS sheet_to_json with header: 1). Finds the PUBLISHER_ID header row, then reads rows below it.
 */
export function parseSheetMatrix(matrix: unknown[][]): ParseOutcome {
  const headerIdx = matrix.findIndex(r => Array.isArray(r) && String(r[0] ?? '').trim().toUpperCase() === 'PUBLISHER_ID');
  if (headerIdx < 0) return { rows: [], missingColumns: ['PUBLISHER_ID header row'], mapped: {} };
  const header = matrix[headerIdx].map(c => norm(String(c ?? '')));
  const col = (aliases: string[]) => header.findIndex(h => aliases.includes(h));
  const idx = {
    id: col(ALIASES.publisherId),
    name: col(ALIASES.publisherName),
    seller: col(ALIASES.sellerType),
    bids: col(ALIASES.bidRequests),
    spend: col(ALIASES.spend),
    inScope: col(ALIASES.inScope),
    reseller: col(['resellersupply', '%resellersupply']),
    disc: col(['disconected', 'disconnected']),
  };
  const missingColumns = (['id', 'seller', 'bids', 'spend'] as const).filter(k => idx[k] < 0);
  if (missingColumns.length) return { rows: [], missingColumns: [...missingColumns], mapped: {} };
  const rows: PublisherRow[] = [];
  for (const r of matrix.slice(headerIdx + 1)) {
    if (!Array.isArray(r)) continue;
    const id = String(r[idx.id] ?? '').trim().replace(/\.0+$/, '');
    if (!id) continue;
    const bids = cellNum(r[idx.bids]);
    const spend = cellNum(r[idx.spend]);
    const res = idx.reseller >= 0 ? r[idx.reseller] : null;
    rows.push({
      publisherId: id,
      publisherName: idx.name >= 0 ? String(r[idx.name] ?? '').trim() : '',
      sellerType: String(r[idx.seller] ?? '').trim(),
      bidRequests: bids,
      spend,
      rpmbr: rpmbr(spend, bids),
      inScope: idx.inScope >= 0 ? String(r[idx.inScope] ?? '').trim() === '1' : null,
      resellerPct: res === null || res === undefined || res === '' ? null : Math.round(cellNum(res) * (cellNum(res) <= 1 ? 10000 : 100)) / 100,
      sheetDisconnectedOn: idx.disc >= 0 ? cellDate(r[idx.disc]) : null,
    });
  }
  return { rows, missingColumns: [], mapped: {} };
}
