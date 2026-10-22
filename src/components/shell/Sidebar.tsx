import React, { useEffect } from 'react';
import { TABS, TAB_LABEL, type Tab } from '../../lib/cases/selection.ts';
import { useCases } from '../cases/CasesContext.tsx';
import { cx, Overline } from '../ui.tsx';
import { Icon, type IconName } from './Icon.tsx';

const ICON: Record<Tab, IconName> = { overview: 'room', investigations: 'investigations', impact: 'impact', projection: 'projection', optimization: 'optimization' };

/** The Pitt mark on a light chip (the logo's navy ink cannot sit on the dark rail) and a white wordmark. */
export const Brand: React.FC = () => (
  <span className="flex items-center gap-2.5">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-mark-chip" aria-hidden>
      <img src="/brand/the-pitt-mark-128.png" alt="" className="h-[18px] w-auto" />
    </span>
    <span className="leading-none">
      <span className="block text-[17px] font-bold tracking-[0.02em] text-sidebar-strong">THE PITT</span>
      <span className="mt-1 block text-[9px] font-medium tracking-[0.12em] text-sidebar-muted">BY EQUATIV</span>
    </span>
  </span>
);

/**
 * Maestro-style left rail, dark in both themes. One section, "The Pitt": the five pages, with the run's publisher
 * count as a quiet number. On small screens it opens as a drawer from the top bar.
 */
export const Sidebar: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { tab, go, run } = useCases();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  const nav = (
    <nav aria-label="The Pitt" className="flex h-full flex-col bg-sidebar px-2 pb-4 pt-4 text-sidebar-ink">
      <a href="#/overview" onClick={(e) => (e.preventDefault(), go('overview'), onClose())} className="mb-6 block rounded-sm px-2 py-1">
        <Brand />
      </a>
      <Overline className="px-2 pb-1.5 text-sidebar-muted">The Pitt</Overline>
      <ul className="space-y-0.5">
        {TABS.map((t) => {
          const on = tab === t;
          return (
            <li key={t}>
              <a
                href={'#/' + t}
                onClick={(e) => (e.preventDefault(), go(t), onClose())}
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'flex h-8 items-center gap-2.5 rounded-sm px-2 text-[13px] transition-colors',
                  on ? 'bg-sidebar-active font-bold text-sidebar-strong' : 'text-sidebar-ink hover:bg-sidebar-active/60',
                )}
              >
                <span className={on ? 'text-brand' : 'text-sidebar-muted'}>
                  <Icon name={ICON[t]} />
                </span>
                <span className="truncate">{TAB_LABEL[t]}</span>
                {t === 'investigations' && <span className="num ml-auto text-xs font-normal text-sidebar-muted">{run.cases.length}</span>}
              </a>
            </li>
          );
        })}
      </ul>
      <div className="my-4 border-t border-sidebar-line" />
      <Overline className="px-2 pb-1.5 text-sidebar-muted">Run</Overline>
      <p className="px-2 text-xs leading-relaxed text-sidebar-ink">{run.label}</p>
      <p className="px-2 text-[11px] text-sidebar-muted">
        {run.cases.length} publisher case{run.cases.length === 1 ? '' : 's'} · Amazon DSP
      </p>
      <p className="mt-auto px-2 text-[11px] leading-relaxed text-sidebar-muted">Read-only. Nothing is sent, created or changed from here.</p>
    </nav>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[188px] lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-overlay" onClick={onClose} />
          <div className="anim-slide-in-left absolute inset-y-0 left-0 w-[240px] shadow-menu">{nav}</div>
        </div>
      )}
    </>
  );
};
