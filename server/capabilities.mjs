// DSP / partner-seat registry and integration capabilities.
// Seat IDs and names are copied from the Investigator v4.6 node "02 Config & Validate Input" (PARTNERS + SEAT_NAMES,
// sourced there from ANALYTICS.PUBLIC.VIEW_DISCONNECTION_ALERT_365DAYS, Oct 2026). Formats are only what the seat name states.
// A seat mapping is an identity mapping, never a financial reporting filter: 437 Display stays separate from 491 Video / 492 CTV.

export const REGISTRY_SOURCE = 'n8n workflow 4JGsgrMbBGWqcev7, node "02 Config & Validate Input" (PARTNERS, SEAT_NAMES)';

/** status: 'supported' = end-to-end launch validated; 'read_only' = context only; 'not_integrated' = no launch. */
export const DSPS = [
  {
    key: 'amazon_dsp',
    name: 'Amazon DSP',
    status: 'supported',
    note: 'Initial supported integration: the main workflow\'s curated mode and the Investigator were built and checked on Amazon DSP cases.',
    seats: [
      { id: 437, name: 'Amazon DSP AMER Display B', format: 'display', region: 'AMER' },
      { id: 489, name: 'Amazon DSP EMEA/APAC Display B', format: 'display', region: 'EMEA/APAC' },
      { id: 490, name: 'Amazon DSP Native B', format: 'native', region: null },
      { id: 491, name: 'Amazon DSP Video B', format: 'video', region: null },
      { id: 492, name: 'Amazon DSP CTV B', format: 'ctv', region: null },
    ],
  },
  ...[
    ['beeswax', 'Beeswax', [[342, 'Beeswax'], [430, 'Beeswax B']]],
    ['dv360', 'Google DV360', [[76, 'Google DV360'], [429, 'Google DV360 B'], [499, 'Google DV360 ROW B']]],
    ['ttd', 'The Trade Desk', [[75, 'The Trade Desk (Non-CTV)'], [465, 'The Trade Desk (Non-CTV) B'], [500, 'The Trade Desk (Non-CTV) USA B'], [428, 'The Trade Desk CTV'], [494, 'The Trade Desk CTV B']]],
    ['yahoo_dsp', 'Yahoo DSP', [[440, 'Yahoo DSP B']]],
    ['xandr', 'Microsoft Ads (Xandr)', [[86, 'Microsoft Ads (Xandr)']]],
  ].map(([key, name, seats]) => ({
    key,
    name,
    status: 'not_integrated',
    note: 'The Investigator has seat IDs for this partner, but no end-to-end launch from this site has been validated. Launch stays disabled; nothing falls back to Amazon.',
    seats: seats.map(([id, n]) => ({ id, name: n, format: /CTV/.test(n) ? 'ctv' : null, region: null })),
  })),
];

export const dspByKey = (key) => DSPS.find((d) => d.key === key) || null;

export function publicCapabilities() {
  return {
    source: REGISTRY_SOURCE,
    dsps: DSPS.map((d) => ({ key: d.key, name: d.name, status: d.status, note: d.note, seats: d.seats })),
  };
}

/**
 * Manage (and adjacent) write capabilities. Every row is unverified: no API documentation, OpenAPI file or endpoint for
 * domain / bundle exclusion was available to this build. Rows stay disabled until each column is filled from a verified source.
 * See docs/manage-capability-matrix.md for the evidence request.
 */
export const WRITE_CAPABILITIES = [
  {
    action: 'exclude_domain',
    label: 'Exclude a website domain',
    api: null,
    nativeScope: null,
    canReadState: false,
    canWrite: false,
    matching: null,
    concurrency: null,
    verification: null,
    rollback: null,
    ownerApproval: null,
    status: 'integration_unavailable',
    ask: {
      channel: '#help-maestro or #help-adserver (Manage access); #quality_team for partner-domain blocks',
      text:
        'The Pitt needs the authoritative API for excluding a website domain for ONE network x partner seat: base URL per environment, auth for a service account, ' +
        'the resource that holds the rule and its native scope (network, network x partner, seat, shared list), a read-current-state call, an additive mutation, ' +
        'exact vs subdomain matching, conditional-update / version field, idempotency support, and how to verify the rule is live.',
    },
  },
  {
    action: 'exclude_bundle',
    label: 'Exclude an app bundle',
    api: null,
    nativeScope: null,
    canReadState: false,
    canWrite: false,
    matching: null,
    concurrency: null,
    verification: null,
    rollback: null,
    ownerApproval: null,
    status: 'integration_unavailable',
    ask: {
      channel: '#help-maestro or #help-adserver (Manage access); #quality_team for partner-bundle blocks',
      text:
        'Same request as for domains, for app bundles: accepted identifier types (bundle ID vs store ID), case and store semantics, native scope and verification.',
    },
  },
];

export const writeCapability = (action) => WRITE_CAPABILITIES.find((c) => c.action === action) || null;

/** An action can execute only when every column is verified and the server allows writes. */
export function executable(cap, cfg) {
  if (!cap) return { ok: false, reason: 'unsupported_action' };
  if (cfg.killSwitch) return { ok: false, reason: 'kill_switch_on' };
  if (!cfg.manage.writesEnabled) return { ok: false, reason: 'writes_disabled' };
  const verified = cap.api && cap.nativeScope && cap.canReadState && cap.canWrite && cap.matching && cap.concurrency && cap.verification;
  if (!verified || cap.status !== 'verified') return { ok: false, reason: 'integration_unavailable' };
  return { ok: true };
}
