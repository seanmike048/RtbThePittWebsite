import React, { useState } from 'react';
import { Database, LogIn, Play, RefreshCw, ServerOff } from 'lucide-react';
import { Badge, Button, Modal, cx } from '../ui.tsx';
import { launchBlockers } from '../../lib/ops/runs.ts';
import type { Ops } from './useOps.ts';

const ENV_TONE = { local: 'neutral', dev: 'info', staging: 'warn', production: 'danger' } as const;
const field = 'h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none';

/** Scope and actions shared by every tab: DSP, partner seats, networks, refresh window, Launch and Refresh. */
export const ScopeBar: React.FC<{ ops: Ops }> = ({ ops }) => {
  const [confirm, setConfirm] = useState(false);
  const [token, setToken] = useState('');
  const { backend, session, status, dsps, dsp, scope, setScope, networks } = ops;

  if (backend === 'checking') return null;
  if (backend === 'none')
    return (
      <div className="flex items-start gap-2 py-2 text-xs text-muted">
        <ServerOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          No Pitt backend behind this page (static hosting or the claude.ai artifact). <strong className="font-semibold text-ink-2">Launch investigation</strong> and the server-side{' '}
          <strong className="font-semibold text-ink-2">Refresh Snowflake data</strong> run only on the hosted app with its API configured; the in-page connector refresh on each tab still works.
        </span>
      </div>
    );
  if (session && !session.auth_configured)
    return <p className="py-2 text-xs text-warn-ink">Sign-in is not configured on this server. Missing: {(session.missing ?? []).join(', ')}.</p>;
  if (!session?.user)
    return (
      <form
        className="flex flex-wrap items-center gap-2 py-2"
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
        {ops.error && <span className="text-xs text-danger-ink">{ops.error}</span>}
      </form>
    );

  const roles = session.user.roles;
  const can = (r: string) => roles.includes(r) || roles.includes('admin');
  const blockers = launchBlockers(dsp, scope.seats, networks.ids, { configured: !!status?.launch.configured, canLaunch: can('launcher'), busy: ops.busy === 'launch' });
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
                {d.name} · {d.status === 'supported' ? 'supported' : d.status === 'read_only' ? 'read-only' : 'not integrated'}
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
          <Button size="sm" variant="primary" disabled={!!blockers.length} onClick={() => setConfirm(true)} title={blockers.join(' ')}>
            <Play className="h-4 w-4" /> Launch investigation
          </Button>
        </div>
      </div>
      {(networks.invalid.length > 0 || blockers.length > 0 || ops.error || job) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {networks.invalid.length > 0 && <span className="text-danger-ink">Not a network ID: {networks.invalid.join(', ')}</span>}
          {blockers.length > 0 && <span className="text-muted">Launch unavailable: {blockers.join(' ')}</span>}
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

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Launch an investigation?"
        subtitle="Review the exact scope sent to n8n."
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={ops.busy === 'launch'}
              onClick={() => {
                void ops.launch().then(() => setConfirm(false));
              }}
            >
              Launch
            </Button>
          </div>
        }
      >
        <dl className="grid grid-cols-[minmax(0,12rem)_1fr] gap-x-4 gap-y-2 px-5 py-4 text-sm">
          <dt className="text-muted">Environment</dt>
          <dd className="font-medium text-ink">{status?.environment}</dd>
          <dt className="text-muted">DSP</dt>
          <dd className="text-ink">{dsp?.name}</dd>
          <dt className="text-muted">Partner seats</dt>
          <dd className="text-ink">{scope.seats.map((id) => (dsp?.seats.find((s) => s.id === id)?.name ?? 'seat') + ' (' + id + ')').join(', ')}</dd>
          <dt className="text-muted">Networks</dt>
          <dd className="num text-ink">{networks.ids.join(', ')}</dd>
          <dt className="text-muted">Time window</dt>
          <dd className="text-ink">Set by the workflow: 14 days before each cut to up to 30 days after it (UTC days). The refresh dates above do not apply.</dd>
          <dt className="text-muted">Side effects</dt>
          <dd className="text-ink">Read-only investigation. This launch path posts nothing to Slack, creates no Jira ticket and changes no setting. Each launch uses one n8n execution from the project's weekly quota.</dd>
        </dl>
      </Modal>
    </div>
  );
};
