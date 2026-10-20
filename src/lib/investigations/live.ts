/** Read-only Snowflake queries for investigation context and the watchlist. Network IDs are validated as integers. */
import type { DailyPoint, NetworkContext, SeatEvent } from './context.ts';
import type { AtRiskSeat, RecentCut, Watchlist } from './watchlist.ts';

const AMZ = '437, 489, 490, 491, 492';
const id = (v: string) => {
  if (!/^\d{1,9}$/.test(v)) throw new Error('Invalid network id');
  return v;
};

export const sqlConnections = (networkId: string) => `WITH latest AS (
  SELECT partner_id, status, key_account_manager_email, tech_ops_engineer_email, supply_business_unit, network_name,
         ROW_NUMBER() OVER (PARTITION BY partner_id ORDER BY date_utc DESC, IFF(status = 'Connected', 1, 0) DESC) AS rn
  FROM ANALYTICS_EXPO.DATA_ESSENTIALS.DSP_NETWORK_CONNECTION_HISTORY
  WHERE network_id = ${id(networkId)}
)
SELECT COUNT_IF(status = 'Connected') AS connected, COUNT_IF(status = 'Disconnected') AS disconnected, COUNT(*) AS partners,
       ANY_VALUE(network_name) AS network_name, ANY_VALUE(key_account_manager_email) AS kam,
       ANY_VALUE(tech_ops_engineer_email) AS techops, ANY_VALUE(supply_business_unit) AS bu
FROM latest WHERE rn = 1`;

export const sqlEvents = (networkId: string) => `WITH a AS (
  SELECT partner_id, partner_name, datedisconnection, datereconnection, revenue_7_days_before, demand_ops
  FROM ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS
  WHERE network_id = ${id(networkId)} AND datedisconnection >= DATEADD(day, -60, CURRENT_DATE())
), s AS (
  SELECT partner_id, start_date, blocking_reason, comment, lastupdatedby
  FROM ANALYTICS_DATA_HUB.EQT_SSP_MAPPING.MAPPING_NETWORK_PARTNER_CONNECTION_SCD
  WHERE network_id = ${id(networkId)} AND start_date >= DATEADD(day, -61, CURRENT_DATE())
)
SELECT a.partner_id, a.partner_name, TO_VARCHAR(a.datedisconnection, 'YYYY-MM-DD HH24:MI') AS cut_at,
       IFF(a.datereconnection >= '2099-01-01', NULL, TO_VARCHAR(a.datereconnection, 'YYYY-MM-DD')) AS reconnected_at,
       a.revenue_7_days_before, s.blocking_reason, REPLACE(s.comment, '\\n', ' · ') AS comment, s.lastupdatedby, a.demand_ops
FROM a LEFT JOIN s ON s.partner_id = a.partner_id AND ABS(DATEDIFF(minute, s.start_date, a.datedisconnection)) <= 5
QUALIFY ROW_NUMBER() OVER (PARTITION BY a.partner_id, a.datedisconnection ORDER BY s.start_date DESC) = 1
ORDER BY a.datedisconnection DESC`;

export const sqlDaily = (networkId: string) => `SELECT TO_VARCHAR(day, 'YYYY-MM-DD') AS d,
       SUM(IFF(partner_id IN (${AMZ}), bid_requests, 0)) AS amazon_br,
       SUM(IFF(partner_id IN (${AMZ}), total_paid_price_true_count, 0)) AS amazon_spend,
       SUM(total_paid_price_true_count) AS network_spend
FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES
WHERE network_id = ${id(networkId)} AND day >= DATEADD(day, -45, CURRENT_DATE())
GROUP BY 1 ORDER BY 1`;

export const SQL_RECENT_AMAZON_CUTS = `WITH cuts AS (
  SELECT network_id, network_name, partner_id, datedisconnection, revenue_7_days_before
  FROM ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS
  WHERE partner_id IN (${AMZ}) AND datedisconnection >= DATEADD(day, -60, CURRENT_DATE()) AND datereconnection >= '2099-01-01'
), scd AS (
  SELECT network_id, partner_id, start_date, blocking_reason, comment, lastupdatedby
  FROM ANALYTICS_DATA_HUB.EQT_SSP_MAPPING.MAPPING_NETWORK_PARTNER_CONNECTION_SCD
  WHERE partner_id IN (${AMZ}) AND start_date >= DATEADD(day, -61, CURRENT_DATE()) AND blocking_reason <> 0
)
SELECT TO_VARCHAR(c.network_id) AS network_id, c.network_name, COUNT(*) AS seats,
       LISTAGG(DISTINCT c.partner_id, ', ') WITHIN GROUP (ORDER BY c.partner_id) AS partners,
       TO_VARCHAR(MIN(c.datedisconnection), 'YYYY-MM-DD HH24:MI') AS cut_at, SUM(c.revenue_7_days_before) AS rev7,
       ANY_VALUE(s.blocking_reason) AS reason_code, ANY_VALUE(REPLACE(s.comment, '\\n', ' · ')) AS comment, ANY_VALUE(s.lastupdatedby) AS updated_by
FROM cuts c LEFT JOIN scd s ON s.network_id = c.network_id AND s.partner_id = c.partner_id AND ABS(DATEDIFF(minute, s.start_date, c.datedisconnection)) <= 5
GROUP BY 1, 2 ORDER BY rev7 DESC NULLS LAST, cut_at DESC LIMIT 40`;

export const SQL_AT_RISK = `WITH last AS (SELECT MAX(day) AS d FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES WHERE partner_id = 437),
act AS (
  SELECT network_id, partner_id, SUM(bid_requests) AS br, SUM(total_paid_price_true_count) AS spend
  FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES, last
  WHERE partner_id IN (${AMZ}) AND day > DATEADD(day, -7, last.d) AND day <= last.d
  GROUP BY 1, 2
), conn AS (
  SELECT DISTINCT network_id, partner_id, network_name, partner_name
  FROM ANALYTICS_EXPO.DATA_ESSENTIALS.DSP_NETWORK_CONNECTION_HISTORY
  WHERE partner_id IN (${AMZ}) AND status = 'Connected'
)
SELECT TO_VARCHAR((SELECT d FROM last), 'YYYY-MM-DD') AS last_day, TO_VARCHAR(a.network_id) AS network_id, c.network_name,
       a.partner_id, c.partner_name, a.br, a.spend, a.spend / NULLIF(a.br, 0) * 1000000 AS rpmbr
FROM act a JOIN conn c ON c.network_id = a.network_id AND c.partner_id = a.partner_id
WHERE a.br >= 50000000 AND a.spend / NULLIF(a.br, 0) * 1000000 < 0.10
ORDER BY a.br DESC LIMIT 40`;

type Row = Record<string, string | null>;
const n = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));

export function toContext(base: NetworkContext, conn: Row[], events: Row[], daily: Row[], asOf: string): NetworkContext {
  const c = conn[0] ?? {};
  const evs: SeatEvent[] = events.map(r => ({
    partnerId: Number(r.PARTNER_ID),
    partnerName: r.PARTNER_NAME ?? '',
    cutAt: r.CUT_AT ?? '',
    reconnectedAt: r.RECONNECTED_AT ?? null,
    revenue7d: n(r.REVENUE_7_DAYS_BEFORE),
    reasonCode: n(r.BLOCKING_REASON),
    comment: r.COMMENT ?? null,
    updatedBy: r.LASTUPDATEDBY ?? null,
  }));
  const relatedByDay = new Map(base.daily.map(d => [d.day, d]));
  const days: DailyPoint[] = daily.map(r => ({
    day: r.D ?? '',
    amazonBidRequests: n(r.AMAZON_BR),
    amazonSpend: n(r.AMAZON_SPEND),
    networkSpend: n(r.NETWORK_SPEND),
    relatedNetworkSpend: relatedByDay.get(r.D ?? '')?.relatedNetworkSpend ?? null,
    relatedAmazonSpend: relatedByDay.get(r.D ?? '')?.relatedAmazonSpend ?? null,
  }));
  return {
    ...base,
    networkName: c.NETWORK_NAME ?? base.networkName,
    asOf,
    source: 'live',
    owners: { kam: c.KAM ?? base.owners.kam, techOps: c.TECHOPS ?? base.owners.techOps, demandOps: events[0]?.DEMAND_OPS ?? base.owners.demandOps, businessUnit: c.BU ?? base.owners.businessUnit },
    connections: { connected: Number(c.CONNECTED ?? 0), disconnected: Number(c.DISCONNECTED ?? 0), partners: Number(c.PARTNERS ?? 0) },
    events: evs,
    daily: days.length ? days : base.daily,
  };
}

export function toWatchlist(cuts: Row[], atRisk: Row[], asOf: string): Watchlist {
  return {
    asOf,
    source: 'live',
    lastActivityDay: atRisk[0]?.LAST_DAY ?? '',
    cuts: cuts.map(
      (r): RecentCut => ({
        networkId: r.NETWORK_ID ?? '',
        networkName: r.NETWORK_NAME ?? '',
        seats: Number(r.SEATS ?? 0),
        partners: r.PARTNERS ?? '',
        cutAt: r.CUT_AT ?? '',
        revenue7d: n(r.REV7) ?? 0,
        reasonCode: n(r.REASON_CODE),
        comment: r.COMMENT ?? null,
        updatedBy: r.UPDATED_BY ?? null,
      }),
    ),
    atRisk: atRisk.map(
      (r): AtRiskSeat => ({
        networkId: r.NETWORK_ID ?? '',
        networkName: r.NETWORK_NAME ?? '',
        partnerId: Number(r.PARTNER_ID),
        partnerName: r.PARTNER_NAME ?? '',
        bidRequests7d: n(r.BR) ?? 0,
        spend7d: n(r.SPEND) ?? 0,
        rpmbr7d: n(r.RPMBR) ?? 0,
      }),
    ),
  };
}
