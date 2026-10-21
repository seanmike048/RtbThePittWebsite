"""Generates n8n/FRYm3m0UAffFyJLq.webhook-change-set.json: the nodes and connections to ADD to the main workflow
"The Pitt - Main CLEAN MVP (no Dust)" so the site can launch it. Nothing existing is modified or removed.
Credential references are stubs (no id): n8n asks the importer to pick or create them. No secret is written here.
Run: python3 scripts/gen_n8n_change_set.py"""
import json, pathlib, uuid

OUT = pathlib.Path(__file__).resolve().parent.parent / 'n8n'
BASE_REVISION = {'workflow_id': 'FRYm3m0UAffFyJLq', 'versionId': 'cf043f3d-cc9d-49fb-ac35-1f80e66d8fd9', 'versionCounter': 4, 'updatedAt': '2026-10-21T14:16:20.122Z', 'read_at': '2026-10-21'}
INVESTIGATOR_ID = '4JGsgrMbBGWqcev7'  # the id M5 actually calls (its note mentions S4mONBmBK82vrIbp, which is stale)
CALLBACK_URL = 'https://REPLACE-WITH-APPROVED-PITT-HOST/api/investigation-events'  # set by the platform owner per environment

VALIDATE = r"""// W2 Validate launch & build cases (site launch path). Rejects anything outside pitt.launch.v1; builds the same case
// shape M4 gives the Investigator. Destinations, credentials and workflow IDs are fixed in this workflow, never read from the body.
const b = $json.body || {};
const fail = (m) => { throw new Error('Rejected launch: ' + m); };
if (b.schema_version !== 'pitt.launch.v1') fail('schema_version');
if (!/^run_[a-f0-9]{20}$/.test(b.run_id || '') || !/^req_[a-f0-9]{20}$/.test(b.request_id || '')) fail('run_id / request_id');
const s = b.scope || {};
// Only Amazon DSP is enabled for site launches (same seats as Investigator node 02 PARTNERS.amazon_dsp).
const SEATS = { amazon_dsp: [437, 489, 490, 491, 492] };
if (!SEATS[s.dsp_key]) fail('dsp_key not enabled for site launches');
const pids = Array.isArray(s.partner_ids) ? s.partner_ids : [];
const nids = Array.isArray(s.network_ids) ? s.network_ids : [];
if (!pids.length || pids.length > 10 || !pids.every((p) => SEATS[s.dsp_key].includes(p))) fail('partner_ids');
if (!nids.length || nids.length > 10 || !nids.every((n) => Number.isInteger(n) && n > 0)) fail('network_ids');
if (typeof (b.callback || {}).token !== 'string' || b.callback.token.length < 24) fail('callback token');
// Ingestion de-duplication: static data persists only for production (activated) executions; the site de-duplicates too.
const seen = $getWorkflowStaticData('global');
seen.pitt_runs = (seen.pitt_runs || []).filter((r) => Date.now() - r.at < 86400000);
if (seen.pitt_runs.some((r) => r.run_id === b.run_id)) fail('duplicate run_id');
seen.pitt_runs.push({ run_id: b.run_id, at: Date.now() });
const pitt = { run_id: b.run_id, request_id: b.request_id, environment: b.environment, callback_token: b.callback.token, scope: { dsp_key: s.dsp_key, partner_ids: pids, network_ids: nids } };
return nids.map((n) => ({ json: { network_id: n, partner: 'Amazon DSP', partner_ids: pids, data_mode: 'live', selection: 'site_launch', pitt } }));
"""

PROGRESS = r"""// W2p Build progress event: one 'running' event so the site shows that n8n picked the run up.
const p = $('W2 Validate launch & build cases').first().json.pitt;
return [{ json: { token: p.callback_token, event: { schema_version: 'pitt.event.v1', event_id: 'exec-' + $execution.id + '-running', run_id: p.run_id, request_id: p.request_id,
  environment: p.environment, sequence: 1, type: 'progress', status: 'running', stage: 'investigator_started', sent_at: new Date().toISOString(),
  execution_id: String($execution.id), workflow_id: $workflow.id, scope: p.scope } } }];
"""

RESULT = r"""// W4 Build result event: the Investigator's Final Report items, minus the Slack rendering, as pitt.result.v1 cases.
const p = $('W2 Validate launch & build cases').first().json.pitt;
const cases = $input.all().map((x) => { const { slack_blocks, slack_text, slack_text_full, approval_text, ...c } = x.json; return c; });
const status = cases.length && cases.every((c) => c.status === 'READY_FOR_APPROVAL') ? 'succeeded' : cases.length ? 'partial' : 'failed';
return [{ json: { token: p.callback_token, event: { schema_version: 'pitt.event.v1', event_id: 'exec-' + $execution.id + '-result', run_id: p.run_id, request_id: p.request_id,
  environment: p.environment, sequence: 100, type: 'result', status, sent_at: new Date().toISOString(), execution_id: String($execution.id), workflow_id: $workflow.id,
  workflow_revision: null, scope: p.scope, result: { cases } } } }];
"""

FAILURE = r"""// W4e Build failure event: the Investigator failed; report it instead of going silent.
const p = $('W2 Validate launch & build cases').first().json.pitt;
const err = $input.first().json.error;
return [{ json: { token: p.callback_token, event: { schema_version: 'pitt.event.v1', event_id: 'exec-' + $execution.id + '-failed', run_id: p.run_id, request_id: p.request_id,
  environment: p.environment, sequence: 100, type: 'result', status: 'failed', sent_at: new Date().toISOString(), execution_id: String($execution.id), workflow_id: $workflow.id,
  scope: p.scope, result: { cases: [] }, error: { message: String((err && (err.message || err)) || 'Investigator failed').slice(0, 300) } } } }];
"""

def callback(name, pos):
    return {
        'parameters': {
            'method': 'POST', 'url': CALLBACK_URL, 'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth',
            'sendHeaders': True, 'headerParameters': {'parameters': [{'name': 'x-pitt-run-token', 'value': '={{ $json.token }}'}]},
            'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ JSON.stringify($json.event) }}', 'options': {'timeout': 15000},
        },
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'pitt/' + name)), 'name': name, 'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2, 'position': pos,
        'credentials': {'httpHeaderAuth': {'id': '', 'name': 'The Pitt - callback service key (TO CREATE)'}},
        'retryOnFail': True, 'maxTries': 3, 'waitBetweenTries': 5000, 'onError': 'continueRegularOutput',
        'notes': 'POSTs to The Pitt (fixed URL, set per environment by the platform owner). Retries are safe: the site rejects a repeated event_id.',
    }

def code(name, js, pos, notes):
    return {'parameters': {'jsCode': js}, 'id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'pitt/' + name)), 'name': name, 'type': 'n8n-nodes-base.code', 'typeVersion': 2, 'position': pos, 'notes': notes}

nodes = [
    {
        'parameters': {'httpMethod': 'POST', 'path': 'the-pitt-launch-' + str(uuid.uuid5(uuid.NAMESPACE_URL, 'pitt/webhook-path'))[:8], 'authentication': 'headerAuth', 'responseMode': 'onReceived', 'options': {}},
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'pitt/W1')), 'name': 'W1 Webhook - The Pitt site launch', 'type': 'n8n-nodes-base.webhook', 'typeVersion': 2, 'position': [-112, 720],
        'webhookId': str(uuid.uuid5(uuid.NAMESPACE_URL, 'pitt/W1-webhook')),
        'credentials': {'httpHeaderAuth': {'id': '', 'name': 'The Pitt - launch webhook key (TO CREATE)'}},
        'notes': 'Site launch entry point. Header Auth. Responds immediately; the result comes back through W5. Does not post to Slack or create Jira tickets.',
    },
    code('W2 Validate launch & build cases', VALIDATE, [112, 720], 'Validates pitt.launch.v1 and builds Investigator cases (Amazon DSP only for now).'),
    code('W2p Build progress event', PROGRESS, [336, 560], 'One running event. Placed above W3 so execution order v1 runs it before the Investigator.'),
    callback('W5p Callback - progress', [576, 560]),
    {
        'parameters': {'workflowId': {'__rl': True, 'value': INVESTIGATOR_ID, 'mode': 'id', 'cachedResultUrl': '/workflow/' + INVESTIGATOR_ID},
                       'workflowInputs': {'mappingMode': 'defineBelow', 'value': {}, 'matchingColumns': [], 'schema': [], 'attemptToConvertTypes': False, 'convertFieldsToString': True},
                       'options': {'waitForSubWorkflow': True}},
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'pitt/W3')), 'name': 'W3 Run Investigator (site launch)', 'type': 'n8n-nodes-base.executeWorkflow', 'typeVersion': 1.2, 'position': [576, 720],
        'onError': 'continueErrorOutput', 'notes': 'Same Investigator as M5. Error output goes to W4e so a failure is reported.',
    },
    code('W4 Build result event', RESULT, [816, 640], 'Final Report items as pitt.result.v1 cases (Slack rendering removed).'),
    code('W4e Build failure event', FAILURE, [816, 800], 'Failure as a result event.'),
    callback('W5 Callback - result', [1056, 720]),
]

connections = {
    'W1 Webhook - The Pitt site launch': {'main': [[{'node': 'W2 Validate launch & build cases', 'type': 'main', 'index': 0}]]},
    'W2 Validate launch & build cases': {'main': [[{'node': 'W2p Build progress event', 'type': 'main', 'index': 0}, {'node': 'W3 Run Investigator (site launch)', 'type': 'main', 'index': 0}]]},
    'W2p Build progress event': {'main': [[{'node': 'W5p Callback - progress', 'type': 'main', 'index': 0}]]},
    'W3 Run Investigator (site launch)': {'main': [[{'node': 'W4 Build result event', 'type': 'main', 'index': 0}], [{'node': 'W4e Build failure event', 'type': 'main', 'index': 0}]]},
    'W4 Build result event': {'main': [[{'node': 'W5 Callback - result', 'type': 'main', 'index': 0}]]},
    'W4e Build failure event': {'main': [[{'node': 'W5 Callback - result', 'type': 'main', 'index': 0}]]},
}

change_set = {
    'kind': 'the-pitt.n8n-change-set.v1',
    'target': BASE_REVISION,
    'summary': 'Adds a second, independent entry point (W1-W5) for launches from The Pitt site. M1-M11 are untouched.',
    'add_nodes': nodes,
    'add_connections': connections,
    'credentials_to_create': [
        {'node': 'W1 Webhook - The Pitt site launch', 'type': 'httpHeaderAuth', 'name': 'The Pitt - launch webhook key (TO CREATE)', 'matches_site_env': ['PITT_N8N_LAUNCH_HEADER_NAME', 'PITT_N8N_LAUNCH_HEADER_VALUE']},
        {'node': 'W5 / W5p callbacks', 'type': 'httpHeaderAuth', 'name': 'The Pitt - callback service key (TO CREATE)', 'header_name': 'x-pitt-callback-key', 'matches_site_env': ['PITT_CALLBACK_HEADER_NAME', 'PITT_CALLBACK_HEADER_VALUE']},
    ],
    'placeholders': {'callback_url': CALLBACK_URL},
    'rollback': 'Delete nodes W1, W2, W2p, W5p, W3, W4, W4e, W5 and their connections; the workflow is then identical to the base revision.',
}
(OUT / 'FRYm3m0UAffFyJLq.webhook-change-set.json').write_text(json.dumps(change_set, indent=2) + '\n')
print('wrote', OUT / 'FRYm3m0UAffFyJLq.webhook-change-set.json', len(nodes), 'nodes')
