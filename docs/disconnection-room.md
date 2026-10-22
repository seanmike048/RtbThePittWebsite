# The Pitt · Amazon DSP Disconnection Room

This is the output layer of The Pitt, built for Equativ AI Days 2026 (Competitive track). It shows which networks are cut from Amazon DSP, how much weekly spend is at risk, why (the evidence-based checks), and what to fix to reconnect. It is the **Disconnection Room** tab of the site.

## Files

| File | Role |
|---|---|
| `src/lib/pitt/types.ts` | The data contract (types). |
| `src/lib/pitt/data.ts` | **All data**, as typed arrays: `SYNTHETIC`, `RUN_2026_10_21`, and optionally `EXPORT`. Generated, so don't edit it by hand. |
| `scripts/gen_room_data.py` | Writes `data.ts`: the seeded synthetic set, the real 21 Oct run, and an optional Snowflake CSV export. |
| `src/lib/pitt/engine.ts` | **All thresholds, labels, stage names, the accent colour** and every derivation (filters, KPIs, Sankey, risk table, funnel, waterfall, what-if, network page, reconciliation). |
| `src/lib/pitt/engine.test.ts` | Rules and guardrails, tested. |
| `src/components/room/*` | Rendering only. Components call engine selectors and never calculate from data; a test checks this. |

## Rules the code enforces

- **Filters come first.** Business unit, Amazon partner, region, priority, status and date range are applied before every derivation (`applyFilters`), so every KPI, chart and table describes the same cohort.
- **Reconciliation.** On load and on every cohort change, the browser console prints `RECONCILIATION OK (€…)`, or the exact mismatch. The check: Sankey "Still disconnected" = Revenue at risk KPI = sum of the at-risk rows in the risk table.
- **Missing is "No data", never 0.**
  - `RECONNECTED_AT = null` means still disconnected; it is never inferred.
  - A `NO_DATA` check is grey and never counts as a pass.
  - Owners come only from `USERNAME`.
- **AI hypotheses:**
  - If no check is FAIL, HIGH confidence is shown as MEDIUM, with a "capped" chip.
  - An `evidence_ref` that is not a row in Checks gets a red "Unverified evidence" badge.
- **Publisher view hides** owners, other publishers, Equativ revenue figures, the AI hypotheses and validation internals.
- **The draft message is read-only**, with a "Requires human approval in Slack" lock. There is no send button.

## Priority engine (placeholder thresholds)

These sit in `PRIORITY_RULES`, and the UI shows a "Placeholder thresholds" chip next to them:

- **P0:** still disconnected and `SPEND_7D_BEFORE ≥ 10,000`.
- **P1:** `SPEND_7D_BEFORE ≥ 1,000`, or an Amazon revenue/spend drop of 50% or more.
- **P2:** still disconnected and `SPEND_7D_BEFORE` missing.

Other settings in the same file:
- **Risk** (`riskOf`): P0 is Critical, P1 is High, P2 or more than 30 days is Watch, everything else is Low.
- **Age buckets:** Current, 1–7, 8–30, 31–90 and 90+ days, counted from `CUT_AT` to the data set's `asOf`.
- **Amazon RPMBr reference** (USD per million bid requests): Americas $50, EMEA $25, APAC $10. Shown next to EUR RPMBr without conversion.

## Data contract (exact field names)

- **A. Disconnections** (`ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS`), one row per network × seat: `PARTNER_ID, PARTNER_NAME, PUBLISHER, NETWORK_ID, BUSINESS_UNIT, USERNAME, CUT_AT, RECONNECTED_AT, SPEND_7D_BEFORE`.
- **Networks:** `NETWORK_ID, REGION`.
- **B. Checks**, one row per network × check × window: `network_id, check ∈ {ADS_TXT, SCO, BLOCKED_INVENTORY, IVT}, window ∈ {BEFORE, AFTER}, result ∈ {PASS, FAIL, NO_DATA}, evidence_ref, detail`.
- **C. Traffic metrics:** `network_id, metric, partner_name, partner_ids, change_pct, before, after, period, source`.
  - `change_pct` empty means it is derived from before and after.
  - The "Drop is Amazon-specific" banner needs `network_auctions_per_day` within ±10% and `amazon_bid_requests_per_day` at −50% or lower.
- **D. Demand funnel:** `network_id, auctions, bid_requests, bids, wins, impressions` plus `drop_reasons[] {stage, reason, count}`. A reason's `stage` is the stage the request did not reach.
- **E. AI investigation:** `network_id, hypotheses[] {label, confidence, evidence_refs[], missing_info[]}, draft_message, validation {passed, ai_output_accepted, fallback_fields[]}`. `confidence` may be null when the source does not state it.
- **Readiness:** `network_id, signal, presence ∈ {PRESENT, ABSENT, PARTIAL, NO_DATA}, detail`. The `content.*` group is tagged "Not fully relevant until January 2027".
- **Saves:** `network_id, PUBLISHER, PARTNER_ID, kind ∈ {stayed_connected, reconnected_after_fix}, fixed_check, fixed_at, SPEND_7D`.

## Data sets

1. **Synthetic demo data**, with a persistent banner. It has 25 networks and 41 seat rows across seats 437/489/490/491/492, three business units, and seed 20261021. The scenarios:
   - **A:** ads.txt FAIL after the cut.
   - **B:** IVT spike.
   - **C:** all PASS or NO_DATA with an Amazon-specific drop, LOW confidence and missing information listed. Some C networks show the HIGH cap and the "Unverified evidence" badge.
2. **Real run · 21 Oct 2026, 4:55 PM** (the default): Display.io, E-Planning LATAM and Vidazoo Intermediary, totalling €7,002 a week over 4 cut seats with a spend. Source: `scripts/run-2026-10-21-1655.json`, the #thepittoutput post copied verbatim (headline, reads, findings, leading hypotheses, Verify steps, Jira drafts). It carries only what that output states; everything else is null or NO_DATA (business unit, owner, funnel and AI confidence are not in it).

## Replacing the sample data with a Snowflake CSV export

1. Export one CSV per array with the column names above, into one folder:
   - `disconnections.csv`, the only required file;
   - optionally `networks.csv`, `checks.csv`, `traffic.csv` (`partner_ids` separated by `|`), `funnels.csv`, `drop_reasons.csv`, `readiness.csv`, `saves.csv`, and `investigations.json` (an array in the contract shape).
2. Run:
   ```bash
   python3 scripts/gen_room_data.py --csv path/to/export --label "Export 21 Oct" --as-of 2026-10-21
   ```
   The script refuses missing columns and unknown enum values, and says which line. Empty cells (or `NULL`) become null, and a `RECONNECTED_AT` in 2099 (the alert view's "open") becomes null, meaning still disconnected.
3. The export appears as a third entry in the **Data** selector. Open the browser console and check for `RECONCILIATION OK`.
4. To leave out the synthetic set, remove `SYNTHETIC` from `DATASETS` in the generator.
