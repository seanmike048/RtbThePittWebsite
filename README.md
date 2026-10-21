# The Pitt · RTB Command Center

Evidence-based triage room for publisher networks disconnected from the Amazon DSP — **Equativ TechOps · AI Days 2026**.

The Pitt shows which partner seats were cut, how bid-request traffic collapsed, which facts are confirmed vs. only hypothesised,
what to do next, and the validated Slack / client messages produced by the
`[TechOps] RTB-Checklist-Output-Generation` n8n workflow.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static site in dist/
npm test         # financial-impact acceptance tests, parser and CFO model tests (Node 22+)
```

## Views

| Tab | What it shows |
| --- | --- |
| **Investigations** | The Pitt workflow's approved investigation (pasted text, kept verbatim) with Snowflake context: Equativ's connection-log reason for the cut, revenue reconciliation to the alert view, daily traffic around the cut, every DSP connection change for the network, related networks, actions by team and the unsent publisher draft |
| **At risk** | Amazon DSP watchlist: networks cut in the last 60 days with the logged reason, and connected seats showing the low-RPMBr signal that preceded past cuts |
| **Financial impact** | Spend after resolution, incremental spend vs no intervention, RPMBr change, faster recovery, hours released and Finance metrics, for the 437 Display portfolio and the #5100 case as separate scopes. Scenarios run only on entered or labelled illustrative inputs; blocked outputs say which input unblocks them. See `docs/financial-impact.md` |
| **CFO impact · 437** | Endpoint-437 CFO model (live from Snowflake, or the validated September workbook) |

Use **Paste investigation** to add another workflow output. **Refresh context** / **Refresh data** query Snowflake read-only
through the viewer's claude.ai connector; elsewhere the page shows the embedded snapshot from 2026-10-20.

## Guardrails

- Workflow output is parsed for display only and shown verbatim; the page never rewrites its findings.
- Snowflake context that conflicts with the workflow (e.g. a logged internal reason vs. a DSP-side hypothesis) is flagged next to it, not merged.
- Spend and revenue carry no currency until Finance validates it; 7-day pre-cut revenue is never labelled lost revenue.
- At-risk rules come from reasons observed in the connection log and are labelled as such, not as policy.

## Structure

```
src/
├── App.tsx                       # Tabs and shared state
├── components/
│   ├── investigations/           # Investigation page, watchlist, daily chart, paste dialog
│   ├── finance/                  # Financial impact page, chart kit, assumptions panel
│   ├── cfo437/                   # CFO impact · 437 sections
│   ├── live/useSnowflake.ts      # Read-only Snowflake access through the viewer's connector
│   └── ui.tsx                    # Card, Badge, Button, Modal, tables…
└── lib/
    ├── investigations/           # Workflow-output parser, Tubi case + context snapshot, watchlist, SQL
    ├── finance/                  # Value states, currency gating, daily scenario engine, cash flow, evidence, provenance
    ├── cfo437/                   # Endpoint-437 baseline, scenario model, SQL
    └── analytics/                # SSP-wide context data
sql/                              # 01–10 query files: executed SQL with query IDs, templates labelled
scripts/                          # Generators for the snapshot data and the SQL files
```

The original AI Studio export is kept as `rtb-command-center.zip` for reference.

## Deploy (Firebase App Hosting)

App Hosting runs `npm run build`, then `npm start`, which serves `dist/` with the zero-dependency `server.mjs` on `$PORT`
(8080 by default). Unknown paths fall back to `index.html`; `/healthz` returns `ok`. Run settings live in `apphosting.yaml`.

```bash
npm run build && PORT=8080 npm start
```

**Refresh data** on the CFO impact · 437 tab only works inside claude.ai, where the viewer's Snowflake and Google Drive
connectors are available. On the hosted URL the page shows the embedded data and says live refresh is unavailable.
