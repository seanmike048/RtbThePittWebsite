# The Pitt: financial impact upgrade

Data audit, reconciliation, model and handover for the **Financial impact** tab. Snowflake reads: 2026-10-20 and 2026-10-21, read-only, role "Snowflake role data analyst". The data is complete through 2026-10-19 (UTC days).

## 1. What was inspected

- **Repository** (`seanmike048/RtbThePittWebsite`):
  - Vite 7, React 19, TypeScript, Tailwind v4.
  - `npm run build`, `npm test` (node:test), `npm start` (`server.mjs`, Firebase App Hosting).
- **HTML reference "The Pitt · RTB Command Center.html":**
  - It was **not attached** to this session; only `rtb-command-center.zip` and the analytics HTML were.
  - The asset names it references (`index-*.js/css`) are this repository's own Vite build, so the editable source is this repository.
  - No unseen tabs or handlers are claimed as inspected.
- **Existing tabs, all kept working** (checked in the browser): Investigations, At risk, CFO impact · 437.
- **The n8n investigation:**
  - Kept verbatim (`src/lib/investigations/tubi5100.ts`).
  - Ingested with a SHA-256 content hash, ingestion time and parser version (`src/lib/finance/evidence.ts`).
  - The workflow supplied no execution ID or workflow version, and none is invented.

## 2. Evidence reconciliation (case #5100)

### Seven-day revenue

| Item | Value | Source |
|---|---|---|
| Workflow "revenue in the 7 days before" | 16,037 | Narrative (currency unverified) |
| 492 Amazon DSP CTV B | 11,267.006179 | `VIEW_DISCONNECTION_ALERT_365DAYS` |
| 491 Amazon DSP Video B | 4,770.186127 | same |
| 437 / 489 / 490 | 0.00 | same |
| 11,267.01 + 4,770.19 | **16,037.20** | sum of the displayed values |
| Detailed sum | 16,037.192306 | rounds to the workflow's 16,037 (difference to the displayed sum: 0.20) |
| Full UTC days 2026-09-18 … 24, same seats | **18,076.61** | `DAY_DEMAND`, query `01c7de55-020c-f8bc-0000-08896b330382` |

The alert view compares `DAY >= cut − 7 days AND DAY <= cut` with an 08:11 timestamp. Its DDL was read with query `01c7de55-020c-f8bb-0000-08896b32ddf6`. So the "7 days" are **UTC days 19–25 September**: the window includes the partial cut day and leaves out 18 September. Both windows are shown, and neither replaces the other.

**Endpoint 437 Display gets 0.00 from this case.** Partner 437 had no rows on network 5100 from 2026-09-06 onwards. The 16,037 belongs to CTV B and Video B. There is a test for this.

### Cause: source conflict, unreviewed

The two sources disagree:

- **Workflow:** "Commercial or seat-level DSP cut" (not confirmed).
- **Connection log** (`MAPPING_NETWORK_PARTNER_CONNECTION_SCD`, query `01c7de56-020c-f8bb-0000-08896b32df0e`):
  - All five seats went from reason 0 to reason **1 "Other"** at `2026-09-25 08:11:12`. The SCD timestamp has no zone.
  - Comment: **"Reauct phase out"**. Set by an Equativ user.
  - The previous connected states were labelled "All Publisher Test", "Test All Publishers", "Testing All Traffic", "All Ads.txt List" and "All Publisher Test 2".

Human approval of the workflow does not settle this. The case is flagged **Recoverability requires review**. It is excluded from the approved recoverable aggregate, which is shown as *Unavailable* (not 0), while the 16,037.19 stays visible for diagnosis.

### Other assertions

- **Reason-code legend:** it is documented in the column comment: 0 Connected, 1 Other, 2 LowProfitabilityBidder, 3 LowProfitabilityEquativ, 4 QualityIssueBidder, 5 QualityIssuePublisher, 6 DirectIntegrationBidder. The app now uses it instead of the earlier "observed" labels.
- **Network 5524 "Tubi":** publisher identity and inventory overlap with 5100 are not verified (the earlier "same publisher" wording was removed).
  - #5524 all-DSP spend rose after the cut, while its Amazon spend stayed near zero apart from 21–24 September.
  - #5100 also lost non-Amazon demand, and has no rows after 2026-10-14.
  - Nothing is credited to recovery or to The Pitt.
- **Quality figures not revalidated:** the 75.68% (BlockedByPartnerSetupIncompatibleInventory) and 19.66% (uncrawled ads.txt) figures, and the four PASS checks. No filtering source table was found (query `01c7dd5d-020c-ecd8-0000-08896b2daa66`).

## 3. Source dictionary (verified)

| Field | Meaning (warehouse comment) |
|---|---|
| `DAY` | Day of activity, **in UTC** |
| `BID_REQUESTS` (SCO-node tables only) | Bid requests sent by Equativ to DSPs |
| `TOTAL_PAID_PRICE_TRUE_COUNT` | "Price paid by winning DSPs **in Euro**" (DAY_*); "Gross paid price in EUR" (MONTH_SCO_NODES) |
| `TOTAL_PAID_PRICE_DSP_CURRENCY_TRUE_COUNT` | Same in DSP currency (437, September 2026: 8,322,782.16 vs 7,228,721.12) |
| `IMPRESSION_TYPE` | 0 Banner, 1 VideoInStream, 2 Native, 3 VideoOutStream, 4 Unknown, 5 Audio (437 = type 0 only) |
| `INVENTORY` | 0 Desktop, 1 Mobile web, 2 In-app |
| `PARTNER_ID` | DSP endpoint / seat: 437 AMER Display B, 489 EMEA/APAC Display B, 490 Native B, 491 Video B, 492 CTV B |
| `NETWORK_ID` | Network / publisher that provided the inventory |
| SCD `START_DATE` / `END_DATE` | `TIMESTAMP_NTZ`, no zone documented |

**Currency:** the warehouse documents Euro, but the workbook shows "$". The app labels every amount as *source currency units (SCU)*, shows "Source-documented EUR · not Finance-validated", and blocks official totals, ROI and NPV until Finance validates the currency.

**Grain:** `MONTH_DEMAND` and `MONTH_SCO_NODES` agree for 437 in September. Spend is within 0.007 and impressions are identical, so there is no fan-out at partner-month level. Auctions are on a different grain (26.5 B, fewer than the 79.8 B bids), so they are left out of the funnel.

**Coverage:**

- `DAY_SCO_NODES` for 437: 2026-09-06 → 2026-10-19 (44 days).
- `DAY_DEMAND`: 2026-08-17 → 2026-10-19 (64 days).
- 90 pre-incident days are **not** available.
- `DAY_SUPPLY` timed out (60 s), so it is shown as a failed query and nothing is substituted.

**Workbook reconciliation** (visible BOTH + INTERMEDIARY view, September 2026, `01c7dd3c-020c-ed74-0000-08896b2c8e5a`):

- 317 rows (the workbook has 316), 205 positive.
- Spend 7,141,421.72, bid requests 198,617,854,478.
- Pooled RPMBr 35.9556, median positive RPMBr 12.27, top-16 share 80.44%.

The full availability matrix is in the app (Appendix → Data availability matrix) and in `src/lib/finance/availability.ts`.

## 4. Model (`src/lib/finance/`)

| Module | Contents |
|---|---|
| `values.ts` | Value states. *Zero, negative, missing, excluded, unavailable* are distinct; missing days never render as 0. |
| `currency.ts` | Currency status and gating. Unknown currencies never sum, and symbols appear only when Finance has validated the currency. |
| `metrics.ts` | RPMBr = spend ÷ bid requests × 1,000,000. Pooled = Σ ÷ Σ. A zero denominator is *unavailable*. |
| `scenario.ts` | The daily model and its supporting functions (below). |
| `baseline.ts` | Observed series and the no-intervention projection (below). |
| `effort.ts` | Net hours released per task (negatives kept), capacity value apart from cash, and one case = one investigation. |
| `cashflow.ts` | Net benefit, ROI, payback ("Not reached within modeled horizon"), NPV and IRR (exactly one sign change). Blocked until Finance supplies currency, contribution and costs. |
| `evidence.ts` | Immutable ingestion, revenue reconciliation, claims and conflicts, recoverability, and the approved aggregate. |
| `assumptions.ts` | Blank defaults and labelled illustrative values; a strict parser for saved scenarios (an "approved" state cannot be forged); export without e-mail addresses. |
| `provenance.ts`, `snapshot.data.ts` | Every executed query with its ID, time, row count and SQL. `snapshot.data.ts` is generated by `scripts/gen_finance.py`. |
| `live.ts` | Three fixed read-only refresh queries (no viewer SQL). A failed refresh keeps the snapshot. |

**Daily model** (`scenario.ts`):

- S0 = B0 × Y0 / 1e6.
- B1 = B0 + q × max(Btarget − B0, 0) × r.
- S1 = B1 × Y1 / 1e6.
- E = S0 + p × (S1 − S0); p is applied once.
- Volume + yield + interaction = S1 − S0, exactly.
- Spend-gap mode is used when yield is undefined; that is the case scope, where the seats have zero bid requests.
- Horizons: 7 / 14 / 30 / 90 days and 12 calendar months. A horizon the projection does not cover is unavailable.
- Faster-resolution value is reported as "of which", never added.
- One-factor tornado.

**No-intervention projection** (`baseline.ts`): the same-weekday mean of the last 28 complete days. It is a run-rate scenario, not a forecast. With fewer than 28 consecutive complete days the projection is unavailable: "Forecast unavailable because historical time series data is insufficient."

**Tests:** `src/lib/finance/finance.test.ts` covers every §12 acceptance test. Run `npm test` (44 tests: 23 finance acceptance and identity tests, 21 existing).

## 5. SQL deliverables (`sql/`)

| File | Status |
|---|---|
| 01_source_dictionary | Executed (6 statements) |
| 02_connection_episodes | Executed (3) |
| 03_daily_endpoint_activity | Executed (5) |
| 04_daily_publisher_supply | Executed (1, DAY_DEMAND) + **failed** DAY_SUPPLY template |
| 05_quality_and_filtering | **Template**: no source found |
| 06_publisher_baseline | Executed (3) + the canonical `scoped_daily` contract template |
| 07_incident_event_study | Executed (1) + same-weekday template |
| 08_workflow_effort | **Template**: no source |
| 09_recovery_outcomes | Executed (1) |
| 10_scenario_inputs | **Template**: no approved inputs exist |

Every executed statement is verbatim, with its Snowflake query ID, execution time and row count. `scripts/gen_sql.py` regenerates the files.

## 6. Handover

### What changed

- **New Financial impact tab.** It covers both scopes (Portfolio · 437 Display and Investigation · #5100) and has:
  - a sticky scope bar with currency and freshness, an evidence strip and an executive row;
  - the P0 charts (spend after resolution, cumulative incremental, incident timeline, baseline / current / scenario, volume / yield waterfall, effort by task);
  - the P1 charts (scope reconciliation, Pareto, funnel, supply paths, tornado, cash flow) and P2 (outcome validation);
  - an assumptions panel with save and export, a data-health drawer, and an appendix (evidence, availability matrix, SQL, method).
- **Parser:** now handles merged headings, Markdown links, missing currency and timezone, hypothesis status, approval and the unsent draft, and keeps the raw payload unchanged.
- **Reason-code legend:** now the documented one.
- **#5524 note:** no longer claims "same publisher".

### What is measured

- Daily and monthly activity for 437 and for #5100 by seat.
- The revenue windows.
- The connection episodes.
- The funnel and concentration.
- Reconnection outcomes of 1,725 partner-437 cuts (reconnection ≠ authorized fix).

### What is an estimate or scenario

- The no-intervention run rate, and every conditional, expected, incremental, RPMBr-change, waterfall and tornado figure.
- These appear only from user-entered values or labelled illustrative values (q and p of 25 / 50 / 75%; ramps of 21 / 14 / 7 days; +1 / 2 / 3% target volume for the portfolio; the full-day pre-cut mean as the case comparator).

### What is blocked, and what unblocks it

| Blocked output | Input or approval needed | Owner (to assign) |
|---|---|---|
| Any official monetary total, ROI, NPV, capacity value | Finance validation of `TOTAL_PAID_PRICE_TRUE_COUNT` currency (EUR per warehouse vs $ in workbook), FX source / date | Finance |
| Incremental contribution, net benefit, payback | Contribution or take-rate definition for gross buyer spend; implementation, operating and servicing costs; discount rate | Finance |
| Approved conditional / expected spend | Approved q, p, ramp, target volume / comparator per scenario, with source cohort | Business owner + Demand Ops |
| #5100 in approved recoverable totals | Decision on whether the "Reauct phase out" should be reversed | Partnerships / Demand Ops owner of the cut |
| Net hours released | Active minutes by task and role, manual vs Pitt-assisted, matched cases | TechOps |
| Detection latency, faster-resolution value | n8n execution IDs and lifecycle timestamps; a validated manual timeline | Workflow owner |
| Quality explanation | Source of the 75.68% / 19.66% / PASS figures with denominators | TechOps |
| Supply-grain substitution control | `DAY_SUPPLY` read with a longer timeout; verified publisher group for 5100 / 5524 | Data |
| Statistical forecast / intervals | ≥ 90 days of daily history (retention is ~44 days) and a backtested method | Data |

### Known limitations

- **Live refresh** works only where the viewer's Snowflake connector is available (claude.ai artifact). On Firebase the button is disabled and labelled "Disconnected". A server-side adapter with a service account would be needed there.
- **Row-level RPMBr on the legacy CFO impact · 437 tab:** a row with 0 bid requests still shows 0 instead of *unavailable*. This is unchanged from before; the new tab uses the corrected definition.
- **Seller types** are the current sellers.json values, applied to every day.
- **Bundle size:** the client bundle is ~650 kB (the warning is about chunk size only).
