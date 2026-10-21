import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiFailure, describe, setCsrf } from '../../lib/ops/api.ts';
import { idempotencyKey, isTerminal, parseNetworkIds, track, trackedRuns } from '../../lib/ops/runs.ts';
import type { Dsp, RefreshJob, Run, ServerStatus, SessionInfo } from '../../lib/ops/types.ts';

const store = (() => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
})();

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));

export interface Scope {
  dsp: string;
  seats: number[];
  networksText: string;
  from: string;
  to: string;
}

/** Backend connection, scope, launches and refresh jobs. Polls only real server state; nothing is simulated. */
export function useOps() {
  const [backend, setBackend] = useState<'checking' | 'none' | 'ok'>('checking');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [dsps, setDsps] = useState<Dsp[]>([]);
  const [scope, setScope] = useState<Scope>({ dsp: 'amazon_dsp', seats: [437], networksText: '', from: daysAgo(15), to: daysAgo(2) });
  const [runs, setRuns] = useState<Run[]>([]);
  const [refreshJob, setRefreshJob] = useState<RefreshJob | null>(null);
  const [busy, setBusy] = useState<null | 'launch' | 'refresh'>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingKey = useRef<{ scope: string; key: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.session();
      setBackend('ok');
      setSession(s);
      setCsrf(s.csrf ?? null);
      if (s.user) {
        const [st, caps, list] = await Promise.all([api.status(), api.capabilities(), api.runs()]);
        setStatus(st);
        setDsps(caps.dsps);
        const tracked = trackedRuns(store);
        setRuns([...list.runs.filter((r) => tracked.includes(r.run_id) || !isTerminal(r.state)), ...list.runs.filter((r) => !tracked.includes(r.run_id) && isTerminal(r.state))].slice(0, 20));
      }
    } catch (e) {
      if (e instanceof ApiFailure && e.error.code === 'backend_unreachable') setBackend('none');
      else setError(describe(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll non-terminal runs (server state, survives reloads through the run list).
  useEffect(() => {
    const open = runs.filter((r) => !isTerminal(r.state));
    if (!open.length) return;
    const t = setTimeout(async () => {
      const fresh = await Promise.all(open.map((r) => api.run(r.run_id).then((x) => x.run).catch(() => r)));
      setRuns((prev) => prev.map((r) => fresh.find((f) => f.run_id === r.run_id) ?? r));
    }, 5000);
    return () => clearTimeout(t);
  }, [runs]);

  // Results n8n pushes on its own arrive without a launch from this page: re-read the run list every 20 s while signed in.
  const signedIn = !!session?.user;
  useEffect(() => {
    if (!signedIn) return;
    const t = setInterval(() => {
      api
        .runs()
        .then(({ runs: list }) =>
          setRuns((prev) => {
            const byId = new Map(prev.map((r) => [r.run_id, r]));
            for (const r of list) {
              const old = byId.get(r.run_id);
              // Keep a full result already on screen when the list only carries a summary.
              byId.set(r.run_id, old && r.result && 'summary_only' in r.result && old.result && !('summary_only' in old.result) ? { ...r, result: old.result } : r);
            }
            return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
          }),
        )
        .catch(() => {});
    }, 20_000);
    return () => clearInterval(t);
  }, [signedIn]);

  useEffect(() => {
    if (!refreshJob || !['queued', 'running'].includes(refreshJob.state)) return;
    const t = setTimeout(() => api.refreshStatus(refreshJob.refresh_id).then((x) => setRefreshJob(x.refresh)).catch((e) => setError(describe(e))), 3000);
    return () => clearTimeout(t);
  }, [refreshJob]);

  const dsp = useMemo(() => dsps.find((d) => d.key === scope.dsp) ?? null, [dsps, scope.dsp]);
  const networks = useMemo(() => parseNetworkIds(scope.networksText), [scope.networksText]);

  const launch = useCallback(async () => {
    if (busy) return;
    setBusy('launch');
    setError(null);
    // Same scope, same key: a retried request is recognised by the server as the same launch.
    const sig = JSON.stringify([scope.dsp, scope.seats, networks.ids]);
    if (pendingKey.current?.scope !== sig) pendingKey.current = { scope: sig, key: idempotencyKey() };
    try {
      const { run } = await api.launch({ dsp: scope.dsp, partner_ids: scope.seats, network_ids: networks.ids, idempotency_key: pendingKey.current.key });
      track(store, run.run_id, true);
      setRuns((prev) => [run, ...prev.filter((r) => r.run_id !== run.run_id)]);
      pendingKey.current = null;
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  }, [busy, scope, networks.ids]);

  const refresh = useCallback(async () => {
    if (busy) return;
    setBusy('refresh');
    setError(null);
    try {
      const { refresh: job } = await api.refresh({ dsp: scope.dsp, partner_ids: scope.seats, network_ids: networks.ids, from: scope.from, to: scope.to });
      setRefreshJob(job);
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  }, [busy, scope, networks.ids]);

  const stopTracking = useCallback((runId: string) => {
    track(store, runId, false);
    setRuns((prev) => prev.filter((r) => r.run_id !== runId));
  }, []);

  const signIn = useCallback(
    async (token: string) => {
      setError(null);
      try {
        const s = await api.signIn(token);
        setCsrf(s.csrf);
        await load();
      } catch (e) {
        setError(describe(e));
      }
    },
    [load],
  );

  return { backend, session, status, dsps, dsp, scope, setScope, networks, runs, refreshJob, busy, error, launch, refresh, stopTracking, signIn, reload: load };
}

export type Ops = ReturnType<typeof useOps>;
