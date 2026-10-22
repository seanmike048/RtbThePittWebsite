/** Amazon DSP watchlist: networks cut recently, and connected seats showing the signals behind past cuts. Snowflake, 2026-10-20. */

export interface RecentCut {
  networkId: string;
  networkName: string;
  seats: number;
  partners: string;
  cutAt: string;
  revenue7d: number;
  reasonCode: number | null;
  comment: string | null;
  updatedBy: string | null;
}

export interface AtRiskSeat {
  networkId: string;
  networkName: string;
  partnerId: number;
  partnerName: string;
  bidRequests7d: number;
  spend7d: number;
  rpmbr7d: number;
}

export interface Watchlist {
  asOf: string;
  lastActivityDay: string;
  source: 'snapshot' | 'live';
  cuts: RecentCut[];
  atRisk: AtRiskSeat[];
}

const c = (
  networkId: string,
  networkName: string,
  seats: number,
  partners: string,
  cutAt: string,
  revenue7d: number,
  reasonCode: number | null,
  comment: string | null,
  updatedBy: string | null,
): RecentCut => ({ networkId, networkName, seats, partners, cutAt, revenue7d, reasonCode, comment, updatedBy });

/** Networks with "STR" as a separate word are being sunset and are left out (same rule as the n8n main workflow's M2/M4). */
export const isSunset = (name: string) => /(^|\s)STR(\s|$)/.test(name);

/** Tubi networks left out of the site on request (21 Oct 2026): #5524 and the retired #5100 case. */
export const EXCLUDED_NETWORKS = new Set(['5100', '5524']);

export const WATCHLIST_SNAPSHOT: Watchlist = {
  asOf: '2026-10-21',
  lastActivityDay: '2026-10-19',
  source: 'snapshot',
  cuts: [
    // The 20 Oct TOPS-11471 wave, from The Pitt run of 21 Oct 2026 (4:55 PM): weekly spend per network over the seats with a
    // recorded spend; no reason code or comment is stated in the run.
    c('5412', 'Display.io', 3, '437, 489, 491', '2026-10-20 11:44', 3114, null, null, null),
    c('5449', 'E-Planning LATAM', 1, '437', '2026-10-20 11:38', 2309, null, null, null),
    c('4883', 'Vidazoo Intermediary', 1, '491', '2026-10-20 11:44', 1579, null, null, null),
    c('3600', 'VIX Latam', 1, '492', '2026-09-01 18:06', 2328.693409, 3, 'No spend', 'diartsev@equativ.com'),
    c('5530', 'Markapp Media', 1, '492', '2026-09-01 17:10', 20.577272, 3, 'No spend', 'diartsev@equativ.com'),
    c('4164', 'playstream.media', 1, '492', '2026-09-01 17:39', 9.309915, 3, 'No spend', 'diartsev@equativ.com'),
    c('4311', 'LG Ads Solutions', 1, '492', '2026-09-01 17:10', 7.349473, 3, 'No spend', 'diartsev@equativ.com'),
    c('4942', 'Anoki', 1, '492', '2026-09-01 17:10', 4.503265, 3, 'No spend', 'diartsev@equativ.com'),
    c('5874', 'Cinepulse', 1, '492', '2026-09-01 17:10', 1.978456, 3, 'No spend', 'diartsev@equativ.com'),
    c('4443', 'Column6RTB', 5, '437, 489, 490, 491, 492', '2026-09-01 17:10', 1.416874, 3, 'No spend', 'diartsev@equativ.com'),
    c('5877', 'Indicue', 1, '492', '2026-09-01 17:10', 1.304919, 3, 'No spend', 'diartsev@equativ.com'),
    c('4408', 'BalloonLabsApps', 1, '492', '2026-09-01 17:10', 0.956314, 3, 'No spend', 'diartsev@equativ.com'),
    c('6005', 'Pokkt', 1, '492', '2026-09-01 17:10', 0.717328, 3, 'No spend', 'diartsev@equativ.com'),
    c('4063', 'Mumsnet Limited', 1, '489', '2026-08-31 21:16', 0.217783, 4, 'IVT · TOPS-7705', 'diartsev@equativ.com'),
    c('3855', 'Guardian News & Media Limited', 2, '489, 491', '2026-08-31 21:16', 0.083582, 4, 'IVT · TOPS-7705', 'diartsev@equativ.com'),
    c('1331', 'Azerion Technology B.V. (PubGalaxy)', 5, '437, 489, 490, 491, 492', '2026-08-31 21:08', 0.012553, 4, 'Partner block request', 'diartsev@equativ.com'),
  ],
  atRisk: [
    { networkId: '6049', networkName: 'Outdoor America', partnerId: 492, partnerName: 'Amazon DSP CTV B', bidRequests7d: 339520720, spend7d: 21.726653, rpmbr7d: 0.063992 },
    { networkId: '4568', networkName: 'Bigo Indirect', partnerId: 491, partnerName: 'Amazon DSP Video B', bidRequests7d: 259376000, spend7d: 0, rpmbr7d: 0 },
    { networkId: '4575', networkName: 'Mediafuse', partnerId: 492, partnerName: 'Amazon DSP CTV B', bidRequests7d: 155970745, spend7d: 12.321356, rpmbr7d: 0.078998 },
  ],
};

/** Signals observed in the connection log comments for past cuts; used as the at-risk rule, not an official policy. */
export const AT_RISK_RULE = 'Connected Amazon seat with ≥ 50M bid requests in the last 7 days and RPMBr under 0.10 (the “Under $0.10 RPMBR” / “$0 RPMBR” cuts in the log).';
