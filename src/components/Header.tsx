import React, { useEffect, useState } from 'react';
import { Code2, Moon, Sun, Upload } from 'lucide-react';
import type { RTBViewModel } from '../lib/adapter/types.ts';
import { Button, cx } from './ui.tsx';

export type TabId = 'overview' | 'disconnections' | 'analytics' | 'signals' | 'validation' | 'specs';

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
  return [theme, () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))] as const;
}

export const Header: React.FC<{
  model: RTBViewModel;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onOpenImport: () => void;
  onOpenSource: () => void;
}> = ({ model, activeTab, onTabChange, onOpenImport, onOpenSource }) => {
  const [theme, toggleTheme] = useTheme();

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'disconnections', label: 'Disconnections', count: model.disconnections.length },
    { id: 'analytics', label: 'Analytics & CFO model' },
    { id: 'signals', label: 'Signals & checklist' },
    { id: 'validation', label: 'Validation & Slack' },
    { id: 'specs', label: 'Adapter specs' },
  ];

  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-line bg-surface/85 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <a href="#" onClick={e => (e.preventDefault(), onTabChange('overview'))} className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 19V5h6a4 4 0 0 1 0 8H7" />
              </svg>
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[15px] font-bold tracking-tight text-ink">The Pitt</p>
              <p className="truncate text-xs text-muted">RTB Command Center · Equativ TechOps</p>
            </div>
          </a>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="rounded-xl p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Button variant="ghost" size="sm" onClick={onOpenSource} title="Inspect raw source JSON">
              <Code2 className="h-4 w-4" />
              <span className="hidden sm:inline">Raw source</span>
            </Button>
            <Button variant="primary" size="sm" onClick={onOpenImport}>
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import data</span>
              <span className="sm:hidden">Import</span>
            </Button>
          </div>
        </div>

        <nav aria-label="Sections" className="scrollbar-none -mb-px flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              aria-current={activeTab === t.id ? 'page' : undefined}
              className={cx(
                'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-sm font-medium transition-colors cursor-pointer',
                activeTab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cx(
                    'num rounded-full px-1.5 py-0.5 text-[11px] leading-none',
                    activeTab === t.id ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-muted',
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};
