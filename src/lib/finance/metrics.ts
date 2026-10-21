/**
 * Metric definitions. RPMBr = spend per one million bid requests, the workbook's formula
 * (SPEND ÷ BID_REQUEST_COUNT × 1,000,000) and the same columns in MONTH_SCO_NODES. Bid requests are documented as
 * "Volume of Bid Requests sent by Equativ to our Demand Partners (DSP)".
 */
import { unavailable, val, type Val } from './values.ts';

export const PER_MILLION = 1_000_000;
export const RPMBR_LABEL = 'Spend per 1M bid requests (RPMBr)';

export function rpmbr(spend: number | null, bidRequests: number | null): Val {
  if (spend === null || bidRequests === null) return unavailable('Spend or bid requests missing.');
  if (bidRequests <= 0) return unavailable('No bid requests: yield is undefined, not zero.', ['comparator yield']);
  return val((spend / bidRequests) * PER_MILLION);
}

/** Pooled RPMBr = Σ spend ÷ Σ bid requests × 1,000,000. Never a mean of row yields. A row with missing spend makes the pool incomplete. */
export function pooledRpmbr(rows: { spend: number | null; bidRequests: number | null }[]): Val {
  let s = 0;
  let b = 0;
  for (const r of rows) {
    if (r.spend === null || r.bidRequests === null) return unavailable('A row has missing spend or bid requests; the pool would be incomplete.');
    s += r.spend;
    b += r.bidRequests;
  }
  return rpmbr(s, b);
}

/** Percentage change; undefined when the base is zero or unavailable. */
export function pctChange(from: Val, to: Val): Val {
  const a = from.kind === 'value' || from.kind === 'negative' ? from.v : from.kind === 'zero' ? 0 : null;
  const b = to.kind === 'value' || to.kind === 'negative' ? to.v : to.kind === 'zero' ? 0 : null;
  if (a === null || b === null) return unavailable('A side of the comparison is unavailable.');
  if (a === 0) return unavailable('Baseline is zero: percentage change is undefined.');
  return val(((b - a) / Math.abs(a)) * 100);
}
