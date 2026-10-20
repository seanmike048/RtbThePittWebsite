import React, { useState } from 'react';
import { AlertTriangle, CalendarRange, Clock, FlaskConical, ShieldCheck, X } from 'lucide-react';
import type { RTBViewModel } from '../lib/adapter/types.ts';
import { cx, SegmentedControl } from './ui.tsx';

export const ContextBar: React.FC<{
  model: RTBViewModel;
  onLoadSample: () => void;
  onLoadFinalized: () => void;
}> = ({ model, onLoadSample, onLoadFinalized }) => {
  const [showCoverage, setShowCoverage] = useState(false);
  const isFinal = model.sourceType === 'finalized_report';
  const { metadata } = model;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <div
        className={cx(
          'flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
          isFinal ? 'border-ok/25 bg-ok-soft' : model.sourceType === 'sample_input' ? 'border-warn/30 bg-warn-soft' : 'border-line bg-surface',
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cx(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              isFinal ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn',
            )}
          >
            {isFinal ? <ShieldCheck className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <p className={cx('text-sm font-semibold', isFinal ? 'text-ok-ink' : 'text-warn-ink')}>
              {isFinal
                ? 'Finalized executed report'
                : model.sourceType === 'sample_input'
                  ? 'Sample workflow input — not production data'
                  : model.sourceTitle}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
              {isFinal
                ? 'Deterministic priority, Gemini narrative and Boundary C validation are all present and verified.'
                : 'Priority, confidence and Gemini validation have not executed on this raw input yet.'}
            </p>
          </div>
        </div>
        <SegmentedControl
          ariaLabel="Data source"
          value={isFinal ? 'final' : 'raw'}
          onChange={v => (v === 'final' ? onLoadFinalized() : onLoadSample())}
          options={[
            { value: 'raw', label: 'Raw input' },
            { value: 'final', label: 'Finalized report' },
          ]}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5" />
          Reporting window <strong className="font-medium text-ink-2">{metadata.moduleReportingWindow}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5" title="Client-side import time — not source refresh time">
          <Clock className="h-3.5 w-3.5" />
          Imported <span className="num text-ink-2">{new Date(metadata.importTimestamp).toLocaleTimeString()}</span>
        </span>
        {metadata.hasWindowCoverageDiscrepancy && (
          <button
            type="button"
            onClick={() => setShowCoverage(s => !s)}
            aria-expanded={showCoverage}
            className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-0.5 font-medium text-warn-ink transition-colors hover:border-warn/60 cursor-pointer"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Metric interval differs from reporting window
          </button>
        )}
      </div>

      {showCoverage && (
        <div className="anim-fade-up mt-3 flex items-start justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm leading-relaxed text-ink-2">
          <p>
            <strong className="text-warn-ink">Date coverage distinction. </strong>
            {metadata.windowDiscrepancyNotice}
          </p>
          <button type="button" aria-label="Dismiss" onClick={() => setShowCoverage(false)} className="text-muted hover:text-ink cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
