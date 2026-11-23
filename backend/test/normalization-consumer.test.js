const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { readSource, ROOT } = require('../scripts/api-contract/source-inventory');
const { TRIM_REQUEST_EVIDENCE, normalizationConsumerSource } = require('../scripts/api-contract/normalization-consumer-evidence');
const { buildInventory } = require('../scripts/api-contract/inventory-command');
const { buildOpenApi } = require('../scripts/api-contract/openapi-command');
const { resolveRuntimeSchema } = require('../scripts/api-contract/schema-catalog');
const inventory = buildInventory(); const openapi = buildOpenApi(inventory);
const ajv = new Ajv({ strict: false }); addFormats(ajv);
const uuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiContext = readSource(path.join(ROOT, 'admin-web/src/lib/api.ts'));
const apiSource = apiContext.ast.program.body.filter((n) => n.type === 'ExportNamedDeclaration' && n.declaration && ['api', 'ApiError'].includes(n.declaration.id?.name)).map((n) => apiContext.text(n.declaration)).join('\n');

for (const entry of TRIM_REQUEST_EVIDENCE) test(`T01 request builder ${entry.consumer}: ${entry.operation}`, async () => {
  const call = inventory.consumers.find((c) => c.file === entry.file && c.operation === entry.operation);
  assert.equal(call.inputCompatibilityEvidence.evidence, 'backend/test/normalization-consumer.test.js');
  const source = normalizationConsumerSource(call, readSource(path.join(ROOT, call.file)));
  const route = inventory.routes.find((r) => r.method + ' ' + r.path === entry.operation);
  const validation = route.validation.find((v) => inventory.schemas[route.handler.file + '#' + v.schema]?.evidenceId?.startsWith('trim.'));
  const schema = resolveRuntimeSchema(route, validation);
  const properties = schema.homeservicesWireContract.schema.shape;
  const fixedReasonSuffix = {
    'PATCH /api/v1/admin/privacy/policies/{id}/status': 'reviewed policy version.',
    'PATCH /api/v1/admin/attribution/models/{id}/status': 'attribution model version.',
  }[entry.operation];
  // These two builders synthesize their own reason instead of consuming a text input.
  const builderCases = fixedReasonSuffix
    ? ['ACTIVE', 'RETIRED'].map((status) => ({ status, expectedAcceptance: true,
      expectedReason: `${status === 'ACTIVE' ? 'Activate' : 'Retire'} ${fixedReasonSuffix}` }))
    : [['  Reviewed operational decision  ', true], ['🙂'.repeat(500), true],
      [' '.repeat(20), false], ['x'.repeat(5001), false]].map(([reason, expectedAcceptance]) => ({
      reason, expectedAcceptance, status: properties.status?.options?.[0],
    }));
  for (const { reason, status, expectedAcceptance, expectedReason } of builderCases) {
    const sent = [];
    const scope = { JSON, Error, crypto: { randomUUID: () => uuid }, API_URL: 'https://local.invalid/api',
      session: { getSnapshot: () => ({ accessToken: null }) },
      fetch: async (url, init) => { sent.push({ url, ...init }); return { status: 204, ok: true }; },
      id: uuid, reason, policyReason: reason, reviewReason: reason, comment: reason, reviewReference: 'Reviewed policy reference',
      reviewing: uuid, next: status, nextStatus: status, status, assignee: '',
      change: { id: uuid, next: status }, policyAction: { id: uuid, next: properties.decision ? 'REJECTED' : status },
      review: { id: uuid, decision: 'REJECTED', digest: 'a'.repeat(64) },
      selected: /MarketsPage|ProfessionalsPage|UsersPage/.test(entry.file) ? { id: uuid, code: 'ES', active: true } : uuid,
    };
    if (entry.consumer === 'Admin Web') {
      const context = vm.createContext(scope);
      vm.runInContext(stripTypeScriptTypes(apiSource, { mode: 'transform' }), context, { timeout: 1000 });
      await vm.runInContext(stripTypeScriptTypes(source, { mode: 'strip' }), context, { timeout: 1000 });
    } else {
      const client = { post: async (url, body) => { sent.push({ url: `https://local.invalid/api${url}`, method: 'POST', body: JSON.stringify(body) }); return { data: {} }; } };
      const consumer = vm.runInNewContext(stripTypeScriptTypes(`class Consumer { ${source} }; new Consumer()`, { mode: 'strip' }), {}, { timeout: 1000 });
      consumer.client = client; await consumer.revokeReferralCode(uuid, reason);
    }
    assert.equal(sent.length, 1); const request = sent[0];
    assert.equal(request.method, route.method);
    assert.equal(new URL(request.url).pathname, route.path.replace('{id}', uuid).replace('{marketCode}', 'ES'));
    const payload = JSON.parse(request.body);
    if (expectedReason) assert.equal(payload.reason, expectedReason);
    const accepted = ajv.compile(openapi.paths[route.path][route.method.toLowerCase()].requestBody.content['application/json'].schema)(payload);
    const parsed = schema.safeParse(payload); assert.equal(accepted, parsed.success);
    assert.equal(parsed.success, expectedAcceptance, 'Actual builder must emit the expected valid/invalid wire case');
    if (parsed.success) for (const f of schema.homeservicesNormalizationFields) assert.equal(parsed.data[f.field], payload[f.field].trim());
    if (entry.consumer === 'Admin Web') {
      assert.equal(request.headers['Content-Type'], 'application/json');
      assert.equal(request.headers['x-correlation-id'], uuid);
      assert.equal(request.credentials, 'include');
      assert.equal(request.headers['X-Admin-Role'], undefined);
    }
  }
});

test('T01 only affected Admin/Customer observations receive request-case evidence', () => {
  assert.equal(TRIM_REQUEST_EVIDENCE.length, 19);
  assert.deepEqual([...new Set(TRIM_REQUEST_EVIDENCE.map((e) => e.consumer))].sort(), ['Admin Web', 'Customer mobile']);
  for (const call of inventory.consumers) assert.equal(call.requestResponseCompatibility, 'NOT_PROVEN_BY_PATH_MATCH');
});
