import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, CircleSlash, Copy, Inbox, Info, Loader2, X } from 'lucide-react';

type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'ok' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  accent: 'bg-accent-soft text-accent-ink',
  danger: 'bg-danger-soft text-danger-ink',
  warn: 'bg-warn-soft text-warn-ink',
  ok: 'bg-ok-soft text-ok-ink',
  info: 'bg-info-soft text-info',
};

const DOTS: Record<Tone, string> = {
  neutral: 'bg-faint',
  accent: 'bg-accent',
  danger: 'bg-danger',
  warn: 'bg-warn',
  ok: 'bg-ok',
  info: 'bg-info',
};

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export const Badge: React.FC<{ tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }> = ({
  tone = 'neutral',
  dot,
  className,
  children,
}) => (
  <span
    className={cx(
      'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs whitespace-nowrap',
      TONES[tone],
      className,
    )}
  >
    {dot && <span className={cx('h-1.5 w-1.5 rounded-full', DOTS[tone])} />}
    {children}
  </span>
);

export const Card: React.FC<{ className?: string; children: React.ReactNode; as?: 'section' | 'div' | 'article' }> = ({
  className,
  children,
  as: Tag = 'section',
}) => <Tag className={cx('rounded-lg border border-line bg-surface', className)}>{children}</Tag>;

/** Maestro overline: 11px/500 uppercase with tracking. The only uppercase text in the product (rail sections, summary bands). */
export const Overline: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cx('text-[11px] font-medium uppercase leading-[14px] tracking-[0.06em]', className)}>{children}</p>
);

/** Maestro card header: 17px/400 title, actions right-aligned. */
export const CardHeader: React.FC<{ title: React.ReactNode; aside?: React.ReactNode; sub?: React.ReactNode; className?: string }> = ({ title, aside, sub, className }) => (
  <div className={cx('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-3.5 pb-3', className)}>
    <div className="min-w-0">
      <h2 className="text-[17px] font-normal leading-6 text-ink">{title}</h2>
      {sub && <p className="mt-0.5 max-w-3xl text-xs text-muted">{sub}</p>}
    </div>
    {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
  </div>
);

export const Eyebrow: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string }> = ({
  tone = 'neutral',
  children,
  className,
}) => {
  const color = {
    neutral: 'text-muted',
    accent: 'text-accent',
    danger: 'text-danger',
    warn: 'text-warn',
    ok: 'text-ok',
    info: 'text-info',
  }[tone];
  return (
    <Overline className={cx(color, className)}>{children}</Overline>
  );
};

export const SectionHeading: React.FC<{
  eyebrow?: string;
  eyebrowTone?: Tone;
  title: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ eyebrow, eyebrowTone = 'accent', title, description, aside, icon }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
      {icon && (
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        {eyebrow && <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow>}
        <h2 className="mt-1 text-[17px] font-normal leading-6 text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">{description}</p>}
      </div>
    </div>
    {aside && <div className="shrink-0">{aside}</div>}
  </div>
);

/**
 * One button for every route. Variants: primary (one per view), secondary, ghost. Disabled uses the disabled tokens
 * (legible, not faded); loading keeps the label and announces itself.
 */
export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md'; loading?: boolean }
> = ({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }) => (
  <button
    type="button"
    {...rest}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={cx(
      'inline-flex items-center justify-center gap-2 rounded-sm border font-medium transition-colors cursor-pointer disabled:cursor-not-allowed',
      'disabled:border-disabled-line disabled:bg-disabled disabled:text-disabled-ink disabled:shadow-none',
      size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm',
      variant === 'primary' && 'border-transparent bg-accent text-on-accent shadow-sm hover:bg-accent-ink active:opacity-90',
      variant === 'secondary' && 'border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-2',
      variant === 'ghost' && 'border-transparent text-link hover:bg-surface-2 active:bg-surface-2 disabled:border-transparent disabled:bg-transparent',
      className,
    )}
  >
    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
    {children}
  </button>
);

/** Text inputs and selects share one look and one set of states (focus, invalid, disabled). */
export const fieldClass = (size: 'sm' | 'md' = 'md') =>
  cx(
    'rounded-sm border border-line bg-surface text-ink placeholder:text-faint transition-colors hover:border-line-strong',
    'focus:border-focus focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus',
    'aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:border-disabled-line disabled:bg-disabled disabled:text-disabled-ink',
    size === 'sm' ? 'h-8 px-2 text-[13px]' : 'h-9 px-3 text-sm',
  );

type StateKind = 'empty' | 'loading' | 'error' | 'unavailable';
const STATE_ICON: Record<StateKind, React.ReactNode> = {
  empty: <Inbox className="h-4 w-4" aria-hidden />,
  loading: <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />,
  error: <AlertTriangle className="h-4 w-4" aria-hidden />,
  unavailable: <CircleSlash className="h-4 w-4" aria-hidden />,
};

/**
 * Shared empty, loading, error and unavailable states: same spacing, an icon and a title so the state never relies on
 * colour alone, an optional action.
 */
export const StateNote: React.FC<{ kind: StateKind; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string; compact?: boolean }> = ({
  kind,
  title,
  children,
  action,
  className,
  compact,
}) => (
  <div
    role={kind === 'error' ? 'alert' : kind === 'loading' ? 'status' : undefined}
    className={cx(
      'flex items-start gap-3 rounded-lg border text-sm',
      compact ? 'px-3 py-2' : 'px-4 py-3',
      kind === 'error' ? 'border-danger/30 bg-danger-soft text-danger-ink' : 'border-line bg-surface-2 text-ink-2',
      className,
    )}
  >
    <span className={cx('mt-0.5 shrink-0', kind === 'error' ? 'text-danger' : 'text-muted')}>{STATE_ICON[kind]}</span>
    <div className="min-w-0 flex-1">
      <p className={cx('font-medium', kind === 'error' ? 'text-danger-ink' : 'text-ink')}>{title}</p>
      {children && <div className="mt-0.5 text-muted [overflow-wrap:anywhere]">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  </div>
);

/** One table look: quiet header, hairline rows, hover, tabular numbers. */
export const table = {
  wrap: 'overflow-x-auto rounded-lg border border-line bg-surface',
  table: 'w-full text-left text-sm',
  head: 'bg-surface-2 text-[13px] text-muted',
  th: 'whitespace-nowrap border-b border-line px-3 py-2.5 font-normal',
  body: 'divide-y divide-line',
  row: 'transition-colors hover:bg-surface-2/70',
  td: 'px-3 py-3 align-top',
  num: 'num text-right',
} as const;

export function useCopy(timeout = 1800) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key = 'default') => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(key);
    window.setTimeout(() => setCopied(null), timeout);
  };
  return { copied, copy };
}

export const CopyButton: React.FC<{ text: string; label?: string; className?: string }> = ({
  text,
  label = 'Copy',
  className,
}) => {
  const { copied, copy } = useCopy();
  return (
    <Button size="sm" variant="secondary" onClick={() => copy(text)} className={className}>
      {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </Button>
  );
};

export const InfoTip: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="rounded-full p-0.5 text-faint transition-colors hover:text-ink-2 cursor-pointer"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="anim-fade-up absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-line bg-surface p-3 text-left text-xs leading-relaxed text-ink-2 shadow-xl"
        >
          <span className="mb-1 block font-semibold text-ink">{title}</span>
          {children}
        </span>
      )}
    </span>
  );
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  headerAside?: React.ReactNode;
  size?: 'md' | 'lg';
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, icon, footer, headerAside, size = 'md', children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} />
      <div
        className={cx(
          'anim-fade-up relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-line bg-surface-raised shadow-2xl sm:rounded-xl',
          size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-2xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerAside}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
};

/** Kept for existing callers: an empty state without a title line. */
export const EmptyNote: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('flex items-start gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm leading-relaxed text-muted', className)}>
    <span className="mt-0.5 shrink-0">{STATE_ICON.empty}</span>
    <div className="min-w-0">{children}</div>
  </div>
);

export const SegmentedControl = <T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: NoInfer<T>; label: string }[];
  ariaLabel: string;
}) => (
  <div role="tablist" aria-label={ariaLabel} className="scrollbar-none inline-flex max-w-full overflow-x-auto rounded-sm border border-line-strong">
    {options.map(o => (
      <button
        key={o.value}
        type="button"
        role="tab"
        aria-selected={value === o.value}
        onClick={() => onChange(o.value)}
        className={cx(
          'h-8 whitespace-nowrap border-l border-line-strong px-3 text-[13px] transition-colors first:border-l-0 cursor-pointer',
          value === o.value ? 'bg-accent-soft font-medium text-accent-ink' : 'bg-surface text-ink hover:bg-surface-2',
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const formatAmount = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatCompact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

export const formatTimestamp = (ts: string) => {
  const [date, time] = ts.split('T');
  return { date, time: time ? time.slice(0, 5) : '' };
};

export const TableShell: React.FC<{ children: React.ReactNode; minWidth?: string }> = ({ children, minWidth = '640px' }) => (
  <div className={table.wrap}>
    <table className={table.table} style={{ minWidth }}>
      {children}
    </table>
  </div>
);

export const Th: React.FC<{ children?: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th scope="col" className={cx('whitespace-nowrap border-b border-line bg-surface-2 px-3 py-2.5 text-[13px] font-normal text-muted', right && 'text-right')}>{children}</th>
);

