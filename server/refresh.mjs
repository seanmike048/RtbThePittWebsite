// "Refresh Snowflake data": a scoped, read-only job that builds a new versioned snapshot, validates it, and promotes it
// atomically only when every dataset is complete. It never runs an investigation, approves anything or writes to Snowflake.
// Columns used below are the ones the site already queries (src/lib/investigations/live.ts, sql/01_source_dictionary.sql).
import { dspByKey } from './capabilities.mjs';
import { missing } from './config.mjs';
import { ContractError, ISO_DAY, canonical, newId, sha256 } from './contracts.mjs';

const ph = (n) => Array.from({ length: n }, () => '?').join(', ');
const MAX_DAYS = 92;

/** Allowlisted query families. Each returns { sql, binds }; inputs are already validated integers / ISO days. */
export const QUERY_FAMILIES = {
  seat_daily_activity: {
    source: 'ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES',
    definitions: {
      BID_REQUESTS: 'Bid requests sent by Equativ to DSPs (column comment)',
      SPEND: 'TOTAL_PAID_PRICE_TRUE_COUNT: price paid by winning DSPs, documented in Euro by the column comment; not Finance-validated',
      RPMBR: 'SPEND / BID_REQUESTS x 1,000,000 per network x seat x day; null when BID_REQUESTS is 0',
      DAY: 'UTC day',
    },
    build: (s) => ({
      sql:
        'SELECT TO_VARCHAR(day, \'YYYY-MM-DD\') AS day, network_id, partner_id, SUM(bid_requests) AS bid_requests, SUM(total_paid_price_true_count) AS spend\n' +
        'FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES\n' +
        'WHERE network_id IN (' + ph(s.network_ids.length) + ') AND partner_id IN (' + ph(s.partner_ids.length) + ') AND day >= TO_DATE(?) AND day <= TO_DATE(?)\n' +
        'GROUP BY 1, 2, 3 ORDER BY 1, 2, 3',
      binds: [...s.network_ids, ...s.partner_ids, s.from, s.to],
    }),
  },
  source_watermark: {
    source: 'ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES',
    definitions: { LAST_DAY: 'Latest UTC day with rows for the selected seats (any network): the source watermark, not the refresh time' },
    build: (s) => ({
      sql: 'SELECT TO_VARCHAR(MAX(day), \'YYYY-MM-DD\') AS last_day FROM ANALYTICS_DATA_HUB.EQT_SSP_ACTIVITY.DAY_SCO_NODES WHERE partner_id IN (' + ph(s.partner_ids.length) + ') AND day >= DATEADD(day, -10, CURRENT_DATE())',
      binds: [...s.partner_ids],
    }),
  },
  connection_events: {
    source: 'ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS + ANALYTICS_DATA_HUB.EQT_SSP_MAPPING.MAPPING_NETWORK_PARTNER_CONNECTION_SCD',
    definitions: {
      REVENUE_7_DAYS_BEFORE: 'Alert view figure: sums DAILY_REPORT.TOTAL_PAID_PRICE_TRUE_COUNT, the measure DAY_DEMAND documents as price paid by winning DSPs in Euro (checked 2026-10-21); not Finance-validated',
      BLOCKING_REASON: 'SCD reason code (column comment legend: 0 Connected, 1 Other, 2 LowProfitabilityBidder, 3 LowProfitabilityEquativ, 4 QualityIssueBidder, 5 QualityIssuePublisher, 6 DirectIntegrationBidder)',
      CUT_AT: 'Timestamp as stored; no time zone documented',
    },
    build: (s) => ({
      sql:
        'WITH a AS (SELECT network_id, partner_id, partner_name, datedisconnection, datereconnection, revenue_7_days_before FROM ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS\n' +
        '  WHERE network_id IN (' + ph(s.network_ids.length) + ') AND partner_id IN (' + ph(s.partner_ids.length) + ') AND datedisconnection >= DATEADD(day, -' + MAX_DAYS + ', TO_DATE(?))),\n' +
        's AS (SELECT network_id, partner_id, start_date, blocking_reason, comment FROM ANALYTICS_DATA_HUB.EQT_SSP_MAPPING.MAPPING_NETWORK_PARTNER_CONNECTION_SCD\n' +
        '  WHERE network_id IN (' + ph(s.network_ids.length) + ') AND partner_id IN (' + ph(s.partner_ids.length) + '))\n' +
        'SELECT a.network_id, a.partner_id, a.partner_name, TO_VARCHAR(a.datedisconnection, \'YYYY-MM-DD HH24:MI\') AS cut_at,\n' +
        '  IFF(a.datereconnection >= \'2099-01-01\', NULL, TO_VARCHAR(a.datereconnection, \'YYYY-MM-DD\')) AS reconnected_at, a.revenue_7_days_before, s.blocking_reason, s.comment\n' +
        'FROM a LEFT JOIN s ON s.network_id = a.network_id AND s.partner_id = a.partner_id AND ABS(DATEDIFF(minute, s.start_date, a.datedisconnection)) <= 5\n' +
        'QUALIFY ROW_NUMBER() OVER (PARTITION BY a.network_id, a.partner_id, a.datedisconnection ORDER BY s.start_date DESC) = 1 ORDER BY cut_at DESC',
      binds: [...s.network_ids, ...s.partner_ids, s.to, ...s.network_ids, ...s.partner_ids],
    }),
  },
};

export function validateRefreshInput(body, user) {
  if (!body || typeof body !== 'object') throw new ContractError('invalid', 'Body must be a JSON object');
  for (const k of Object.keys(body)) if (!['dsp', 'partner_ids', 'network_ids', 'from', 'to'].includes(k)) throw new ContractError('invalid', 'Unknown field: ' + k);
  const dsp = dspByKey(body.dsp);
  if (!dsp) throw new ContractError('invalid', 'Unknown DSP');
  const seats = dsp.seats.map((s) => s.id);
  const ints = (a, name) => {
    if (!Array.isArray(a) || !a.length || a.length > 20 || !a.every((x) => Number.isInteger(x) && x > 0 && x < 1e9)) throw new ContractError('invalid', name + ': 1 to 20 positive integers');
    return [...new Set(a)].sort((x, y) => x - y);
  };
  const partner_ids = ints(body.partner_ids, 'partner_ids');
  if (!partner_ids.every((p) => seats.includes(p))) throw new ContractError('invalid', 'A seat is not in the ' + dsp.name + ' registry');
  const network_ids = ints(body.network_ids, 'network_ids');
  if (!ISO_DAY.test(body.from || '') || !ISO_DAY.test(body.to || '') || body.from > body.to) throw new ContractError('invalid', 'from / to must be ISO days, from <= to (UTC)');
  const days = Math.round((Date.parse(body.to) - Date.parse(body.from)) / 86_400_000) + 1;
  if (days > MAX_DAYS) throw new ContractError('invalid', 'Window is limited to ' + MAX_DAYS + ' days');
  if (!user.canSeePartner(dsp.key) || !network_ids.every((n) => user.canSeeNetwork(n))) throw new ContractError('forbidden', 'Scope is outside your authorisation');
  return { dsp_key: dsp.key, partner_ids, network_ids, from: body.from, to: body.to, timezone: 'UTC', days };
}

const daysBetween = (from, to) => {
  const out = [];
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};
const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Validates the activity rows: no duplicate keys, explicit missing days, null never turned into 0. */
export function validateActivity(rows, scope, watermark) {
  const issues = [];
  const seen = new Set();
  const byDay = new Map();
  const out = [];
  for (const r of rows) {
    const key = r.DAY + '|' + r.NETWORK_ID + '|' + r.PARTNER_ID;
    if (seen.has(key)) issues.push('duplicate row ' + key + ' (join fan-out)');
    seen.add(key);
    if (!scope.partner_ids.includes(Number(r.PARTNER_ID)) || !scope.network_ids.includes(Number(r.NETWORK_ID))) issues.push('row outside the requested scope: ' + key);
    const br = n(r.BID_REQUESTS), spend = n(r.SPEND);
    out.push({ day: r.DAY, network_id: Number(r.NETWORK_ID), partner_id: Number(r.PARTNER_ID), bid_requests: br, spend, rpmbr: br && spend != null ? (spend / br) * 1e6 : null });
    byDay.set(r.DAY, true);
  }
  const lastComplete = watermark && watermark < scope.to ? watermark : scope.to;
  const expected = daysBetween(scope.from, lastComplete);
  const missingDays = expected.filter((d) => !byDay.has(d));
  return {
    rows: out,
    issues,
    coverage: { from: scope.from, to: scope.to, complete_through: lastComplete, days_expected: expected.length, days_present: expected.length - missingDays.length, missing_days: missingDays.slice(0, 60) },
  };
}

export function createRefresh({ cfg, store, snowflake, onPromote = () => {}, now = () => Date.now(), schedule = (fn) => setImmediate(fn) }) {
  async function start(user, body) {
    if (!user.has('refresher')) throw new ContractError('forbidden', 'You do not have the refresh permission');
    const gaps = missing(cfg, 'snowflake');
    if (gaps.length) throw new ContractError('upstream_unavailable', 'Snowflake refresh is not configured on this server', { missing: gaps });
    const scope = validateRefreshInput(body, user);
    const scopeKey = sha256(canonical({ d: scope.dsp_key, p: scope.partner_ids, n: scope.network_ids, f: scope.from, t: scope.to }));
    const { job, duplicate } = await store.tx((s) => {
      const running = s.all('refreshes', (r) => r.scope_key === scopeKey && ['queued', 'running'].includes(r.state))[0];
      if (running) return { job: running, duplicate: true };
      const job = { refresh_id: newId('ref'), scope, scope_key: scopeKey, state: 'queued', created_by: user.id, created_at: new Date(now()).toISOString(), snapshot_id: null, datasets: {}, error: null };
      s.insert('refreshes', job.refresh_id, job);
      return { job, duplicate: false };
    });
    if (!duplicate) {
      store.audit({ kind: 'refresh', action: 'refresh_started', refresh_id: job.refresh_id, actor: user.id, scope });
      schedule(() => run(job.refresh_id).catch(() => {}));
    }
    return { refresh: job, duplicate };
  }

  async function run(id) {
    const job = await store.tx((s) => s.update('refreshes', id, (j) => ({ ...j, state: 'running' })));
    const scope = job.scope;
    const datasets = {};
    const runOne = async (name) => {
      const fam = QUERY_FAMILIES[name];
      const q = fam.build(scope);
      try {
        const r = await snowflake.query(q.sql, q.binds);
        datasets[name] = { status: 'ok', source: fam.source, definitions: fam.definitions, query_id: r.query_id, executed_at: r.executed_at, row_count: r.row_count, rows: r.rows };
      } catch (e) {
        datasets[name] = { status: 'failed', source: fam.source, error_code: e.code || 'upstream_error', error: e.code === 'upstream_unavailable' && e.details?.missing ? 'Not configured: ' + e.details.missing.join(', ') : String(e.message).slice(0, 200), query_id: e.details?.query_id ?? null, rows: null };
      }
    };
    await runOne('source_watermark');
    await runOne('seat_daily_activity');
    await runOne('connection_events');

    const watermark = datasets.source_watermark.rows?.[0]?.LAST_DAY ?? null;
    let activity = null;
    if (datasets.seat_daily_activity.status === 'ok') {
      activity = validateActivity(datasets.seat_daily_activity.rows, scope, watermark);
      if (activity.issues.length) datasets.seat_daily_activity = { ...datasets.seat_daily_activity, status: 'invalid', issues: activity.issues.slice(0, 20) };
      else datasets.seat_daily_activity.coverage = activity.coverage;
    }
    const allOk = Object.values(datasets).every((d) => d.status === 'ok');
    const snapshot = {
      snapshot_id: newId('snap'),
      refresh_id: id,
      scope,
      status: allOk ? 'complete' : Object.values(datasets).some((d) => d.status === 'ok') ? 'partial' : 'failed',
      refreshed_at: new Date(now()).toISOString(),
      source_watermark: watermark,
      currency: { code: 'EUR', status: 'source_documented', label: 'EUR as documented by the source columns; not Finance-validated' },
      datasets: Object.fromEntries(Object.entries(datasets).map(([k, d]) => [k, { ...d, rows: undefined }])),
      activity: allOk ? activity.rows : null,
      events: allOk ? datasets.connection_events.rows : null,
      blocked_calculations: allOk ? [] : ['CFO and financial-impact calculations keep the last complete snapshot: this refresh is ' + (Object.values(datasets).some((d) => d.status === 'ok') ? 'partial' : 'failed')],
    };
    snapshot.content_hash = sha256(canonical({ a: snapshot.activity, e: snapshot.events }));
    await store.tx((s) => {
      s.insert('snapshots', snapshot.snapshot_id, snapshot);
      const metaKey = 'current_snapshot:' + sha256(canonical({ d: scope.dsp_key, p: scope.partner_ids, n: scope.network_ids }));
      if (snapshot.status === 'complete') {
        const prev = s.get('meta', metaKey);
        if (prev) s.update('meta', metaKey, () => ({ snapshot_id: snapshot.snapshot_id, previous: prev.snapshot_id, promoted_at: snapshot.refreshed_at }));
        else s.insert('meta', metaKey, { snapshot_id: snapshot.snapshot_id, previous: null, promoted_at: snapshot.refreshed_at });
      }
      s.update('refreshes', id, (j) => ({ ...j, state: snapshot.status === 'complete' ? 'succeeded' : snapshot.status, snapshot_id: snapshot.snapshot_id, datasets: snapshot.datasets }));
    });
    store.audit({ kind: 'refresh', action: 'refresh_finished', refresh_id: id, snapshot_id: snapshot.snapshot_id, status: snapshot.status, query_ids: Object.fromEntries(Object.entries(datasets).map(([k, d]) => [k, d.query_id ?? null])) });
    if (snapshot.status === 'complete') await onPromote(snapshot);
    return snapshot;
  }

  function get(user, id) {
    const j = store.get('refreshes', String(id));
    if (!j || !user.has('viewer') || !user.canSeePartner(j.scope.dsp_key) || !j.scope.network_ids.every((x) => user.canSeeNetwork(x))) throw new ContractError('not_found', 'Refresh not found');
    const snap = j.snapshot_id ? store.get('snapshots', j.snapshot_id) : null;
    return { refresh: j, snapshot: snap };
  }

  function current(user, scope) {
    if (!user.has('viewer') || !user.canSeePartner(scope.dsp_key) || !scope.network_ids.every((x) => user.canSeeNetwork(x))) throw new ContractError('forbidden', 'Scope is outside your authorisation');
    const key = 'current_snapshot:' + sha256(canonical({ d: scope.dsp_key, p: scope.partner_ids, n: scope.network_ids }));
    const m = store.get('meta', key);
    return m ? store.get('snapshots', m.snapshot_id) : null;
  }

  return { start, run, get, current };
}
