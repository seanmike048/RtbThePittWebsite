/**
 * Approved investigation from The Pitt workflow for Tubi TV STR (#5100), kept verbatim, plus the
 * Snowflake context read on 2026-10-20 (ANALYTICS_EXPO / ANALYTICS / ANALYTICS_DATA_HUB). Refresh replaces the context live.
 */
import type { DailyPoint, NetworkContext, SeatEvent } from './context.ts';

export const TUBI_REPORT_TEXT = `THE PITT | APPROVED INVESTIGATION
Tubi TV STR | Network #5100 | Amazon DSP
Disconnected: 2026-09-25 | Priority: HIGHEST

EXECUTIVE SUMMARY
• Revenue in the 7 days before disconnection: 16,037 (currency unverified; not confirmed lost revenue)
• Quality checks: ads_txt: PASS | sco: PASS | blocked_inventory: PASS | ivt: PASS
• Evidence confidence: MEDIUM
• Root-cause confidence: low
• Exact disconnection reason: NOT CONFIRMED

LEADING HYPOTHESIS — NOT A CONFIRMED CAUSE
Commercial or seat-level DSP cut

RECOMMENDED INTERNAL ACTIONS

TechOps → msteitieh@equativ.com
On 2026-09-25 at 08:11, Amazon DSP disconnected 5 seats for Tubi TV STR. Pre-cut, 75.68% of calls were filtered by BlockedByPartnerSetupIncompatibleInventory. Quality checks passed. Please verify SSP partner setup rules to clarify if inventory formats match DSP seat specs. Confidence: low.

Partnerships → Partnerships team (assign manually)
5 Amazon DSP seats for Tubi TV STR disconnected 2026-09-25 at 08:11. Amazon bid requests fell 99.5% with no SSP quality failures. Please contact Amazon DSP for official disconnection reason or commercial status. Confidence: low.

Publisher KAM → sreiter@equativ.com
Post-disconnection, 19.66% of auctions had uncrawled ads.txt files. Please review ads.txt crawl accessibility with the publisher technical contact. This could be unrelated to the seat disconnection.

PUBLISHER COMMUNICATION — DRAFT ONLY, NOT SENT
For sreiter@equativ.com to review:We observed that Amazon DSP disconnected 5 partner seats for Tubi TV STR on 2026-09-25 at 08:11. Our quality checks remain normal. Please share any recent configuration changes or direct communications from Amazon DSP regarding these seats.

Human approval completed. No external publisher message was sent.`;

const ev = (
  partnerId: number,
  partnerName: string,
  cutAt: string,
  reconnectedAt: string | null,
  revenue7d: number | null,
  reasonCode: number | null,
  comment: string | null,
  updatedBy: string | null,
): SeatEvent => ({ partnerId, partnerName, cutAt, reconnectedAt, revenue7d, reasonCode, comment, updatedBy });

const EVENTS: SeatEvent[] = [
  ev(492, 'Amazon DSP CTV B', '2026-09-25 08:11', null, 11267.006179, 1, 'Reauct phase out', 'aglaizal@equativ.com'),
  ev(491, 'Amazon DSP Video B', '2026-09-25 08:11', null, 4770.186127, 1, 'Reauct phase out', 'aglaizal@equativ.com'),
  ev(437, 'Amazon DSP AMER Display B', '2026-09-25 08:11', null, 0, 1, 'Reauct phase out', 'aglaizal@equativ.com'),
  ev(489, 'Amazon DSP EMEA/APAC Display B', '2026-09-25 08:11', null, 0, 1, 'Reauct phase out', 'aglaizal@equativ.com'),
  ev(490, 'Amazon DSP Native B', '2026-09-25 08:11', null, 0, 1, 'Reauct phase out', 'aglaizal@equativ.com'),
  ev(554, 'Pubmatic Video B', '2026-09-24 14:08', null, 0, 2, 'Under $0.10 RPMBR', 'apiattelli@equativ.com'),
  ev(553, 'Magnite Native B', '2026-09-24 16:59', '2026-10-07', 0, 1, null, 'apiattelli@equativ.com'),
  ev(494, 'The Trade Desk CTV B', '2026-09-25 12:03', null, 6122.630658, 1, 'Reauct', 'apiattelli@equativ.com'),
  ev(428, 'The Trade Desk CTV', '2026-09-25 12:04', null, 4188.239723, 1, 'Reauct', 'apiattelli@equativ.com'),
  ev(468, 'Adobe Video B', '2026-10-01 16:43', null, 8693.872508, 1, 'Reauct', 'apiattelli@equativ.com'),
  ev(429, 'Google DV360 B', '2026-10-01 16:43', null, 2786.526233, 1, 'Reauct', 'apiattelli@equativ.com'),
  ev(430, 'Beeswax B', '2026-10-01 16:44', null, 391.579501, 1, 'Reauct', 'apiattelli@equativ.com'),
  ev(84, 'LoopMe', '2026-10-02 08:44', null, 0.010376, 3, 'TOPS-10888', 'rroma@equativ.com'),
  ev(443, 'Smaato B', '2026-10-05 22:07', null, 0, 2, '$0 RPMBR', 'apiattelli@equativ.com'),
  ev(500, 'The Trade Desk (Non-CTV) USA B', '2026-10-09 16:17', null, 0.262866, 1, 'Reauct', 'apiattelli@equativ.com'),
  ev(481, 'Crimtan', '2026-10-13 06:16', null, 0, 3, 'Disconnected no bid networks · TOPS-11003', 'jstolarz@equativ.com'),
  ev(342, 'Beeswax', '2026-10-14 07:15', null, 1.866729, 3, 'rpma optimization to hit goals · TOPS-11348', 'jstolarz@equativ.com'),
  ev(394, 'Demandbase', '2026-10-15 08:07', null, 0, 3, 'Zero Bid Networks · TOPS-11004', 'tdelalande@equativ.com'),
  ev(464, 'Quantcast B', '2026-09-11 16:43', '2026-10-08', 0.087231, 0, 'automated reconnection proposal · TOPS-11140', 'jstolarz@equativ.com'),
  ev(466, 'Bidswitch B', '2026-09-11 13:56', '2026-10-08', 0.324302, 0, 'automated reconnection proposed · TOPS-11146', 'jstolarz@equativ.com'),
  ev(68, 'Basis Technologies', '2026-09-02 08:46', null, 0, null, null, null),
];

// [day, amazon bid requests, amazon spend, network spend (all DSPs), related #5524 spend, related #5524 Amazon spend]
const DAILY_RAW: [string, number | null, number | null, number | null, number, number][] = [
  ['2026-09-05', 42646533, 675.97, 8937.31, 7889.18, 2.08],
  ['2026-09-06', 68562299, 1406.58, 10626.36, 8319.01, 2.12],
  ['2026-09-07', 52509312, 683.8, 7024.24, 11742.98, 3.93],
  ['2026-09-08', 33469643, 315.97, 4175.47, 10052.64, 6.2],
  ['2026-09-09', 93283484, 966.5, 7125.77, 10338.45, 7.04],
  ['2026-09-10', 92907219, 1348.14, 6164.83, 10478.58, 3.98],
  ['2026-09-11', 132840645, 1082.43, 6756.8, 11771.08, 4.56],
  ['2026-09-12', 118396965, 1228.06, 6754.23, 8629.38, 4.51],
  ['2026-09-13', 113317492, 1072.02, 6473.18, 8722.18, 8.96],
  ['2026-09-14', 44444486, 462.86, 5586.99, 10009.82, 11.41],
  ['2026-09-15', 125236787, 607.54, 5869.14, 10937.79, 4.82],
  ['2026-09-16', 90143295, 831.43, 4785.63, 10540.04, 18.79],
  ['2026-09-17', 143050197, 3666.62, 8289.84, 10387.18, 17.88],
  ['2026-09-18', 122591264, 2468.32, 8043.94, 8840.54, 9.44],
  ['2026-09-19', 164401285, 2344.41, 9270.94, 12658.55, 21.46],
  ['2026-09-20', 160377373, 3742.06, 12625.5, 11495.53, 65.5],
  ['2026-09-21', 117585628, 2048.07, 8929.81, 10514.67, 681.03],
  ['2026-09-22', 147191754, 1327.32, 6961.57, 9833.5, 1139.37],
  ['2026-09-23', 77258810, 3812.57, 9122.86, 14791.24, 1512.88],
  ['2026-09-24', 139077121, 2333.87, 7959.39, 24339.14, 2101.35],
  ['2026-09-25', 12165815, 428.9, 5074.91, 21728.97, 147.23],
  ['2026-09-26', 0, 0, 5005.09, 20519.04, 61.65],
  ['2026-09-27', 0, 0, 5073.86, 22087.12, 56.56],
  ['2026-09-28', 0, 0, 4971.17, 21187.8, 70.74],
  ['2026-09-29', 0, 0, 5204.9, 20524.84, 69.59],
  ['2026-09-30', 0, 0, 5547.49, 22113.22, 61.34],
  ['2026-10-01', 0, 0, 4081.73, 19345.7, 84.99],
  ['2026-10-02', 0, 0, 2129.55, 23500.66, 46.33],
  ['2026-10-03', 0, 0, 2257.19, 26086.74, 12.66],
  ['2026-10-04', 0, 0, 2309.18, 24317.76, 11.61],
  ['2026-10-05', 0, 0, 1404.73, 22557.9, 10.44],
  ['2026-10-06', 0, 0, 1194.91, 20398.16, 220.55],
  ['2026-10-07', 0, 0, 1609.45, 17525.54, 275.12],
  ['2026-10-08', 0, 0, 1526.78, 18688.73, 260.22],
  ['2026-10-09', 0, 0, 1599.2, 21341.65, 9.02],
  ['2026-10-10', 0, 0, 2012.46, 27094.06, 3.06],
  ['2026-10-11', 0, 0, 1618.9, 25232.76, 3.83],
  ['2026-10-12', 0, 0, 1463.98, 20555.39, 9.27],
  ['2026-10-13', 0, 0, 1398.94, 24467.36, 2.01],
  ['2026-10-14', 0, 0, 1047.23, 27122.57, 2.73],
  ['2026-10-15', null, null, null, 29485.58, 2.84],
  ['2026-10-16', null, null, null, 39116.82, 3.13],
  ['2026-10-17', null, null, null, 42520.04, 5.4],
  ['2026-10-18', null, null, null, 44845.3, 2.77],
  ['2026-10-19', null, null, null, 39629.75, 7.55],
];

const DAILY: DailyPoint[] = DAILY_RAW.map(([day, amazonBidRequests, amazonSpend, networkSpend, relatedNetworkSpend, relatedAmazonSpend]) => ({
  day,
  amazonBidRequests,
  amazonSpend,
  networkSpend,
  relatedNetworkSpend,
  relatedAmazonSpend,
}));

export const TUBI_CONTEXT: NetworkContext = {
  networkId: '5100',
  networkName: 'Tubi TV STR',
  asOf: '2026-10-20',
  source: 'snapshot',
  owners: { kam: 'sreiter@equativ.com', techOps: 'msteitieh@equativ.com', demandOps: 'Dmitri IARTSEV', businessUnit: 'US' },
  connections: { connected: 112, disconnected: 25, partners: 137 },
  events: EVENTS,
  daily: DAILY,
  related: [
    {
      networkId: '5524',
      name: 'Tubi',
      amazonSeatsConnected: 5,
      note: 'Named “Tubi”, non-STR network; publisher identity and inventory overlap with #5100 not verified. All 5 Amazon seats are still connected.',
      riskSeat: { partnerName: 'Amazon DSP CTV B', bidRequests7d: 170812889, spend7d: 10.99614, rpmbr7d: 0.064375 },
    },
  ],
};
