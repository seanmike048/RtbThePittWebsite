/**
 * Publisher-level rows from the workbook worksheet "437 (Americas Display)".
 * Rows ship empty until loaded from the workbook (Google Drive connector or CSV export).
 */
import { rpmbr } from './baseline.ts';

export interface PublisherRow {
  publisherId: string;
  publisherName: string;
  sellerType: string;
  bidRequests: number;
  spend: number;
  rpmbr: number;
  inScope: boolean | null;
}

export const VISIBLE_SELLER_TYPES = ['BOTH', 'INTERMEDIARY'];

export const isVisible = (r: PublisherRow) => VISIBLE_SELLER_TYPES.includes(r.sellerType.trim().toUpperCase());

/** Workbook column aliases, matched case-insensitively after removing spaces, dashes and underscores. */
const ALIASES: Record<keyof PublisherRow, string[]> = {
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
  (Object.keys(ALIASES) as (keyof PublisherRow)[]).forEach(k => {
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

/** Publisher rows loaded from the workbook. Empty until Phase B (see docs/cfo-437-plan.md). */
export const WORKBOOK_ROWS: PublisherRow[] = [];
