process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';
process.env.JWT_SECRET ||= 'f9-test-jwt-secret-with-more-than-32-characters';
process.env.MARKETS_IDENTITY_GEOGRAPHY_ENABLED = 'true';
process.env.CONSENT_ATTRIBUTION_ENABLED = 'true';
process.env.EXPERIMENTS_CONTENT_SEO_ENABLED = 'true';
process.env.EXPERIMENTS_ENABLED = 'true';
process.env.CONTENT_PUBLISHING_ENABLED = 'true';
process.env.PUBLIC_SEO_ENABLED = 'true';
process.env.EXPERIMENT_ASSIGNMENT_SECRET = 'f9-deterministic-test-assignment-secret';
process.env.PUBLIC_WEB_BASE_URL = 'https://example.test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bucketFor, evaluateAudience, selectVariant, validateAudience, validateDefinition } = require('../src/modules/experiments/registry');
const { criticalValue, summarizeAnalysis, wilson } = require('../src/modules/experiments/statistics');
const { TRANSITIONS, assignVariant, recordExposure } = require('../src/modules/experiments/experiment.service');
const { assertSafePath, canonicalPathFor, sanitizeBlocks, validateContentVersion } = require('../src/modules/content/content-registry');
const { assertNoRedirectLoop } = require('../src/modules/seo/seo.service');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../src/modules/identity/permission-catalog');
const { TRIGGER_REGISTRY } = require('../src/modules/automation/registries');
const { pseudonymize } = require('../src/modules/privacy/privacy-utils');

const variants = [
  { key: 'control', name: 'Control', isControl: true, weightBps: 5000, payload: { layout: 'standard' } },
  { key: 'treatment', name: 'Treatment', isControl: false, weightBps: 5000, payload: { layout: 'compact' } },
];
const metrics = [
  { key: 'completion', role: 'PRIMARY', eventName: 'booking_confirmed', aggregation: 'UNIQUE_SUBJECT_RATE', windowHours: 168, direction: 'INCREASE', minimumSampleSize: 100 },
  { key: 'refund', role: 'GUARDRAIL', eventName: 'payment_failed', aggregation: 'UNIQUE_SUBJECT_RATE', windowHours: 168, direction: 'DECREASE', minimumSampleSize: 100, guardrailThreshold: 0.02 },
];

test('experiment definition requires exact weights, one control and canonical metrics', () => {
  const result = validateDefinition({ variants, metrics, audience: { path: 'market.code', operator: 'equals', value: 'ES' } });
  assert.equal(result.variants.reduce((sum, item) => sum + item.weightBps, 0), 10000);
  assert.match(result.configurationDigest, /^[a-f0-9]{64}$/);
  assert.throws(() => validateDefinition({ variants: variants.map((item) => ({ ...item, isControl: false })), metrics }), (error) => error.code === 'EXPERIMENT_CONTROL_INVALID');
  assert.throws(() => validateDefinition({ variants: [{ ...variants[0], weightBps: 7000 }, variants[1]], metrics }), (error) => error.code === 'EXPERIMENT_WEIGHTS_INVALID');
  assert.throws(() => validateDefinition({ variants, metrics: [{ ...metrics[0], eventName: 'client_claimed_winner' }] }), (error) => error.code === 'EXPERIMENT_METRIC_EVENT_INVALID');
});

test('assignment bucket and variant are sticky, version-isolated and order-independent', () => {
  const input = { versionId: 'version-1', subjectKey: 'a'.repeat(64), secret: 'server-secret' };
  const first = bucketFor(input);
  assert.equal(first, bucketFor(input));
  assert.notEqual(first, bucketFor({ ...input, versionId: 'version-2' }));
  assert.equal(selectVariant(variants, first).key, selectVariant([...variants].reverse(), first).key);
  assert.ok(first >= 0 && first < 10000);
});

test('audience registry is typed, bounded and rejects injection', () => {
  const tree = validateAudience({ all: [{ path: 'market.code', operator: 'equals', value: 'ES' }, { path: 'featureEligible', operator: 'is_true' }] });
  assert.equal(evaluateAudience(tree, { market: { code: 'ES' }, featureEligible: true }), true);
  assert.equal(evaluateAudience(tree, { market: { code: 'BR' }, featureEligible: true }), false);
  assert.throws(() => validateAudience({ path: 'user.email', operator: 'equals', value: 'x@example.test' }), (error) => error.code === 'EXPERIMENT_AUDIENCE_INVALID');
  assert.throws(() => validateAudience({ path: 'market.code', operator: 'eval', value: 'process.exit()' }), (error) => error.code === 'EXPERIMENT_AUDIENCE_INVALID');
});

test('experiment lifecycle cannot mutate a running version or revive archives', () => {
  assert.equal(TRANSITIONS.DRAFT.has('READY'), true);
  assert.equal(TRANSITIONS.RUNNING.has('DRAFT'), false);
  assert.equal(TRANSITIONS.COMPLETED.has('RUNNING'), false);
  assert.equal(TRANSITIONS.ARCHIVED.size, 0);
});

const experimentDatabase = () => {
  const policyVersion = { id: 'market-policy-1', marketId: 'market-es', version: 1, status: 'ACTIVE', reviewStatus: 'APPROVED', effectiveAt: new Date('2026-01-01'), retiredAt: null };
  const market = { id: 'market-es', code: 'ES', countryId: 'country-es', status: 'ACTIVE', currentPolicyVersion: 1, defaultLocale: 'es-ES', supportedLocales: ['es-ES'], country: { isoAlpha2: 'ES' }, policies: [policyVersion] };
  const variantRows = variants.map((item, index) => ({ id: `variant-${index + 1}`, versionId: 'experiment-version-1', ...item }));
  const version = { id: 'experiment-version-1', version: 1, marketPolicyVersionId: policyVersion.id, purpose: 'product_experimentation', startAt: null, endAt: null, analysisAt: null, audience: { conditionTree: { path: 'market.code', operator: 'equals', value: 'ES' } }, variants: variantRows, metrics, marketPolicyVersion: policyVersion };
  const experiment = { id: 'experiment-1', key: 'booking-layout', status: 'RUNNING', killSwitch: false, trafficAllocationBps: 10000, marketId: market.id, surface: 'booking.checkout', featureFlagKey: 'experiments.booking', versions: [version] };
  let assignment; let exposure;
  const database = {
    market: { findUnique: async bots => market },
    experiment: { findFirst: async () => experiment },
    featureFlag: { findUnique: async () => ({ key: 'experiments.booking', status: 'ENABLED', rules: {} }) },
    user: { findUnique: async () => ({ role: 'CLIENT', isActive: true, createdAt: new Date(), _count: { bookings: 0 }, professionalProfile: null }) },
    subjectIdentityLink: { findMany: async () => [] },
    consentPolicy: { findFirst: async () => ({ id: 'consent-policy-1', version: 1, purpose: 'product_experimentation', countryCode: 'ES', locale: 'es-ES', status: 'ACTIVE', enforcementMode: 'NOT_REQUIRED', effectiveAt: new Date('2026-01-01'), retiredAt: null }) },
    consentDecision: { findFirst: async () => null },
    experimentAssignment: {
      findUnique: async ({ where }) => where.id ? (assignment?.id === where.id ? { ...assignment, version: { ...version, experiment: { ...experiment, market } } } : null) : assignment ? { ...assignment, variant: variantRows.find((item) => item.id === assignment.variantId) } : null,
      create: async ({ data }) => { assignment = { id: 'assignment-1', assignedAt: new Date('2026-09-09T00:00:00Z'), ...data }; return { ...assignment, variant: variantRows.find((item) => item.id === data.variantId) }; },
    },
    experimentExposure: {
      findUnique: async ({ where }) => exposure?.eventId === where.eventId ? exposure : null,
      create: async ({ data }) => { exposure = { id: 'exposure-1', ...data }; return exposure; },
    },
  };
  return { database, market, experiment, state: () => ({ assignment, exposure }) };
};

test('server-authoritative assignment is sticky and persists no raw user identifier', async () => {
  const fixture = experimentDatabase();
  const args = { key: 'booking-layout', marketCode: 'ES', locale: 'es-ES', identity: { userId: 'user-123' }, database: fixture.database, now: new Date('2026-09-09T00:00:00Z') };
  const first = await assignVariant(args); const second = await assignVariant(args);
  assert.deepEqual(first.variant, second.variant);
  assert.equal(first.assignmentId, second.assignmentId);
  assert.equal(fixture.state().assignment.subjectKey, pseudonymize('USER', 'user-123'));
  assert.equal(JSON.stringify(fixture.state()).includes('user-123'), false);
});

test('exposure is explicit, replay-safe and ownership-bound', async () => {
  const fixture = experimentDatabase();
  const assigned = await assignVariant({ key: 'booking-layout', marketCode: 'ES', locale: 'es-ES', identity: { userId: 'user-123' }, database: fixture.database, now: new Date('2026-09-09T00:00:00Z') });
  const args = { assignmentId: assigned.assignmentId, eventId: '11111111-1111-4111-8111-111111111111', surface: 'booking.checkout', identity: { userId: 'user-123' }, database: fixture.database, now: new Date('2026-09-09T00:01:00Z') };
  assert.equal((await recordExposure(args)).duplicate, false);
  assert.equal((await recordExposure(args)).duplicate, true);
  await assert.rejects(() => recordExposure({ ...args, identity: { userId: 'attacker-456' }, eventId: '22222222-2222-4222-8222-222222222222' }), (error) => error.code === 'EXPERIMENT_ASSIGNMENT_UNAVAILABLE');
});

test('inactive markets prevent assignment even when experiment configuration exists', async () => {
  const fixture = experimentDatabase(); fixture.market.status = 'DISABLED';
  await assert.rejects(() => assignVariant({ key: 'booking-layout', marketCode: 'ES', locale: 'es-ES', identity: { userId: 'user-123' }, database: fixture.database }), (error) => error.code === 'MARKET_UNAVAILABLE');
});

test('Wilson results are reproducible and do not declare a winner', () => {
  const interval = wilson(50, 100);
  assert.ok(interval.low < 0.5 && interval.high > 0.5);
  const counts = [
    { key: 'control', isControl: true, exposures: 100, conversions: { completion: 20, refund: 2 } },
    { key: 'treatment', isControl: false, exposures: 100, conversions: { completion: 30, refund: 5 } },
  ];
  const first = summarizeAnalysis({ metrics, counts, minimumSampleSize: 100, analysisAt: new Date('2026-09-01'), now: new Date('2026-09-09') });
  const second = summarizeAnalysis({ metrics, counts, minimumSampleSize: 100, analysisAt: new Date('2026-09-01'), now: new Date('2026-09-09') });
  assert.deepEqual(first, second);
  assert.equal(first.status, 'GUARDRAIL_BLOCKED');
  assert.equal(JSON.stringify(first).includes('winner'), false);
});

test('configured significance alpha deterministically controls confidence width', () => {
  assert.ok(Math.abs(criticalValue(0.05) - 1.959963) < 0.00001);
  const narrow = wilson(50, 100, criticalValue(0.2));
  const wide = wilson(50, 100, criticalValue(0.01));
  assert.ok((wide.high - wide.low) > (narrow.high - narrow.low));
});

test('early stopping remains disabled and minimum sample is enforced', () => {
  const result = summarizeAnalysis({ metrics, counts: variants.map((item) => ({ key: item.key, isControl: item.isControl, exposures: 10, conversions: { completion: 8, refund: 0 } })), minimumSampleSize: 100, analysisAt: null, now: new Date() });
  assert.equal(result.status, 'INCONCLUSIVE');
  assert.equal(result.results.earlyStopping, false);
  assert.equal(result.results.sampleReady, false);
});

test('content registry accepts structured blocks and rejects HTML/XSS', () => {
  const body = sanitizeBlocks([{ type: 'heading', level: 2, text: 'Reliable home services' }, { type: 'paragraph', text: 'A sufficiently useful and reviewed explanation for customers.' }, { type: 'faq', question: 'How?', answer: 'Through approved professionals.' }]);
  assert.equal(body.length, 3);
  assert.throws(() => sanitizeBlocks([{ type: 'paragraph', text: '<script>alert(1)</script>' }]), (error) => error.code === 'CONTENT_TEXT_INVALID');
  assert.throws(() => sanitizeBlocks([{ type: 'raw_html', text: '<b>x</b>' }]), (error) => ['CONTENT_BLOCK_INVALID', 'CONTENT_TEXT_INVALID'].includes(error.code));
});

test('content version derives canonical market URL and rejects fabricated SEO claims', () => {
  const base = { marketCode: 'ES', locale: 'es-ES', type: 'SERVICE_PAGE', slug: 'limpieza-hogar', title: 'Limpieza del hogar', summary: 'Información editorial revisada sobre el servicio de limpieza del hogar y su disponibilidad local.', body: [{ type: 'heading', text: 'Limpieza fiable' }, { type: 'paragraph', text: 'Contenido suficientemente detallado para la página.' }, { type: 'callout', text: 'Consulta disponibilidad.' }], seoTitle: 'Limpieza del hogar', metaDescription: 'Encuentra información revisada sobre servicios de limpieza del hogar.', robotsDirective: 'index,follow', qualityEvidence: { reviewerChecklist: 'complete' } };
  const parsed = validateContentVersion(base);
  assert.equal(parsed.canonicalPath, '/es/es-es/service-page/limpieza-hogar');
  assert.throws(() => validateContentVersion({ ...base, structuredData: { '@context': 'https://schema.org', '@type': 'Service', aggregateRating: { ratingValue: 5 } } }), (error) => error.code === 'SEO_STRUCTURED_DATA_UNSUPPORTED_CLAIM');
  assert.throws(() => validateContentVersion({ ...base, slug: '../admin' }), (error) => error.code === 'CONTENT_SLUG_INVALID');
});

test('URL contract blocks traversal, encoded separators and unsafe paths', () => {
  assert.equal(assertSafePath('/es/es-es/service/limpieza-hogar'), '/es/es-es/service/limpieza-hogar');
  assert.equal(canonicalPathFor({ marketCode: 'BR', locale: 'pt-BR', type: 'LOCATION_PAGE', slug: 'sao-paulo' }), '/br/pt-br/location-page/sao-paulo');
  for (const invalid of ['//evil.test', '/../admin', '/es/%2fadmin', '/es\\admin']) assert.throws(() => assertSafePath(invalid), (error) => error.code === 'SEO_PATH_INVALID');
});

test('redirect validation detects direct, indirect and excessive loops', async () => {
  const rows = new Map([['/b', { targetPath: '/c', status: 'ACTIVE' }], ['/c', { targetPath: '/a', status: 'ACTIVE' }]]);
  const database = { seoRedirect: { findUnique: async ({ where }) => rows.get(where.sourcePath) || null } };
  await assert.rejects(() => assertNoRedirectLoop({ sourcePath: '/a', targetPath: '/b', database }), (error) => error.code === 'SEO_REDIRECT_LOOP');
  await assert.doesNotReject(() => assertNoRedirectLoop({ sourcePath: '/a', targetPath: '/d', database }));
});

test('F9 RBAC separates management, activation, review and publication', () => {
  assert.equal(PERMISSIONS.EXPERIMENTS_ACTIVATE, 'experiments.activate');
  assert.equal(PERMISSIONS.CONTENT_REVIEW, 'content.review');
  assert.equal(PERMISSIONS.CONTENT_PUBLISH, 'content.publish');
  assert.equal(ROLE_PERMISSIONS.ANALYST.includes(PERMISSIONS.EXPERIMENTS_ACTIVATE), false);
  assert.equal(ROLE_PERMISSIONS.CONTENT_ADMIN.includes(PERMISSIONS.CONTENT_PUBLISH), true);
});

test('F8 integration adds only closed content triggers and no arbitrary publication action', () => {
  for (const trigger of ['content.review.requested', 'content.approved', 'content.publication.scheduled', 'content.published']) assert.equal(TRIGGER_REGISTRY[trigger].schemaVersion, 1);
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/automation/registries.js'), 'utf8');
  assert.doesNotMatch(source, /eval\s*\(|new Function|HTTP_REQUEST/);
  assert.doesNotMatch(source, /PUBLISH_ARBITRARY_CONTENT/);
});

test('F9 migration encodes concurrency, immutable running configuration and default deny RLS', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/202609090002_experiments_content_seo/migration.sql'), 'utf8');
  const force = fs.readFileSync(path.join(__dirname, '../prisma/migrations/202609090003_experiments_content_seo_force_rls/migration.sql'), 'utf8');
  assert.match(migration, /ExperimentAssignment_versionId_subjectKey_key/);
  assert.match(migration, /ExperimentExposure_eventId_key/);
  assert.match(migration, /f9_prevent_experiment_configuration_mutation/);
  assert.match(migration, /f9_protect_content_version_body/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM anon/);
  assert.match(force, /ALTER TABLE "Experiment" FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /ON DELETE CASCADE/);
});

test('published surface implementation is server-rendered and defaults unsupported failures closed', () => {
  const service = fs.readFileSync(path.join(__dirname, '../src/modules/seo/seo.service.js'), 'utf8');
  assert.match(service, /requireActive: true/);
  assert.match(service, /noindex,nofollow/);
  assert.doesNotMatch(service, /Math\.random|innerHTML|dangerouslySetInnerHTML/);
});
