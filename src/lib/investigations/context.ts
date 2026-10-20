/** Snowflake context around a disconnected network: seat events with Equativ's logged reason, owners, daily traffic. */

export interface SeatEvent {
  partnerId: number;
  partnerName: string;
  cutAt: string;
  reconnectedAt: string | null;
  revenue7d: number | null;
  /** MAPPING_NETWORK_PARTNER_CONNECTION_SCD.BLOCKING_REASON; meaning of codes is not documented. */
  reasonCode: number | null;
  comment: string | null;
  updatedBy: string | null;
}

export interface DailyPoint {
  day: string;
  amazonBidRequests: number | null;
  amazonSpend: number | null;
  networkSpend: number | null;
  relatedNetworkSpend: number | null;
  relatedAmazonSpend: number | null;
}

export interface RelatedNetwork {
  networkId: string;
  name: string;
  amazonSeatsConnected: number;
  note: string;
  riskSeat: { partnerName: string; bidRequests7d: number; spend7d: number; rpmbr7d: number } | null;
}

export interface NetworkContext {
  networkId: string;
  networkName: string;
  asOf: string;
  source: 'snapshot' | 'live';
  owners: { kam: string | null; techOps: string | null; demandOps: string | null; businessUnit: string | null };
  connections: { connected: number; disconnected: number; partners: number };
  events: SeatEvent[];
  daily: DailyPoint[];
  related: RelatedNetwork[];
}

export const AMAZON_PARTNERS = [437, 489, 490, 491, 492];
export const isAmazon = (id: number) => AMAZON_PARTNERS.includes(id);

/** Codes as observed with their comments in the connection log (2026); not an official legend. */
export const REASON_CODE_SEEN: Record<number, string> = {
  0: 'Connected / reconnection',
  1: 'Manual block (e.g. “Reauct”, “Reauct phase out”)',
  2: 'Low RPMBr (e.g. “Under $0.10 RPMBR”, “$0 RPMBR”)',
  3: 'Optimization (e.g. “No spend”, “Zero bid networks”, RPMA)',
  4: 'Quality / agreement (e.g. “IVT”, “Partner block request”)',
  5: 'High CTR',
};
