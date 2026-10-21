/** Same-origin client for The Pitt API. Sends the session cookie and the CSRF value; never holds n8n, Manage or Snowflake credentials. */
import type { ApiError, Dsp, Preview, Recommendation, RefreshJob, Run, ServerStatus, SessionInfo } from './types.ts';

export class ApiFailure extends Error {
  constructor(public status: number, public error: ApiError) {
    super(error.message);
  }
}

let csrf: string | null = null;
export const setCsrf = (v: string | null) => {
  csrf = v;
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(method !== 'GET' && csrf ? { 'x-pitt-csrf': csrf } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFailure(0, { code: 'backend_unreachable', message: 'The Pitt backend is not reachable from this page.' });
  }
  const type = res.headers.get('content-type') ?? '';
  // A static host (or the claude.ai artifact) answers /api with HTML or 404: that means no backend, not an error from it.
  if (!type.includes('application/json')) throw new ApiFailure(res.status, { code: 'backend_unreachable', message: 'No Pitt backend behind this page (static hosting).' });
  const json = await res.json();
  if (!res.ok) throw new ApiFailure(res.status, json.error ?? { code: 'upstream_error', message: 'Request failed' });
  return json as T;
}

export const api = {
  session: () => call<SessionInfo>('GET', '/api/session'),
  signIn: (token: string) => call<{ user: SessionInfo['user']; csrf: string }>('POST', '/api/session', { token }),
  signOut: () => call<{ ok: true }>('DELETE', '/api/session'),
  status: () => call<ServerStatus>('GET', '/api/status'),
  capabilities: () => call<{ source: string; dsps: Dsp[] }>('GET', '/api/dsp-capabilities'),
  launch: (b: { dsp: string; partner_ids: number[]; network_ids: number[]; idempotency_key: string; snapshot_id?: string | null }) =>
    call<{ run: Run; duplicate: boolean }>('POST', '/api/investigations', b),
  runs: () => call<{ runs: Run[] }>('GET', '/api/investigations'),
  run: (id: string) => call<{ run: Run }>('GET', '/api/investigations/' + encodeURIComponent(id)),
  refresh: (b: { dsp: string; partner_ids: number[]; network_ids: number[]; from: string; to: string }) => call<{ refresh: RefreshJob; duplicate: boolean }>('POST', '/api/analytics/refresh', b),
  refreshStatus: (id: string) => call<{ refresh: RefreshJob; snapshot: unknown }>('GET', '/api/analytics/refresh/' + encodeURIComponent(id)),
  optimizations: () => call<{ recommendations: Recommendation[] }>('GET', '/api/optimizations'),
  preview: (id: string) => call<{ status: string; reason?: string; ask?: { channel: string; text: string }; preview?: Preview }>('POST', '/api/optimizations/' + encodeURIComponent(id) + '/preview', {}),
  decide: (id: string, b: { decision: 'yes' | 'no'; preview_id: string; payload_hash: string; reason?: string }) =>
    call<{ queued: boolean; execution_id?: string }>('POST', '/api/optimizations/' + encodeURIComponent(id) + '/decision', b),
  execution: (id: string) => call<{ execution: unknown }>('GET', '/api/optimizations/' + encodeURIComponent(id) + '/execution'),
};

export const describe = (e: unknown) => (e instanceof ApiFailure ? e.error.message + (e.error.details?.missing?.length ? ' Missing: ' + e.error.details.missing.join(', ') + '.' : '') : 'Unexpected error');
