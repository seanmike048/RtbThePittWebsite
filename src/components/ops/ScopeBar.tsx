import React, { useState } from 'react';
import { Check, Database, LogIn, RefreshCw, ServerOff, Workflow, X } from 'lucide-react';
import { Badge, Button, cx } from '../ui.tsx';
import type { SessionInfo } from '../../lib/ops/types.ts';
import type { Ops } from './useOps.ts';

const ENV_TONE = { local: 'neutral', dev: 'info', staging: 'warn', production: 'danger' } as const;
const field = 'h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none';

/**
 * Where investigations start: in n8n. The hosted site cannot reach n8n dev (private network), so there is no launch
 * button; n8n pushes each run's results here (P1/P2 after M5) and the run list picks them up.
 */
const N8nNote: React.FC = () => (
  <p className="flex items-start gap-2 text-xs text-muted">
    <Workflow className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
    <span>
      <strong className="font-semibold text-ink-2">Start investigations in n8n</strong> (The Pitt main workflow, run from M1). Results appear here automatically, under Investigation
      runs and in Optimization.
    </span>
  </p>
);

/** Scope and actions shared by every tab: DSP, partner seats, networks and the refresh window for Refresh Snowflake data. */
export const ScopeBar: React.FC<{ ops: Ops }> = ({ ops }) => {
  const [token, setToken] = useState('');
  const { backend, session, status, dsps, dsp, scope, setScope, networks } = ops;

  if (backend === 'checking') return null;
  if (backend === 'none')
    return (
      <div className="flex items-start gap-2 py-2 text-xs text-muted">
        <ServerOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          No Pitt backend behind this page (static hosting or the claude.ai artifact). Results pushed by n8n and the server-side{' '}
          <strong className="font-semibold text-ink-2">Refresh Snowflake data</strong> are only on the hosted app; the in-page connector refresh on each tab still works.
        </span>
      </div>
    );
  if (!session?.user)
    return (
      <LockedBar
        session={session}
        signInForm={
          session?.auth_configured ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void ops.signIn(token).then(() => setToken(''));
              }}
            >
              <label htmlFor="pitt-token" className="text-xs text-muted">
                Sign in with your Pitt access token
              </label>
              <input id="pitt-token" type="password" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value)} className={cx(field, 'w-64')} />
              <Button size="sm" variant="secondary" type="submit" disabled={token.length < 24}>
                <LogIn className="h-4 w-4" /> Sign in
              </Button>
            </form>
          ) : null
        }
        error={ops.error}
      />
    );

  const roles = session.user.roles;
  const can = (r: string) => roles.includes(r) || roles.includes('admin');
  const refreshBlockers = [
    ...(!scope.seats.length || !networks.ids.length ? ['Choose seats and networks.'] : []),
    ...(!status?.snowflake.configured ? ['Snowflake refresh is not configured on this server.'] : []),
    ...(!can('refresher') ? ['Your account does not have the refresh permission.'] : []),
  ];
  const job = ops.refreshJob;

  return (
    <div className="space-y-2 py-2">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        {status && (
          <Badge tone={ENV_TONE[status.environment]} dot>
            {status.environment === 'production' ? 'PRODUCTION' : status.environment}
          </Badge>
        )}
        <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
          DSP
          <select className={field} value={scope.dsp} onChange={(e) => setScope({ ...scope, dsp: e.target.value, seats: [] })}>
            {dsps.map((d) => (
              <option key={d.key} value={d.key}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[11px] font-medium text-muted">Partner seat (endpoint)</legend>
          <div className="flex flex-wrap gap-1">
            {(dsp?.seats ?? []).map((s) => {
              const on = scope.seats.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  title={s.name}
                  onClick={() => setScope({ ...scope, seats: on ? scope.seats.filter((x) => x !== s.id) : [...scope.seats, s.id].sort((a, b) => a - b) })}
                  className={cx('num h-9 rounded-lg border px-2 text-xs cursor-pointer', on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong')}
                >
                  {s.id} {s.format ? <span className="text-muted">{s.format}</span> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
          Networks (IDs)
          <input className={cx(field, 'num w-40')} placeholder="5412, 5449" value={scope.networksText} onChange={(e) => setScope({ ...scope, networksText: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
          Refresh from (UTC)
          <input type="date" className={cx(field, 'num')} value={scope.from} onChange={(e) => setScope({ ...scope, from: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
          to
          <input type="date" className={cx(field, 'num')} value={scope.to} onChange={(e) => setScope({ ...scope, to: e.target.value })} />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={!!refreshBlockers.length || ops.busy !== null} onClick={() => void ops.refresh()} title={refreshBlockers.join(' ')}>
            <RefreshCw className={cx('h-4 w-4', job && ['queued', 'running'].includes(job.state) && 'animate-spin motion-reduce:animate-none')} /> Refresh Snowflake data
          </Button>
        </div>
      </div>
      <N8nNote />
      {(networks.invalid.length > 0 || refreshBlockers.length > 0 || ops.error || job) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {networks.invalid.length > 0 && <span className="text-danger-ink">Not a network ID: {networks.invalid.join(', ')}</span>}
          {refreshBlockers.length > 0 && <span className="text-muted">Refresh unavailable: {refreshBlockers.join(' ')}</span>}
          {ops.error && <span className="text-danger-ink">{ops.error}</span>}
          {job && (
            <span className="text-muted">
              <Database className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Refresh {job.state}
              {Object.entries(job.datasets ?? {}).map(([k, d]) => (
                <span key={k}>
                  {' · '}
                  {k}: {d.status}
                  {d.query_id ? ' (query ' + d.query_id + ')' : ''}
                  {d.coverage ? ', complete through ' + d.coverage.complete_through + ' UTC' : ''}
                  {d.error ? ' — ' + d.error : ''}
                </span>
              ))}
            </span>
          )}
        </div>
      )}

    </div>
  );
};

/**
 * Shown until someone is signed in: Refresh, disabled, with what the server still needs. Only variable names come from
 * the server; values never do.
 */
const LockedBar: React.FC<{ session: SessionInfo | null; signInForm: React.ReactNode; error: string | null }> = ({ session, signInForm, error }) => {
  const setup = session?.setup;
  const authOk = !!session?.auth_configured;
  const items: { label: string; ok: boolean; detail: string }[] = [
    {
      label: 'Sign-in',
      ok: authOk,
      detail: authOk ? 'Configured. Sign in to see results and refresh.' : 'Set ' + (setup?.auth ?? session?.missing ?? []).join(', ') + ' (App Hosting secrets pitt-users-json, pitt-session-secret).',
    },
    {
      label: 'Snowflake refresh',
      ok: !!setup && setup.snowflake.length === 0,
      detail: setup && setup.snowflake.length === 0 ? 'Configured.' : 'Set ' + (setup?.snowflake ?? ['the Snowflake settings']).join(', ') + ' (read-only service user from Analytics).',
    },
  ];
  const why = authOk ? 'Sign in first.' : 'Sign-in is not configured on this server.';
  return (
    <div className="space-y-2 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {setup && (
          <Badge tone={ENV_TONE[setup.environment as keyof typeof ENV_TONE] ?? 'neutral'} dot>
            {setup.environment === 'production' ? 'PRODUCTION' : setup.environment}
          </Badge>
        )}
        {signInForm}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled title={why}>
            <RefreshCw className="h-4 w-4" /> Refresh Snowflake data
          </Button>
        </div>
      </div>
      <N8nNote />
      <details className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs" open={!authOk}>
        <summary className="cursor-pointer font-medium text-ink-2">
          Refresh is disabled: {why} Setup checklist ({items.filter((i) => i.ok).length}/{items.length} done)
        </summary>
        <ul className="mt-2 space-y-1">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-2">
              {i.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-label="done" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-label="to do" />}
              <span>
                <strong className="font-semibold text-ink-2">{i.label}:</strong> <span className="text-muted">{i.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-muted">Steps: docs/the-pitt-ops-integration.md, section 7.</p>
      </details>
      {error && <p className="text-xs text-danger-ink">{error}</p>}
    </div>
  );
};
