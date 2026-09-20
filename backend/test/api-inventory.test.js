process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { z } = require('zod');
const { inventory, ROOT } = require('../scripts/api-contract/source-inventory');
const { buildInventory, serialize } = require('../scripts/api-contract/inventory-command');
const { projectSchema } = require('../scripts/api-contract/schema-catalog');
const { consumerInventory } = require('../scripts/api-contract/consumer-inventory');
const { breakingChanges, schemaChanges } = require('../scripts/api-contract/breaking-changes');
const { buildOpenApi } = require('../scripts/api-contract/openapi-command');

test('inventory is deterministic and classifies mounted internal, webhook, admin and mobile surfaces', () => {
  const first = buildInventory();
  assert.equal(serialize(first), serialize(buildInventory()));
  assert.ok(first.routes.length > 200);
  assert.equal(first.routes.find((r) => r.path === '/api/payments/webhook').classification, 'WEBHOOK');
  assert.equal(first.routes.find((r) => r.path === '/health/ready').classification, 'INTERNAL');
  assert.equal(first.routes.find((r) => r.path === '/api/payments/cash').classification, 'DEPRECATED');
  assert.equal(first.routes.find((r) => r.path === '/api/v1/admin/users').auth, 'ADMIN_BEARER');
  assert.equal(first.routes.find((r) => r.path === '/api/v1/admin/auth/refresh').auth, 'ADMIN_REFRESH_COOKIE_AND_CSRF');
  assert.equal(first.routes.find((r) => r.path === '/api/bookings/{id}').classification, 'LEGACY_SUPPORTED');
  assert.equal(first.routes.find((r) => r.path === '/api/v1/markets').classification, 'CANONICAL_V1');
  const serialized = serialize(first);
  assert.doesNotMatch(serialized, /(?:postgres(?:ql)?:\/\/|[A-Z]:\\|sk_live_|sk_test_|DATABASE_URL|JWT_SECRET)/);
});

test('source inventory matches real Express router registrations including compatibility method aliases', () => {
  const routes = inventory();
  const routeFiles = [...new Set(routes.map((r) => r.registration.file).filter((f) => f !== 'backend/src/app.js'))];
  for (const file of routeFiles) {
    const router = require(path.join(ROOT, file));
    const actual = router.stack.filter((layer) => layer.route).flatMap((layer) => {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      return paths.flatMap((url) => Object.keys(layer.route.methods).map((method) => ({
        method: method.toUpperCase(), suffix: url.replace(/:([A-Za-z0-9_]+)/g, '{$1}'),
      })));
    });
    const extracted = routes.filter((r) => r.registration.file === file);
    assert.equal(extracted.length, actual.length, file);
    for (const route of actual) assert.ok(extracted.some((r) => r.method === route.method
      && (route.suffix === '/' || r.path.endsWith(route.suffix))), `${file} ${route.method} ${route.suffix}`);
  }
});

test('schema projection preserves bounds and rejects silent refinement/transform coverage claims', () => {
  const ajv = new Ajv({ strict: false }); addFormats(ajv);
  const schema = z.object({ id: z.string().uuid(), limit: z.number().int().min(1).max(50), status: z.enum(['PENDING', 'COMPLETED']).optional() }).strict();
  const projection = projectSchema(schema);
  assert.equal(projection.wireParity, 'STRUCTURAL');
  assert.equal(ajv.validateSchema(projection.jsonSchema), true);
  const validate = ajv.compile(projection.jsonSchema);
  for (const value of [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', limit: 50 },
    { id: 'invalid', limit: 1 }, { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', limit: 51 },
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', limit: 1, unknown: true },
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', limit: 1, status: 'INVALID' },
  ]) assert.equal(validate(value), schema.safeParse(value).success);
  assert.equal(projectSchema(z.string().transform((s) => s.length)).wireParity, 'UNPROVEN');
  assert.equal(projectSchema(z.string().refine((s) => s !== 'invalid')).wireParity, 'UNPROVEN');
  assert.equal(projectSchema(z.string().trim().max(10)).wireParity, 'UNPROVEN');
});

test('real consumer inventory covers every product without equating path matches to full compatibility', () => {
  const calls = consumerInventory(inventory());
  assert.deepEqual([...new Set(calls.map((call) => call.consumer))].sort(), ['Admin Web', 'Customer mobile', 'Professional mobile', 'Public Web']);
  assert.ok(calls.some((call) => call.operation === 'POST /api/bookings/{id}/cancel'));
  assert.ok(calls.some((call) => call.operation === 'GET /api/v1/markets'));
  assert.deepEqual(calls.filter((call) => call.status !== 'PATH_METHOD_MATCH'), []);
  assert.ok(calls.every((call) => call.requestResponseCompatibility === 'NOT_PROVEN_BY_PATH_MATCH'));
});

test('breaking detector blocks endpoint/auth/status/required/type/enum/output removals and allows additive fields', () => {
  const prior = { routes: [{ method: 'GET', path: '/example', auth: 'CUSTOMER_BEARER', classification: 'LEGACY_SUPPORTED', middleware: ['authenticate'], handler: { file: 'example' }, validation: [], response: [{ statuses: [200], fields: ['items', 'pagination'] }] }], schemas: {} };
  assert.ok(breakingChanges(prior, { routes: [], schemas: {} }).length);
  for (const mutation of [
    (r) => { r.auth = 'PUBLIC'; }, (r) => { r.middleware = []; },
    (r) => { r.response[0].statuses = [201]; }, (r) => { r.response[0].fields = ['items']; },
  ]) { const next = structuredClone(prior); mutation(next.routes[0]); assert.ok(breakingChanges(prior, next).length); }
  const input = { type: 'object', properties: { count: { type: 'number' }, status: { enum: ['A', 'B'] } }, required: ['count'] };
  for (const mutation of [
    (s) => { s.required.push('status'); }, (s) => { s.properties.count.type = 'string'; }, (s) => { s.properties.status.enum = ['A']; },
  ]) { const next = structuredClone(input); mutation(next); const changes = []; schemaChanges(input, next, 'request', 'input', changes); assert.ok(changes.length); }
  const next = structuredClone(input); next.properties.optional = { type: 'string' };
  const changes = []; schemaChanges(input, next, 'request', 'input', changes); assert.deepEqual(changes, []);
  const output = []; schemaChanges(input, { ...input, required: [] }, 'response', 'output', output); assert.ok(output.length);
});

test('OpenAPI 3.1 candidate is source-derived, safe, and refuses to claim publication completeness', () => {
  const contract = buildOpenApi(buildInventory());
  assert.equal(contract.openapi, '3.1.0');
  assert.equal(contract['x-homeservices-contract-status'], 'CANDIDATE_NOT_PUBLISHED');
  assert.equal(contract['x-homeservices-completeness'].unresolvedConsumerCalls, 0);
  assert.ok(contract['x-homeservices-completeness'].unprovenWireSchemas > 0);
  assert.ok(contract['x-homeservices-completeness'].operationsWithoutCompleteResponseSchema > 0);
  assert.equal(contract.paths['/health'], undefined);
  assert.ok(contract.paths['/api/v1/markets']?.get);
  assert.ok(contract.paths['/api/admin/audit-logs']?.get);
  assert.ok(contract.paths['/api/payments/webhook']?.post);
  const serialized = JSON.stringify(contract);
  assert.doesNotMatch(serialized, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(serialized, /[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|DATABASE_URL)/);
  assert.doesNotMatch(serialized, /[A-Z]:\\|\/home\//);
});
