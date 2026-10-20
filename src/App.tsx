/**
 * The Pitt · RTB Command Center — Equativ TechOps
 * Evidence-based triage for publisher networks disconnected from the Amazon DSP.
 */
import React, { useCallback, useState } from 'react';
import { Code2 } from 'lucide-react';
import type { DisconnectionPartnerRecord, RTBViewModel } from './lib/adapter/types.ts';
import { getFinalizedSampleModel, getInitialSampleModel } from './lib/adapter/parser.ts';
import { Header, type TabId } from './components/Header.tsx';
import { ContextBar } from './components/ContextBar.tsx';
import { ImpactAndTimeline, IncidentHero, KpiRow } from './components/Overview.tsx';
import { Investigation } from './components/Investigation.tsx';
import { DetailDrawer, DisconnectionsTable } from './components/Disconnections.tsx';
import { Signals } from './components/Signals.tsx';
import { Validation } from './components/Validation.tsx';
import { Specs } from './components/Specs.tsx';
import { ImportModal } from './components/ImportModal.tsx';
import { Badge, CopyButton, Modal } from './components/ui.tsx';

export default function App() {
  const [model, setModel] = useState<RTBViewModel>(() => getInitialSampleModel());
  const [tab, setTab] = useState<TabId>('overview');
  const [importOpen, setImportOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [selected, setSelected] = useState<DisconnectionPartnerRecord | null>(null);

  const changeTab = (t: TabId) => {
    setTab(t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const closeImport = useCallback(() => setImportOpen(false), []);
  const closeSource = useCallback(() => setSourceOpen(false), []);
  const closeDrawer = useCallback(() => setSelected(null), []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        model={model}
        activeTab={tab}
        onTabChange={changeTab}
        onOpenImport={() => setImportOpen(true)}
        onOpenSource={() => setSourceOpen(true)}
      />

      <ContextBar
        model={model}
        onLoadSample={() => setModel(getInitialSampleModel())}
        onLoadFinalized={() => setModel(getFinalizedSampleModel())}
      />

      <main key={tab} className="anim-fade-up mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {tab === 'overview' && (
          <>
            <IncidentHero model={model} />
            <KpiRow model={model} />
            <ImpactAndTimeline model={model} />
            <Investigation model={model} />
            <DisconnectionsTable model={model} onSelect={setSelected} />
          </>
        )}
        {tab === 'disconnections' && <DisconnectionsTable model={model} onSelect={setSelected} />}
        {tab === 'signals' && <Signals model={model} />}
        {tab === 'validation' && <Validation model={model} />}
        {tab === 'specs' && <Specs />}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            <strong className="font-semibold text-ink-2">The Pitt</strong> · RTB Command Center · Equativ TechOps · AI Days 2026
          </p>
          <p className="num">Workflow: [TechOps] RTB-Checklist-Output-Generation</p>
        </div>
      </footer>

      <ImportModal
        open={importOpen}
        onClose={closeImport}
        onApply={m => {
          setModel(m);
          setImportOpen(false);
        }}
      />

      <DetailDrawer record={selected} model={model} onClose={closeDrawer} />

      <Modal
        open={sourceOpen}
        onClose={closeSource}
        size="lg"
        icon={<Code2 className="h-5 w-5" />}
        title="Active source payload"
        subtitle={
          <Badge tone={model.sourceType === 'finalized_report' ? 'ok' : 'warn'}>
            {model.sourceType === 'finalized_report' ? 'Finalized report' : model.sourceType === 'sample_input' ? 'Raw sample input' : 'Custom import'}
          </Badge>
        }
        headerAside={<CopyButton text={model.rawSourceJson} label="Copy JSON" />}
      >
        <pre className="num whitespace-pre-wrap break-all bg-slate-950 p-5 text-xs leading-relaxed text-slate-200">
          {model.rawSourceJson}
        </pre>
      </Modal>
    </div>
  );
}
