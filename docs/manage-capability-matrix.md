# Manage capability matrix: domain and bundle exclusion

**Status on 2026-10-21: I cannot confirm this from available sources.** No Manage API documentation, OpenAPI file or endpoint for excluding a domain or an app bundle was available to this build. The sources at hand do not establish one:

- The credential guide says Buyer Connect / Manage per-service scoping is not available yet, and sends access requests to #help-maestro or #help-adserver.
- The "Domain Blocked By Partner Setup" page describes partner-domain blocks owned by Quality. It points to Quality tooling and a Brand Safety request path, which is not a general-purpose Manage API.

So both actions below stay **disabled**. The Optimization tab shows **Manual action required** with the request text, and no adapter makes any external call (`server/optimizations.mjs` → `UNAVAILABLE_ADAPTER`).

| Action | Verified API/service | Native scope | Can read current state | Can write | Matching semantics | Concurrency method | Verification | Rollback | Owner approval |
|---|---|---|---|---|---|---|---|---|---|
| Exclude a website domain | Not verified | Unknown | Unknown | Unknown | Unknown (exact host vs. subdomains vs. wildcard) | Unknown | Unknown | Unknown | Unknown (Quality / Brand Safety may own partner-domain blocks) |
| Exclude an app bundle | Not verified | Unknown | Unknown | Unknown | Unknown (bundle ID vs. store ID, case) | Unknown | Unknown | Unknown | Unknown |

The registry with these rows is `server/capabilities.mjs` (`WRITE_CAPABILITIES`). A row can execute only when every column is filled from a verified source, `status` is `verified`, `PITT_MANAGE_WRITES_ENABLED=true` and `PITT_WRITE_KILL_SWITCH=false`. The test suite enforces this (`server/server.test.mjs`, tests 12 and 25).

## Request to send (copy from the Optimization tab, or from here)

To #help-maestro or #help-adserver (Manage access), and to #quality_team for partner-domain and partner-bundle blocks:

> The Pitt, an Equativ TechOps tool, needs to know which authoritative API excludes a website domain, or an app bundle, for **one network × one partner seat**. Please share:
> 1. The base URL for each environment.
> 2. Authentication for a service account (not a personal token).
> 3. Which resource holds the rule, and its native scope: network, network × partner, seat, or shared list. If it is a shared list, who else consumes it.
> 4. A call that reads the current state, returning a version or ETag.
> 5. An additive mutation, and a removal mutation for rollback.
> 6. Matching rules: exact host or subdomains, and for bundles, bundle ID or store ID and whether case matters.
> 7. Whether conditional update and idempotency keys are supported.
> 8. Rate limits.
> 9. How to verify that the rule is live and when it reaches bidding.
> 10. Who must approve such a change (Quality, Brand Safety, Partnerships).

## What is already built for when the API is verified

The server already handles these steps (`server/optimizations.mjs`):

- **Preview.** It reads the current state, refuses resources broader than the approved scope, and builds an add-only diff that leaves existing entries alone. The preview is immutable, with a payload hash and an expiry.
- **Decision.** It records a Yes or No bound to that hash. A No never calls anything.
- **Execution, in a separate worker.** It re-reads the state and checks the version. It applies only the approved delta, using `if_version` and an idempotency key. A timeout becomes `outcome_unknown`, never a blind retry. It then verifies by reading back each target.
- **Rollback.** A rollback is a new preview that removes only this change's verified entries that are still present.

The only missing piece is the adapter (`read`, `applyDelta`) for the real API. The tests exercise this machinery with a **test double** that is labelled as such; it is not a real integration.

Removing protective rules (IVT, malware, ads.txt, brand safety, Quality blocks) and undoing a commercial phase-out are excluded from automation (`NEVER_AUTOMATED`). They stay tasks for their policy owner.
