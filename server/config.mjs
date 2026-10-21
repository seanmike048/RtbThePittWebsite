// Server configuration, read once from the environment. Variable names are documented in .env.example; no value is ever logged.
// Every external destination comes from here (never from a request), so a browser cannot choose a URL, workflow or credential.

const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Math.trunc(Number(v)));
const str = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

const ENVIRONMENTS = ['local', 'dev', 'staging', 'production'];

/** Hosts the server may call. A configured URL whose host is not listed here is refused at start-up and at call time. */
function hostAllowlist(raw) {
  return (raw || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const environment = ENVIRONMENTS.includes(env.PITT_ENV) ? env.PITT_ENV : 'local';
  const cfg = {
    environment,
    port: int(env.PORT, 8080),
    dataDir: str(env.PITT_DATA_DIR) || '.pitt-data',
    auth: {
      // 'tokens': per-user access tokens (SHA-256 hashes in PITT_USERS_JSON) exchanged for an HttpOnly session cookie.
      // 'dev': one fixed local user, refused outside PITT_ENV=local.
      mode: env.PITT_AUTH_MODE === 'dev' ? 'dev' : 'tokens',
      usersJson: str(env.PITT_USERS_JSON),
      sessionSecret: str(env.PITT_SESSION_SECRET),
      sessionTtlMinutes: int(env.PITT_SESSION_TTL_MINUTES, 480),
    },
    allowedHosts: hostAllowlist(env.PITT_ALLOWED_OUTBOUND_HOSTS),
    // Browser origins allowed to call mutating routes, e.g. https://thepitt--<project>.<region>.hosted.app
    publicOrigins: (env.PITT_PUBLIC_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean),
    n8n: {
      // The approved webhook URL for this environment (n8n "Production URL" of the Webhook node, or its Test URL in dev).
      // It is never derived from the editor URL of the workflow.
      launchUrl: str(env.PITT_N8N_LAUNCH_URL),
      launchHeaderName: str(env.PITT_N8N_LAUNCH_HEADER_NAME),
      launchHeaderValue: str(env.PITT_N8N_LAUNCH_HEADER_VALUE),
      workflowId: str(env.PITT_N8N_WORKFLOW_ID),
      // Service credential n8n sends on the callback (n8n Header Auth credential on the callback node).
      callbackHeaderName: str(env.PITT_CALLBACK_HEADER_NAME) || 'x-pitt-callback-key',
      callbackHeaderValue: str(env.PITT_CALLBACK_HEADER_VALUE),
      dispatchTimeoutMs: int(env.PITT_N8N_DISPATCH_TIMEOUT_MS, 15000),
      runTimeoutMinutes: int(env.PITT_RUN_TIMEOUT_MINUTES, 45),
      maxConcurrentRuns: int(env.PITT_MAX_CONCURRENT_RUNS, 1),
      // n8n project quota noted in the main workflow's M2 Config: 25 executions / project / week. Set the budget for site launches.
      weeklyLaunchBudget: int(env.PITT_WEEKLY_LAUNCH_BUDGET, 0),
      maxResultBytes: int(env.PITT_MAX_RESULT_BYTES, 2_000_000),
      callbackSkewSeconds: int(env.PITT_CALLBACK_SKEW_SECONDS, 300),
    },
    snowflake: {
      account: str(env.PITT_SNOWFLAKE_ACCOUNT), // account identifier, e.g. orgname-accountname
      user: str(env.PITT_SNOWFLAKE_USER),
      role: str(env.PITT_SNOWFLAKE_ROLE),
      warehouse: str(env.PITT_SNOWFLAKE_WAREHOUSE),
      privateKeyPem: str(env.PITT_SNOWFLAKE_PRIVATE_KEY_PEM),
      publicKeyFingerprint: str(env.PITT_SNOWFLAKE_PUBLIC_KEY_FP), // "SHA256:..." as returned by DESC USER
      statementTimeoutSeconds: int(env.PITT_SNOWFLAKE_STATEMENT_TIMEOUT_SECONDS, 120),
      maxRowsPerQuery: int(env.PITT_SNOWFLAKE_MAX_ROWS, 5000),
    },
    manage: {
      // Kept null on purpose: no verified Manage API contract exists yet (see docs/manage-capability-matrix.md).
      baseUrl: str(env.PITT_MANAGE_BASE_URL),
      writesEnabled: bool(env.PITT_MANAGE_WRITES_ENABLED, false),
    },
    killSwitch: bool(env.PITT_WRITE_KILL_SWITCH, true), // true = no external writes at all (default)
    approvalTtlMinutes: int(env.PITT_APPROVAL_TTL_MINUTES, 30),
  };
  return cfg;
}

/** Problems that make a feature unavailable, in plain words. Empty array = configured. Values are never echoed. */
export function missing(cfg, feature) {
  const out = [];
  if (feature === 'auth') {
    if (cfg.auth.mode === 'dev' && cfg.environment !== 'local') out.push('PITT_AUTH_MODE=dev is only allowed with PITT_ENV=local');
    if (cfg.auth.mode === 'tokens') {
      if (!cfg.auth.usersJson) out.push('PITT_USERS_JSON');
      if (!cfg.auth.sessionSecret || cfg.auth.sessionSecret.length < 32) out.push('PITT_SESSION_SECRET (32+ characters)');
    }
  }
  if (feature === 'launch') {
    if (!cfg.n8n.launchUrl) out.push('PITT_N8N_LAUNCH_URL (approved webhook URL for this environment)');
    else if (!hostAllowed(cfg, cfg.n8n.launchUrl)) out.push('PITT_N8N_LAUNCH_URL host is not in PITT_ALLOWED_OUTBOUND_HOSTS');
    if (!cfg.n8n.launchHeaderName || !cfg.n8n.launchHeaderValue) out.push('PITT_N8N_LAUNCH_HEADER_NAME / _VALUE (webhook Header Auth)');
    if (!cfg.n8n.callbackHeaderValue) out.push('PITT_CALLBACK_HEADER_VALUE (callback service key)');
    if (!cfg.n8n.workflowId) out.push('PITT_N8N_WORKFLOW_ID');
    if (!(cfg.n8n.weeklyLaunchBudget > 0)) out.push('PITT_WEEKLY_LAUNCH_BUDGET (n8n executions this site may use per week)');
  }
  if (feature === 'snowflake') {
    const NAMES = { account: 'PITT_SNOWFLAKE_ACCOUNT', user: 'PITT_SNOWFLAKE_USER', role: 'PITT_SNOWFLAKE_ROLE', warehouse: 'PITT_SNOWFLAKE_WAREHOUSE',
      privateKeyPem: 'PITT_SNOWFLAKE_PRIVATE_KEY_PEM', publicKeyFingerprint: 'PITT_SNOWFLAKE_PUBLIC_KEY_FP' };
    for (const [k, name] of Object.entries(NAMES)) if (!cfg.snowflake[k]) out.push(name);
    if (cfg.snowflake.account && !hostAllowed(cfg, snowflakeBase(cfg))) out.push('Snowflake account host is not in PITT_ALLOWED_OUTBOUND_HOSTS');
  }
  return out;
}

export const snowflakeBase = (cfg) => 'https://' + String(cfg.snowflake.account || '').toLowerCase() + '.snowflakecomputing.com';

export function hostAllowed(cfg, url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && !(cfg.environment === 'local' && u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return false;
    return cfg.allowedHosts.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
