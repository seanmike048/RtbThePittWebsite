/**
 * USD conversion policy. Source amounts keep their currency; conversion happens here only.
 *
 *  - Source: ANALYTICS.PUBLIC.MAPPING_CURRENCY_RATE_HIST (Equativ platform rate table, EUR base).
 *  - Reading: CURRENCY_RATE for USD is the EUR value of 1 USD (inferred from the table's values; see SPEND_SNAPSHOT.fx).
 *  - Daily amounts convert at their own day's rate, then aggregate (never convert a sum at an average rate).
 *  - An amount already in USD is never converted again. Unknown currency or a missing rate gives "unavailable".
 */
import { SPEND_SNAPSHOT } from './spend.data.ts';

export type Usd =
  | { kind: 'usd'; usd: number; basis: string }
  | { kind: 'unavailable'; reason: string };

export const FX_SOURCE = {
  table: SPEND_SNAPSHOT.fx.table,
  reading: SPEND_SNAPSHOT.fx.reading,
  readAt: SPEND_SNAPSHOT.read_at,
  queryId: SPEND_SNAPSHOT.queries.find((q) => q.what.startsWith('ANALYTICS.PUBLIC.MAPPING_CURRENCY_RATE_HIST'))?.id ?? null,
};

export type RateTable = Record<string, number>;
export const RATES: RateTable = SPEND_SNAPSHOT.fx.eur_per_usd;

/** EUR value of 1 USD on a day, or null when the table has no row for that day. */
export const eurPerUsd = (day: string, rates: RateTable = RATES): number | null => {
  const r = rates[day.slice(0, 10)];
  return typeof r === 'number' && r > 0 ? r : null;
};

/** Converts one amount on one day. */
export function toUsd(amount: number, currency: 'EUR' | 'USD' | 'unknown', day: string | null, rates: RateTable = RATES): Usd {
  if (!Number.isFinite(amount)) return { kind: 'unavailable', reason: 'The source amount is not a number.' };
  if (currency === 'USD') return { kind: 'usd', usd: amount, basis: 'Source amount in USD (not converted)' };
  if (currency === 'unknown') return { kind: 'unavailable', reason: 'The source does not document the currency, so no USD value is shown.' };
  if (!day) return { kind: 'unavailable', reason: 'No date for the amount, so no FX rate can be chosen.' };
  const r = eurPerUsd(day, rates);
  if (r == null) return { kind: 'unavailable', reason: `No EUR→USD rate for ${day.slice(0, 10)} in ${FX_SOURCE.table}.` };
  return { kind: 'usd', usd: amount / r, basis: `EUR converted at the ${day.slice(0, 10)} rate` };
}

/** Converts daily EUR amounts day by day, then sums. Any missing rate makes the total unavailable (no partial sums). */
export function sumDailyEurToUsd(days: { day: string; eur: number }[], rates: RateTable = RATES): Usd {
  let total = 0;
  for (const d of days) {
    const u = toUsd(d.eur, 'EUR', d.day, rates);
    if (u.kind === 'unavailable') return u;
    total += u.usd;
  }
  const span = days.length ? `${days[0].day} → ${days[days.length - 1].day}` : 'no days';
  return { kind: 'usd', usd: total, basis: `Daily EUR converted at each day's rate, then summed (${span})` };
}

export const usdValue = (u: Usd | null | undefined): number | null => (u && u.kind === 'usd' ? u.usd : null);

/** "$3,497". Values under $10 keep cents so a near-zero seat does not read as $0. */
export function fmtUsd(n: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return 'Unavailable';
  const a = Math.abs(n);
  const body = a > 0 && a < 10 ? a.toFixed(2) : Math.round(a).toLocaleString('en-US');
  const sign = n < 0 ? '−' : opts.signed && n > 0 ? '+' : '';
  return `${sign}$${body}`;
}

export const showUsd = (u: Usd | null | undefined) => (u && u.kind === 'usd' ? fmtUsd(u.usd) : 'Unavailable');

/**
 * Rewrites euro amounts quoted inside source prose ("€34,785/week") into USD at one stated day's rate, marked "≈".
 * Without a rate the amount is replaced by a neutral marker; the original stays in the stored source.
 */
export function usdInText(text: string, day: string | null, rates: RateTable = RATES): string {
  return text.replace(/€\s?(\d[\d,]*(?:\.\d+)?)(\s?[KkMm])?/g, (_m, num: string, suffix: string | undefined) => {
    const mult = suffix ? (/[Kk]/.test(suffix) ? 1e3 : 1e6) : 1;
    const u = toUsd(Number(num.replace(/,/g, '')) * mult, 'EUR', day, rates);
    return u.kind === 'usd' ? '≈ ' + fmtUsd(u.usd) : '[amount in source currency]';
  });
}
