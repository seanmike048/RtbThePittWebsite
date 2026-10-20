/**
 * Live refresh through the viewer's claude.ai connectors (artifact `mcp` capability):
 * Snowflake for Amazon DSP connection history on partner 437, Google Drive for the workbook.
 * Everything here is read-only.
 */

export const SNOWFLAKE_SERVER = 'Snowflake role data analyst';
export const SNOWFLAKE_TOOL = 'sql_exec_tool';
export const DRIVE_SERVER = 'Google Drive';
export const DRIVE_DOWNLOAD_TOOL = 'download_file_content';
export const DRIVE_METADATA_TOOL = 'get_file_metadata';

export const WORKBOOK_FILE_ID = '1vjeIWfm0go39Q8i9ymRln40cjzgh1CrOpkLL_vIKoD0';
export const WORKBOOK_SHEET = '437 (Americas Display)';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

export const SQL_CONNECTION_SUMMARY = `SELECT status, COUNT(DISTINCT network_id) AS networks, MAX(date_disconnection) AS latest_cut
FROM ANALYTICS_EXPO.DATA_ESSENTIALS.DSP_NETWORK_CONNECTION_HISTORY
WHERE partner_id = 437
GROUP BY status`;

export const SQL_DISCONNECTED_NETWORKS = `SELECT network_id, network_name, date_disconnection, supply_business_unit
FROM ANALYTICS_EXPO.DATA_ESSENTIALS.DSP_NETWORK_CONNECTION_HISTORY
WHERE partner_id = 437 AND status = 'Disconnected'
ORDER BY date_disconnection DESC NULLS LAST`;

export interface DisconnectedNetwork {
  networkId: string;
  networkName: string;
  cutAt: string | null;
  businessUnit: string;
}

export interface ConnectionState {
  connected: number;
  disconnected: number;
  latestCut: string | null;
  networks: DisconnectedNetwork[];
  asOf: string;
  source: 'snapshot' | 'live';
}

/** Snowflake sql_exec_tool payload: {result_set: {data: string[][], resultSetMetaData: {rowType: [{name}]}}}. */
export function snowflakeRows(payload: unknown): Record<string, string | null>[] {
  const rs = (payload as { result_set?: { data?: unknown[][]; resultSetMetaData?: { rowType?: { name: string }[] } } })?.result_set;
  const names = rs?.resultSetMetaData?.rowType?.map(c => c.name.toUpperCase());
  if (!rs || !Array.isArray(rs.data) || !names) throw new Error('Unexpected Snowflake result shape');
  return rs.data.map(row => Object.fromEntries(names.map((n, i) => [n, row[i] === null || row[i] === undefined ? null : String(row[i])])));
}

export function toConnectionState(summary: Record<string, string | null>[], list: Record<string, string | null>[], asOf: string): ConnectionState {
  const by = (status: string) => summary.find(r => (r.STATUS ?? '').toLowerCase() === status);
  return {
    connected: Number(by('connected')?.NETWORKS ?? 0),
    disconnected: Number(by('disconnected')?.NETWORKS ?? 0),
    latestCut: by('disconnected')?.LATEST_CUT?.slice(0, 16) ?? null,
    networks: list.map(r => ({
      networkId: (r.NETWORK_ID ?? '').trim(),
      networkName: (r.NETWORK_NAME ?? '').trim(),
      cutAt: r.DATE_DISCONNECTION ? r.DATE_DISCONNECTION.slice(0, 16) : null,
      businessUnit: r.SUPPLY_BUSINESS_UNIT ?? '',
    })),
    asOf,
    source: 'live',
  };
}

/** Drive download payload: {content: base64, mimeType, title}. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type SourceStatus =
  | { state: 'idle' }
  | { state: 'loading'; step: string }
  | { state: 'ok'; at: string; note?: string }
  | { state: 'error'; code: string; message: string };

/** Viewer-facing copy for each connector error code, per the mcp failure design. */
export function errorCopy(code: string, server: string): string {
  switch (code) {
    case 'needs_reauth':
      return `Reconnect ${server} in claude.ai Settings → Connectors, then refresh.`;
    case 'server_not_connected':
    case 'server_not_found':
      return `Add the ${server} connector in claude.ai Settings → Connectors to refresh this source.`;
    case 'selection_required':
      return `Choose which ${server} connector this page should use when claude.ai asks, then refresh.`;
    case 'not_in_manifest':
    case 'approval_required':
    case 'consent_required':
      return `${server} is not allowed for this page. Allow it from the artifact's Permissions menu, then refresh.`;
    case 'blocked_by_policy':
      return `Your organization's policy blocks ${server} for this page.`;
    case 'server_unavailable':
    case 'rate_limited':
      return `${server} did not answer in time. Try again in a moment.`;
    case 'not_granted':
    case 'capability_disabled':
    case 'capability_removed':
    case 'unavailable':
      return 'Live refresh is not available in this view. Open the page in claude.ai to refresh.';
    case 'tool_error':
      return `${server} reported an error running the request.`;
    case 'parse_error':
      return `${server} answered, but the data was not in the expected shape.`;
    default:
      return `${server} could not be reached.`;
  }
}

/** Snapshot of the Snowflake read taken on 2026-10-20 (embedded so the page renders without a connector). */
export const CONNECTION_SNAPSHOT: ConnectionState = {
  connected: 2174,
  disconnected: 104,
  latestCut: '2026-10-01 08:28',
  asOf: '2026-10-20',
  source: 'snapshot',
  networks: [
    ['5339', 'Raptive STR', '2026-10-01 08:28', 'US'],
    ['5100', 'Tubi TV STR', '2026-09-25 08:11', 'US'],
    ['4443', 'Column6RTB', '2026-09-14 11:53', 'US'],
    ['5550', 'diDNA', '2026-09-03 08:35', 'US'],
    ['4438', 'Coingecko', '2026-08-31 21:25', 'APAC'],
    ['4478', 'Krush Media', '2026-08-31 21:19', 'US'],
    ['5683', 'Quebecor', '2026-08-31 21:16', 'US'],
    ['4625', 'LoopMe Inc', '2026-08-31 21:09', 'UK'],
    ['3653', 'Azerion Technology B.V. (Headerlift)', '2026-08-31 21:08', 'ES'],
    ['1331', 'Azerion Technology B.V. (PubGalaxy)', '2026-08-31 21:08', 'CEE'],
    ['3232', 'InMobi', '2026-08-31 21:07', 'US'],
    ['5046', 'Adplay Azerion', '2026-08-31 21:07', 'FR'],
    ['4721', 'Smoot', '2026-04-16 21:33', 'LATAM'],
    ['4512', 'Cumhuriyet', '2026-04-15 15:46', 'ES'],
    ['4575', 'Mediafuse', '2026-04-15 15:46', 'US'],
    ['5397', 'Kuantyx Media', '2026-04-15 15:46', 'IT'],
    ['4872', 'cpmstar', '2026-04-15 15:46', 'US'],
    ['5536', 'Fandom B - US - Supply - 5536', '2026-04-15 15:46', 'US'],
    ['5294', 'Unity STR', '2026-04-15 15:46', 'US'],
    ['5001', 'Sony', '2026-04-15 15:21', 'US'],
    ['5854', 'Magnite DV+', '2026-04-15 15:16', 'US'],
  ].map(([networkId, networkName, cutAt, businessUnit]) => ({ networkId, networkName, cutAt, businessUnit })),
};

/** The snapshot lists the 21 most recent cuts; the other 83 were cut on 2025-11-25 21:32 and arrive with a live refresh. */
export const SNAPSHOT_OLDER_CUTS = { count: 83, cutAt: '2025-11-25 21:32' };

/* ---------------- Endpoint-437 publisher data, straight from Snowflake ---------------- */

/** Source of the workbook: monthly SCO-node activity per partner and network. Verified 2026-10-20 to reproduce the
 * workbook exactly (861 networks, 201,042,845,839 bid requests, 7,228,721.113683 spend for September 2026). */
export const PUBLISHER_SOURCE = 'ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.MONTH_SCO_NODES';
export const SELLER_TYPE_SOURCE = "ANALYTICS.PUBLIC.VIEW_SELLERS_JSON_NODES (parent_domain = 'smartadserver.com', latest per seller_id)";
export const ALERT_SOURCE = 'ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS';

const SELLER_TYPES_CTE = `st AS (
  SELECT seller_id, seller_type, name
  FROM ANALYTICS.PUBLIC.VIEW_SELLERS_JSON_NODES
  WHERE parent_domain = 'smartadserver.com'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY seller_id ORDER BY last_modification_date DESC) = 1
)`;

/** Month must be YYYY-MM; anything else is rejected before it reaches SQL. */
export function sqlPublisherRows(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month');
  return `WITH ${SELLER_TYPES_CTE}, pub AS (
  SELECT network_id, SUM(bid_requests) AS bid_requests, SUM(total_paid_price_true_count) AS spend
  FROM ${PUBLISHER_SOURCE}
  WHERE partner_id = 437 AND month = '${month}-01'
  GROUP BY 1
)
SELECT TO_VARCHAR(p.network_id) AS publisher_id, COALESCE(st.name, '') AS publisher_name,
       COALESCE(st.seller_type, '') AS seller_type, p.bid_requests, p.spend
FROM pub p LEFT JOIN st ON st.seller_id = TO_VARCHAR(p.network_id)
ORDER BY p.spend DESC NULLS LAST`;
}

export const SQL_MONTHLY_TREND = `WITH ${SELLER_TYPES_CTE}, m AS (
  SELECT month, network_id, SUM(bid_requests) AS br, SUM(total_paid_price_true_count) AS spend
  FROM ${PUBLISHER_SOURCE}
  WHERE partner_id = 437 AND month >= DATEADD(month, -12, DATE_TRUNC(month, CURRENT_DATE()))
  GROUP BY 1, 2
)
SELECT TO_VARCHAR(m.month, 'YYYY-MM') AS month, COUNT(*) AS networks, SUM(br) AS bid_requests, SUM(spend) AS spend,
  COUNT_IF(st.seller_type IN ('BOTH', 'INTERMEDIARY')) AS visible_networks,
  SUM(IFF(st.seller_type IN ('BOTH', 'INTERMEDIARY'), br, 0)) AS visible_bid_requests,
  SUM(IFF(st.seller_type IN ('BOTH', 'INTERMEDIARY'), spend, 0)) AS visible_spend
FROM m LEFT JOIN st ON st.seller_id = TO_VARCHAR(m.network_id)
GROUP BY 1 ORDER BY 1`;

/** Still-cut alerts on partner 437. The view marks "not reconnected" with reconnection date 2099-12-31. */
export const SQL_OPEN_ALERTS = `SELECT TO_VARCHAR(network_id) AS network_id, network_name,
  TO_VARCHAR(datedisconnection, 'YYYY-MM-DD HH24:MI') AS cut_at, revenue_7_days_before, business_unit
FROM ${ALERT_SOURCE}
WHERE partner_id = 437 AND datereconnection >= '2099-01-01'
ORDER BY revenue_7_days_before DESC NULLS LAST, datedisconnection DESC`;

export interface TrendPoint {
  month: string;
  networks: number;
  bidRequests: number;
  spend: number;
  visibleNetworks: number;
  visibleBidRequests: number;
  visibleSpend: number;
}

export interface OpenAlert {
  networkId: string;
  networkName: string;
  cutAt: string;
  revenue7d: number | null;
  businessUnit: string;
}

export interface AlertState {
  alerts: OpenAlert[];
  asOf: string;
  source: 'snapshot' | 'live';
  /** Snapshot only lists the alerts with revenue plus the most recent; totals cover all of them. */
  total: number;
  revenue7dTotal: number;
}

const num = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? 0 : Number(v));

export function toPublisherRows(rows: Record<string, string | null>[]): import('./publishers.ts').PublisherRow[] {
  return rows.map(r => {
    const bids = num(r.BID_REQUESTS);
    const spend = num(r.SPEND);
    return {
      publisherId: (r.PUBLISHER_ID ?? '').trim(),
      publisherName: (r.PUBLISHER_NAME ?? '').trim(),
      sellerType: (r.SELLER_TYPE ?? '').trim(),
      bidRequests: bids,
      spend,
      rpmbr: bids > 0 ? (spend / bids) * 1_000_000 : 0,
      inScope: null,
      resellerPct: null,
      sheetDisconnectedOn: null,
    };
  });
}

export const toTrend = (rows: Record<string, string | null>[]): TrendPoint[] =>
  rows.map(r => ({
    month: r.MONTH ?? '',
    networks: num(r.NETWORKS),
    bidRequests: num(r.BID_REQUESTS),
    spend: num(r.SPEND),
    visibleNetworks: num(r.VISIBLE_NETWORKS),
    visibleBidRequests: num(r.VISIBLE_BID_REQUESTS),
    visibleSpend: num(r.VISIBLE_SPEND),
  }));

export const toAlerts = (rows: Record<string, string | null>[], asOf: string): AlertState => {
  const alerts = rows.map(r => ({
    networkId: r.NETWORK_ID ?? '',
    networkName: (r.NETWORK_NAME ?? '').trim(),
    cutAt: r.CUT_AT ?? '',
    revenue7d: r.REVENUE_7_DAYS_BEFORE === null ? null : num(r.REVENUE_7_DAYS_BEFORE),
    businessUnit: r.BUSINESS_UNIT ?? '',
  }));
  return { alerts, asOf, source: 'live', total: alerts.length, revenue7dTotal: alerts.reduce((s, a) => s + (a.revenue7d ?? 0), 0) };
};

/** Snowflake read of 2026-10-20 (visible counts use the current sellers.json seller types for every month). */
export const TREND_SNAPSHOT: TrendPoint[] = (
  [
    ['2025-10', 2, 5525822, 10.333351, 0, 0, 0],
    ['2025-11', 33, 69144325, 5.324924, 26, 67581800, 0],
    ['2025-12', 7, 494380105, 5307.746179, 2, 17097000, 0],
    ['2026-01', 37, 11784389391, 203873.321902, 1, 100081994, 1428.769129],
    ['2026-02', 72, 17630632082, 194901.108447, 22, 3742624025, 62216.477509],
    ['2026-03', 297, 18638765258, 584932.44734, 113, 12147975812, 500059.461737],
    ['2026-04', 623, 135439308439, 5382132.676755, 223, 125890615919, 5096474.550926],
    ['2026-05', 626, 148237403179, 5734157.440916, 221, 142170508431, 5444017.462433],
    ['2026-06', 710, 168976419899, 6418519.316327, 255, 161862589507, 6103182.004785],
    ['2026-07', 722, 196986857896, 5183318.419865, 266, 192318082274, 5076783.935834],
    ['2026-08', 840, 182543237308, 4130987.843534, 309, 179778235509, 4078146.289142],
    ['2026-09', 861, 201042845839, 7228721.113683, 317, 198617854478, 7141421.720178],
  ] as const
).map(([month, networks, bidRequests, spend, visibleNetworks, visibleBidRequests, visibleSpend]) => ({
  month,
  networks,
  bidRequests,
  spend,
  visibleNetworks,
  visibleBidRequests,
  visibleSpend,
}));

export const ALERT_SNAPSHOT: AlertState = {
  asOf: '2026-10-20',
  source: 'snapshot',
  total: 121,
  revenue7dTotal: 470.60102,
  alerts: (
    [
      ['5339', 'Raptive STR', '2026-10-01 08:28', 465.604722, 'US'],
      ['5397', 'Kuantyx Media', '2026-04-15 15:46', 3.960064, 'IT'],
      ['4512', 'Cumhuriyet', '2026-04-15 15:46', 0.543468, 'ES'],
      ['4721', 'Smoot', '2026-04-16 21:33', 0.326779, 'LATAM'],
      ['4872', 'cpmstar', '2026-04-15 15:46', 0.157023, 'US'],
      ['1331', 'Azerion Technology B.V. (PubGalaxy)', '2026-08-31 21:08', 0.008964, 'CEE'],
      ['5100', 'Tubi TV STR', '2026-09-25 08:11', 0, 'US'],
      ['4443', 'Column6RTB', '2026-09-14 11:53', 0, 'US'],
      ['5550', 'diDNA', '2026-09-03 08:35', 0, 'US'],
    ] as const
  ).map(([networkId, networkName, cutAt, revenue7d, businessUnit]) => ({ networkId, networkName, cutAt, revenue7d, businessUnit })),
};

export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
