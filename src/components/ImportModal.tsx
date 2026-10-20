import React, { useRef, useState } from 'react';
import { AlertOctagon, AlertTriangle, FileJson, FlaskConical, ShieldCheck, Upload } from 'lucide-react';
import { parseWorkflowPayload } from '../lib/adapter/parser.ts';
import { RAW_SAMPLE_WORKFLOW_INPUT, SAMPLE_FINALIZED_REPORT } from '../lib/adapter/sampleData.ts';
import type { RTBViewModel } from '../lib/adapter/types.ts';
import { Button, cx, Modal } from './ui.tsx';

export const ImportModal: React.FC<{ open: boolean; onClose: () => void; onApply: (m: RTBViewModel) => void }> = ({
  open,
  onClose,
  onApply,
}) => {
  const [text, setText] = useState('');
  const [error, setError] = useState<{ msg: string; pipeline: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (raw = text) => {
    setError(null);
    if (!raw.trim()) return setError({ msg: 'Paste or upload a JSON payload first.', pipeline: false });
    try {
      const res = parseWorkflowPayload(JSON.parse(raw), 'Custom import');
      if (!res.success || !res.model) {
        return setError({ msg: res.error ?? 'Could not parse payload.', pipeline: Boolean(res.isN8nWorkflowDefinition) });
      }
      onApply(res.model);
    } catch (e) {
      setError({ msg: `JSON syntax error: ${(e as Error).message}`, pipeline: false });
    }
  };

  const load = (obj: unknown) => {
    const s = JSON.stringify(obj, null, 2);
    setText(s);
    apply(s);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      const s = String(ev.target?.result ?? '');
      setText(s);
      apply(s);
    };
    r.readAsText(f);
    e.target.value = '';
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Upload className="h-5 w-5" />}
      title="Import workflow data"
      subtitle="Paste an executed JSON payload, upload a file, or start from a sample."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">Parsed in your browser. Code in payloads is never executed.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => apply()}>
              Parse & apply
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => load(RAW_SAMPLE_WORKFLOW_INPUT)}
            className="rounded-xl border border-line p-4 text-left transition-colors hover:border-warn/50 hover:bg-warn-soft cursor-pointer"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <FlaskConical className="h-4 w-4 text-warn" /> Raw sample input
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Input from [TechOps] RTB-Checklist-Output-Generation.</p>
          </button>
          <button
            type="button"
            onClick={() => load(SAMPLE_FINALIZED_REPORT)}
            className="rounded-xl border border-line p-4 text-left transition-colors hover:border-ok/50 hover:bg-ok-soft cursor-pointer"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <ShieldCheck className="h-4 w-4 text-ok" /> Finalized report
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Completed P0 report with facts, validation and Slack text.</p>
          </button>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="json-input" className="text-sm font-medium text-ink">
              JSON payload
            </label>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              <FileJson className="h-3.5 w-3.5" /> Upload .json
            </Button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
          </div>
          <textarea
            id="json-input"
            value={text}
            onChange={e => setText(e.target.value)}
            spellCheck={false}
            placeholder='{ "publisher": "…", "disconnections": [ … ] }'
            className="num h-64 w-full resize-y rounded-xl border border-line bg-surface-2 p-4 text-xs leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>

        {error && (
          <div
            className={cx(
              'flex gap-2.5 rounded-xl border px-4 py-3 text-sm leading-relaxed',
              error.pipeline ? 'border-danger/30 bg-danger-soft text-danger-ink' : 'border-warn/30 bg-warn-soft text-warn-ink',
            )}
          >
            {error.pipeline ? <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            {error.msg}
          </div>
        )}
      </div>
    </Modal>
  );
};
