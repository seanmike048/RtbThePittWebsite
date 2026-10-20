import React, { useEffect, useState } from 'react';
import type { Assumption } from '../../lib/cfo437/assumptions.ts';
import type { Classification } from '../../lib/cfo437/baseline.ts';
import type { Result } from '../../lib/cfo437/model.ts';
import { Badge, cx } from '../ui.tsx';

export const CLASS_META: Record<Classification, { label: string; tone: 'ok' | 'info' | 'accent' | 'warn' | 'neutral' }> = {
  observed: { label: 'Observed', tone: 'ok' },
  calculated: { label: 'Calculated', tone: 'info' },
  estimated: { label: 'Estimated', tone: 'accent' },
  scenario_assumption: { label: 'Scenario assumption', tone: 'warn' },
  unavailable: { label: 'Requires validation', tone: 'neutral' },
};

export const ClassTag: React.FC<{ c: Classification; children?: React.ReactNode }> = ({ c, children }) => (
  <Badge tone={CLASS_META[c].tone} dot>
    {children ?? CLASS_META[c].label}
  </Badge>
);

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return fmt(n, a < 100 ? 2 : 0);
};

/** Renders a model Result with its unit, or its unavailability reason. */
export const ResultValue: React.FC<{
  r: Result;
  unit: string;
  digits?: number;
  size?: 'sm' | 'lg';
  compactNum?: boolean;
}> = ({ r, unit, digits = 0, size = 'sm', compactNum }) =>
  r.value === null ? (
    <span className={cx('italic text-muted', size === 'lg' ? 'text-sm' : 'text-xs')} title={r.reason}>
      {r.status === 'blocked' ? 'Blocked' : 'Requires validation'}
    </span>
  ) : (
    <span className={cx('num font-semibold text-ink', size === 'lg' ? 'text-2xl' : 'text-sm')}>
      {compactNum ? compact(r.value) : fmt(r.value, digits)}{' '}
      <span className={cx('font-sans font-normal text-muted', size === 'lg' ? 'text-sm' : 'text-xs')}>{unit}</span>
    </span>
  );

/** Inline numeric editor for one assumption. Blank means "Requires validation". */
export const AssumptionInput: React.FC<{
  a: Assumption;
  onChange: (v: number | null) => void;
  compactMode?: boolean;
  idPrefix: string;
}> = ({ a, onChange, compactMode, idPrefix }) => {
  const [text, setText] = useState(a.value === null ? '' : String(a.value));
  useEffect(() => setText(a.value === null ? '' : String(a.value)), [a.value]);
  const id = `${idPrefix}-${a.id}`;
  return (
    <div className={compactMode ? '' : 'space-y-1.5'}>
      {!compactMode && (
        <label htmlFor={id} className="flex items-center justify-between gap-2 text-sm font-medium text-ink-2">
          <span>{a.label}</span>
          <ClassTag c={a.status} />
        </label>
      )}
      <div
        className={cx(
          'flex items-center rounded-xl border bg-surface focus-within:border-accent',
          a.value === null ? 'border-dashed border-line-strong' : 'border-line',
        )}
      >
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          aria-label={compactMode ? a.label : undefined}
          value={text}
          placeholder="Requires validation"
          onChange={e => {
            setText(e.target.value);
            const v = e.target.value.trim();
            onChange(v === '' || Number.isNaN(Number(v)) ? null : Math.max(0, Number(v)));
          }}
          className="num w-full min-w-0 rounded-xl bg-transparent px-3 py-2 text-sm text-ink placeholder:font-sans placeholder:text-xs placeholder:italic placeholder:text-faint focus:outline-none"
        />
        <span className="shrink-0 pr-3 text-xs text-muted">{a.unit}</span>
      </div>
      {!compactMode && (
        <p className="text-[11px] text-muted">
          {a.source} · {a.owner} · confidence {a.confidence}
        </p>
      )}
    </div>
  );
};

export const SectionAnchor: React.FC<{ id: string }> = ({ id }) => <div id={id} className="scroll-mt-36" />;

export const Notice: React.FC<{ tone: 'warn' | 'danger' | 'info' | 'ok'; icon?: React.ReactNode; children: React.ReactNode }> = ({
  tone,
  icon,
  children,
}) => {
  const s = {
    warn: 'border-warn/30 bg-warn-soft [&_strong]:text-warn-ink',
    danger: 'border-danger/25 bg-danger-soft [&_strong]:text-danger-ink',
    info: 'border-info/25 bg-info-soft [&_strong]:text-info',
    ok: 'border-ok/25 bg-ok-soft [&_strong]:text-ok-ink',
  }[tone];
  return (
    <div className={cx('flex gap-3 rounded-2xl border p-4 text-sm leading-relaxed text-ink-2', s)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
};

export const HBar: React.FC<{ label: string; value: number; max: number; display: string; tone?: 'accent' | 'warn' | 'muted' }> = ({
  label,
  value,
  max,
  display,
  tone = 'accent',
}) => (
  <div>
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 truncate text-ink-2" title={label}>
        {label}
      </span>
      <span className="num shrink-0 text-xs font-medium text-ink">{display}</span>
    </div>
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
      <div
        className={cx('anim-grow-x h-full rounded-full', tone === 'accent' ? 'bg-accent' : tone === 'warn' ? 'bg-warn' : 'bg-faint')}
        style={{ width: `${max > 0 ? Math.max(0.5, (value / max) * 100) : 0}%` }}
      />
    </div>
  </div>
);
