"""Generate src/lib/finance/snapshot.data.ts and provenance.data.ts from executed Snowflake query results.

Every number in the generated files comes from a saved query result (scratchpad/q/<query_id>.json); nothing is typed by hand.
"""
import json, sys, os

Q = sys.argv[1]
OUT = sys.argv[2]


def load(qid):
    return json.load(open(os.path.join(Q, qid + '.json')))


def rows(qid):
    d = load(qid)
    rs = d['result']['result_set']
    names = [c['name'] for c in rs['resultSetMetaData']['rowType']]
    return [dict(zip(names, r)) for r in rs['data']]


def n(x):
    if x is None or x == '':
        return 'null'
    v = float(x)
    if v == int(v) and abs(v) < 2**53:
        return str(int(v))
    return repr(round(v, 6))


def day(x):
    return x[:10]


# Query registry: (key, query_id, title, sql file, purpose)
REG = [
    ('tables', '01c7de4e-020c-f8bc-0000-08896b330016', 'Candidate activity tables and the connection-history table', '01_source_dictionary.sql', 'Existence, row count and last_altered of each source'),
    ('columnsHub', '01c7de52-020c-f8bb-0000-08896b32dc5e', 'Column list of DAY_DEMAND, DAY_SCO_NODES, MONTH_DEMAND, MONTH_SCO_NODES', '01_source_dictionary.sql', 'Real column names before any query is written'),
    ('commentsSco', '01c7de4e-020c-f8bb-0000-08896b32d9ee', 'Column comments on SCO-node tables', '01_source_dictionary.sql', 'Metric units, currency and timezone as documented in the warehouse'),
    ('commentsSupplyScd', '01c7de54-020c-f8bc-0000-08896b3302fe', 'Column comments on DAY_SUPPLY and the connection SCD', '01_source_dictionary.sql', 'Impression type and inventory legends; documented blocking-reason legend; SCD timestamps carry no timezone'),
    ('demandVsSco', '01c7de4e-020c-f86c-0000-08896b32f21e', 'MONTH_DEMAND vs MONTH_SCO_NODES, partner 437, September 2026', '01_source_dictionary.sql', 'Fan-out check between the two grains, and DSP-currency total'),
    ('mix437', '01c7de52-020c-f8bc-0000-08896b33029a', 'Impression type and inventory mix, partner 437, September 2026', '01_source_dictionary.sql', 'Confirms 437 is Banner (impression type 0) only'),
    ('coverageSco', '01c7de51-020c-f8bd-0000-08896b331022', 'DAY_SCO_NODES coverage for partner 437', '03_daily_endpoint_activity.sql', 'Daily retention actually available'),
    ('coverageDemand', '01c7de52-020c-f86c-0000-08896b32f39a', 'DAY_DEMAND coverage for partner 437', '03_daily_endpoint_activity.sql', 'Daily retention actually available'),
    ('episodes5100', '01c7de56-020c-f8bb-0000-08896b32df0e', 'Connection episodes, network 5100 × Amazon variants', '02_connection_episodes.sql', 'Actual state transitions, actor and exact comments'),
    ('alertDdl', '01c7de55-020c-f8bb-0000-08896b32ddf6', 'Definition of VIEW_DISCONNECTION_ALERT_365DAYS', '02_connection_episodes.sql', 'How the workflow’s “7 days before” revenue window is computed'),
    ('daily437All', '01c7de52-020c-f8bd-0000-08896b331142', 'Daily partner 437 activity, all networks', '03_daily_endpoint_activity.sql', 'All-row daily series'),
    ('daily437Visible', '01c7de57-020c-f8bc-0000-08896b33040e', 'Daily partner 437 activity, visible BOTH + INTERMEDIARY view', '03_daily_endpoint_activity.sql', 'Portfolio daily baseline'),
    ('seatDaily5100', '01c7de54-020c-f8bd-0000-08896b331276', 'Daily Amazon activity on network 5100 by partner', '03_daily_endpoint_activity.sql', 'Investigation-scope daily series per seat'),
    ('networkDaily', '01c7de55-020c-f86c-0000-08896b32f552', 'Daily all-DSP and Amazon spend, networks 5100 and 5524', '04_daily_publisher_supply.sql', 'Supply-path comparison (demand grain, one row per day and network)'),
    ('preCutWindow', '01c7de55-020c-f8bc-0000-08896b330382', 'Amazon spend on 5100 by seat, full days 2026-09-18 to 2026-09-24', '07_incident_event_study.sql', 'Full-day pre-cut window, compared with the alert view window'),
    ('funnel437', '01c7de56-020c-f8bc-0000-08896b3303fe', 'Partner 437 funnel totals, September 2026', '06_publisher_baseline.sql', 'Bid requests → bids → wins → impressions'),
    ('baseline437', '01c7dd3c-020c-ed74-0000-08896b2c8e5a', 'Workbook reconciliation, visible view, September 2026', '06_publisher_baseline.sql', 'Rows, positive / zero spend, pooled and median RPMBr, top-16 share'),
    ('allRows437', '01c7dd40-020c-ec72-0000-08896b2cda52', 'All-row check, partner 437, September 2026', '06_publisher_baseline.sql', '861 networks; spend 7,228,721.11'),
    ('cohort437', '01c7de56-020c-f8bd-0000-08896b3314be', 'Partner 437 disconnections with 30 days of follow-up, by blocking reason', '09_recovery_outcomes.sql', 'Reconnection outcomes including unresolved cuts'),
    ('reasonCounts', '01c7dd5e-020c-ec72-0000-08896b2dd60e', 'Blocking-reason frequency in the connection SCD, 2026', '02_connection_episodes.sql', 'Which codes are used and with what comments'),
]

FAILED = [
    {'key': 'supplyDaily', 'title': 'DAY_SUPPLY daily auctions and spend, networks 5100 and 5524', 'file': '04_daily_publisher_supply.sql',
     'executedAt': '2026-10-21', 'error': 'Timed out after 60 s (connector limit). No rows were returned; nothing was substituted.'},
    {'key': 'coverageAll', 'title': 'MIN/MAX day across DAY_SCO_NODES, DAY_DEMAND and MONTH_SCO_NODES in one statement', 'file': '03_daily_endpoint_activity.sql',
     'executedAt': '2026-10-21', 'error': 'Timed out after 60 s. Re-run as two filtered queries (coverageSco, coverageDemand).'},
]

out = []
out.append('/* Generated by scripts/gen_finance.py from saved Snowflake results. Do not edit by hand. */\n')
out.append("import type { QueryRecord } from './provenance.ts';\n")

recs = []
for key, qid, title, f, purpose in REG:
    d = load(qid)
    rs = d['result']['result_set']
    recs.append({'key': key, 'queryId': qid, 'title': title, 'file': f, 'purpose': purpose,
                 'executedAt': d['ts'][:19] + 'Z', 'rowCount': rs['resultSetMetaData']['numRows'],
                 'sql': d['sql'], 'status': 'ok', 'server': 'Snowflake role data analyst'})
for f in FAILED:
    recs.append({**f, 'queryId': None, 'rowCount': None, 'sql': None, 'status': 'failed', 'purpose': '', 'server': 'Snowflake role data analyst'})
out.append('export const QUERY_LOG: QueryRecord[] = ' + json.dumps(recs, indent=1, ensure_ascii=False) + ';\n')

# Daily portfolio series
vis = {r['DAY']: r for r in rows('01c7de57-020c-f8bc-0000-08896b33040e')}
allr = {day(r['DAY']): r for r in rows('01c7de52-020c-f8bd-0000-08896b331142')}
out.append('/** Partner 437 by UTC day. [day, visible bid requests, visible spend, visible networks, all-row bid requests, all-row spend] */')
out.append('export const PORTFOLIO_DAILY_RAW: [string, number, number, number, number, number][] = [')
for d_ in sorted(vis):
    v = vis[d_]; a = allr[d_]
    out.append(f"  ['{d_}', {n(v['VISIBLE_BR'])}, {n(v['VISIBLE_SPEND'])}, {n(v['VISIBLE_NETWORKS'])}, {n(a['BR'])}, {n(a['SPEND'])}],")
out.append('];\n')

# Seat daily on 5100
out.append('/** Network 5100 × Amazon variants by UTC day; a missing (day, partner) means no row in DAY_SCO_NODES. [day, partner, bid requests, bids, impressions, spend] */')
out.append('export const SEAT_DAILY_RAW: [string, number, number, number, number, number][] = [')
for r in rows('01c7de54-020c-f8bd-0000-08896b331276'):
    out.append(f"  ['{day(r['DAY'])}', {r['PARTNER_ID']}, {n(r['BR'])}, {n(r['BIDS'])}, {n(r['IMPS'])}, {n(r['SPEND'])}],")
out.append('];\n')

out.append('/** DAY_DEMAND by UTC day for networks 5100 and 5524. [day, network, all-DSP spend, Amazon-variant spend] */')
out.append('export const NETWORK_DAILY_RAW: [string, number, number, number][] = [')
for r in rows('01c7de55-020c-f86c-0000-08896b32f552'):
    out.append(f"  ['{day(r['DAY'])}', {r['NETWORK_ID']}, {n(r['SPEND'])}, {n(r['AMAZON_SPEND'])}],")
out.append('];\n')

out.append('/** MAPPING_NETWORK_PARTNER_CONNECTION_SCD rows for 5100 × Amazon. Timestamps are TIMESTAMP_NTZ with no documented zone. */')
out.append('export const EPISODES_5100 = [')
for r in rows('01c7de56-020c-f8bb-0000-08896b32df0e'):
    out.append('  ' + json.dumps({'start': r['START_DATE'], 'end': r['END_DATE'] or None, 'partnerId': int(r['PARTNER_ID']),
                                   'reason': int(r['BLOCKING_REASON']), 'comment': r['COMMENT'] or '', 'by': r['LASTUPDATEDBY']}) + ',')
out.append('] as const;\n')

pre = {r['PARTNER_ID']: r for r in rows('01c7de55-020c-f8bc-0000-08896b330382')}
out.append('/** Full UTC days 2026-09-18..24, DAY_DEMAND, network 5100. */')
out.append('export const PRE_CUT_FULL_DAYS = ' + json.dumps({int(k): {'spend': float(v['SPEND']), 'dspCurrencySpend': float(v['SPEND_DSP_CCY']), 'equativNet': float(v['EQT_NET'])} for k, v in pre.items()}) + ';\n')

f = rows('01c7de56-020c-f8bc-0000-08896b3303fe')[0]
out.append('export const FUNNEL_437_SEP = ' + json.dumps({'bidRequests': int(f['BR']), 'bids': int(f['BIDS']), 'wins': int(f['WINS']), 'clientSideWinningBids': int(f['CS_WINNING_BIDS']),
                                                         'impressions': int(f['IMPS']), 'auctions': int(f['AUCTIONS']), 'spend': float(f['SPEND']), 'impressionTypes': int(f['IMP_TYPES']), 'impressionType': int(f['IMP_TYPE'])}) + ';\n')

out.append('export const MIX_437_SEP = ' + json.dumps([{'impressionType': int(r['IMPRESSION_TYPE']), 'inventory': int(r['INVENTORY']), 'impressions': int(r['IMPS']), 'spend': float(r['SPEND']), 'dspCurrencySpend': float(r['SPEND_DSP'])} for r in rows('01c7de52-020c-f8bc-0000-08896b33029a')]) + ';\n')

out.append('/** Partner 437 cuts that started 2025-10-19..2026-09-18 (so each has at least 30 days of follow-up), from a connected state. */')
out.append('export const COHORT_437 = ' + json.dumps([{'reason': int(r['BLOCKING_REASON']), 'cuts': int(r['CUTS_WITH_30D_FOLLOWUP']), 'reconnected30d': int(r['RECONNECTED_30D']),
                                                      'reconnectedLater': int(r['RECONNECTED_LATER']), 'stillDisconnected': int(r['STILL_DISCONNECTED']), 'changedToOtherBlock': int(r['CHANGED_TO_OTHER_BLOCK'])} for r in rows('01c7de56-020c-f8bd-0000-08896b3314be')]) + ';\n')

b = rows('01c7dd3c-020c-ed74-0000-08896b2c8e5a')[0]
vals = list(b.values())
out.append('/** Visible view, September 2026 (MONTH_SCO_NODES + sellers.json). */')
out.append('export const BASELINE_437_SEP = ' + json.dumps({'rows': int(vals[0]), 'positive': int(vals[1]), 'zeroOrNegative': int(vals[2]), 'bidRequests': int(vals[3]), 'spend': float(vals[4]),
                                                          'pooledRpmbr': float(vals[5]), 'medianPositiveRpmbr': float(vals[6]), 'top16SharePct': float(vals[7]), 'untypedNetworks': int(vals[8])}) + ';\n')

cs = rows('01c7de51-020c-f8bd-0000-08896b331022')[0]
cd = rows('01c7de52-020c-f86c-0000-08896b32f39a')[0]
out.append('export const COVERAGE = ' + json.dumps({'DAY_SCO_NODES': {'from': day(cs['MIN_DAY']), 'to': day(cs['MAX_DAY']), 'days': int(cs['DAYS'])},
                                                  'DAY_DEMAND': {'from': day(cd['MIN_DAY']), 'to': day(cd['MAX_DAY']), 'days': int(cd['DAYS'])}}) + ';\n')

open(OUT, 'w').write('\n'.join(out))
print('wrote', OUT, len('\n'.join(out)))

# SQL text per file, for the sql/ directory
by_file = {}
for r in recs:
    if r['sql']:
        by_file.setdefault(r['file'], []).append(r)
json.dump(by_file, open(os.path.join(os.path.dirname(Q), 'sql_by_file.json'), 'w'), indent=1)
