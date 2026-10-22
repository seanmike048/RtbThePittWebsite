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
import { OptimizationPage } from './components/optimization/OptimizationPage.tsx';
import { RunsPanel } from './components/ops/RunsPanel.tsx';
import { ScopeBar } from './components/ops/ScopeBar.tsx';
import { useOps } from './components/ops/useOps.ts';
import { RoomPage } from './components/room/RoomPage.tsx';
import { ShellContext } from './components/shell/ShellContext.tsx';
import { Sidebar } from './components/shell/Sidebar.tsx';
import { TopBar } from './components/shell/TopBar.tsx';

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
  const [navOpen, setNavOpen] = useState(false);
  const ops = useOps();
  // The n8n launch / refresh bar belongs to the pages that use it.
  const opsTab = tab === 'investigations' || tab === 'optimization';

  return (
    <ShellContext.Provider value={{ openImport: () => setImportOpen(true) }}>
      <div className="min-h-screen bg-canvas">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="flex min-h-screen flex-col lg:pl-[188px]">
          <TopBar onMenu={() => setNavOpen(true)} user={ops.session?.user ?? null}>
            {ops.backend === 'ok' && opsTab ? <ScopeBar ops={ops} /> : undefined}
          </TopBar>

          <main key={tab} className="anim-fade-up mx-auto w-full max-w-[1440px] flex-1 space-y-4 px-4 py-6 sm:px-6">
            {ops.backend === 'none' && opsTab && <ScopeBar ops={ops} />}
            {tab === 'overview' && <RoomPage />}
            {tab === 'investigations' && <InvestigationsPage runs={ops.backend === 'ok' ? <RunsPanel ops={ops} /> : undefined} />}
            {tab === 'impact' && <FinancialImpactPage />}
            {tab === 'projection' && <SpendProjectionPage />}
            {tab === 'optimization' && <ProposalsPage serverQueue={ops.backend === 'ok' ? <OptimizationPage ops={ops} /> : undefined} />}
          </main>

          <footer className="border-t border-line px-4 py-4 text-xs text-muted sm:px-6">
            <p>The Pitt by Equativ · Snowflake reads are read-only. Nothing is sent, created or changed from this site.</p>
          </footer>
        </div>

        <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      </div>
    </ShellContext.Provider>
  );
}
