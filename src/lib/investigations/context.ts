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

/**
 * MAPPING_NETWORK_PARTNER_CONNECTION_SCD.BLOCKING_REASON, as documented in the column comment
 * (read 2026-10-21, query 01c7de54-020c-f8bc-0000-08896b3302fe). The free-text COMMENT carries the detail.
 */
export const REASON_CODE_SEEN: Record<number, string> = {
  0: 'Connected',
  1: 'Other',
  2: 'LowProfitabilityBidder',
  3: 'LowProfitabilityEquativ',
  4: 'QualityIssueBidder',
  5: 'QualityIssuePublisher',
  6: 'DirectIntegrationBidder',
};
