# Deployment and rollback checklist: launch, refresh, Optimization

This follows the internal process in "Deploying Workflows to Production" (2026-10-19) and the "n8n Credential Management Strategy" (2026-10-20). Do the steps in each environment in order. This checklist authorises nothing by itself: every write and every publish goes through its owner.

## Environments

| | local | dev | staging | production |
|---|---|---|---|---|
| `PITT_ENV` | local | dev | staging | production |
| Auth | `dev` mode allowed | tokens | tokens | tokens (service accounts, never personal tokens, for n8n / Snowflake) |
| n8n | none, or the n8n dev test URL | n8n dev, Webhook **Test URL** | per platform owner | the Production URL after GenAI-team deployment |
| Snowflake | none | Analytics read-only service user | same | same, production key pair |
| Manage writes | off | off | off | off until the matrix is verified and the owner approves |
| Storage | file store | file store (1 instance) | managed DB | managed DB |

## Before any deploy

1. Run `npm install`, `npm run lint` (tsc), `npm test` and `npm run build`; all of them must pass. These were not run in this build because Node is not installed (see the handover).
2. Run `/n8n-review` on the main workflow **with the change set applied in dev**. Do not claim it passed without running it.
3. Confirm the secret scan stays clean: `npm test` covers `src` and `dist`.

## n8n (dev first)

1. Record the base revision. Expected: `FRYm3m0UAffFyJLq` version `cf043f3d-cc9d-49fb-ac35-1f80e66d8fd9`. If it has changed, regenerate the change set from the new export and review the diff.
2. Get approval to edit dev. Add W1–W5 from `n8n/FRYm3m0UAffFyJLq.webhook-change-set.json`, leaving M1–M11 unchanged.
3. Create two Header Auth credentials in n8n: "The Pitt - launch webhook key" for W1 and "The Pitt - callback service key" for W5/W5p, with header `x-pitt-callback-key`. Values go only in the n8n credential store and the site's secret manager.
4. Replace the placeholder callback URL in W5 and W5p with the approved site URL for this environment. Confirm that n8n can reach it.
5. Test with the Webhook **Test URL** in dev and one Amazon network. Check that one `running` and one `result` event arrive, and that nothing is posted to Slack.
6. Remember that each run uses one execution of the project quota (25 / week, noted in M2). Set `PITT_WEEKLY_LAUNCH_BUDGET` with the project owner.
7. For production, request promotion from the GenAI team. They load the JSON and credential stubs **unpublished**. Production credentials are completed separately, and dependencies (the Investigator) are published before the parent. A merge does not make a workflow live.

## Site

1. Set the variables from `.env.example` in the App Hosting secret manager. `PITT_ALLOWED_OUTBOUND_HOSTS` must list only the n8n host and the Snowflake account host.
2. Keep `PITT_WRITE_KILL_SWITCH=true` and `PITT_MANAGE_WRITES_ENABLED=false`.
3. Storage: `apphosting.yaml` allows 2 instances, and the file store is per instance and not durable. For dev, either set `maxInstances: 1` and accept data loss on redeploy, or back `server/store.mjs`'s interface with a managed database. Production needs the database.
4. Issue user access tokens. Store only `sha256(token)` in `PITT_USERS_JSON`, with least-privilege roles and network / partner scopes.
5. Deploy, then check: `/healthz` returns `ok`, `/api/status` lists no missing variable for the features you enabled, the environment badge is right, and launch is disabled for non-Amazon DSPs.

## Rollback

- **Site.** Redeploy the previous revision. The API is additive: the static pages work without it, and the scope bar shows its "no backend" notice.
- **n8n.** Delete nodes W1, W2, W2p, W5p, W3, W4, W4e and W5 and their connections. The workflow is then identical to the base revision. Revoke both Header Auth credentials.
- **Credentials.** Rotate the launch key, callback key and session secret if any of them may have been exposed. Rotating the session secret signs everyone out.
- **Writes.** Set `PITT_WRITE_KILL_SWITCH=true`. New executions stop and read-only diagnosis keeps working.

## Secret rotation

- **Launch key and callback key.** Update the n8n credential and the site secret together, during a quiet window with no run in flight. In-flight runs keep their per-run tokens.
- **Snowflake key pair.** Register the new public key on the user (Snowflake supports two keys), switch `PITT_SNOWFLAKE_PRIVATE_KEY_PEM` / `_PUBLIC_KEY_FP`, then remove the old key.
