/**
 * Live refresh of the daily series. Three fixed, read-only statements; no SQL text is taken from the viewer.
 * Results are checked for shape and coverage before they replace the snapshot; a failure keeps the snapshot.
 */
import type { NetworkRaw, PortfolioRaw, SeatRaw } from './baseline.ts';

const SELLER_TYPES = `st AS (
  SELECT seller_id, seller_type FROM ANALYTICS.PUBLIC.VIEW_SELLERS_JSON_NODES
  WHERE parent_domain = 'smartadserver.com'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY seller_id ORDER BY last_modification_date DESC) = 1
)`;

export const SQL_PORTFOLIO_DAILY = `WITH ${SELLER_TYPES}, d AS (
  SELECT day, network_id, SUM(bid_requests) AS br, SUM(total_paid_price_true_count) AS spend
  FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES
  WHERE partner_id = 437 AND day >= DATEADD(day, -60, CURRENT_DATE()) AND day < CURRENT_DATE()
  GROUP BY 1, 2
)
SELECT TO_VARCHAR(d.day, 'YYYY-MM-DD') AS day,
  SUM(IFF(st.seller_type IN ('BOTH', 'INTERMEDIARY'), br, 0)) AS visible_br,
  SUM(IFF(st.seller_type IN ('BOTH', 'INTERMEDIARY'), spend, 0)) AS visible_spend,
  COUNT_IF(st.seller_type IN ('BOTH', 'INTERMEDIARY')) AS visible_networks,
  SUM(br) AS all_br, SUM(spend) AS all_spend
FROM d LEFT JOIN st ON st.seller_id = TO_VARCHAR(d.network_id)
GROUP BY 1 ORDER BY 1`;

export const SQL_SEAT_DAILY = `SELECT TO_VARCHAR(day, 'YYYY-MM-DD') AS day, partner_id, SUM(bid_requests) AS br, SUM(bids) AS bids,
  SUM(impressions_true_count) AS imps, SUM(total_paid_price_true_count) AS spend
FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES
WHERE network_id = 5100 AND partner_id IN (437, 489, 490, 491, 492) AND day >= '2026-09-06' AND day < CURRENT_DATE()
GROUP BY 1, 2 ORDER BY 1, 2`;

export const SQL_NETWORK_DAILY = `SELECT TO_VARCHAR(day, 'YYYY-MM-DD') AS day, network_id, SUM(total_paid_price_true_count) AS spend,
  SUM(IFF(partner_id IN (437, 489, 490, 491, 492), total_paid_price_true_count, 0)) AS amazon_spend
FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_DEMAND
WHERE network_id IN (5100, 5524) AND day >= '2026-09-06' AND day < CURRENT_DATE()
GROUP BY 1, 2 ORDER BY 1, 2`;

type Row = Record<string, string | null>;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const n = (r: Row, k: string): number => {
  const v = r[k];
  if (v === null || v === undefined || v === '') throw new Error(`Column ${k} is empty`);
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`Column ${k} is not numeric`);
  return x;
};
const d = (r: Row) => {
  const v = (r.DAY ?? '').slice(0, 10);
  if (!DAY.test(v)) throw new Error('Day column has an unexpected format');
  return v;
};

export function toPortfolioRaw(rows: Row[]): PortfolioRaw {
  if (rows.length < 28) throw new Error(`Only ${rows.length} days returned; at least 28 are needed`);
  return rows.map(r => [d(r), n(r, 'VISIBLE_BR'), n(r, 'VISIBLE_SPEND'), n(r, 'VISIBLE_NETWORKS'), n(r, 'ALL_BR'), n(r, 'ALL_SPEND')]);
}

export function toSeatRaw(rows: Row[]): SeatRaw {
  return rows.map(r => [d(r), n(r, 'PARTNER_ID'), n(r, 'BR'), n(r, 'BIDS'), n(r, 'IMPS'), n(r, 'SPEND')]);
}

export function toNetworkRaw(rows: Row[]): NetworkRaw {
  if (!rows.length) throw new Error('No network rows returned');
  return rows.map(r => [d(r), n(r, 'NETWORK_ID'), n(r, 'SPEND'), n(r, 'AMAZON_SPEND')]);
}
