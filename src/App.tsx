/**
 * The Pitt — Equativ TechOps
 * Approved investigations of DSP disconnections, with Snowflake context, the Amazon watchlist, and the CFO impact model.
 */
import { useState } from 'react';
import type { NetworkContext } from './lib/investigations/context.ts';
import { type InvestigationReport, parseInvestigation } from './lib/investigations/report.ts';
import { TUBI_CONTEXT, TUBI_REPORT_TEXT } from './lib/investigations/tubi5100.ts';
import { type Watchlist, WATCHLIST_SNAPSHOT } from './lib/investigations/watchlist.ts';
import { Header, type TabId } from './components/Header.tsx';
import { InvestigationPage } from './components/investigations/InvestigationPage.tsx';
import { WatchlistPage } from './components/investigations/WatchlistPage.tsx';
import { PasteInvestigation } from './components/investigations/PasteInvestigation.tsx';
import { Cfo437Page } from './components/cfo437/Cfo437Page.tsx';
import { FinancePage } from './components/finance/FinancePage.tsx';

export default function App() {
  const [tab, setTab] = useState<TabId>('investigations');
  const [reports, setReports] = useState<InvestigationReport[]>(() => [parseInvestigation(TUBI_REPORT_TEXT)]);
  const [selected, setSelected] = useState(0);
  const [contexts, setContexts] = useState<Record<string, NetworkContext>>({ [TUBI_CONTEXT.networkId]: TUBI_CONTEXT });
  const [watchlist, setWatchlist] = useState<Watchlist>(WATCHLIST_SNAPSHOT);
  const [pasteOpen, setPasteOpen] = useState(false);

  const changeTab = (t: TabId) => {
    setTab(t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        activeTab={tab}
        onTabChange={changeTab}
        onOpenImport={() => setPasteOpen(true)}
        counts={{ investigations: reports.length, atRisk: watchlist.atRisk.length }}
      />

      <main key={tab} className="anim-fade-up mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {tab === 'investigations' && (
          <InvestigationPage
            reports={reports}
            selected={selected}
            onSelect={setSelected}
            contexts={contexts}
            onContext={c => setContexts(prev => ({ ...prev, [c.networkId]: c }))}
            onOpenImport={() => setPasteOpen(true)}
          />
        )}
        {tab === 'watchlist' && (
          <WatchlistPage
            watchlist={watchlist}
            onWatchlist={setWatchlist}
            investigated={reports.map(r => r.networkId)}
            onOpenInvestigation={id => {
              const i = reports.findIndex(r => r.networkId === id);
              if (i >= 0) setSelected(i);
              changeTab('investigations');
            }}
          />
        )}
        {tab === 'impact' && <FinancePage />}
        {tab === 'analytics' && <Cfo437Page />}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            <strong className="font-semibold text-ink-2">The Pitt</strong> · Equativ TechOps · AI Days 2026
          </p>
          <p>Snowflake context is read-only. Workflow outputs are shown verbatim; nothing is sent externally from this page.</p>
        </div>
      </footer>

      <PasteInvestigation
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onAdd={r => {
          setReports(prev => [...prev, r]);
          setSelected(reports.length);
          setPasteOpen(false);
          setTab('investigations');
        }}
      />
    </div>
  );
}
