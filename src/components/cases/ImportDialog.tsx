import React, { useMemo, useState } from 'react';
import { ClipboardPaste } from 'lucide-react';
import { enrich } from '../../lib/cases/bundled.ts';
import { parseRun } from '../../lib/cases/parse.ts';
import { Button, Modal } from '../ui.tsx';
import { useCases } from './CasesContext.tsx';

const MAX_CHARS = 500_000;

/** Paste the full Slack / n8n output once; preview what was detected; import it for every page. */
export const ImportDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { importRun, resetToBundled, run, go } = useCases();
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? enrich(parseRun(text.slice(0, MAX_CHARS))) : null), [text]);
  const r = parsed?.report;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import a The Pitt run"
      subtitle="Paste the complete Slack or n8n output. Only the run summary and The Pitt drafts are read; everything else is ignored."
      icon={<ClipboardPaste className="h-5 w-5" />}
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            className="text-xs text-muted hover:text-ink cursor-pointer"
            onClick={() => {
              resetToBundled();
              onClose();
            }}
          >
            Restore the bundled 21 Oct run
          </button>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!parsed || !parsed.cases.length}
              onClick={() => {
                importRun({ ...parsed!, label: 'Imported run · ' + new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) });
                setText('');
                onClose();
                go('investigations');
              }}
            >
              Import {parsed?.cases.length ?? 0} case{parsed?.cases.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-xs text-muted">
          Current run: <span className="text-ink-2">{run.label}</span> · {run.cases.length} case(s). Importing replaces it on every page. The text stays in this browser; nothing in it is run or
          followed.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={12}
          maxLength={MAX_CHARS}
          aria-label="Slack or n8n output"
          placeholder="Paste here: the run summary (“3 publishers · …”) and the “[The Pitt] … disconnected from …” drafts."
          className="num w-full rounded-md border border-line bg-surface-2 p-3 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {r && (
          <div className="rounded-md border border-line" aria-live="polite">
            <dl className="grid grid-cols-3 gap-3 p-3 text-sm sm:grid-cols-6">
              {[
                ['Cases', r.cases],
                ['Actions', r.actions],
                ['Drafts read', r.drafts],
                ['Duplicates merged', r.duplicatesRemoved],
                ['Source-only lines', r.sourceOnlyLines],
                ['Lines ignored', r.ignoredLines],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="num text-base font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            {parsed!.cases.length > 0 && (
              <ul className="border-t border-line px-3 py-2 text-xs text-ink-2">
                {parsed!.cases.map((c) => (
                  <li key={c.caseId}>
                    <span className="num text-muted">{c.caseId}</span> · {c.publisher} · {c.actions.length} action(s)
                  </li>
                ))}
              </ul>
            )}
            {r.warnings.length > 0 && (
              <ul className="space-y-0.5 border-t border-line bg-warn-soft px-3 py-2 text-xs text-warn-ink">
                {r.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
              Ignored lines are Slack chrome, link previews or other messages: they are never used as evidence. Source-only lines (metrics the product does not analyse) are stored with the case and not displayed.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};
