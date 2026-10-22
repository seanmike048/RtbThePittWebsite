import React from 'react';
import { CaseFile } from './CaseFile.tsx';
import { useCases } from './CasesContext.tsx';
import { PublisherDirectory } from './PublisherDirectory.tsx';
import { RequirePublisher } from './bits.tsx';
import { RunStrip } from './RunStrip.tsx';

/** Publisher directory beside the selected publisher's case file. */
export const InvestigationsPage: React.FC<{ runs?: React.ReactNode }> = ({ runs }) => {
  const { selected } = useCases();
  return (
    <div className="space-y-6">
      <RunStrip compact />
      {selected ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-32 lg:self-start" aria-label="Publishers">
            <p className="mb-2 text-xs font-medium text-muted">Publishers in this run</p>
            <PublisherDirectory compact />
          </aside>
          <CaseFile key={selected.caseId} c={selected} />
        </div>
      ) : (
        <RequirePublisher title="Investigations">{() => null}</RequirePublisher>
      )}
      {runs}
    </div>
  );
};
