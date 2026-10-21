/**
 * Currency gating. A monetary amount carries the currency status of its source. Nothing is called EUR or USD unless
 * Finance validated it; "source-documented" means a warehouse column comment says so, which is evidence, not approval.
 */
import { unavailable, val, num, type Val } from './values.ts';

export type CurrencyBasis = 'finance-validated' | 'source-documented' | 'unknown';

export interface CurrencyStatus {
  code: string | null;
  basis: CurrencyBasis;
  note: string;
}

/** TOTAL_PAID_PRICE_TRUE_COUNT: comments on DAY_DEMAND, DAY_SUPPLY, DAY_SCO_NODES ("in Euro") and MONTH_SCO_NODES ("Gross paid price in EUR"). */
export const WAREHOUSE_SPEND: CurrencyStatus = {
  code: 'EUR',
  basis: 'source-documented',
  note:
    'Warehouse column comments describe TOTAL_PAID_PRICE_TRUE_COUNT as Euro. The workbook displays “$” for the same numbers. Finance has not validated either reading.',
};

/** The workflow narrative states “currency unverified”. */
export const NARRATIVE: CurrencyStatus = { code: null, basis: 'unknown', note: 'The workflow text says “currency unverified”.' };

export const UNIT_LONG = 'source currency units';
export const UNIT_SHORT = 'SCU';

/** Unit label. A symbol or ISO code appears only once Finance has validated the currency. */
export function unitLabel(c: CurrencyStatus, short = false): string {
  if (c.basis === 'finance-validated' && c.code) return c.code;
  return short ? UNIT_SHORT : UNIT_LONG;
}

export function currencyBadge(c: CurrencyStatus): string {
  if (c.basis === 'finance-validated') return `${c.code} · Finance-validated`;
  if (c.basis === 'source-documented') return `Source-documented ${c.code} · not Finance-validated`;
  return 'Currency unknown';
}

export interface MoneyItem {
  label: string;
  amount: Val;
  currency: CurrencyStatus;
  synthetic?: boolean;
}

/**
 * Totals across sources or cases. Unknown currencies never sum. Official totals also require Finance validation
 * and refuse synthetic items.
 */
export function aggregateMoney(items: MoneyItem[], opts: { official: boolean }): Val {
  if (!items.length) return unavailable('Nothing to total.');
  const synthetic = items.filter(i => i.synthetic);
  if (opts.official && synthetic.length) return unavailable(`Synthetic items cannot enter official totals: ${synthetic.map(s => s.label).join(', ')}.`, ['live data']);
  const noCode = items.filter(i => !i.currency.code);
  if (noCode.length) return unavailable(`Currency missing for ${noCode.map(i => i.label).join(', ')}.`, ['currency of each amount']);
  const codes = new Set(items.map(i => i.currency.code));
  if (codes.size > 1) return unavailable(`Amounts are in different currencies (${[...codes].join(', ')}); an approved FX source and date are required.`, ['FX source', 'FX date']);
  if (opts.official && items.some(i => i.currency.basis !== 'finance-validated'))
    return unavailable('Finance has not validated the currency of these amounts.', ['Finance currency validation']);
  let total = 0;
  for (const i of items) {
    const n = num(i.amount);
    if (n === null) return unavailable(`${i.label} has no usable amount.`);
    total += n;
  }
  return val(total);
}
