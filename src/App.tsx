/**
 * The Pitt — Equativ TechOps
 * Amazon DSP disconnections, publisher first: an imported n8n / Slack run becomes one normalized data layer
 * (src/lib/cases), and every page reads the same run and the same selected publisher from CasesProvider.
 */
import { useState } from 'react';
import { CasesProvider, useCases } from './components/cases/CasesContext.tsx';
import { FinancialImpactPage } from './components/cases/FinancialImpactPage.tsx';
import { ImportDialog } from './components/cases/ImportDialog.tsx';
import { InvestigationsPage } from './components/cases/InvestigationsPage.tsx';
import { ProposalsPage } from './components/cases/ProposalsPage.tsx';
import { SpendProjectionPage } from './components/cases/SpendProjectionPage.tsx';
import { Header } from './components/Header.tsx';
import { OptimizationPage } from './components/optimization/OptimizationPage.tsx';
import { RunsPanel } from './components/ops/RunsPanel.tsx';
import { ScopeBar } from './components/ops/ScopeBar.tsx';
import { useOps } from './components/ops/useOps.ts';
import { RoomPage } from './components/room/RoomPage.tsx';

export default function App() {
  return (
    <CasesProvider>
      <Shell />
    </CasesProvider>
  );
}

function Shell() {
  const { tab } = useCases();
  const [importOpen, setImportOpen] = useState(false);
  const ops = useOps();
  // The n8n launch / refresh bar belongs to the pages that use it.
  const opsTab = tab === 'investigations' || tab === 'optimization';

  return (
    <div className="flex min-h-screen flex-col">
      <Header onOpenImport={() => setImportOpen(true)} toolbar={ops.backend === 'ok' && opsTab ? <ScopeBar ops={ops} /> : undefined} />

      <main key={tab} className="anim-fade-up mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {ops.backend === 'none' && opsTab && <ScopeBar ops={ops} />}
        {tab === 'overview' && <RoomPage />}
        {tab === 'investigations' && <InvestigationsPage runs={ops.backend === 'ok' ? <RunsPanel ops={ops} /> : undefined} />}
        {tab === 'impact' && <FinancialImpactPage />}
        {tab === 'projection' && <SpendProjectionPage />}
        {tab === 'optimization' && <ProposalsPage serverQueue={ops.backend === 'ok' ? <OptimizationPage ops={ops} /> : undefined} />}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            <strong className="font-semibold text-ink-2">The Pitt</strong> · Equativ TechOps
          </p>
          <p>Snowflake reads are read-only. Nothing is sent, created or changed from this site.</p>
        </div>
      </footer>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
