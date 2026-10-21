// Read-only Snowflake access through the Snowflake SQL API (POST /api/v2/statements) with key-pair JWT authentication.
// Only allowlisted query families run here (refresh.mjs); every value is a bind variable. Errors are mapped to codes,
// never passed through with raw SQL text.
import { createPrivateKey, createSign, randomUUID } from 'node:crypto';
import { hostAllowed, missing, snowflakeBase } from './config.mjs';
import { ContractError } from './contracts.mjs';

const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

/** JWT per the Snowflake key-pair docs: iss = ACCOUNT.USER.SHA256:<fingerprint>, sub = ACCOUNT.USER, lifetime <= 1 hour. */
export function keyPairJwt(cfg, nowSec = Math.floor(Date.now() / 1000)) {
  const account = String(cfg.snowflake.account).toUpperCase().split('.')[0];
  const user = String(cfg.snowflake.user).toUpperCase();
  const fp = String(cfg.snowflake.publicKeyFingerprint).startsWith('SHA256:') ? cfg.snowflake.publicKeyFingerprint : 'SHA256:' + cfg.snowflake.publicKeyFingerprint;
  const head = b64u({ alg: 'RS256', typ: 'JWT' });
  const body = b64u({ iss: account + '.' + user + '.' + fp, sub: account + '.' + user, iat: nowSec, exp: nowSec + 59 * 60 });
  const s = createSign('RSA-SHA256');
  s.update(head + '.' + body);
  return head + '.' + body + '.' + s.sign(createPrivateKey(cfg.snowflake.privateKeyPem)).toString('base64url');
}

export function createSnowflake(cfg, fetchImpl = fetch) {
  const base = snowflakeBase(cfg);

  async function call(url, init) {
    if (!hostAllowed(cfg, url)) throw new ContractError('upstream_unavailable', 'Snowflake host not allowed');
    let res;
    try {
      res = await fetchImpl(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout((cfg.snowflake.statementTimeoutSeconds + 15) * 1000),
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: 'Bearer ' + keyPairJwt(cfg),
          'x-snowflake-authorization-token-type': 'KEYPAIR_JWT',
          'user-agent': 'the-pitt/1.0',
        },
      });
    } catch (e) {
      throw new ContractError('upstream_unavailable', e?.name === 'TimeoutError' ? 'Snowflake did not answer in time' : 'Snowflake unreachable');
    }
    const json = await res.json().catch(() => ({}));
    if (res.status === 429) throw new ContractError('rate_limited', 'Snowflake rate limit');
    if (res.status === 401 || res.status === 403) throw new ContractError('unauthorized', 'The read-only service identity was refused by Snowflake');
    if (res.status === 422 || res.status >= 400) throw new ContractError('invalid', 'Query failed (Snowflake code ' + (json.code || res.status) + ')', { query_id: json.statementHandle ?? null });
    return { status: res.status, json };
  }

  /**
   * Runs one statement. Binds are positional ('?'). Returns typed rows plus the query ID (statementHandle) for provenance.
   * Results larger than the first partition are refused rather than silently truncated.
   */
  async function query(sql, binds = []) {
    const gaps = missing(cfg, 'snowflake');
    if (gaps.length) throw new ContractError('upstream_unavailable', 'Snowflake refresh is not configured on this server', { missing: gaps });
    const bindings = Object.fromEntries(binds.map((v, i) => [String(i + 1), { type: typeof v === 'number' ? 'FIXED' : 'TEXT', value: String(v) }]));
    let { status, json } = await call(base + '/api/v2/statements?requestId=' + randomUUID(), {
      method: 'POST',
      body: JSON.stringify({ statement: sql, timeout: cfg.snowflake.statementTimeoutSeconds, warehouse: cfg.snowflake.warehouse, role: cfg.snowflake.role, bindings }),
    });
    const deadline = Date.now() + cfg.snowflake.statementTimeoutSeconds * 1000;
    while (status === 202 && json.statementHandle) {
      if (Date.now() > deadline) throw new ContractError('upstream_unavailable', 'Query still running after the configured timeout', { query_id: json.statementHandle });
      await new Promise((r) => setTimeout(r, 1500));
      ({ status, json } = await call(base + '/api/v2/statements/' + encodeURIComponent(json.statementHandle), { method: 'GET' }));
    }
    const meta = json.resultSetMetaData || {};
    if ((meta.partitionInfo || []).length > 1) throw new ContractError('invalid', 'Result too large for one partition; narrow the scope', { query_id: json.statementHandle });
    const cols = (meta.rowType || []).map((c) => String(c.name).toUpperCase());
    const rows = (json.data || []).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? null])));
    if (rows.length > cfg.snowflake.maxRowsPerQuery) throw new ContractError('invalid', 'Result exceeds the configured row limit', { query_id: json.statementHandle });
    return { query_id: json.statementHandle ?? null, executed_at: new Date().toISOString(), rows, row_count: Number(meta.numRows ?? rows.length) };
  }

  return { query };
}
