// The Pitt first-party API (/api/*). These routes are this application's contract, not n8n or Manage endpoints.
// Same-origin only (no CORS), JSON only, CSRF value required on every session-authenticated mutation.
import { publicCapabilities, WRITE_CAPABILITIES } from './capabilities.mjs';
import { missing } from './config.mjs';
import { ContractError } from './contracts.mjs';
import { createAuth } from './auth.mjs';
import { createInvestigations } from './investigations.mjs';
import { createOptimizations } from './optimizations.mjs';
import { createRefresh } from './refresh.mjs';
import { createSnowflake } from './snowflake.mjs';

const STATUS = { invalid: 400, unauthorized: 401, forbidden: 403, not_found: 404, duplicate: 409, stale: 409, unsupported: 422, rate_limited: 429, upstream_unavailable: 503, outcome_unknown: 202 };
const BROWSER_BODY_LIMIT = 64 * 1024;

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new ContractError('invalid', 'Body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ContractError('invalid', 'Body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, body, extra = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extra,
  });
  res.end(JSON.stringify(body));
}

export function createApi({ cfg, store, fetchImpl = fetch, manageAdapter, capabilities, schedule } = {}) {
  const auth = createAuth(cfg);
  const optimizations = createOptimizations({ cfg, store, adapter: manageAdapter, capabilities, schedule });
  const snowflake = createSnowflake(cfg, fetchImpl);
  const refresh = createRefresh({ cfg, store, snowflake, onPromote: (snap) => optimizations.onSnapshot(snap), schedule });
  const investigations = createInvestigations({ cfg, store, fetchImpl, schedule });
  const authGaps = missing(cfg, 'auth');

  function session(req, mutating) {
    if (authGaps.length) throw new ContractError('upstream_unavailable', 'Sign-in is not configured on this server', { missing: authGaps });
    const s = auth.fromRequest(req);
    if (!s) throw new ContractError('unauthorized', 'Sign in required');
    if (mutating) {
      if (req.headers['x-pitt-csrf'] !== s.csrf) throw new ContractError('forbidden', 'Missing or invalid CSRF token');
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new ContractError('forbidden', 'Cross-origin request refused');
    }
    return s.user;
  }

  async function route(req, res, url) {
    const m = req.method;
    const p = url.pathname;
    const seg = p.split('/').filter(Boolean); // ['api', ...]
    const mutating = m !== 'GET' && m !== 'HEAD';
    if (mutating && p !== '/api/investigation-events' && !/^application\/json\b/i.test(req.headers['content-type'] || '')) throw new ContractError('invalid', 'Content-Type must be application/json');

    // ---- session
    if (p === '/api/session' && m === 'POST') {
      if (authGaps.length) throw new ContractError('upstream_unavailable', 'Sign-in is not configured on this server', { missing: authGaps });
      const body = await readBody(req, 4096);
      const s = auth.login(body.token);
      if (!s) {
        store.audit({ kind: 'auth', action: 'login_refused' });
        throw new ContractError('unauthorized', 'Unknown access token');
      }
      store.audit({ kind: 'auth', action: 'login', actor: s.user.id });
      return json(res, 200, { user: { id: s.user.id, roles: s.user.roles }, csrf: s.csrf }, { 'set-cookie': auth.cookieHeader(s.cookie, auth.ttlSeconds) });
    }
    if (p === '/api/session' && m === 'GET') {
      // Setup gaps are variable names only (already public in .env.example), so a signed-out page can show what is missing.
      const setup = { environment: cfg.environment, auth: authGaps, launch: missing(cfg, 'launch'), snowflake: missing(cfg, 'snowflake') };
      if (authGaps.length) return json(res, 200, { user: null, auth_configured: false, missing: authGaps, setup });
      const s = auth.fromRequest(req);
      return json(res, 200, s ? { user: { id: s.user.id, roles: s.user.roles }, csrf: s.csrf, auth_configured: true } : { user: null, auth_configured: true, setup });
    }
    if (p === '/api/session' && m === 'DELETE') return json(res, 200, { ok: true }, { 'set-cookie': auth.cookieHeader('', 0) });

    // ---- service-only callback from n8n (no browser session)
    if (p === '/api/investigation-events' && m === 'POST') {
      const body = await readBody(req, cfg.n8n.maxResultBytes);
      const out = await investigations.receiveEvent(req.headers, body);
      if (out.applied && ['succeeded', 'partial', 'failed'].includes(out.run.state)) await optimizations.syncFromRun(store.get('runs', out.run.run_id));
      return json(res, 200, { applied: out.applied, reason: out.reason ?? null, state: out.run.state });
    }

    const user = session(req, mutating);

    if (p === '/api/status' && m === 'GET')
      return json(res, 200, {
        environment: cfg.environment,
        launch: { configured: !missing(cfg, 'launch').length, missing: missing(cfg, 'launch') },
        snowflake: { configured: !missing(cfg, 'snowflake').length, missing: missing(cfg, 'snowflake') },
        manage: { writes_enabled: cfg.manage.writesEnabled && !cfg.killSwitch, kill_switch: cfg.killSwitch },
        store: { kind: store.constructor.name, durable_across_instances: false },
      });
    if (p === '/api/dsp-capabilities' && m === 'GET') return json(res, 200, publicCapabilities());
    if (p === '/api/manage-capabilities' && m === 'GET') return json(res, 200, { capabilities: capabilities ?? WRITE_CAPABILITIES });

    // ---- investigations
    if (p === '/api/investigations' && m === 'POST') {
      const out = await investigations.launch(user, await readBody(req, BROWSER_BODY_LIMIT));
      return json(res, out.duplicate ? 200 : 202, out);
    }
    if (p === '/api/investigations' && m === 'GET') return json(res, 200, { runs: investigations.list(user) });
    if (seg[1] === 'investigations' && seg.length === 3 && m === 'GET') return json(res, 200, { run: investigations.get(user, seg[2]) });

    // ---- analytics refresh
    if (p === '/api/analytics/refresh' && m === 'POST') {
      const out = await refresh.start(user, await readBody(req, BROWSER_BODY_LIMIT));
      return json(res, out.duplicate ? 200 : 202, out);
    }
    if (seg[1] === 'analytics' && seg[2] === 'refresh' && seg.length === 4 && m === 'GET') return json(res, 200, refresh.get(user, seg[3]));

    // ---- optimizations
    if (p === '/api/optimizations' && m === 'GET') return json(res, 200, { recommendations: optimizations.list(user) });
    if (seg[1] === 'optimizations' && seg.length === 4) {
      const id = seg[2];
      if (seg[3] === 'preview' && m === 'POST') return json(res, 200, await optimizations.preview(user, id));
      if (seg[3] === 'decision' && m === 'POST') return json(res, 200, await optimizations.decide(user, id, await readBody(req, BROWSER_BODY_LIMIT)));
      if (seg[3] === 'execution' && m === 'GET') return json(res, 200, { execution: optimizations.execution(user, id) });
      if (seg[3] === 'rollback-preview' && m === 'POST') return json(res, 200, { preview: await optimizations.rollbackPreview(user, id) });
    }
    throw new ContractError('not_found', 'Unknown route');
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      await route(req, res, url);
    } catch (e) {
      const code = e instanceof ContractError ? e.code : 'internal';
      const status = STATUS[code] ?? 500;
      // Internal errors never leak stack traces, SQL or upstream bodies.
      json(res, status, { error: { code, message: e instanceof ContractError ? e.message : 'Internal error', details: e instanceof ContractError ? e.details ?? null : null } });
    }
  }

  const timer = setInterval(() => investigations.sweep().catch(() => {}), 60_000);
  timer.unref?.();

  return { handle, investigations, refresh, optimizations, auth, close: () => clearInterval(timer) };
}
