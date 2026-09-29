const assert = require('node:assert/strict');
const test = require('node:test');
const { z } = require('zod');
const { projectSchema } = require('../scripts/api-contract/schema-catalog');
const { verifyRequestCases, verifyOpenApiBinding, verifyHeaderBinding } = require('../scripts/api-contract/request-parity');
const { declareInputContract } = require('../src/shared/http/input-contract');
const { createBookingSchema, loginSchema, passwordRecoveryRequestSchema, registerSchema } = require('../src/validators/auth.validators');
const { bookingCancellationBody, bookingRejectionBody, paymentConfirmationBody, bookingIdParams, bookingListQuery } = require('../src/validators/legacy-request.validators');
const { bookingInputContext } = require('../src/contracts/booking.inputs');
const { buildInventory } = require('../scripts/api-contract/inventory-command');
const { buildOpenApi } = require('../scripts/api-contract/openapi-command');
const { schemaChanges, breakingChanges } = require('../scripts/api-contract/breaking-changes');
const { catalogProjection } = require('../scripts/api-contract/schema-catalog');
const { reasonCases, bookingCases, emailCases, paymentCases, sample, uuid } = require('./helpers/input-contract-cases');

test('input projection classifies semantics without upgrading normalized/refined schemas to equivalent', () => {
  const structural = projectSchema(z.object({ count: z.number().int().min(1).max(5) }).strict());
  assert.deepEqual(structural.semanticClasses, ['STRUCTURAL_EQUIVALENT']);
  const normalized = projectSchema(z.string().trim().max(5));
  assert.ok(normalized.semanticClasses.includes('NORMALIZATION'));
  assert.equal(normalized.wireParity, 'UNPROVEN');
  assert.ok(projectSchema(z.string().transform((value) => new Date(value))).semanticClasses.includes('TRANSFORM'));
  assert.ok(projectSchema(z.string().refine((value) => value !== 'blocked')).semanticClasses.includes('REFINEMENT'));
});

for (const [name, schema, cases] of [
  ['booking cancel', bookingCancellationBody, reasonCases], ['booking reject', bookingRejectionBody, reasonCases],
  ['booking create', createBookingSchema, bookingCases], ['identity login', loginSchema, emailCases(false)],
  ['identity recovery', passwordRecoveryRequestSchema, emailCases(true)], ['payment confirm', paymentConfirmationBody, paymentCases],
]) test(`${name}: executed wire acceptance, normalization/transformation and refinement evidence`, () => {
  assert.equal(verifyRequestCases({ schema, cases }).status, 'PASS');
});

test('Booking header is projected from the actual runtime parser and keeps trim/boundary semantics', () => {
  const { header } = bookingInputContext;
  const cases = [...[16, 128].map((n) => sample(`length ${n}`, ` ${'a'.repeat(n)} `, true, { expected: 'a'.repeat(n) })),
    ...[undefined, '', 'x'.repeat(15), 'x'.repeat(129), 'invalid space inside'].map((value, i) => sample(`invalid header ${i}`, value, false))];
  assert.equal(verifyRequestCases({ schema: header.schema, cases, parseWire: header.parse }).status, 'PASS');
  const document = buildInventory(); const api = buildOpenApi(document);
  const projected = api.paths['/api/bookings'].post.parameters.find((p) => p.in === 'header' && p.name === header.name);
  const expected = structuredClone(projectSchema(header.schema).jsonSchema); delete expected.$schema;
  assert.deepEqual(projected.schema, expected); assert.equal(projected.required, true);
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../', header.source), 'utf8');
  assert.ok(source.includes(header.runtimeExpression), 'Header metadata no longer matches runtime enforcement.');
});

test('mounted declared inputs bind runtime adapters and faithful OpenAPI wire schemas', () => {
  const document = buildInventory(); const api = buildOpenApi(document);
  const schemas = { createBookingSchema, bookingCancellationBody, bookingRejectionBody, loginSchema, passwordRecoveryRequestSchema, paymentConfirmationBody, bookingIdParams, bookingListQuery };
  let declared = 0;
  for (const route of document.routes) for (const validation of route.validation) {
    const schema = schemas[validation.schema];
    if (!schema) continue;
    verifyOpenApiBinding({ document, route, validation, schema, openapi: api });
    if (schema.homeservicesWireContract) declared++;
  }
  assert.equal(declared, 6);
});

test('metadata cannot claim equivalence while hiding a semantic class or omit executable evidence', () => {
  assert.throws(() => declareInputContract(z.string(), { schema: z.string(), classes: ['STRUCTURAL_EQUIVALENT', 'TRANSFORM'] }));
  assert.throws(() => declareInputContract(z.string(), { schema: z.string(), classification: 'UNKNOWN' }));
  assert.throws(() => declareInputContract(z.string(), { schema: z.string(), classification: 'NORMALIZATION', semantics: ['trim'] }));
});

test('parity engine rejects artificial equivalents and narrowed accepted wire', () => {
  assert.throws(() => verifyRequestCases({ schema: createBookingSchema, cases: bookingCases, mode: 'ACCEPTANCE_EQUIVALENT' }));
  const narrowed = structuredClone(projectSchema(bookingCancellationBody).jsonSchema);
  narrowed.properties.reason.maxLength = 500;
  assert.throws(() => verifyRequestCases({ schema: bookingCancellationBody, cases: reasonCases, projectedSchema: narrowed }));
});

for (const [name, mutate] of [
  ['required', (s) => s.required.push('optional')], ['nullable', (s) => s.properties.optional.type = 'string'],
  ['type', (s) => s.properties.count.type = 'string'], ['enum', (s) => s.properties.state.enum = ['A']],
  ['bounds', (s) => s.properties.count.maximum = 1], ['array bounds', (s) => s.properties.items.maxItems = 1],
  ['unknown fields', (s) => s.additionalProperties = false],
]) test(`request parity catches ${name} drift`, () => {
  const schema = z.object({ count: z.number().int().min(1).max(5), state: z.enum(['A', 'B']), optional: z.string().nullable().optional(), items: z.array(z.string()).max(3) }).strip();
  const value = { count: 3, state: 'B', optional: null, items: ['a', 'b'], extra: true };
  const projected = projectSchema(schema).jsonSchema; mutate(projected);
  const { optional, ...withoutOptional } = value;
  assert.throws(() => verifyRequestCases({ schema, projectedSchema: projected, cases: [sample('accepted', value, true), sample('optional absent', withoutOptional, true), sample('invalid', {}, false)] }));
});

test('actual registration cross-field requirements remain runtime-refined and fail when policy pairs are incomplete', () => {
  const { LEGAL_DOCUMENT_VERSION } = require('../src/config/business');
  const canonical = { email: 'person@example.invalid', phone: '+12025550147', password: 'unit-placeholder-only',
    firstName: 'Test', lastName: 'Person', countryCode: 'ES', acceptTerms: true, acceptPrivacy: true,
    termsVersion: LEGAL_DOCUMENT_VERSION, privacyVersion: LEGAL_DOCUMENT_VERSION };
  const cases = [sample('canonical registration', canonical, true),
    sample('marketing pair missing', { ...canonical, marketingConsent: true }, false, { refinement: 'Consent requires policy ID/version together.' }),
    sample('policy pair incomplete', { ...canonical, marketingPolicyId: uuid }, false, { refinement: 'Policy ID and version are paired.' }),
    sample('role escalation', { ...canonical, role: 'ADMIN' }, false)];
  assert.equal(verifyRequestCases({ schema: registerSchema, projectedSchema: catalogProjection(registerSchema).jsonSchema,
    cases, mode: 'STRUCTURAL_WITH_RUNTIME_REFINEMENT' }).refinementWitnesses, 2);
  assert.ok(projectSchema(registerSchema).semanticClasses.includes('CROSS_FIELD_VALIDATION'));
  assert.notEqual(projectSchema(registerSchema).wireParity, 'STRUCTURAL');
});

test('Booking domain scheduling derives end from authoritative service duration and rejects temporal/refinement failures', () => {
  const { schedulingWindow } = require('../src/modules/bookings/booking-creation.service');
  const servicesById = new Map([[uuid, { duration: 30 }]]);
  const command = { scheduledDate: '2030-10-01T10:00:00.000Z', bookingServices: [{ serviceId: uuid, quantity: 2 }], servicesById, now: new Date('2030-10-01T09:00:00Z') };
  assert.equal(schedulingWindow(command).end.toISOString(), '2030-10-01T11:00:00.000Z');
  assert.throws(() => schedulingWindow({ ...command, now: new Date('2030-10-01T10:00:00Z') }), { code: 'BOOKING_START_NOT_FUTURE' });
  assert.throws(() => schedulingWindow({ ...command, servicesById: new Map([[uuid, { duration: 0 }]]) }), { code: 'SERVICE_DURATION_INVALID' });
});

test('breaking checks retain validator, wire, alias and future semantic change detection', () => {
  for (const mutation of [
    (s) => s.properties.optional.type = 'string', (s) => s.properties.alias = undefined,
    (s) => s.additionalProperties = false,
  ]) {
    const before = { type: 'object', properties: { optional: { type: ['string', 'null'] }, alias: { type: 'string' } }, additionalProperties: true };
    const after = structuredClone(before); mutation(after);
    const changes = []; schemaChanges(before, after, 'request', 'wire', changes); assert.ok(changes.length);
  }
  const route = { method: 'POST', path: '/test', middleware: [], auth: 'PUBLIC', classification: 'LEGACY_SUPPORTED', handler: { file: 'file' }, validation: [{ input: 'req.body', schema: 'schema' }], response: [] };
  const before = { routes: [route], schemas: { 'file#schema': catalogProjection(z.string().transform((s) => s.trim())) } };
  const after = { routes: [route], schemas: { 'file#schema': catalogProjection(z.string().transform((s) => s.toUpperCase())) } };
  assert.ok(breakingChanges(before, after).some((message) => message.includes('runtime validation semantics')));
});

test('coerced HTTP queries and defaults remain visible as normalization, not invisible structural proof', () => {
  const projected = projectSchema(z.object({ page: z.coerce.number().int().min(1).default(1) }).strict());
  assert.ok(projected.semanticClasses.includes('NORMALIZATION'));
  assert.ok(projected.semanticReviewRequired);
});

test('text cleanup is classified by actual semantics, not the name of Zod transform()', () => {
  const { updateProfileSchema } = require('../src/validators/auth.validators');
  assert.deepEqual(updateProfileSchema.parse({ firstName: ' Test\u0000  Person ' }), { firstName: 'Test Person' });
  const projection = projectSchema(updateProfileSchema);
  assert.ok(projection.semanticClasses.includes('NORMALIZATION'));
  assert.ok(!projection.semanticClasses.includes('TRANSFORM'));
  assert.notEqual(projection.wireParity, 'STRUCTURAL', 'Classification alone must not resolve the profile input gap.');
});

test('financial provider identifiers have exact accepted-wire normalization rather than a loose structural subset', () => {
  assert.equal(verifyRequestCases({ schema: paymentConfirmationBody, cases: paymentCases, mode: 'ACCEPTANCE_EQUIVALENT' }).status, 'PASS');
});

test('representable registration field dependencies are emitted as actual JSON Schema constraints', () => {
  assert.ok(projectSchema(registerSchema).jsonSchema.allOf?.length > 0, 'Policy pair requirements must not remain only prose.');
});

test('registration field rules preserve all eight combinations, issue order and paths', () => {
  const { LEGAL_DOCUMENT_VERSION } = require('../src/config/business');
  const canonical = { email: 'person@example.invalid', phone: '+12025550147', password: 'unit-placeholder-only',
    firstName: 'Test', lastName: 'Person', countryCode: 'ES', acceptTerms: true, acceptPrivacy: true,
    termsVersion: LEGAL_DOCUMENT_VERSION, privacyVersion: LEGAL_DOCUMENT_VERSION };
  const Ajv = require('ajv/dist/2020'); const ajv = new Ajv({ strict: false }); require('ajv-formats')(ajv);
  const validate = ajv.compile(projectSchema(registerSchema).jsonSchema);
  for (const consent of [false, true]) for (const id of [false, true]) for (const version of [false, true]) {
    const value = { ...canonical, marketingConsent: consent, ...(id ? { marketingPolicyId: uuid } : {}), ...(version ? { marketingPolicyVersion: 1 } : {}) };
    const expected = [];
    if (consent && (!id || !version)) expected.push({ path: ['marketingPolicyId'], message: 'An effective marketing policy id and version are required.' });
    if (id !== version) expected.push({ path: ['marketingPolicyVersion'], message: 'Marketing policy id and version must be supplied together.' });
    const parsed = registerSchema.safeParse(value);
    assert.equal(parsed.success, expected.length === 0);
    assert.equal(validate(value), expected.length === 0);
    assert.deepEqual(parsed.success ? [] : parsed.error.issues.map(({ path, message }) => ({ path, message })), expected);
  }
});

test('request parity detects header/query/params and unknown-field metadata drift', () => {
  const document = buildInventory(); const api = buildOpenApi(document);
  for (const [method, path, schema, mutate] of [
    ['GET', '/api/bookings/{id}', bookingIdParams, (operation) => { operation.parameters[0].schema.type = 'number'; }],
    ['GET', '/api/bookings/client/my-bookings', bookingListQuery, (operation) => { operation.parameters.find((p) => p.name === 'page').required = true; }],
    ['GET', '/api/bookings/client/my-bookings', bookingListQuery, (operation) => { operation.parameters.push({ in: 'query', name: 'role', schema: { type: 'string' } }); }],
    ['POST', '/api/bookings/{id}/cancel', bookingCancellationBody, (operation) => { operation['x-homeservices-input-bindings'].find((b) => b.input === 'req.body').unknownFieldPolicies = [{ path: '$', policy: 'REJECT' }]; }],
  ]) {
    const route = document.routes.find((r) => r.method === method && r.path === path);
    const validation = route.validation.find((v) => v.schema === (schema === bookingIdParams ? 'bookingIdParams' : schema === bookingListQuery ? 'bookingListQuery' : 'bookingCancellationBody'));
    const changed = structuredClone(api); mutate(changed.paths[path][method.toLowerCase()]);
    assert.throws(() => verifyOpenApiBinding({ document, route, validation, schema, openapi: changed }));
  }
  const headerOperation = api.paths['/api/bookings'].post;
  verifyHeaderBinding(headerOperation, bookingInputContext.header);
  for (const mutation of [(o) => o.parameters = [], (o) => o.parameters[0].required = false, (o) => o.parameters[0].schema.type = 'number']) {
    const changed = structuredClone(headerOperation); mutation(changed);
    assert.throws(() => verifyHeaderBinding(changed, bookingInputContext.header));
  }
});

test('admin refresh retains cookie plus CSRF security authority, never public credentials as body fields', () => {
  const document = buildInventory(); const api = buildOpenApi(document);
  assert.deepEqual(api.paths['/api/v1/admin/auth/refresh'].post.security, [{ adminRefreshCookie: [], adminCsrfHeader: [] }]);
  const refresh = api.paths['/api/v1/admin/auth/refresh'].post;
  assert.ok(!refresh.parameters.some((parameter) => ['JWT_SECRET', 'service-role', 'x-service-token'].includes(parameter.name)));
});

test('fully closed inputs require executed equivalence; missing tests or forged parity cannot clear debt', () => {
  const { unresolvedInput, verifyDeclaredAuthority } = require('../scripts/api-contract/input-evidence');
  const document = buildInventory();
  const cancel = document.routes.find((r) => r.method === 'POST' && r.path === '/api/bookings/{id}/cancel');
  const key = `${cancel.handler.file}#bookingCancellationBody`;
  assert.equal(unresolvedInput(document.schemas[key]), false);
  assert.equal(document.schemas[key].classification, 'NORMALIZATION');
  const changed = structuredClone(document); changed.schemas[key].evidenceId = 'invented';
  assert.throws(() => verifyDeclaredAuthority(changed));
  assert.equal(unresolvedInput({ wireParity: 'STRUCTURAL', semanticReviewRequired: true }), true);
});

test('input inventory retains all historic gaps, new semantic debt and freshness as separate evidence', () => {
  const { buildInputInventory, checkInputInventory } = require('../scripts/api-contract/input-inventory');
  const document = buildInventory(); const inventory = buildInputInventory(document);
  assert.equal(inventory.summary.operations, 251);
  assert.equal(inventory.summary.unresolvedHistoricalProjections, 142);
  assert.equal(inventory.summary.unresolvedInputSemantics, 163);
  assert.equal(inventory.summary.acceptanceEquivalentBindings, 3);
  assert.equal(inventory.summary.runtimeRefinedDeclaredBindings, 3);
  assert.equal(Object.values(inventory.summary.unresolvedByPrimaryClass).reduce((a, b) => a + b), inventory.summary.unresolvedInputSemantics);
  assert.ok(inventory.operations.some((r) => r.additionalSurfaceGaps.some((g) => g.semanticClass === 'RUNTIME_DERIVED')));
  assert.throws(() => checkInputInventory({ ...document, sourceFingerprint: 'stale-control' }));
});
