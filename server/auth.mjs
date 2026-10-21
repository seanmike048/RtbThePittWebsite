// Authentication and authorisation. Per-user access tokens (stored only as SHA-256 hashes in PITT_USERS_JSON) are exchanged
// for a signed HttpOnly session cookie; every mutation also needs the CSRF value bound to that session.
// Roles are separate permissions: hidden buttons are never access control, every route checks here.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sha256 } from './contracts.mjs';

export const ROLES = ['viewer', 'launcher', 'refresher', 'approver', 'executor', 'admin'];
const COOKIE = 'pitt_session';

const b64 = (s) => Buffer.from(s).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');
const sign = (secret, data) => createHmac('sha256', secret).update(data).digest('base64url');
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function parseUsers(json) {
  let list;
  try {
    list = JSON.parse(json || '[]');
  } catch {
    throw new Error('PITT_USERS_JSON is not valid JSON');
  }
  if (!Array.isArray(list)) throw new Error('PITT_USERS_JSON must be an array');
  return list.map((u) => {
    if (!/^[a-z0-9._-]{2,60}$/i.test(u.id || '')) throw new Error('user id');
    if (!/^[a-f0-9]{64}$/.test(u.token_sha256 || '')) throw new Error('token_sha256 for ' + u.id);
    const roles = (u.roles || []).filter((r) => ROLES.includes(r));
    return { id: u.id, tokenHash: u.token_sha256, roles, networks: u.networks || [], partners: u.partners || [], projects: u.projects || [] };
  });
}

export function principal(u) {
  const has = (r) => u.roles.includes(r) || u.roles.includes('admin');
  return {
    id: u.id,
    roles: u.roles,
    has,
    canSeeNetwork: (n) => u.networks.includes('*') || u.networks.map(Number).includes(Number(n)),
    canSeePartner: (p) => u.partners.includes('*') || u.partners.includes(p),
  };
}

export const DEV_USER = { id: 'local-dev', tokenHash: '0'.repeat(64), roles: ['viewer', 'launcher', 'refresher', 'approver'], networks: ['*'], partners: ['*'] };

export function createAuth(cfg) {
  const users = cfg.auth.mode === 'tokens' && cfg.auth.usersJson ? parseUsers(cfg.auth.usersJson) : [];
  const secret = cfg.auth.sessionSecret;
  const ttl = cfg.auth.sessionTtlMinutes * 60_000;

  function login(token) {
    if (cfg.auth.mode === 'dev') return issue(DEV_USER);
    if (typeof token !== 'string' || token.length < 24) return null;
    const h = sha256(token);
    const u = users.find((x) => same(x.tokenHash, h));
    return u ? issue(u) : null;
  }

  function issue(u) {
    const payload = { uid: u.id, exp: Date.now() + ttl, csrf: randomBytes(18).toString('base64url') };
    const data = b64(JSON.stringify(payload));
    const value = data + '.' + sign(secret || 'dev-only-not-a-secret', data);
    return { cookie: value, csrf: payload.csrf, user: principal(u) };
  }

  function fromRequest(req) {
    const raw = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
    if (!raw) return null;
    const [data, sig] = raw.slice(COOKIE.length + 1).split('.');
    if (!data || !sig || !same(sig, sign(secret || 'dev-only-not-a-secret', data))) return null;
    let p;
    try {
      p = JSON.parse(unb64(data));
    } catch {
      return null;
    }
    if (!(p.exp > Date.now())) return null;
    const u = cfg.auth.mode === 'dev' ? DEV_USER : users.find((x) => x.id === p.uid);
    return u ? { user: principal(u), csrf: p.csrf } : null;
  }

  const cookieHeader = (value, maxAgeSeconds) =>
    COOKIE + '=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAgeSeconds + (cfg.environment === 'local' ? '' : '; Secure');

  return { login, fromRequest, cookieHeader, ttlSeconds: Math.floor(ttl / 1000) };
}
