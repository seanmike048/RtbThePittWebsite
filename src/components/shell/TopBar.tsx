import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TABS, TAB_LABEL, type Tab } from '../../lib/cases/selection.ts';
import { useCases } from '../cases/CasesContext.tsx';
import { cx, fieldClass } from '../ui.tsx';
import { Icon } from './Icon.tsx';

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const explicit = document.documentElement.dataset.theme;
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('pitt-theme', theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const;
}

type Hit = { kind: 'case'; id: string; label: string; sub: string } | { kind: 'page'; id: Tab; label: string; sub: string };

/** ⌘K search over the run's publishers and the pages. Choosing a publisher selects it for every page. */
const Search: React.FC = () => {
  const { run, go, tab } = useCases();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const hits = useMemo<Hit[]>(() => {
    const n = q.trim().toLowerCase();
    const cases: Hit[] = run.cases
      .filter((c) => !n || [c.publisher, String(c.networkId), c.caseId, c.region ?? ''].some((x) => x.toLowerCase().includes(n)))
      .map((c) => ({ kind: 'case', id: c.caseId, label: c.publisher, sub: `#${c.networkId} · ${c.dsp} · ${c.status}` }));
    const pages: Hit[] = TABS.filter((t) => !n || TAB_LABEL[t].toLowerCase().includes(n)).map((t) => ({ kind: 'page', id: t, label: TAB_LABEL[t], sub: 'Page' }));
    return [...cases, ...pages].slice(0, 8);
  }, [q, run]);
  const choose = (h: Hit) => {
    if (h.kind === 'case') go(tab === 'overview' ? 'investigations' : tab, h.id);
    else go(h.id);
    setQ('');
    setOpen(false);
    ref.current?.blur();
  };

  return (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
        <Icon name="search" />
      </span>
      <input
        ref={ref}
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="pitt-search-results"
        aria-label="Search publishers, networks, case IDs and pages"
        placeholder="Search publishers, networks, case IDs…"
        value={q}
        onChange={(e) => (setQ(e.target.value), setOpen(true), setI(0))}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setI((x) => Math.min(x + 1, hits.length - 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setI((x) => Math.max(x - 1, 0)));
          else if (e.key === 'Enter' && hits[i]) choose(hits[i]);
          else if (e.key === 'Escape') (setOpen(false), ref.current?.blur());
        }}
        className={fieldClass() + ' w-full bg-surface pl-9 pr-12'}
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-sm border border-line bg-surface-2 px-1.5 text-[11px] text-muted sm:block">⌘K</kbd>
      {open && hits.length > 0 && (
        <ul id="pitt-search-results" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-line bg-surface-raised py-1 shadow-menu">
          {hits.map((h, k) => (
            <li key={h.kind + h.id} role="option" aria-selected={k === i}>
              <button
                type="button"
                onMouseDown={(e) => (e.preventDefault(), choose(h))}
                onMouseEnter={() => setI(k)}
                className={cx('flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm cursor-pointer', k === i && 'bg-surface-2')}
              >
                <span className="truncate text-ink">{h.label}</span>
                <span className="shrink-0 truncate text-xs text-muted">{h.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** White top bar: menu (small screens), search, selected publisher, theme, signed-in user when a backend answers. */
export const TopBar: React.FC<{ onMenu: () => void; user: { id: string; roles: string[] } | null; children?: React.ReactNode }> = ({ onMenu, user, children }) => {
  const [theme, toggleTheme] = useTheme();
  const { run, selected, select } = useCases();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button type="button" onClick={onMenu} aria-label="Open navigation" className="rounded-sm p-2 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer lg:hidden">
          <Icon name="menu" className="h-5 w-5" />
        </button>
        <Search />
        <label className="hidden min-w-0 items-center gap-2 text-xs text-muted md:flex">
          Publisher
          <select value={selected?.caseId ?? ''} onChange={(e) => select(e.target.value || null)} aria-label="Selected publisher" className={fieldClass('sm') + ' max-w-[15rem] truncate'}>
            <option value="">None selected</option>
            {run.cases.map((c) => (
              <option key={c.caseId} value={c.caseId}>
                {c.publisher} · #{c.networkId}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="rounded-sm p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        {user && (
          <span className="hidden items-center gap-2 lg:flex">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent-ink" aria-hidden>
              {user.id.slice(0, 2).toUpperCase()}
            </span>
            <span className="leading-tight">
              <span className="block max-w-[10rem] truncate text-[13px] font-medium text-ink">{user.id}</span>
              <span className="block max-w-[10rem] truncate text-[11px] text-muted">{user.roles.join(', ') || 'Signed in'}</span>
            </span>
          </span>
        )}
      </div>
      {children && <div className="border-t border-line">{children}</div>}
    </header>
  );
};
