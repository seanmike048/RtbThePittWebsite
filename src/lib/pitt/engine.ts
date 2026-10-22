/**
 * The Disconnection Room engine: every threshold, label, stage name and derivation. Components only render what these
 * selectors return. Filters are applied first (applyFilters), and every selector takes the filtered cohort, so all KPIs,
 * charts and tables on screen describe the same rows.
 */
import type { AiInvestigation, Check, CheckName, CheckResult, Dataset, DemandFunnel, Disconnection, Hypothesis, Presence, TrafficMetric } from './types.ts';

// ------------------------------------------------------------------ configuration (editable placeholders)

/** Shown as a "Placeholder thresholds" chip: none of these is validated by TechOps or Finance yet. */
export const PRIORITY_RULES = {
  p0SpendMin: 10_000, // P0: still disconnected AND SPEND_7D_BEFORE >= this
  p1SpendMin: 1_000, // P1: SPEND_7D_BEFORE >= this OR revenue drop >= p1DropPct
  p1DropPct: 50,
  // P2: still disconnected with SPEND_7D_BEFORE missing
} as const;

export const AGE_BUCKETS = [
  { id: 'current', label: 'Current', min: 0, max: 0 },
  { id: '1-7', label: '1–7', min: 1, max: 7 },
  { id: '8-30', label: '8–30', min: 8, max: 30 },
  { id: '31-90', label: '31–90', min: 31, max: 90 },
  { id: '90+', label: '90+', min: 91, max: Infinity },
] as const;
export type BucketId = (typeof AGE_BUCKETS)[number]['id'];

export const CHECK_ORDER: CheckName[] = ['ADS_TXT', 'SCO', 'BLOCKED_INVENTORY', 'IVT'];
export const CHECK_LABEL: Record<CheckName | 'NO_DATA', string> = { ADS_TXT: 'ads.txt', SCO: 'Supply chain (SCO)', BLOCKED_INVENTORY: 'Blocked inventory', IVT: 'IVT', NO_DATA: 'No failing check' };
/** Recommended fix shown for a failing check (internal and publisher view). */
export const CHECK_FIX: Record<CheckName, string> = {
  ADS_TXT: 'Add or correct the Equativ line in ads.txt / app-ads.txt for this inventory.',
  SCO: 'Complete the supply chain object (complete=1, every node in sellers.json).',
  BLOCKED_INVENTORY: 'Review the blocked domains and bundles; remove blocks that are no longer needed.',
  IVT: 'Identify the IVT sources (placements, bundles, IP ranges) and filter them before reconnection.',
};

export const FUNNEL_STAGES = ['Auctions', 'Bid requests', 'Bids', 'Wins', 'Impressions'] as const;
const FUNNEL_KEYS = ['auctions', 'bid_requests', 'bids', 'wins', 'impressions'] as const;

/** Traffic banner "Drop is Amazon-specific": auctions within ±stablePct AND Amazon bid requests at or below dropPct. */
export const AMAZON_SPECIFIC = { stablePct: 10, dropPct: -50, auctionsMetric: 'network_auctions_per_day', amazonMetric: 'amazon_bid_requests_per_day' } as const;

export const READINESS_GROUPS = [
  { id: 'content', label: 'Content signals', note: 'Not fully relevant until January 2027', signals: ['content.genre', 'content.genres', 'content.contentrating', 'content.keywords', 'content.kwarray', 'content.id'] },
  { id: 'video', label: 'Video and app', note: null, signals: ['video.plcmt', 'video.placement', 'video.api', 'video.ext.orientation', 'app.content.url'] },
  { id: 'imp', label: 'Impression', note: null, signals: ['imp.ext.gpid', 'imp.secure'] },
  { id: 'regs', label: 'Privacy and regulation', note: null, signals: ['regs.ext.agerange', 'regs.gpp', 'regs.gpp_sid', 'regs.us_privacy', 'regs.ext.gdpr', 'regs.ext.gpc'] },
  { id: 'device', label: 'Device', note: null, signals: ['device.lmt', 'device.dnt'] },
] as const;

/** Tone of each priority and check result; colours come from the shared theme tokens (index.css). */
export const PRIORITY_TONE = { P0: 'danger', P1: 'warn', P2: 'info', none: 'neutral' } as const;
export const RESULT_TONE = { PASS: 'ok', FAIL: 'danger', NO_DATA: 'neutral' } as const;

// ------------------------------------------------------------------ formatting (null is "No data", never 0)

export const NO_DATA = 'No data';
export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null || !Number.isFinite(n) ? NO_DATA : n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtMoney = (n: number | null | undefined, symbol = '$') => (n == null || !Number.isFinite(n) ? NO_DATA : symbol + Math.round(n).toLocaleString('en-US'));
export const fmtCompact = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return NO_DATA;
  const a = Math.abs(n);
  return a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Number.isInteger(n) ? String(n) : n.toFixed(2);
};
export const fmtPct = (n: number | null | undefined, digits = 1) => (n == null || !Number.isFinite(n) ? NO_DATA : (n > 0 ? '+' : '') + n.toFixed(digits) + '%');

// ------------------------------------------------------------------ filters

export interface Filters {
  businessUnit: string | null;
  partnerId: number | null;
  region: string | null;
  priority: Priority | null;
  status: 'disconnected' | 'reconnected' | null;
  /** inclusive YYYY-MM-DD on CUT_AT; null = open */
  from: string | null;
  to: string | null;
}
export const NO_FILTERS: Filters = { businessUnit: null, partnerId: null, region: null, priority: null, status: null, from: null, to: null };
/** Default cohort: the last DEFAULT_WINDOW_DAYS days for the synthetic set (so a prior period exists), the whole run otherwise. */
export const DEFAULT_WINDOW_DAYS = 90;
export function defaultFilters(ds: Dataset): Filters {
  if (!ds.synthetic) return NO_FILTERS;
  const from = new Date(Date.parse(ds.asOf + 'T00:00:00Z') - (DEFAULT_WINDOW_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  return { ...NO_FILTERS, from, to: ds.asOf };
}

export type Priority = 'P0' | 'P1' | 'P2';
export type Risk = 'Critical' | 'High' | 'Watch' | 'Low';

const day = (ts: string) => ts.slice(0, 10);
const dayNum = (d: string) => Math.floor(Date.parse(d + 'T00:00:00Z') / 86_400_000);
export const daysSince = (cutAt: string, asOf: string) => Math.max(0, dayNum(asOf) - dayNum(day(cutAt)));
export const isDisconnected = (r: Disconnection) => r.RECONNECTED_AT == null;

/** Per-row derived fields. Everything else on screen is built from these. */
export interface Row extends Disconnection {
  key: string;
  REGION: string | null;
  days: number;
  bucket: BucketId;
  priority: Priority | null;
  risk: Risk;
  primaryCheck: CheckName | 'NO_DATA';
  reason: string;
  revenueDropPct: number | null;
}

export function bucketOf(days: number): BucketId {
  return AGE_BUCKETS.find((b) => days >= b.min && days <= b.max)!.id;
}

/** Amazon revenue drop for a network, from a traffic metric whose name contains "revenue" or "spend" and that went down. */
export function revenueDropPct(ds: Dataset, networkId: number): number | null {
  const m = ds.traffic.filter((t) => t.network_id === networkId && /revenue|spend/.test(t.metric)).map(changePct).filter((x): x is number => x != null);
  const drops = m.filter((x) => x < 0);
  return drops.length ? Math.min(...drops) : null;
}

export function priorityOf(r: Disconnection, dropPct: number | null): Priority | null {
  const spend = r.SPEND_7D_BEFORE;
  if (isDisconnected(r) && spend != null && spend >= PRIORITY_RULES.p0SpendMin) return 'P0';
  if ((spend != null && spend >= PRIORITY_RULES.p1SpendMin) || (dropPct != null && -dropPct >= PRIORITY_RULES.p1DropPct)) return 'P1';
  if (isDisconnected(r) && spend == null) return 'P2';
  return null;
}

export function riskOf(priority: Priority | null, disconnected: boolean, days: number): Risk {
  if (!disconnected) return 'Low';
  if (priority === 'P0') return 'Critical';
  if (priority === 'P1') return 'High';
  if (priority === 'P2' || days > 30) return 'Watch';
  return 'Low';
}

/** First FAIL in the AFTER window, in CHECK_ORDER; "NO_DATA" when no check fails. */
export function primaryCheck(checks: Check[], networkId: number): CheckName | 'NO_DATA' {
  const fails = new Set(checks.filter((c) => c.network_id === networkId && c.window === 'AFTER' && c.result === 'FAIL').map((c) => c.check));
  return CHECK_ORDER.find((c) => fails.has(c)) ?? 'NO_DATA';
}

export function oneLineReason(ds: Dataset, networkId: number): string {
  const p = primaryCheck(ds.checks, networkId);
  if (p !== 'NO_DATA') return CHECK_LABEL[p] + ' FAIL after the cut';
  const lead = rankedHypotheses(ds, networkId)[0];
  return lead ? 'No failing check · leading hypothesis: ' + lead.label : 'No failing check';
}

export function deriveRows(ds: Dataset): Row[] {
  const region = new Map(ds.networks.map((n) => [n.NETWORK_ID, n.REGION]));
  return ds.disconnections.map((r) => {
    const days = daysSince(r.CUT_AT, ds.asOf);
    const drop = revenueDropPct(ds, r.NETWORK_ID);
    const priority = priorityOf(r, drop);
    return {
      ...r,
      key: r.NETWORK_ID + ':' + r.PARTNER_ID + ':' + r.CUT_AT,
      REGION: region.get(r.NETWORK_ID) ?? null,
      days,
      bucket: bucketOf(days),
      priority,
      risk: riskOf(priority, isDisconnected(r), days),
      primaryCheck: primaryCheck(ds.checks, r.NETWORK_ID),
      reason: oneLineReason(ds, r.NETWORK_ID),
      revenueDropPct: drop,
    };
  });
}

/** Applied BEFORE every derivation. */
export function applyFilters(rows: Row[], f: Filters): Row[] {
  return rows.filter(
    (r) =>
      (f.businessUnit == null || r.BUSINESS_UNIT === f.businessUnit) &&
      (f.partnerId == null || r.PARTNER_ID === f.partnerId) &&
      (f.region == null || r.REGION === f.region) &&
      (f.priority == null || r.priority === f.priority) &&
      (f.status == null || (f.status === 'disconnected') === isDisconnected(r)) &&
      (f.from == null || day(r.CUT_AT) >= f.from) &&
      (f.to == null || day(r.CUT_AT) <= f.to),
  );
}

/** The same filters on the equal-length window just before [from, to]; null when the window is open. */
export function priorFilters(f: Filters): Filters | null {
  if (!f.from || !f.to) return null;
  const len = dayNum(f.to) - dayNum(f.from) + 1;
  const iso = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
  return { ...f, from: iso(dayNum(f.from) - len), to: iso(dayNum(f.from) - 1) };
}

export function filterOptions(ds: Dataset) {
  const rows = deriveRows(ds);
  const uniq = <T,>(a: T[]) => [...new Set(a)].filter((x) => x != null) as NonNullable<T>[];
  return {
    businessUnits: uniq(rows.map((r) => r.BUSINESS_UNIT)).sort(),
    partners: uniq(rows.map((r) => r.PARTNER_ID)).sort((a, b) => a - b).map((id) => ({ id, name: rows.find((r) => r.PARTNER_ID === id)!.PARTNER_NAME })),
    regions: uniq(rows.map((r) => r.REGION)).sort(),
    minDate: rows.length ? rows.map((r) => day(r.CUT_AT)).sort()[0] : ds.asOf,
    maxDate: ds.asOf,
  };
}

// ------------------------------------------------------------------ KPIs

const sum = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};
const networksOf = (rows: Row[]) => new Set(rows.map((r) => r.NETWORK_ID));

export interface Kpi {
  id: string;
  label: string;
  value: number | null;
  kind: 'count' | 'money';
  sub: string | null;
  definition: string;
  delta: number | null;
}

/**
 * Saves that belong to the cohort: a reconnect-after-fix counts when its network is in the rows; a stayed-connected
 * network has no cut, so it counts only under filters it can be judged by (seat and date) and when no BU, region,
 * priority or status filter is set.
 */
export function savesFor(ds: Dataset, rows: Row[], f: Filters) {
  const nets = networksOf(rows);
  const plain = f.businessUnit == null && f.region == null && f.priority == null && f.status == null;
  return ds.saves.filter((s) =>
    s.kind === 'reconnected_after_fix'
      ? nets.has(s.network_id)
      : plain && (f.partnerId == null || s.PARTNER_ID === f.partnerId) && (f.from == null || s.fixed_at >= f.from) && (f.to == null || s.fixed_at <= f.to),
  );
}

export function kpis(ds: Dataset, rows: Row[], prior: Row[] | null, f: Filters = NO_FILTERS, fPrior: Filters | null = null): Kpi[] {
  const k = (r: Row[], ff: Filters) => {
    const disc = r.filter(isDisconnected);
    const rec = r.filter((x) => !isDisconnected(x));
    const nets = new Set(r.map((x) => x.NETWORK_ID));
    const saves = savesFor(ds, r, ff);
    return {
      networks: disc.length ? networksOf(disc).size : 0,
      atRisk: sum(disc.map((x) => x.SPEND_7D_BEFORE)),
      reconnected: rec.length ? networksOf(rec).size : 0,
      recovered: sum(rec.map((x) => x.SPEND_7D_BEFORE)),
      saved: sum(saves.map((s) => s.SPEND_7D)),
      failing: ds.checks.filter((c) => nets.has(c.network_id) && c.window === 'AFTER' && c.result === 'FAIL').length,
    };
  };
  const now = k(rows, f);
  const before = prior && fPrior ? k(prior, fPrior) : null;
  const d = (a: number | null, b: number | null | undefined) => (before == null || a == null || b == null ? null : a - b);
  return [
    { id: 'networks', label: 'Networks disconnected', value: now.networks, kind: 'count', sub: null, delta: d(now.networks, before?.networks),
      definition: 'Distinct networks with at least one Amazon seat whose RECONNECTED_AT is null, in the filtered cohort.' },
    { id: 'atRisk', label: 'Revenue at risk', value: now.atRisk, kind: 'money', sub: 'per week, before the cut', delta: d(now.atRisk, before?.atRisk),
      definition: 'Sum of SPEND_7D_BEFORE over still-disconnected seats. Spend in the 7 days before the cut: a run rate, not a confirmed loss. Seats with no spend recorded are left out.' },
    { id: 'reconnected', label: 'Reconnected', value: now.reconnected, kind: 'count', sub: now.recovered == null ? 'pre-cut value: No data' : fmtMoney(now.recovered, ds.currency.symbol) + ' / week pre-cut value', delta: d(now.reconnected, before?.reconnected),
      definition: 'Distinct networks whose cut seats all have a RECONNECTED_AT in the cohort. The figure below is their SPEND_7D_BEFORE: what they spent before the cut, not verified restored spend.' },
    { id: 'saved', label: 'Revenue saved', value: now.saved, kind: 'money', sub: 'per week', delta: d(now.saved, before?.saved),
      definition: 'Weekly spend of networks that reconnected after a fix (in the cohort) plus networks that stayed connected after a fix (seat and date filters only). From the saves list in data.ts.' },
    { id: 'failing', label: 'Checks failing', value: now.failing, kind: 'count', sub: 'after the cut', delta: d(now.failing, before?.failing),
      definition: 'Count of FAIL results in the AFTER window for networks in the cohort. NO_DATA is not counted as a pass or a fail.' },
  ];
}

export function cohortSummary(ds: Dataset, rows: Row[], f: Filters) {
  const dates = rows.map((r) => day(r.CUT_AT)).sort();
  return {
    networks: networksOf(rows).size,
    seats: new Set(rows.map((r) => r.PARTNER_ID)).size,
    window: f.from || f.to ? (f.from ?? dates[0] ?? '…') + ' → ' + (f.to ?? ds.asOf) : dates.length ? dates[0] + ' → ' + dates[dates.length - 1] : NO_DATA,
  };
}

// ------------------------------------------------------------------ Sankey (revenue at risk flow)

export const SANKEY_COLUMNS = ['Business unit', 'Amazon partner seat', 'Publisher network', 'Primary failing check', 'Status'] as const;
export interface SankeyNode { id: string; name: string; column: number; value: number; share: number }
export interface SankeyLink { source: string; target: string; value: number }

/**
 * Every seat row with a known SPEND_7D_BEFORE flows BU -> seat -> network -> primary failing check -> status.
 * The "Still disconnected" node therefore equals the Revenue at risk KPI. Rows without spend cannot be drawn and are counted apart.
 */
export function sankey(rows: Row[]) {
  const nodes = new Map<string, SankeyNode>();
  const links = new Map<string, SankeyLink>();
  const node = (column: number, name: string) => {
    const id = column + ':' + name;
    if (!nodes.has(id)) nodes.set(id, { id, name, column, value: 0, share: 0 });
    return id;
  };
  const link = (a: string, b: string, v: number) => {
    const k = a + '>' + b;
    const l = links.get(k);
    if (l) l.value += v;
    else links.set(k, { source: a, target: b, value: v });
  };
  const drawn = rows.filter((r) => r.SPEND_7D_BEFORE != null && r.SPEND_7D_BEFORE > 0);
  for (const r of drawn) {
    const v = r.SPEND_7D_BEFORE!;
    const path = [
      node(0, r.BUSINESS_UNIT ?? 'No business unit'),
      node(1, r.PARTNER_NAME + ' · ' + r.PARTNER_ID),
      node(2, r.PUBLISHER + ' · #' + r.NETWORK_ID),
      node(3, CHECK_LABEL[r.primaryCheck]),
      node(4, isDisconnected(r) ? 'Still disconnected' : 'Reconnected'),
    ];
    for (let i = 0; i < path.length - 1; i++) link(path[i], path[i + 1], v);
  }
  const total = drawn.reduce((a, r) => a + r.SPEND_7D_BEFORE!, 0);
  // Node value = what flows through it (inflow, or outflow for the first column); share = of the drawn total.
  for (const n of nodes.values()) {
    const inflow = [...links.values()].filter((l) => l.target === n.id).reduce((a, l) => a + l.value, 0);
    const outflow = [...links.values()].filter((l) => l.source === n.id).reduce((a, l) => a + l.value, 0);
    n.value = n.column === 0 ? outflow : inflow;
    n.share = total ? (n.value / total) * 100 : 0;
  }
  const stillDisconnected = [...links.values()].filter((l) => l.target === '4:Still disconnected').reduce((a, l) => a + l.value, 0);
  return { nodes: [...nodes.values()], links: [...links.values()], total, stillDisconnected, undrawn: rows.length - drawn.length };
}

// ------------------------------------------------------------------ risk table

export type SortKey = 'age' | 'value' | 'az';
export function riskTable(rows: Row[], sort: SortKey, atRiskOnly: boolean): Row[] {
  const r = atRiskOnly ? rows.filter(isDisconnected) : rows.slice();
  const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
    age: (a, b) => b.days - a.days || (b.SPEND_7D_BEFORE ?? -1) - (a.SPEND_7D_BEFORE ?? -1),
    value: (a, b) => (b.SPEND_7D_BEFORE ?? -1) - (a.SPEND_7D_BEFORE ?? -1) || b.days - a.days,
    az: (a, b) => a.PUBLISHER.localeCompare(b.PUBLISHER) || a.PARTNER_ID - b.PARTNER_ID,
  };
  return r.sort(cmp[sort]);
}

export function bucketTotals(rows: Row[]) {
  return AGE_BUCKETS.map((b) => {
    const r = rows.filter((x) => x.bucket === b.id && isDisconnected(x));
    return { id: b.id, label: b.label, count: r.length, value: sum(r.map((x) => x.SPEND_7D_BEFORE)) };
  });
}

/** On-load reconciliation: Sankey "Still disconnected" = KPI revenue at risk = sum of the at-risk risk table. */
export function reconcile(ds: Dataset, rows: Row[]) {
  const s = sankey(rows).stillDisconnected;
  const kpi = kpis(ds, rows, null).find((k) => k.id === 'atRisk')!.value ?? 0;
  const table = riskTable(rows, 'value', true).reduce((a, r) => a + (r.SPEND_7D_BEFORE ?? 0), 0);
  const ok = Math.abs(s - kpi) < 0.005 && Math.abs(kpi - table) < 0.005;
  return { ok, sankey: s, kpi, table, message: ok ? 'RECONCILIATION OK (' + fmtMoney(kpi, ds.currency.symbol) + ')' : 'RECONCILIATION MISMATCH: sankey ' + s + ' · kpi ' + kpi + ' · table ' + table };
}

// ------------------------------------------------------------------ demand funnel

export interface FunnelStage { stage: string; intake: number | null; continuedPct: number | null; dropped: number | null; reasons: { reason: string; count: number }[]; moreReasons: number; shareOfTop: number | null }

export function funnel(ds: Dataset, rows: Row[], networkId: number | null): { stages: FunnelStage[]; networks: number } {
  const nets = networkId != null ? new Set([networkId]) : networksOf(rows);
  const fs = ds.funnels.filter((f) => nets.has(f.network_id));
  if (!fs.length) return { stages: [], networks: 0 };
  const total = (k: (typeof FUNNEL_KEYS)[number]) => sum(fs.map((f) => f[k]));
  const stages: FunnelStage[] = FUNNEL_KEYS.map((k, i) => {
    const intake = total(k);
    const next = i < FUNNEL_KEYS.length - 1 ? total(FUNNEL_KEYS[i + 1]) : null;
    const nextStage = FUNNEL_STAGES[i + 1];
    const agg = new Map<string, number>();
    if (nextStage) for (const f of fs) for (const d of f.drop_reasons) if (d.stage === nextStage) agg.set(d.reason, (agg.get(d.reason) ?? 0) + d.count);
    const reasons = [...agg.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
    return {
      stage: FUNNEL_STAGES[i],
      intake,
      continuedPct: intake && next != null ? (next / intake) * 100 : null,
      dropped: intake != null && next != null ? intake - next : null,
      reasons: reasons.slice(0, 3),
      moreReasons: Math.max(0, reasons.length - 3),
      shareOfTop: intake != null && total(FUNNEL_KEYS[0]) ? (intake / total(FUNNEL_KEYS[0])!) * 100 : null,
    };
  });
  return { stages, networks: fs.length };
}

// ------------------------------------------------------------------ revenue variance (cohort)

export interface CohortVarianceRow {
  id: string;
  label: string;
  value: number | null;
  /** Why the value is missing, when it is. */
  reason: string | null;
  role: 'total' | 'part' | 'measure';
  explain: string;
}

/**
 * Additive split of the cohort's pre-cut weekly spend: still removed + seats reconnected since. Reconnected seats are
 * not "recovered": spend after a reconnection is not in the alert view. Run rate, projection and confirmed restored
 * spend need daily data per publisher (Financial Impact), so they are unavailable here, never zero.
 */
export function cohortVariance(rows: Row[]): CohortVarianceRow[] {
  const withSpend = rows.filter((r) => r.SPEND_7D_BEFORE != null);
  const total = sum(withSpend.map((r) => r.SPEND_7D_BEFORE));
  const removed = sum(withSpend.filter(isDisconnected).map((r) => r.SPEND_7D_BEFORE)) ?? (total == null ? null : 0);
  const reconnected = sum(withSpend.filter((r) => !isDisconnected(r)).map((r) => r.SPEND_7D_BEFORE)) ?? (total == null ? null : 0);
  const perPublisher = 'Needs daily spend per publisher: open the publisher in Financial Impact.';
  return [
    { id: 'precut', label: 'Pre-cut weekly spend', value: total, reason: total == null ? 'No seat in the cohort has a recorded spend.' : null, role: 'total', explain: 'Amazon DSP spend in the 7 days before the cut, on the cut seats of this cohort.' },
    { id: 'removed', label: 'Removed after cut', value: removed, reason: null, role: 'part', explain: 'Seats still disconnected.' },
    { id: 'reconnected', label: 'Reconnected seats', value: reconnected, reason: null, role: 'part', explain: 'Seats connected again. Their pre-cut value is shown; spend after reconnection is not verified.' },
    { id: 'runrate', label: 'Current run rate', value: null, reason: perPublisher, role: 'measure', explain: 'Latest loaded day × 7.' },
    { id: 'projected', label: 'Projected recovery', value: null, reason: 'Projections are per publisher (Spend Projection).', role: 'measure', explain: 'Only from a complete scenario.' },
    { id: 'restored', label: 'Confirmed restored', value: null, reason: 'No verified restored spend in the alert view.', role: 'measure', explain: 'Spend observed again after a verified reconnection.' },
  ];
}

// ------------------------------------------------------------------ what-if (projection, not a forecast)

/**
 * A network counts as fixed when every check failing after the cut is in the fixed set (or it is among the first
 * `topN` fixable networks by revenue at risk). Fixed networks are projected as reconnected; priorities are recomputed
 * with the same rules.
 */
export function whatIf(ds: Dataset, rows: Row[], fixChecks: CheckName[], topN: number | null) {
  const disc = rows.filter(isDisconnected);
  const failing = (nid: number) => ds.checks.filter((c) => c.network_id === nid && c.window === 'AFTER' && c.result === 'FAIL').map((c) => c.check);
  const fixable = [...networksOf(disc)].filter((nid) => failing(nid).length > 0);
  let fixed = new Set(fixable.filter((nid) => fixChecks.length > 0 && failing(nid).every((c) => fixChecks.includes(c))));
  if (topN != null) {
    const byValue = fixable
      .map((nid) => ({ nid, v: sum(disc.filter((r) => r.NETWORK_ID === nid).map((r) => r.SPEND_7D_BEFORE)) ?? 0 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, topN)
      .map((x) => x.nid);
    fixed = new Set(byValue);
  }
  const projected = rows.map((r) => (fixed.has(r.NETWORK_ID) && isDisconnected(r) ? { ...r, RECONNECTED_AT: 'projected' } : r));
  const prio = (rs: Disconnection[]) => rs.map((r) => priorityOf(r, revenueDropPct(ds, r.NETWORK_ID)));
  const before = prio(rows), after = prio(projected);
  const count = (ps: (Priority | null)[], p: Priority) => ps.filter((x) => x === p).length;
  const transitions: Record<string, number> = {};
  before.forEach((p, i) => {
    if (p !== after[i]) transitions[(p ?? 'none') + '→' + (after[i] ?? 'none')] = (transitions[(p ?? 'none') + '→' + (after[i] ?? 'none')] ?? 0) + 1;
  });
  return {
    fixableNetworks: fixable.length,
    fixedNetworks: fixed.size,
    recovered: sum(disc.filter((r) => fixed.has(r.NETWORK_ID)).map((r) => r.SPEND_7D_BEFORE)),
    p0Before: count(before, 'P0'),
    p0After: count(after, 'P0'),
    p0ToP2: transitions['P0→P2'] ?? 0,
    transitions,
  };
}

// ------------------------------------------------------------------ network page

export function checkGrid(ds: Dataset, networkId: number) {
  return CHECK_ORDER.map((c) => ({
    check: c,
    label: CHECK_LABEL[c],
    BEFORE: ds.checks.find((x) => x.network_id === networkId && x.check === c && x.window === 'BEFORE') ?? null,
    AFTER: ds.checks.find((x) => x.network_id === networkId && x.check === c && x.window === 'AFTER') ?? null,
  }));
}

export function changePct(t: TrafficMetric): number | null {
  if (t.change_pct != null) return t.change_pct;
  if (t.before == null || t.after == null || t.before === 0) return null;
  return ((t.after - t.before) / t.before) * 100;
}

export function trafficContext(ds: Dataset, networkId: number) {
  const metrics = ds.traffic.filter((t) => t.network_id === networkId && !/rpmbr|rpma/i.test(t.metric)).map((t) => ({ ...t, change: changePct(t) }));
  const auctions = metrics.find((m) => m.metric === AMAZON_SPECIFIC.auctionsMetric);
  const amazon = metrics.find((m) => m.metric === AMAZON_SPECIFIC.amazonMetric);
  const amazonSpecific = !!auctions && !!amazon && auctions.change != null && amazon.change != null && Math.abs(auctions.change) <= AMAZON_SPECIFIC.stablePct && amazon.change <= AMAZON_SPECIFIC.dropPct;
  return { metrics, amazonSpecific };
}

export interface ShownHypothesis extends Hypothesis {
  unverified: string[];
}

/** Hypotheses in source order, never ranked or scored. A ref missing from Checks is "Unverified evidence". */
export function rankedHypotheses(ds: Dataset, networkId: number): ShownHypothesis[] {
  const inv = ds.investigations.find((i) => i.network_id === networkId);
  if (!inv) return [];
  const refs = new Set(ds.checks.map((c) => c.evidence_ref));
  return inv.hypotheses.map((h) => ({ ...h, unverified: h.evidence_refs.filter((r) => !refs.has(r)) }));
}

export function investigation(ds: Dataset, networkId: number): AiInvestigation | null {
  return ds.investigations.find((i) => i.network_id === networkId) ?? null;
}

export function readiness(ds: Dataset, networkId: number) {
  const sig = ds.readiness.filter((r) => r.network_id === networkId);
  return READINESS_GROUPS.map((g) => ({
    ...g,
    items: g.signals.map((s) => {
      const r = sig.find((x) => x.signal === s);
      return { signal: s, presence: (r?.presence ?? 'NO_DATA') as Presence, detail: r?.detail ?? null };
    }),
  }));
}

export function networkSummary(ds: Dataset, networkId: number) {
  const rows = deriveRows(ds).filter((r) => r.NETWORK_ID === networkId);
  const failing = ds.checks.filter((c) => c.network_id === networkId && c.window === 'AFTER' && c.result === 'FAIL');
  return {
    rows,
    publisher: rows[0]?.PUBLISHER ?? '#' + networkId,
    region: rows[0]?.REGION ?? null,
    disconnected: rows.some(isDisconnected),
    atRisk: sum(rows.filter(isDisconnected).map((r) => r.SPEND_7D_BEFORE)),
    failing,
    fixes: [...new Set(failing.map((c) => c.check))].map((c) => ({ check: c, label: CHECK_LABEL[c], fix: CHECK_FIX[c] })),
    timeline: [
      ...rows.map((r) => ({ at: r.CUT_AT, what: 'Cut from ' + r.PARTNER_NAME + ' (' + r.PARTNER_ID + ')' })),
      ...failing.map((c) => ({ at: null as string | null, what: CHECK_LABEL[c.check] + ' FAIL after the cut: ' + c.detail })),
      ...rows.filter((r) => r.RECONNECTED_AT).map((r) => ({ at: r.RECONNECTED_AT, what: 'Reconnected to ' + r.PARTNER_NAME + ' (' + r.PARTNER_ID + ')' })),
    ],
  };
}

export const resultTone = (r: CheckResult) => (r === 'PASS' ? 'ok' : r === 'FAIL' ? 'danger' : 'neutral') as 'ok' | 'danger' | 'neutral';
export const presenceTone = (p: Presence) => (p === 'PRESENT' ? 'ok' : p === 'ABSENT' ? 'danger' : p === 'PARTIAL' ? 'warn' : 'neutral') as 'ok' | 'danger' | 'warn' | 'neutral';
export const funnelOf = (ds: Dataset, nid: number): DemandFunnel | null => ds.funnels.find((f) => f.network_id === nid) ?? null;
