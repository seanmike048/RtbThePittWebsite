/** Provenance registry: every executed query with its ID, time, row count and SQL; failures stay failures. */
import { QUERY_LOG } from './snapshot.data.ts';

export interface QueryRecord {
  key: string;
  queryId: string | null;
  title: string;
  file: string;
  purpose: string;
  executedAt: string;
  rowCount: number | null;
  sql: string | null;
  status: 'ok' | 'failed';
  error?: string;
  server: string;
}

export const SNAPSHOT_VERSION = 'snowflake-2026-10-21T01:59Z';
export const DATA_THROUGH = '2026-10-19';

export function query(key: string): QueryRecord {
  const q = QUERY_LOG.find(r => r.key === key);
  if (!q) throw new Error(`Unknown query ${key}`);
  return q;
}

export const queries = (...keys: string[]) => keys.map(query);

/** Live refresh outcome merge: a failed or malformed read never replaces existing data with an empty or zero result. */
export function mergeRefresh<T>(prev: { data: T; source: 'snapshot' | 'live'; asOf: string }, outcome: { ok: true; data: T; asOf: string } | { ok: false; error: string }) {
  if (outcome.ok === false) return { ...prev, lastError: outcome.error };
  return { data: outcome.data, source: 'live' as const, asOf: outcome.asOf, lastError: null };
}
