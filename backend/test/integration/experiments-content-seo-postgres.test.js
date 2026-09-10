require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
process.env.NODE_ENV = 'test';
process.env.MARKETS_IDENTITY_GEOGRAPHY_ENABLED = 'true';
process.env.CONSENT_ATTRIBUTION_ENABLED = 'true';
process.env.EXPERIMENTS_CONTENT_SEO_ENABLED = 'true';
process.env.EXPERIMENTS_ENABLED = 'true';
process.env.CONTENT_PUBLISHING_ENABLED = 'true';
process.env.PUBLIC_SEO_ENABLED = 'true';
process.env.EXPERIMENT_ASSIGNMENT_SECRET = 'integration-only-f9-assignment-secret';
process.env.PUBLIC_WEB_BASE_URL = 'https://public.integration.test';

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true deliberately.');
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL must point to the isolated PostgreSQL test database.');

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const prisma = require('../../src/config/prisma');
const { hashPassword } = require('../../src/utils/password');
const { policyDigest } = require('../../src/modules/markets/market.service');
const { pseudonymize } = require('../../src/modules/privacy/privacy-utils');
const { assignVariant, calculateResults, createExperiment, createVersion, recordExposure, setExperimentStatus } = require('../../src/modules/experiments/experiment.service');
const { createContentVersion, createEntry, reviewContent, schedulePublication, submitForReview } = require('../../src/modules/content/content.service');
const { buildSitemap, getPublishedContent } = require('../../src/modules/seo/seo.service');

const suffix = Date.now().toString(36).slice(-7).toUpperCase();
const runId = `f9-${suffix.toLowerCase()}`;
const consentPurpose = `${runId}.product_experimentation`;
const marketCode = `X${suffix}`;
const created = {};
const reqFor = (userId, action) => ({ user: { id: userId }, ip: '127.0.0.1', get: () => 'f9-integration', context: { requestId: `${runId}-${action}`, correlationId: runId, traceId: '9'.repeat(32) } });

test.before(async () => {
  const country = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'ES' } });
  const passwordHash = await hashPassword('integration-password');
  const [author, reviewer, customer] = await Promise.all(['author', 'reviewer', 'customer'].map((name, index) => prisma.user.create({ data: { email: `${runId}-${name}@example.test`, phone: `+349${Date.now().toString().slice(-7)}${index}`, passwordHash, firstName: 'F9', lastName: name, role: 'CLIENT', countryCode: 'ES', registrationLocale: 'es-ES' } })));
  Object.assign(created, { author, reviewer, customer });
  const market = await prisma.market.create({ data: { code: marketCode, countryId: country.id, status: 'ACTIVE', currencyCode: 'EUR', defaultLocale: 'es-ES', supportedLocales: ['es-ES'], timezonePolicy: { default: 'Europe/Madrid' }, capabilities: { experiments: true, publicContent: true }, currentPolicyVersion: 1, effectiveAt: new Date('2026-01-01') } });
  created.market = market;
  await prisma.user.update({ where: { id: customer.id }, data: { marketId: market.id } });
  const policyInput = { identityPolicy: { selection: 'ONE_OF', documentTypes: [] }, geographyPolicy: { source: 'INE_ES', levels: [] }, addressPolicy: { coordinates: 'OPTIONAL', fields: [] }, localePolicy: { default: 'es-ES', supported: ['es-ES'] }, currencyPolicy: { currency: 'EUR', authority: 'F3' }, legalPolicyReferences: [], taxPolicyReference: null, paymentPolicyReference: null };
  const marketPolicy = await prisma.marketPolicyVersion.create({ data: { marketId: market.id, version: 1, status: 'ACTIVE', reviewStatus: 'APPROVED', reviewedBy: reviewer.id, reviewedAt: new Date(), effectiveAt: new Date('2026-01-01'), ...policyInput, schemaDigest: policyDigest(policyInput) } });
  created.marketPolicy = marketPolicy;
  const consentPolicy = await prisma.consentPolicy.create({ data: { key: `${runId}.experiments`, purpose: consentPurpose, version: 1, countryCode: 'ES', marketId: market.id, locale: 'es-ES', status: 'ACTIVE', legalBasis: 'consent', enforcementMode: 'EXPLICIT_GRANT', documentReference: 'https://legal.integration.test/f9', documentDigest: 'c'.repeat(64), effectiveAt: new Date('2026-01-01'), reviewStatus: 'APPROVED', reviewReference: 'F9-INTEGRATION', reviewedById: reviewer.id, reviewedAt: new Date(), createdById: author.id } });
  created.consentPolicy = consentPolicy;
  await prisma.consentDecision.create({ data: { idempotencyKey: `${runId}:consent`, policyId: consentPolicy.id, policyVersion: 1, purpose: consentPolicy.purpose, subjectKey: pseudonymize('USER', customer.id), subjectType: 'USER', userId: customer.id, decision: 'GRANTED', source: 'INTEGRATION_TEST' } });
  await prisma.featureFlag.create({ data: { key: `${runId}.flag`, description: 'Isolated deterministic integration flag.', status: 'ENABLED', rules: { percentage: 100 } } });
});

test.after(async () => { await prisma.$disconnect(); });

test('PostgreSQL enforces deterministic concurrent assignment and exposure idempotency', async () => {
  const experiment = await createExperiment({ input: { key: `${runId}.experiment`, name: 'F9 integration', marketCode, layerKey: `${runId}.layer`, surface: `${runId}.surface`, featureFlagKey: `${runId}.flag`, trafficAllocationBps: 10000 }, actorId: created.author.id, req: reqFor(created.author.id, 'experiment') });
  await createVersion({ experimentId: experiment.id, input: { purpose: consentPurpose, timezone: 'Europe/Madrid', minimumSampleSize: 10, significanceAlpha: 0.05, audience: { path: 'market.code', operator: 'equals', value: marketCode }, variants: [{ key: 'control', name: 'Control', isControl: true, weightBps: 5000, payload: { layout: 'standard' } }, { key: 'candidate', name: 'Candidate', isControl: false, weightBps: 5000, payload: { layout: 'compact' } }], metrics: [{ key: 'booking', role: 'PRIMARY', eventName: 'booking_confirmed', aggregation: 'UNIQUE_SUBJECT_RATE', windowHours: 168, direction: 'INCREASE', minimumSampleSize: 10 }] }, actorId: created.author.id, req: reqFor(created.author.id, 'version') });
  await setExperimentStatus({ experimentId: experiment.id, status: 'READY', reason: 'Integration configuration has passed validation.', actorId: created.reviewer.id, req: reqFor(created.reviewer.id, 'ready') });
  await setExperimentStatus({ experimentId: experiment.id, status: 'RUNNING', reason: 'Start isolated integration traffic only.', actorId: created.reviewer.id, req: reqFor(created.reviewer.id, 'running') });
  const args = { key: experiment.key, marketCode, locale: 'es-ES', identity: { userId: created.customer.id }, context: reqFor(created.customer.id, 'assign').context };
  const assignments = await Promise.all(Array.from({ length: 8 }, () => assignVariant(args)));
  assert.equal(new Set(assignments.map((item) => item.assignmentId)).size, 1);
  assert.equal(await prisma.experimentAssignment.count({ where: { version: { experimentId: experiment.id } } }), 1);
  const eventId = randomUUID();
  const exposureArgs = { assignmentId: assignments[0].assignmentId, eventId, surface: `${runId}.surface`, identity: { userId: created.customer.id }, context: reqFor(created.customer.id, 'expose').context };
  const exposures = await Promise.all(Array.from({ length: 8 }, () => recordExposure(exposureArgs)));
  assert.equal(exposures.filter((item) => item.duplicate === false).length, 1);
  assert.equal(await prisma.experimentExposure.count({ where: { eventId } }), 1);
  await prisma.marketingEvent.create({ data: { eventName: 'booking_confirmed', occurredAt: new Date(), userId: created.customer.id, subjectKey: pseudonymize('USER', created.customer.id), marketId: created.market.id } });
  const snapshot = await calculateResults({ experimentId: experiment.id, windowStart: new Date(Date.now() - 3_600_000), windowEnd: new Date(Date.now() + 3_600_000), req: reqFor(created.reviewer.id, 'results') });
  assert.equal(snapshot.method.includes('fixed-horizon'), true);
  assert.equal(JSON.stringify(snapshot.results).includes('winner'), false);
});

test('editorial four-eyes flow publishes immutable market-aware content and deterministic sitemap', async () => {
  const entry = await createEntry({ input: { key: `${runId}.cleaning`, type: 'LANDING_PAGE', marketCode }, actorId: created.author.id, req: reqFor(created.author.id, 'content-entry') });
  const version = await createContentVersion({ entryId: entry.id, input: { locale: 'es-ES', slug: `cleaning-${suffix.toLowerCase()}`, title: 'Integration cleaning service', summary: 'A reviewed and sufficiently detailed integration summary for a real market-aware public service page.', body: [{ type: 'heading', text: 'Reliable cleaning' }, { type: 'paragraph', text: 'This content is persisted, reviewed, approved, and rendered on the server.' }, { type: 'callout', text: 'Availability is derived from the active market.' }], seoTitle: 'Integration cleaning service', metaDescription: 'Reviewed integration content for a market-aware cleaning service page.', robotsDirective: 'index,follow', qualityEvidence: { checklist: 'editorial-and-seo-approved' }, structuredData: { '@context': 'https://schema.org', '@type': 'Service', name: 'Integration cleaning service' } }, actorId: created.author.id, req: reqFor(created.author.id, 'content-version') });
  await submitForReview({ versionId: version.id, actorId: created.author.id, req: reqFor(created.author.id, 'submit') });
  await assert.rejects(() => reviewContent({ versionId: version.id, decision: 'APPROVED', reason: 'Author must not self approve content.', actorId: created.author.id, req: reqFor(created.author.id, 'self-review') }), (error) => error.code === 'CONTENT_FOUR_EYES_REQUIRED');
  await reviewContent({ versionId: version.id, decision: 'APPROVED', reason: 'Independent editorial and SEO review completed.', actorId: created.reviewer.id, req: reqFor(created.reviewer.id, 'review') });
  const publication = await schedulePublication({ versionId: version.id, publishAt: new Date(Date.now() - 1000), actorId: created.reviewer.id, req: reqFor(created.reviewer.id, 'publish') });
  assert.equal(publication.status, 'PUBLISHED'); assert.equal(publication.indexable, true);
  const page = await getPublishedContent({ marketCode, locale: 'es-ES', type: 'LANDING_PAGE', slug: version.slug });
  assert.equal(page.seo.robots, 'index,follow'); assert.equal(page.title, version.title);
  const first = await buildSitemap({ marketCode, locale: 'es-ES' }); const second = await buildSitemap({ marketCode, locale: 'es-ES' });
  assert.equal(first.digest, second.digest); assert.equal(first.urls.some((url) => url.location.endsWith(version.canonicalPath)), true);
  await assert.rejects(() => prisma.contentVersion.update({ where: { id: version.id }, data: { title: 'Mutated published title' } }));
});

test('all F9 tables retain enabled and forced default-deny RLS', async () => {
  const tables = await prisma.$queryRaw`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('Experiment','ExperimentVersion','ExperimentVariant','ExperimentAudience','ExperimentAssignment','ExperimentExposure','ExperimentMetricDefinition','ExperimentResultSnapshot','ContentEntry','ContentVersion','ContentApproval','ContentPublication','SeoRedirect','SeoSitemapSnapshot') ORDER BY relname`;
  assert.equal(tables.length, 14);
  assert.equal(tables.every((row) => row.relrowsecurity && row.relforcerowsecurity), true);
  const policies = await prisma.$queryRaw`SELECT tablename FROM pg_policies WHERE tablename IN ('Experiment','ExperimentAssignment','ContentEntry','ContentPublication','SeoRedirect')`;
  assert.equal(policies.length, 0);
});
