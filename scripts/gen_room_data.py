"""Writes src/lib/pitt/data.ts: the Disconnection Room's two data sets as literal typed arrays.

1. SYNTHETIC: 25 seeded networks across Amazon seats 437/489/490/491/492, three business units, and the demo
   scenarios A (ads.txt FAIL after the cut), B (IVT spike) and C (all PASS or NO_DATA, Amazon-specific drop).
   Every name says "(synthetic)"; owners are synthetic placeholders, not people.
2. REAL: the 21 Oct 2026 run (n8n Main MVP + Investigator v4.6) as posted in #thepittoutput at 4:55 PM, kept in
   scripts/run-2026-10-21-1655.json: Display.io, E-Planning LATAM, Vidazoo Intermediary. Cut seats, cut times and
   spend come from the Snowflake snapshot data/snowflake/amazon-spend-2026-10-21.json (alert view + daily DAY_DEMAND),
   converted to USD day by day with the snapshot's FX table, then summed. Drafts, reads and findings are not copied
   here: the case layer (src/lib/cases) owns them and rebuilds the drafts without RPMBr or source-currency amounts.

3. Optional SNOWFLAKE EXPORT: --csv DIR reads one CSV per array (column names = the data contract, see
   docs/disconnection-room.md) and adds it as a third data set. Empty cells become null, never 0.

Run: python3 scripts/gen_room_data.py [--run scripts/run-2026-10-21-1655.json] [--csv DIR --label "Export 21 Oct" --as-of 2026-10-21]"""
import argparse, csv, json, pathlib, random, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'src/lib/pitt/data.ts'
SEATS = {437: 'Amazon DSP AMER Display B', 489: 'Amazon DSP EMEA/APAC Display B', 490: 'Amazon DSP Native B', 491: 'Amazon DSP Video B', 492: 'Amazon DSP CTV B'}
CHECKS = ['ADS_TXT', 'SCO', 'BLOCKED_INVENTORY', 'IVT']
READINESS = ['content.genre', 'content.genres', 'content.contentrating', 'content.keywords', 'content.kwarray', 'content.id', 'video.plcmt', 'video.placement',
             'video.api', 'video.ext.orientation', 'app.content.url', 'imp.ext.gpid', 'imp.secure', 'regs.ext.agerange', 'regs.gpp', 'regs.gpp_sid', 'regs.us_privacy',
             'regs.ext.gdpr', 'regs.ext.gpc', 'device.lmt', 'device.dnt']
EVIDENCE = {'ADS_TXT': 'quality_checks.ads_txt.metrics.network_not_present_pct_post', 'SCO': 'quality_checks.sco.metrics.incomplete_pct_post',
            'BLOCKED_INVENTORY': 'quality_checks.blocked_inventory.metrics.total_blocked_entries', 'IVT': 'quality_checks.ivt.metrics.ivt_pct_post'}

# ---------------------------------------------------------------- synthetic
def synthetic():
    rnd = random.Random(20261021)
    as_of = '2026-10-21'
    from datetime import date, timedelta
    d0 = date(2026, 10, 21)
    names = ['Aurora Media', 'Blue Harbor', 'Cedar Lane', 'Driftwood Apps', 'Ember Video', 'Fjord News', 'Granite Games', 'Halcyon TV', 'Iris Weather',
             'Juniper Sports', 'Kestrel Travel', 'Lumen Kitchen', 'Meridian Finance', 'Nimbus Radio', 'Orchard Kids', 'Pinnacle Auto', 'Quarry Tech',
             'Riverbend Health', 'Saffron Style', 'Tidewater Music', 'Umber Books', 'Vantage Golf', 'Willow Home', 'Xenon Arcade', 'Yarrow Outdoors']
    bus = ['Direct Publishers', 'Sales Houses', 'Ad Networks']
    regions = ['US', 'EMEA', 'APAC', 'LATAM']
    scen = ['A'] * 8 + ['B'] * 8 + ['C'] * 9
    rnd.shuffle(scen)
    disc, nets, checks, traffic, funnels, invs, ready, saves = [], [], [], [], [], [], [], []
    days_list = [0, 0, 2, 3, 5, 6, 9, 12, 15, 18, 22, 27, 33, 41, 48, 55, 63, 72, 80, 88, 95, 102, 110, 118, 140]
    rnd.shuffle(days_list)
    for i, nm in enumerate(names):
        nid = 9100 + i
        s = scen[i]
        bu = bus[i % 3]
        region = regions[(i * 7) % 4]
        nets.append({'NETWORK_ID': nid, 'REGION': region})
        seats = rnd.sample(list(SEATS), rnd.choice([1, 1, 2, 2, 3]))
        days = days_list[i]
        cut = d0 - timedelta(days=days)
        hh, mm = rnd.randint(7, 18), rnd.choice([3, 11, 24, 38, 44, 52])
        reconnected = (i % 5 == 3) and days > 4
        for k, sid in enumerate(sorted(seats)):
            spend = None if (i in (6, 19) and k == 0) else round(rnd.lognormvariate(7.4, 1.1))
            disc.append({'PARTNER_ID': sid, 'PARTNER_NAME': SEATS[sid], 'PUBLISHER': nm + ' (synthetic)', 'NETWORK_ID': nid, 'BUSINESS_UNIT': bu,
                         'USERNAME': 'synthetic-owner-%02d' % (i % 6 + 1),
                         'CUT_AT': '%s %02d:%02d' % (cut.isoformat(), hh, mm),
                         'RECONNECTED_AT': ((cut + timedelta(days=rnd.randint(2, 4))).isoformat() + ' 10:00') if reconnected else None,
                         'SPEND_7D_BEFORE': spend})
        # checks
        for c in CHECKS:
            for w in ['BEFORE', 'AFTER']:
                if s == 'A' and c == 'ADS_TXT' and w == 'AFTER':
                    r, det = 'FAIL', '%.2f%% of auctions on ads.txt files without the Equativ line (rule: FAIL above 5%%)' % rnd.uniform(9, 40)
                elif s == 'B' and c == 'IVT' and w == 'AFTER':
                    r, det = 'FAIL', 'IVT %.1f%% of requests after the cut, %d spike day(s) (rule: FAIL above 2%%)' % (rnd.uniform(8, 19), rnd.randint(2, 5))
                else:
                    r = 'NO_DATA' if rnd.random() < 0.2 else 'PASS'
                    det = 'No rows in the window' if r == 'NO_DATA' else 'Within the TechOps threshold'
                checks.append({'network_id': nid, 'check': c, 'window': w, 'result': r, 'evidence_ref': 'syn-%d.%s.%s' % (nid, c.lower(), w.lower()), 'detail': det})
        # traffic
        if s == 'C':
            a, b = rnd.uniform(-6, 6), rnd.uniform(-95, -70)
        elif s == 'A':
            a, b = rnd.uniform(-12, 4), rnd.uniform(-90, -40)
        else:
            a, b = rnd.uniform(20, 60), rnd.uniform(-70, -30)
        base_a, base_b = rnd.randint(40, 900) * 1_000_000, rnd.randint(5, 300) * 1_000_000
        traffic.append({'network_id': nid, 'metric': 'network_auctions_per_day', 'partner_name': None, 'partner_ids': [], 'change_pct': round(a, 1),
                        'before': base_a, 'after': round(base_a * (1 + a / 100)), 'period': '14 days before vs after the cut (per day)', 'source': 'Synthetic'})
        traffic.append({'network_id': nid, 'metric': 'amazon_bid_requests_per_day', 'partner_name': 'Amazon DSP', 'partner_ids': sorted(seats), 'change_pct': round(b, 1),
                        'before': base_b, 'after': round(base_b * (1 + b / 100)), 'period': '14 days before vs after the cut (per day)', 'source': 'Synthetic'})
        # funnel
        au = rnd.randint(200, 2000) * 1_000_000
        br = round(au * rnd.uniform(0.35, 0.8)); bi = round(br * rnd.uniform(0.02, 0.12)); wi = round(bi * rnd.uniform(0.1, 0.4)); im = round(wi * rnd.uniform(0.8, 0.97))
        reasons = {
            'Bid requests': [('DiscardedByLimitator', 0.45), ('BlockedByPartnerSetupIncompatibleInventory', 0.3), ('Missing Required Buyer UID', 0.15), ('Blocked Partner', 0.1)],
            'Bids': [('No Bid', 0.85), ('Timeout', 0.1), ('Invalid response', 0.05)],
            'Wins': [('Lost to a higher bid', 0.7), ('Below floor', 0.25), ('Blocked advertiser', 0.05)],
            'Impressions': [('Not rendered', 0.7), ('Creative error', 0.3)],
        }
        if s == 'A':
            reasons['Bid requests'] = [('Blocked By Ads.Txt', 0.5)] + [(r, w * 0.5) for r, w in reasons['Bid requests']]
        drops = []
        for stage, prev, cur in [('Bid requests', au, br), ('Bids', br, bi), ('Wins', bi, wi), ('Impressions', wi, im)]:
            lost = prev - cur
            for r, w in reasons[stage]:
                drops.append({'stage': stage, 'reason': r, 'count': round(lost * w)})
        funnels.append({'network_id': nid, 'auctions': au, 'bid_requests': br, 'bids': bi, 'wins': wi, 'impressions': im, 'drop_reasons': drops})
        # investigation
        if s == 'A':
            hyps = [{'label': 'ads.txt no longer authorises Equativ after the cut', 'evidence_refs': ['syn-%d.ads_txt.after' % nid], 'missing_info': []},
                    {'label': 'Amazon commercial decision on the seat', 'evidence_refs': [], 'missing_info': ['Amazon account team confirmation']}]
        elif s == 'B':
            hyps = [{'label': 'IVT spike made the traffic unbuyable', 'evidence_refs': ['syn-%d.ivt.after' % nid], 'missing_info': ['IVT source (placements, bundles, IP ranges)']},
                    {'label': 'Supply mix change on the publisher side', 'evidence_refs': ['syn-%d.sco.after' % nid], 'missing_info': []}]
        else:
            hyps = [{'label': 'Amazon-side seat decision, not visible in Equativ data', 'evidence_refs': [], 'missing_info': ['Disconnection reason from Amazon', 'Seat-level Amazon targeting changes']},
                    {'label': 'Pricing or floor change on the publisher side', 'evidence_refs': ['syn-%d.sco.before' % nid], 'missing_info': ['Floor history for the 14 days before the cut']}]
            if i % 4 == 1:  # demo: a reference that does not exist in Checks -> "Unverified evidence"
                hyps[1]['evidence_refs'].append('syn-%d.floor_history' % nid)
        invs.append({'network_id': nid, 'hypotheses': hyps,
                     'draft_message': 'SYNTHETIC DRAFT. Hello, we observed that your network was disconnected from Amazon DSP on %s. We are checking the situation on our side and will follow up. Could you tell us whether anything changed on your side around that date?' % cut.isoformat(),
                     'validation': {'passed': i % 7 != 2, 'ai_output_accepted': i % 7 != 2, 'fallback_fields': ['publisher_message'] if i % 7 == 2 else []}})
        for sig in READINESS:
            p = rnd.random()
            pres = 'PRESENT' if p < 0.55 else 'ABSENT' if p < 0.8 else 'PARTIAL' if p < 0.9 else 'NO_DATA'
            ready.append({'network_id': nid, 'signal': sig, 'presence': pres, 'detail': None})
        if reconnected:
            saves.append({'network_id': nid, 'PUBLISHER': nm + ' (synthetic)', 'PARTNER_ID': sorted(seats)[0], 'kind': 'reconnected_after_fix',
                          'fixed_check': 'ADS_TXT' if s == 'A' else 'IVT' if s == 'B' else 'SCO', 'fixed_at': (cut + timedelta(days=1)).isoformat(), 'SPEND_7D': disc[-1]['SPEND_7D_BEFORE']})
    for j, nm in enumerate(['Zephyr Podcasts', 'Alder Recipes', 'Basalt Comics']):
        saves.append({'network_id': 9200 + j, 'PUBLISHER': nm + ' (synthetic)', 'PARTNER_ID': [437, 491, 492][j], 'kind': 'stayed_connected',
                      'fixed_check': ['ADS_TXT', 'IVT', 'SCO'][j], 'fixed_at': (d0 - timedelta(days=10 + 9 * j)).isoformat(), 'SPEND_7D': [4200, 1850, 760][j]})
    return {'id': 'synthetic', 'label': 'Synthetic demo data', 'synthetic': True, 'asOf': as_of,
            'currency': {'code': 'USD', 'symbol': '$', 'note': 'Synthetic figures generated directly in USD-like units; not real revenue and not converted.'},
            'source': 'Seeded generator scripts/gen_room_data.py (seed 20261021). Scenarios A = ads.txt FAIL after cut, B = IVT spike, C = all PASS or NO_DATA with an Amazon-specific drop.',
            'disconnections': disc, 'networks': nets, 'checks': checks, 'traffic': traffic, 'funnels': funnels, 'investigations': invs, 'readiness': ready, 'saves': saves}

# ---------------------------------------------------------------- real run (21 Oct 2026)
SNAP = json.loads((ROOT / 'data/snowflake/amazon-spend-2026-10-21.json').read_text())
EUR_PER_USD = SNAP['fx']['eur_per_usd']

def usd_week(nid, pid, cut_day):
    """Pre-cut week (7 days ending on the cut day): each day converted at its own rate, then summed."""
    from datetime import date, timedelta
    d1 = date.fromisoformat(cut_day)
    days = [(d1 - timedelta(days=k)).isoformat() for k in range(6, -1, -1)]
    total = 0.0
    for day in days:
        eur = sum(r['spend_eur'] for r in SNAP['daily'] if r['network_id'] == nid and r['partner_id'] == pid and r['day'] == day)
        if day not in EUR_PER_USD:
            return None
        total += eur / EUR_PER_USD[day]
    return round(total, 2)

def real(run):
    seat = lambda pid: SEATS[pid]
    pub = {5412: 'Display.io', 5449: 'E-Planning LATAM', 4883: 'Vidazoo Intermediary'}
    disc = [{'PARTNER_ID': c['partner_id'], 'PARTNER_NAME': seat(c['partner_id']), 'PUBLISHER': pub[c['network_id']], 'NETWORK_ID': c['network_id'],
             'BUSINESS_UNIT': None, 'USERNAME': None, 'CUT_AT': c['cut_at'], 'RECONNECTED_AT': None,
             'SPEND_7D_BEFORE': usd_week(c['network_id'], c['partner_id'], c['cut_at'][:10])} for c in SNAP['alert_cuts']]
    nets = [{'NETWORK_ID': 5412, 'REGION': 'US'}, {'NETWORK_ID': 5449, 'REGION': 'LATAM'}, {'NETWORK_ID': 4883, 'REGION': 'US'}]
    stated = {
        (5412, 'ADS_TXT', 'AFTER'): ('FAIL', '26.24% of auctions on ads.txt files without the Equativ line (TechOps rule: FAIL above 5%)'),
        (5449, 'ADS_TXT', 'AFTER'): ('FAIL', '7.61% of auctions on ads.txt files without the Equativ line (TechOps rule: FAIL above 5%)'),
        (4883, 'IVT', 'AFTER'): ('FAIL', 'IVT 4.08% / SIVT 0.72% of requests after the cut (TechOps rule: IVT above 2% = FAIL)'),
    }
    checks = []
    for nid in (5412, 5449, 4883):
        for c in CHECKS:
            for w in ['BEFORE', 'AFTER']:
                r, det = stated.get((nid, c, w), ('NO_DATA', 'Not stated in the 21 Oct run'))
                checks.append({'network_id': nid, 'check': c, 'window': w, 'result': r, 'evidence_ref': EVIDENCE[c] if (nid, c, w) in stated else 'run-2026-10-21.%d.%s.%s' % (nid, c.lower(), w.lower()), 'detail': det})
    wk = lambda nid, pid, a, b: round(sum(r['spend_eur'] / EUR_PER_USD[r['day']] for r in SNAP['daily'] if r['network_id'] == nid and r['partner_id'] == pid and a <= r['day'] <= b), 2)
    traffic = [
        {'network_id': 4883, 'metric': 'amazon_spend_per_week_usd', 'partner_name': seat(491), 'partner_ids': [491], 'change_pct': None,
         'before': wk(4883, 491, '2026-10-06', '2026-10-12'), 'after': wk(4883, 491, '2026-10-13', '2026-10-19'),
         'period': '6–12 Oct vs 13–19 Oct (USD, converted per day)', 'source': 'Snowflake DAY_DEMAND, read 22 Oct 2026'},
    ]
    cases = run['cases']
    invs = [{'network_id': nid, 'hypotheses': [{'label': cases[str(nid)]['hypothesis'], 'evidence_refs': ['TOPS-11471'], 'missing_info': ['Verify: ' + cases[str(nid)]['verify']]}],
             'draft_message': None, 'meta': cases[str(nid)]['meta'],
             'validation': {'passed': None, 'ai_output_accepted': None, 'fallback_fields': None}} for nid in (5412, 5449, 4883)]
    ready = []
    for nid in (5412, 5449, 4883):
        for sig in READINESS:
            if nid == 5412 and sig == 'imp.ext.gpid':
                ready.append({'network_id': nid, 'signal': sig, 'presence': 'PARTIAL', 'detail': 'GPID on 0.1% of requests to seat 489 and 0% to seat 491 (43% and 32.9% on App elsewhere)'})
            else:
                ready.append({'network_id': nid, 'signal': sig, 'presence': 'NO_DATA', 'detail': None})
    return {'id': 'run-2026-10-21', 'label': 'Real run · 21 Oct 2026, 4:55 PM', 'synthetic': False, 'asOf': '2026-10-21',
            'currency': {'code': 'USD', 'symbol': '$', 'note': 'USD: source EUR (DAY_DEMAND, documented in Euro) converted day by day with ANALYTICS.PUBLIC.MAPPING_CURRENCY_RATE_HIST, then summed. A run rate, not a confirmed loss.'},
            'source': run['source'] + ' Seats and spend: Snowflake snapshot read 22 Oct 2026.', 'headline': None,
            'disconnections': disc, 'networks': nets, 'checks': checks, 'traffic': traffic, 'funnels': [], 'investigations': invs, 'readiness': ready, 'saves': []}

# ---------------------------------------------------------------- Snowflake CSV export
ENUMS = {'check': set(CHECKS), 'window': {'BEFORE', 'AFTER'}, 'result': {'PASS', 'FAIL', 'NO_DATA'}, 'presence': {'PRESENT', 'ABSENT', 'PARTIAL', 'NO_DATA'},
         'kind': {'stayed_connected', 'reconnected_after_fix'}, 'fixed_check': set(CHECKS)}

def read_csv(d, name, required, cols, optional=False):
    f = d / name
    if not f.exists():
        if optional:
            return []
        sys.exit('missing ' + str(f))
    with f.open(newline='', encoding='utf-8') as h:
        rows = list(csv.DictReader(h))
    if rows and not set(required) <= set(rows[0].keys()):
        sys.exit(name + ': missing columns ' + ', '.join(sorted(set(required) - set(rows[0].keys()))))
    out = []
    for i, r in enumerate(rows, 2):
        o = {}
        for c, kind in cols.items():
            v = (r.get(c) or '').strip()
            if v == '' or v.upper() == 'NULL':
                o[c] = [] if kind == 'ids' else None
            elif kind == 'int':
                o[c] = int(float(v))
            elif kind == 'num':
                o[c] = float(v)
            elif kind == 'ids':
                o[c] = [int(x) for x in re.split(r'[|;, ]+', v) if x]
            else:
                o[c] = v
            if c in ENUMS and o[c] is not None and o[c] not in ENUMS[c]:
                sys.exit('%s line %d: %s=%r is not one of %s' % (name, i, c, o[c], sorted(ENUMS[c])))
        out.append(o)
    return out

def from_csv(d, label, as_of):
    d = pathlib.Path(d)
    disc = read_csv(d, 'disconnections.csv', ['PARTNER_ID', 'PARTNER_NAME', 'PUBLISHER', 'NETWORK_ID', 'CUT_AT'],
                    {'PARTNER_ID': 'int', 'PARTNER_NAME': 'str', 'PUBLISHER': 'str', 'NETWORK_ID': 'int', 'BUSINESS_UNIT': 'str', 'USERNAME': 'str', 'CUT_AT': 'str', 'RECONNECTED_AT': 'str', 'SPEND_7D_BEFORE': 'num'})
    # STR publishers are being sunset and are not analysed.
    disc = [r for r in disc if not re.search(r'(^|\s)STR(\s|$)', r['PUBLISHER'] or '')]
    for r in disc:
        r['CUT_AT'] = r['CUT_AT'][:16].replace('T', ' ')
        if r['RECONNECTED_AT'] and r['RECONNECTED_AT'].startswith('2099'):
            r['RECONNECTED_AT'] = None  # the alert view stores open cuts as 2099-...: still disconnected
        # EUR -> USD at the cut-day rate; no rate for that day = No data (never a guessed rate).
        rate = EUR_PER_USD.get(r['CUT_AT'][:10])
        r['SPEND_7D_BEFORE'] = None if r['SPEND_7D_BEFORE'] is None or rate is None else round(r['SPEND_7D_BEFORE'] / rate, 2)
    nets = read_csv(d, 'networks.csv', ['NETWORK_ID'], {'NETWORK_ID': 'int', 'REGION': 'str'}, optional=True)
    checks = read_csv(d, 'checks.csv', ['network_id', 'check', 'window', 'result'], {'network_id': 'int', 'check': 'str', 'window': 'str', 'result': 'str', 'evidence_ref': 'str', 'detail': 'str'}, optional=True)
    for c in checks:
        c['evidence_ref'] = c['evidence_ref'] or ''
        c['detail'] = c['detail'] or ''
    traffic = read_csv(d, 'traffic.csv', ['network_id', 'metric'], {'network_id': 'int', 'metric': 'str', 'partner_name': 'str', 'partner_ids': 'ids', 'change_pct': 'num', 'before': 'num', 'after': 'num', 'period': 'str', 'source': 'str'}, optional=True)
    for t in traffic:
        t['period'] = t['period'] or ''
        t['source'] = t['source'] or 'Snowflake export'
    funnels = read_csv(d, 'funnels.csv', ['network_id'], {'network_id': 'int', 'auctions': 'num', 'bid_requests': 'num', 'bids': 'num', 'wins': 'num', 'impressions': 'num'}, optional=True)
    drops = read_csv(d, 'drop_reasons.csv', ['network_id', 'stage', 'reason', 'count'], {'network_id': 'int', 'stage': 'str', 'reason': 'str', 'count': 'num'}, optional=True)
    for f in funnels:
        f['drop_reasons'] = [{'stage': x['stage'], 'reason': x['reason'], 'count': x['count']} for x in drops if x['network_id'] == f['network_id']]
    inv_file = d / 'investigations.json'
    invs = json.loads(inv_file.read_text(encoding='utf-8')) if inv_file.exists() else []
    ready = read_csv(d, 'readiness.csv', ['network_id', 'signal', 'presence'], {'network_id': 'int', 'signal': 'str', 'presence': 'str', 'detail': 'str'}, optional=True)
    saves = read_csv(d, 'saves.csv', ['network_id', 'PUBLISHER', 'PARTNER_ID', 'kind', 'fixed_check', 'fixed_at'],
                     {'network_id': 'int', 'PUBLISHER': 'str', 'PARTNER_ID': 'int', 'kind': 'str', 'fixed_check': 'str', 'fixed_at': 'str', 'SPEND_7D': 'num'}, optional=True)
    return {'id': 'export', 'label': label, 'synthetic': False, 'asOf': as_of,
            'currency': {'code': 'USD', 'symbol': '$', 'note': 'SPEND_7D_BEFORE exported in EUR, converted at the cut-day rate of the snapshot FX table (no daily detail); rows without a rate show No data.'},
            'source': 'Snowflake CSV export in ' + d.name, 'disconnections': disc, 'networks': nets, 'checks': checks, 'traffic': traffic,
            'funnels': funnels, 'investigations': invs, 'readiness': ready, 'saves': saves}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', default=str(ROOT / 'scripts/run-2026-10-21-1655.json'))
    ap.add_argument('--csv')
    ap.add_argument('--label', default='Snowflake export')
    ap.add_argument('--as-of', dest='as_of')
    a = ap.parse_args()
    run_src = json.loads(pathlib.Path(a.run).read_text(encoding='utf-8'))
    syn, run = synthetic(), real(run_src)
    export = None
    if a.csv:
        from datetime import date
        export = from_csv(a.csv, a.label, a.as_of or date.today().isoformat())
    body = [
        '/**',
        ' * The Disconnection Room data: every number the Room shows comes from these arrays or is derived in engine.ts.',
        ' * GENERATED by scripts/gen_room_data.py. Edit the generator (or replace the arrays with a Snowflake export, see',
        ' * docs/disconnection-room.md), not this file by hand.',
        ' */',
        "import type { Dataset } from './types.ts';",
        '',
        'export const SYNTHETIC: Dataset = ' + json.dumps(syn, ensure_ascii=False, indent=1) + ';',
        '',
        'export const RUN_2026_10_21: Dataset = ' + json.dumps(run, ensure_ascii=False, indent=1) + ';',
        '',
        *(['export const EXPORT: Dataset = ' + json.dumps(export, ensure_ascii=False, indent=1) + ';', ''] if export else []),
        '/** First entry = the data set the Room opens on: the latest real run. */',
        'export const DATASETS: Dataset[] = [RUN_2026_10_21, SYNTHETIC' + (', EXPORT' if export else '') + '];',
        '',
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('\n'.join(body), encoding='utf-8')
    print('wrote', OUT, '| synthetic rows', len(syn['disconnections']), 'networks', len(syn['networks']), '| real rows', len(run['disconnections']), '| drafts', sum(1 for i in run['investigations'] if i['draft_message']),
          '| export rows', len(export['disconnections']) if export else 0)

if __name__ == '__main__':
    main()
