import React, { useEffect, useState } from 'react';
import { Check, Copy, Info, X } from 'lucide-react';

type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'ok' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2 border-line',
  accent: 'bg-accent-soft text-accent-ink border-accent/25',
  danger: 'bg-danger-soft text-danger-ink border-danger/25',
  warn: 'bg-warn-soft text-warn-ink border-warn/30',
  ok: 'bg-ok-soft text-ok-ink border-ok/25',
  info: 'bg-info-soft text-info border-info/25',
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
      'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
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
}) => <Tag className={cx('rounded-xl border border-line bg-surface shadow-card', className)}>{children}</Tag>;

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
    <p className={cx('text-[11px] font-semibold uppercase tracking-[0.08em]', color, className)}>{children}</p>
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
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        {eyebrow && <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow>}
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">{description}</p>}
      </div>
    </div>
    {aside && <div className="shrink-0">{aside}</div>}
  </div>
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' }
> = ({ variant = 'secondary', size = 'md', className, children, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={cx(
      'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
      size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
      variant === 'primary' && 'bg-accent text-on-accent shadow-sm hover:opacity-90',
      variant === 'secondary' && 'border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
      variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-ink',
      className,
    )}
  >
    {children}
  </button>
);

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
          'anim-fade-up relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl',
          size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-2xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
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

export const EmptyNote: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div
    className={cx(
      'rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-3 text-sm italic leading-relaxed text-muted',
      className,
    )}
  >
    {children}
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
  <div role="tablist" aria-label={ariaLabel} className="scrollbar-none inline-flex max-w-full overflow-x-auto rounded-xl border border-line bg-surface-2 p-1">
    {options.map(o => (
      <button
        key={o.value}
        type="button"
        role="tab"
        aria-selected={value === o.value}
        onClick={() => onChange(o.value)}
        className={cx(
          'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all cursor-pointer',
          value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
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
  <div className="overflow-x-auto rounded-xl border border-line">
    <table className="w-full text-left text-sm" style={{ minWidth }}>
      {children}
    </table>
  </div>
);

export const Th: React.FC<{ children?: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th className={cx('whitespace-nowrap bg-surface-2 px-4 py-3 text-xs font-medium text-muted', right && 'text-right')}>{children}</th>
);

