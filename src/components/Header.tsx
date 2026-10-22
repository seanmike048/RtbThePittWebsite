import React, { useEffect, useState } from 'react';
import { ClipboardPaste, Moon, Sun } from 'lucide-react';
import { TABS, TAB_LABEL } from '../lib/cases/selection.ts';
import { useCases } from './cases/CasesContext.tsx';
import { Button, cx, fieldClass } from './ui.tsx';

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

/** Brand, the five sections, the selected publisher (always visible, never in the way) and the import action. */
export const Header: React.FC<{ onOpenImport: () => void; toolbar?: React.ReactNode }> = ({ onOpenImport, toolbar }) => {
  const [theme, toggleTheme] = useTheme();
  const { run, tab, go, selected, select } = useCases();

  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-line bg-surface/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-4">
          <a href="#/overview" onClick={(e) => (e.preventDefault(), go('overview'))} className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 19V5h6a4 4 0 0 1 0 8H7" />
              </svg>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-ink">The Pitt</span>
              <span className="hidden truncate text-[11px] text-muted sm:block">Equativ TechOps</span>
            </span>
          </a>

          <div className="flex min-w-0 shrink items-center gap-1 sm:gap-2">
            <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
              <span className="hidden md:inline">Publisher</span>
              <select
                value={selected?.caseId ?? ''}
                onChange={(e) => select(e.target.value || null)}
                aria-label="Selected publisher"
                className={fieldClass('sm') + ' w-[8.5rem] min-w-0 truncate sm:w-auto sm:max-w-[16rem]'}
              >
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
              className="rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Button variant="primary" size="sm" onClick={onOpenImport}>
              <ClipboardPaste className="h-4 w-4" />
              <span className="hidden sm:inline">Import run</span>
            </Button>
          </div>
        </div>

        <nav aria-label="Sections" className="scrollbar-none -mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <a
              key={t}
              href={'#/' + t}
              onClick={(e) => (e.preventDefault(), go(t))}
              aria-current={tab === t ? 'page' : undefined}
              className={cx(
                'whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm transition-colors',
                tab === t ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {TAB_LABEL[t]}
            </a>
          ))}
        </nav>
        {toolbar && <div className="border-t border-line">{toolbar}</div>}
      </div>
    </header>
  );
};
