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
