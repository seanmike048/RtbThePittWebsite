# Plan — CFO Impact & Scenario Analysis · Amazon DSP Endpoint 437 · Americas Display

## Context
You want the site's data page turned into an evidence-based CFO impact analysis scoped to **Amazon DSP · Endpoint 437 · Americas Display · September 2026**. The source is the workbook "Amazon DSP per Publisher ID - September 2026" (worksheet `437 (Americas Display)`, validation worksheet `Raw Data`). The file `the-pitt-amazon-dsp-437-americas-display.html` doesn't exist in this project. The "existing data page" is the site's **Analytics & CFO model** tab (`src/components/Analytics.tsx` + `src/lib/analytics/data.ts`), published at https://claude.ai/artifact/B9ottRoAMZhTZE1BCcYwcX.

Decisions you made:
- **Placement:** the Analytics tab becomes **"CFO impact · 437"**. The current Equativ SSP-wide content stays in a clearly labelled *SSP-wide context (not endpoint 437)* section, so its lineage is kept and it never enters the 437 calculations.
- **Sheet access:** connect Google Drive. The sheet returns 401 from here and connectors load only at session start. So the work runs in two phases: build everything now, then load the publisher rows in a new session that has the Drive connector.

### Facts already checked (read-only, Snowflake `ANALYTICS_EXPO`)
- `DATA_ESSENTIALS.DSP_NETWORK_CONNECTION_HISTORY`: all columns in your query B exist. **partner_id 437 = "Amazon DSP AMER Display B"**: 2,174 connected and 104 disconnected network pairs, latest cut 2026-10-01 08:28. The mapping is confirmed, and the page will show it.
- `CORTEX_ANALYST.EQUATIV_SSP_OVERALL_ACTIVITY`: `DAY`, `NETWORK_ID`, `NETWORK_NAME`, `AUCTIONS`, `TOTAL_PAID_PRICE_TRUE_COUNT` exist, so query A is valid. It also has `DSP_ID`, but mapping it to endpoint 437 is unverified. It has **no bid-request column**.
- `DATA_ESSENTIALS.DAILY_ADS_TXT_COMPLIANCE`: all columns in query D exist. The affected-network list is still a placeholder.
- **No issue-case table exists.** No table has `REVENUE_AT_RISK` or `EVIDENCE_CONFIDENCE`; `CASE_ID` appears only in `*_ACTIVITY_BEHAVIOUR_EVAL` tables, which are eval tables, not issue cases. Query C stays an unresolved template.
- **No table has `BID_REQUEST_COUNT` or `SPEND_GROSS_PARTNER_REVENUE`.** `AMAZON_DSP_PER_PUBLISHER_ID_SEPTEMBER_2026` in the supplied baseline query is unverified. That query also has a bug: `MEDIAN(...RPMBr...)` references an aggregate alias. I'll rewrite it with a row-level CTE and mark it "unverified table".

## Phase A — this session (no sheet needed) · ✅ done

### 1. Data layer `src/lib/cfo437/`
- **`baseline.ts`** holds the scope badge, the visible-view baseline (316 / 205 / 111, 198,616,733,575 bid requests, 7,141,421.720178 spend, RPMBr 35.95579079, median 12.26937425, top-16 80.444758%), the all-row validation view (861 / 518 / 343 …), the earlier snapshot (316 / 187 / 129, ≈43.73, ≈13.43), and the Snowflake mapping facts above.
  - Each metric carries `{value, unit, classification, source}`.
  - Spend unit is always **"source currency units"**, with the warning *Currency requires Finance validation*.
  - The page explains that the visible filtered view (Seller Type = BOTH or INTERMEDIARY) is **not** the `In Scope = 1` flag.
- **`assumptions.ts`** defines `Assumption = {id, label, value: number|null, unit, source, owner, confidence, lastUpdated, status: observed|calculated|estimated|scenario_assumption|unavailable}`. It holds per-scenario sets for Conservative, Base and Upside.
  - **Rates** get defaults tagged `scenario_assumption`: coverage, recovery rate, bid-request recovery rate, probability.
  - **Fields left `null` / "Requires validation":** eligible spend at risk, eligible bid requests, detection times, days saved, investigations, hours per investigation, loaded hourly cost, cash-realization rate, implementation cost, operating cost.
- **`model.ts`** holds pure functions. Each returns `{value: number|null, status, reason}`, so a missing input gives a named "unavailable" result, never a 0. Formulas:
  - recovered spend = eligible spend × coverage × recovery rate × probability
  - spend after resolution = baseline + recovered spend; incremental % = recovered spend ÷ baseline
  - recovered bid requests = eligible bid requests × coverage × bid-request recovery rate × probability
  - spend from bid requests = recovered bid requests × RPMBr ÷ **1,000,000**
  - daily spend at risk = eligible spend ÷ historical days (30); value protected = daily spend × days saved × probability. Unavailable until detection and recovery data exist.
  - hours saved = investigations × % automated × hours per investigation; direct cost reduction = hours × rate × cash-realization; capacity released (hours) and capacity value (hours × rate) are reported separately.
  - horizon run-rate for 7 / 14 / 30 / 90 / 365 days uses the per-day September baseline, never lifetime totals.
  - net benefit, ROI and payback are `unavailable` while any cost is null, with the required message. NPV and IRR are always unavailable.
  - **Double-counting guard:** status is `not_evaluated | potential_overlap | validated_non_overlapping`, default *Potential overlap*. `totalBenefit()` refuses to add spend from bid requests, RPMBr-improvement value, or faster-detection value to recovered spend unless the status is `validated_non_overlapping`. The UI shows the blocked components. I'm adding faster-detection value to the guarded list because it comes from the same eligible spend.
  - **Priority score** uses min-max-normalised components with editable weights (default 25 / 20 / 15 / 15 / 10 / 10 / −5). Low-confidence issues are capped below confirmed exposure, and confidence shows beside every score.
- **`publishers.ts`** defines the row type, a CSV and paste parser with header mapping for the workbook columns, and `aggregate(rows)`, which recomputes rows, positive and zero counts, bid requests, spend, weighted and median RPMBr, top-16 share, and the seller-type mix. In Phase A it ships empty, and the UI shows an "awaiting workbook rows" state with an in-page **Load workbook CSV** import (reusing the `Modal` and file-reader pattern from `src/components/ImportModal.tsx`).
- **`model.test.ts`** uses `node:test`:
  - the RPMBr ×1e6 formula reproduces 35.9558 from the baseline
  - ROI is unavailable when costs are missing
  - the double-count guard blocks the sum
  - horizons scale from the daily baseline
  - a low-confidence issue can't outrank confirmed exposure
  - `aggregate()` gives 316 / 205 / 111 on a fixture. In Phase B this becomes the real rows.
- Add it to the `npm test` script.

### 2. UI `src/components/cfo437/`
Reuse `ui.tsx` (`Card`, `Badge`, `SectionHeading`, `SegmentedControl`, `InfoTip`, `CopyButton`, `Modal`, `EmptyNote`). Move the `Tag`, `Stat`, `TableShell` and `Th` helpers from `Analytics.tsx` into `ui.tsx` so both pages share them.

`Cfo437Page.tsx` has the scope badge and a section jump nav, then these sections in order:
1. Executive CFO summary
2. Scope & data freshness: filtered view vs In Scope = 1, the validated 437 mapping, and the earlier-vs-latest snapshot panel shown side by side, not merged
3. Endpoint-437 baseline KPIs
4. Spend concentration: horizontal bars and seller-type mix
5. Publisher prioritization: searchable, sortable table ranked by spend, bid requests, RPMBr or score, with editable weights
6. Spend impact when issues are solved: eligible-spend mode switch (all visible spend / selected publisher subset / validated issue-specific spend). Only the third is labelled "issue-specific financial exposure".
7. Faster detection & recovery
8. Human time saved: direct cash vs capacity released
9. Conservative / Base / Upside cards plus a full scenario table with every field you listed
10. 7d / 14d / 30d / 90d / 12-month run-rate views labelled *Scenario run-rate arithmetic based on historical endpoint-437 display data*
11. Sensitivity grid
12. ROI & payback availability
13. Data quality & limitations
14. Snowflake SQL appendix: each query gets a ✓ validated or ⚠ unverified badge per table and column, from the checks above
15. Assumptions appendix: a table with value, unit, source, owner, confidence, updated and status
16. SSP-wide context: the existing `Analytics.tsx` content, collapsible and labelled out of scope

Other details:
- **Assumption editing:** each assumption is edited inline. Blank means "Requires validation".
- **Copying outputs:** copy buttons give scenario outputs as TSV or JSON, plus the SQL, since downloads are blocked on the hosted page.
- **Charts:** no line charts, because September is a single aggregate, not a time series. The page states that.
- **Labels:** every number shows its unit and has a source or status label.
- **Wiring:** in `Header.tsx` the `analytics` tab is relabelled "CFO impact · 437", and `App.tsx` renders `Cfo437Page`.

### 3. Save the plan in the repo
Write this plan to `docs/cfo-437-plan.md` so the Phase B session can pick it up. Then commit and push to `claude/dazzling-feynman-clbnbi`, and republish the artifact to the same URL. Publisher sections will show the "awaiting workbook rows" state.

## Phase B — new session with the Google Drive connector
You connect Google Drive at https://claude.ai/customize/connectors, then start a new session on this repo and branch with: *"Continue docs/cfo-437-plan.md Phase B"*. That session will:
1. Read `437 (Americas Display)` and `Raw Data` through the connector, then write `src/lib/cfo437/publishers.data.ts` with source rows and the sheet link.
2. Check `aggregate()` on both views against the visible baseline (316 / 205 / 111 / 80.44%) and the all-row view (861 / 518 / 343). Any mismatch gets reported and shown, never overwritten.
3. Fill the rankings, seller-type mix, prioritization and "selected publisher subset" mode, then test, commit, push and republish.

The CSV import also covers Phase B without Drive, if you'd rather upload an export.

## Verification
- `npx tsc --noEmit`, `npm test` (adapter and cfo437 suites), and `npm run build`.
- HTML validation: `npx html-validate` on the built page.
- Playwright on the preview build at 1280px and 390px, in light and dark: `scrollWidth` equals the viewport, plus screenshots of each section.
- An acceptance script asserts the page text contains:
  - the endpoint-437 scope badge
  - 316, 205, 111
  - "source currency units", with no "€" in 437 sections
  - the ×1,000,000 formula
  - 80.44%
  - the earlier-snapshot panel
  - editable Conservative / Base / Upside
  - "not a forecast" labels
  - ROI / NPV / payback / IRR unavailable while costs are missing
  - the SQL appendix with validation badges
  - double-counting status defaulting to *Potential overlap*

## Open inputs to report at the end
| Owner | Inputs |
|---|---|
| Finance | currency, loaded hourly cost, cash-realization rate, implementation and operating cost |
| TechOps | investigations per period, hours per investigation, historical detection and recovery times, recovery probability |
| Product / Data | a validated issue-case table, the endpoint-specific Snowflake source for the workbook, and the `DSP_ID` ↔ 437 mapping |
| Partnerships | which networks are actually affected (eligible spend at risk) |
