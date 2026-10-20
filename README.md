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
npm test         # adapter / guardrail unit tests (Node 22+)
```

## Views

| Tab | What it shows |
| --- | --- |
| **Overview** | Incident headline, priority & confidence, KPIs, bid-request collapse, timeline, investigation, ledger |
| **Disconnections** | Seat ledger — click a row for the full record drawer |
| **Signals & checklist** | Seat mapping, signal associations, policy / benchmark checklist |
| **Validation & Slack** | Boundary C validation, Slack broadcast preview (≤ 200 words), client message |
| **Adapter specs** | Decision boundaries, ingestion rules, n8n export steps, JSON schema |

Use **Import data** to paste or upload an executed workflow payload, or switch between the bundled
*Raw input* and *Finalized report* samples from the context bar. Light and dark themes follow the OS and can be toggled.

## Guardrails (enforced in `src/lib/adapter/parser.ts`)

- Priority and confidence are rendered only when supplied by the backend — never guessed.
- Spend with no currency is shown per seat and never summed; it is never labelled as lost revenue.
- Hypotheses (e.g. ads.txt) are quarantined and never shown as a confirmed cause.
- A metric period that differs from the reporting window is surfaced, not silently aligned.
- n8n pipeline definitions (`nodes` / `connections`) are rejected with guidance.

## Structure

```
src/
├── App.tsx                 # Shell, tabs, modals
├── index.css               # Design tokens (light + dark), Tailwind v4 theme
├── components/
│   ├── ui.tsx              # Card, Badge, Button, Modal, InfoTip, SegmentedControl…
│   ├── Header.tsx / ContextBar.tsx
│   ├── Overview.tsx        # Hero, KPI row, collapse chart, timeline
│   ├── Investigation.tsx   # Facts, evidence, unknowns, hypotheses, actions
│   ├── Disconnections.tsx  # Ledger table + detail drawer
│   ├── Signals.tsx / Validation.tsx / Specs.tsx / ImportModal.tsx
└── lib/adapter/            # Types, parser, sample data, tests
```

The original AI Studio export is kept as `rtb-command-center.zip` for reference.
