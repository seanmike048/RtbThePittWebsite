import React, { useState } from 'react';
import { AlertTriangle, FileText } from 'lucide-react';
import { type InvestigationReport, parseInvestigation } from '../../lib/investigations/report.ts';
import { Button, Modal } from '../ui.tsx';

export const PasteInvestigation: React.FC<{ open: boolean; onClose: () => void; onAdd: (r: InvestigationReport) => void }> = ({ open, onClose, onAdd }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const r = parseInvestigation(text);
    if (!r.networkId || !r.network)
      return setError('Could not find the network line (“<name> | Network #<id> | <DSP>”, or “THE PITT | <name> · Network #<id> · <DSP>” on a v4.6 card). Paste the full workflow output.');
    onAdd(r);
    setText('');
    setError(null);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<FileText className="h-5 w-5" />}
      title="Paste an investigation"
      subtitle="The approved text output of The Pitt workflow, or its v4.6 Slack card, exactly as posted."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={add}>
            Add investigation
          </Button>
        </div>
      }
    >
      <div className="space-y-3 p-5">
        <textarea
          id="inv-paste"
          value={text}
          onChange={e => setText(e.target.value)}
          spellCheck={false}
          placeholder={'THE PITT | APPROVED INVESTIGATION\n<Network> | Network #<id> | Amazon DSP\nDisconnected: <date> | Priority: <priority>\n…'}
          className="num h-72 w-full resize-y rounded-xl border border-line bg-surface-2 p-4 text-xs leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {error && (
          <p className="flex gap-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        <p className="text-xs text-muted">Parsed in your browser and kept verbatim. Refresh context then pulls Snowflake data for the network.</p>
      </div>
    </Modal>
  );
};
