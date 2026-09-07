process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';
process.env.CONSENT_ATTRIBUTION_ENABLED = 'true';
process.env.GROWTH_PSEUDONYM_SECRET = 'growth-pseudonym-test-secret-with-32-characters';
process.env.GROWTH_IDENTITY_PROOF_SECRET = 'identity-proof-test-secret-with-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { issueAnonymousProof, verifyAnonymousProof, reconcileIdentity } = require('../src/modules/privacy/identity-proof.service');
const { sanitizePrivateObject } = require('../src/modules/privacy/privacy-utils');
const { normalizeLandingPath, normalizeReferrer, ingestTouchpoint } = require('../src/modules/privacy/touchpoint.service');
const { enforceSubjectConsent, withdrawConsent } = require('../src/modules/privacy/consent.service');
const { calculateForModel, createModel } = require('../src/modules/attribution/attribution.service');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../src/modules/identity/permission-catalog');
const { consentDecisionSchema, touchpointSchema } = require('../src/validators/privacy.validators');
const { createPolicy, reviewPolicy, setPolicyStatus } = require('../src/modules/privacy/consent-policy.service');
const { registerSchema } = require('../src/validators/auth.validators');

const now = new Date('2026-09-07T12:00:00.000Z');
const policy = {
  id: '11111111-1111-4111-8111-111111111111',
  key: 'marketing-attribution-es',
  purpose: 'marketing_attribution',
  version: 1,
  countryCode: 'ES',
  locale: 'es',
  status: 'ACTIVE',
  legalBasis: 'consent',
  enforcementMode: 'EXPLICIT_GRANT',
  documentReference: 'https://legal.example/marketing/v1',
  documentDigest: 'a'.repeat(64),
  effectiveAt: new Date('2026-09-01T00:00:00.000Z'),
  retiredAt: null,
};
const subject = { subjectKey: 'b'.repeat(64), subjectType: 'ANONYMOUS' };

test('ConsentPolicy lifecycle is sequential, four-eyes reviewed and transition-safe', async () => {
  let stored;
  const tx = {
    consentPolicy: {
      findFirst: async (input) => input.where?.id?.not ? null : null,
      findUnique: async () => stored,
      create: async ({ data }) => { stored = { id: policy.id, ...data, effectiveAt: null, retiredAt: null, reviewedAt: null, reviewedById: null, createdAt: now, updatedAt: now }; return stored; },
      update: async ({ data }) => { stored = { ...stored, ...data, updatedAt: now }; return stored; },
    },
    auditLog: { create: async () => ({}) },
    outboxEvent: { create: async () => ({}) },
  };
  const database = { $transaction: async (work) => work(tx) };
  const creator = { user: { id: 'creator-1' }, context: {} };
  const reviewer = { user: { id: 'reviewer-1' }, context: {} };
  await createPolicy({ input: {
    key: policy.key, purpose: policy.purpose, version: 1, countryCode: 'ES', locale: 'es', legalBasis: 'consent',
    enforcementMode: 'EXPLICIT_GRANT', documentReference: policy.documentReference, documentDigest: policy.documentDigest, retentionDays: 365,
    reason: 'Create reviewed test policy.',
  }, req: creator, database });
  await assert.rejects(() => reviewPolicy({ id: stored.id, reviewStatus: 'APPROVED', reviewReference: 'LEGAL-2026-001', reason: 'Creator cannot self approve.', req: creator, database }), (error) => error.code === 'CONSENT_POLICY_REVIEWER_CONFLICT');
  await reviewPolicy({ id: stored.id, reviewStatus: 'APPROVED', reviewReference: 'LEGAL-2026-001', reason: 'Qualified test review completed.', req: reviewer, database });
  const active = await setPolicyStatus({ id: stored.id, status: 'ACTIVE', effectiveAt: now, reason: 'Activate in isolated test only.', req: reviewer, database });
  assert.equal(active.status, 'ACTIVE');
  await assert.rejects(() => setPolicyStatus({ id: stored.id, status: 'DRAFT', reason: 'Invalid rollback attempt.', req: reviewer, database }), (error) => error.code === 'INVALID_CONSENT_POLICY_TRANSITION');
});

test('anonymous identity proofs are signed, expiring and cannot be forged', () => {
  const issued = issueAnonymousProof({ anonymousId: 'anonymous-device-123456', now, ttlHours: 1 });
  const verified = verifyAnonymousProof(issued.proof, { now: new Date(now.getTime() + 30_000) });
  assert.equal(verified.subjectType, 'ANONYMOUS');
  assert.match(verified.subjectKey, /^[a-f0-9]{64}$/);
  assert.throws(() => verifyAnonymousProof(`${issued.proof.slice(0, -1)}x`, { now }), (error) => error.code === 'INVALID_IDENTITY_PROOF');
  assert.throws(() => verifyAnonymousProof(issued.proof, { now: new Date(now.getTime() + 3_600_001) }), (error) => error.code === 'EXPIRED_IDENTITY_PROOF');
});

test('marketing denial remains optional at registration while a grant requires a real policy version', () => {
  const registration = { email: 'person@example.test', phone: '+34123456789', password: 'strong-password', firstName: 'Ada', lastName: 'Lovelace', role: 'CLIENT', countryCode: 'ES', locale: 'es', acceptTerms: true, acceptPrivacy: true, marketingConsent: false, termsVersion: '2026-08-30', privacyVersion: '2026-08-30' };
  assert.equal(registerSchema.parse(registration).marketingConsent, false);
  assert.throws(() => registerSchema.parse({ ...registration, marketingConsent: true }));
  assert.equal(registerSchema.parse({ ...registration, marketingConsent: true, marketingPolicyId: policy.id, marketingPolicyVersion: 1 }).marketingPolicyVersion, 1);
});

test('AttributionModel version sequence rejects skipped historical versions', async () => {
  const database = { $transaction: async (work) => work({ attributionModel: { findFirst: async () => ({ version: 1 }) } }) };
  await assert.rejects(() => createModel({ input: { key: 'first-touch', version: 3, name: 'Skipped model', type: 'FIRST_TOUCH', purpose: policy.purpose, windowDays: 30, reason: 'Attempt to skip a model version.' }, req: { user: { id: 'admin-1' } }, database }), (error) => error.code === 'ATTRIBUTION_MODEL_VERSION_SEQUENCE');
});

test('identity reconciliation is account-bound and replay-safe', async () => {
  const proof = issueAnonymousProof({ anonymousId: 'anonymous-device-123456', now }).proof;
  let stored;
  const database = {
    subjectIdentityLink: {
      findUnique: async () => stored || null,
      create: async ({ data }) => { stored = { id: 'link-1', ...data }; return stored; },
    },
    outboxEvent: { create: async () => ({}) },
  };
  const first = await reconcileIdentity({ identity: { userId: 'user-1' }, proof, database });
  assert.equal(first.duplicate, false);
  assert.equal((await reconcileIdentity({ identity: { userId: 'user-1' }, proof, database })).duplicate, true);
  await assert.rejects(() => reconcileIdentity({ identity: { userId: 'user-2' }, proof, database }), (error) => error.code === 'IDENTITY_LINK_CONFLICT');
});

test('privacy boundary rejects PII, payment data, credentials and raw identifiers recursively', () => {
  assert.deepEqual(sanitizePrivateObject({ interaction: 'separate_control', step: 2 }), { interaction: 'separate_control', step: 2 });
  assert.throws(() => sanitizePrivateObject({ email: 'person@example.com' }), (error) => error.code === 'PRIVACY_BOUNDARY_VIOLATION');
  assert.throws(() => sanitizePrivateObject({ note: 'send Bearer abcdefghijklmnopqrstuvwxyz' }), (error) => error.code === 'PRIVACY_BOUNDARY_VIOLATION');
  assert.throws(() => sanitizePrivateObject({ anonymousId: 'raw-value' }), (error) => error.code === 'PRIVACY_BOUNDARY_VIOLATION');
  assert.throws(() => sanitizePrivateObject({ card: '4242 4242 4242 4242' }), (error) => error.code === 'PRIVACY_BOUNDARY_VIOLATION');
});

test('referrer and landing normalization remove secret-bearing query and fragments', () => {
  assert.deepEqual(normalizeReferrer('https://Example.com/path?token=secret#fragment'), { origin: 'https://example.com', path: '/path', sanitized: true });
  assert.deepEqual(normalizeLandingPath('/welcome?email=person@example.com'), { path: '/welcome', sanitized: true });
  assert.throws(() => normalizeReferrer('javascript:alert(1)'), (error) => error.code === 'UNSAFE_REFERRER');
  assert.throws(() => normalizeReferrer('https://user:password@example.com/path'), (error) => error.code === 'UNSAFE_REFERRER');
  assert.throws(() => normalizeReferrer('https://example.com/person%40example.com'), (error) => error.code === 'PRIVACY_BOUNDARY_VIOLATION');
  assert.throws(() => normalizeLandingPath('/reset/abc1234567890defghijklmnopqrstuv'), (error) => error.code === 'PRIVACY_BOUNDARY_VIOLATION');
});

test('server-side consent enforcement fails closed for stale, denied and withdrawn policy state', async () => {
  const makeDatabase = (decision, effective = policy) => ({
    consentPolicy: { findFirst: async () => effective },
    subjectIdentityLink: { findMany: async () => [] },
    consentDecision: { findFirst: async () => decision },
  });
  const granted = { id: 'decision-1', policyId: policy.id, policyVersion: 1, purpose: policy.purpose, decision: 'GRANTED', occurredAt: now, createdAt: now };
  assert.equal((await enforceSubjectConsent({ purpose: policy.purpose, countryCode: 'ES', locale: 'es', subject, at: now, database: makeDatabase(granted) })).decision.id, 'decision-1');
  await assert.rejects(() => enforceSubjectConsent({ purpose: policy.purpose, countryCode: 'ES', locale: 'es', subject, at: now, database: makeDatabase({ ...granted, decision: 'WITHDRAWN' }) }), (error) => error.code === 'CONSENT_ENFORCEMENT_DENIED');
  await assert.rejects(() => enforceSubjectConsent({ purpose: policy.purpose, countryCode: 'ES', locale: 'es', subject, at: now, database: makeDatabase(granted, null) }), (error) => error.code === 'CONSENT_POLICY_UNAVAILABLE');
  await assert.rejects(() => enforceSubjectConsent({ purpose: policy.purpose, countryCode: 'ES', locale: 'es', subject, at: now, database: makeDatabase({ ...granted, policyVersion: 0 }) }), (error) => error.code === 'CONSENT_GRANT_REQUIRED');
});

test('withdrawal appends a new fact and immediately becomes the latest state', async () => {
  const grant = { id: 'grant-1', policyId: policy.id, policyVersion: 1, purpose: policy.purpose, decision: 'GRANTED', occurredAt: new Date(now - 1_000), createdAt: new Date(now - 1_000) };
  let created;
  const tx = {
    subjectIdentityLink: { findMany: async () => [] },
    consentDecision: { findFirst: async () => grant, create: async ({ data }) => { created = { id: 'withdrawal-1', ...data }; return created; } },
    outboxEvent: { create: async () => ({}) },
  };
  const database = {
    subjectIdentityLink: { findMany: async () => [] },
    consentDecision: { findFirst: async () => grant, findUnique: async () => null },
    $transaction: async (work) => work(tx),
  };
  const output = await withdrawConsent({ input: { idempotencyKey: 'withdrawal-key-123456', purpose: policy.purpose, source: 'SETTINGS' }, identity: { userId: 'user-1' }, database, now });
  assert.equal(output.decision.decision, 'WITHDRAWN');
  assert.equal(output.decision.policyId, grant.policyId);
  assert.equal(grant.decision, 'GRANTED');
});

test('touchpoint ingestion is idempotent, consent-bound and stores normalized first-party context', async () => {
  const grant = { id: 'decision-1', policyId: policy.id, policyVersion: 1, decision: 'GRANTED', purpose: policy.purpose, occurredAt: now, createdAt: now };
  let stored;
  const database = {
    consentPolicy: { findFirst: async () => policy },
    subjectIdentityLink: { findMany: async () => [], findFirst: async () => null },
    consentDecision: { findFirst: async () => grant },
    touchpoint: {
      findUnique: async () => stored,
      create: async ({ data }) => { stored = { id: 'touchpoint-1', ...data }; return stored; },
    },
    outboxEvent: { create: async () => ({}) },
  };
  const input = {
    idempotencyKey: 'touchpoint-key-123456', purpose: policy.purpose, countryCode: 'ES', locale: 'es', policyId: policy.id, policyVersion: 1,
    source: 'Newsletter', medium: 'Email_Campaign', referrer: 'https://example.com/article?utm_secret=x', landingUrl: '/signup?invite=secret', context: { placement: 'hero' },
  };
  const first = await ingestTouchpoint({ input, identity: { userId: 'user-1' }, database, now });
  assert.equal(first.sanitized, true);
  assert.equal(first.touchpoint.referrerPath, '/article');
  assert.equal(first.touchpoint.landingPath, '/signup');
  assert.equal((await ingestTouchpoint({ input, identity: { userId: 'user-1' }, database, now })).duplicate, true);
});

const attributionDatabase = ({ candidates, decision = { decision: 'GRANTED', policyId: policy.id, policyVersion: 1 } }) => {
  let stored;
  return {
    subjectIdentityLink: { findMany: async () => [] },
    consentDecision: { findFirst: async () => decision },
    touchpoint: { findMany: async ({ orderBy }) => orderBy[0].occurredAt === 'asc' ? candidates : [...candidates].reverse() },
    attribution: {
      findUnique: async () => stored,
      create: async ({ data }) => { stored = { id: 'attribution-1', ...data }; return stored; },
    },
    outboxEvent: { create: async () => ({}) },
  };
};

test('first-touch and last-touch attribution are deterministic, windowed and replay-safe', async () => {
  const candidates = [
    { id: 'touch-1', occurredAt: new Date('2026-09-05T12:00:00Z'), policyId: policy.id, policyVersion: 1, consentDecisionId: 'decision-1' },
    { id: 'touch-2', occurredAt: new Date('2026-09-06T12:00:00Z'), policyId: policy.id, policyVersion: 1, consentDecisionId: 'decision-1' },
  ];
  const conversion = { id: 'conversion-1', occurredAt: now, lead: { subjectKey: subject.subjectKey, subjectType: 'ANONYMOUS' } };
  const base = { id: 'model-1', key: 'first-touch', version: 1, purpose: policy.purpose, windowDays: 30 };
  const firstDb = attributionDatabase({ candidates });
  const first = await calculateForModel({ conversion, model: { ...base, type: 'FIRST_TOUCH' }, database: firstDb, now });
  assert.equal(first.attribution.touchpointId, 'touch-1');
  assert.equal(first.attribution.windowStartedAt.toISOString(), '2026-08-08T12:00:00.000Z');
  assert.match(first.attribution.inputDigest, /^[a-f0-9]{64}$/);
  assert.equal((await calculateForModel({ conversion, model: { ...base, type: 'FIRST_TOUCH' }, database: firstDb, now })).duplicate, true);
  const last = await calculateForModel({ conversion, model: { ...base, id: 'model-2', key: 'last-touch', type: 'LAST_TOUCH' }, database: attributionDatabase({ candidates }), now });
  assert.equal(last.attribution.touchpointId, 'touch-2');
});

test('withdrawn consent creates immutable blocked attribution without inventing revenue', async () => {
  const conversion = { id: 'conversion-2', occurredAt: now, lead: { subjectKey: subject.subjectKey, subjectType: 'ANONYMOUS' } };
  const model = { id: 'model-3', key: 'first-touch', version: 2, purpose: policy.purpose, windowDays: 7, type: 'FIRST_TOUCH' };
  const output = await calculateForModel({ conversion, model, database: attributionDatabase({ candidates: [], decision: { decision: 'WITHDRAWN' } }), now });
  assert.equal(output.attribution.status, 'BLOCKED_CONSENT');
  assert.equal(output.attribution.touchpointId, undefined);
  assert.equal('value' in output.attribution, false);
});

test('strict API contracts reject forged consent and unsafe touchpoint fields', () => {
  const base = { idempotencyKey: 'consent-key-123456', policyId: policy.id, policyVersion: 1, purpose: policy.purpose, countryCode: 'ES', locale: 'es', decision: 'GRANTED', source: 'SETTINGS' };
  assert.throws(() => consentDecisionSchema.parse({ ...base, granted: true }));
  assert.throws(() => consentDecisionSchema.parse({ ...base, subjectKey: 'forged' }));
  assert.throws(() => touchpointSchema.parse({ ...base, source: 'newsletter', email: 'person@example.com' }));
});

test('F7 permissions keep consent evidence from marketing and analytics roles', () => {
  assert.ok(ROLE_PERMISSIONS.COMPLIANCE_ADMIN.includes(PERMISSIONS.PRIVACY_CONSENT_READ));
  assert.ok(ROLE_PERMISSIONS.MARKETING_ADMIN.includes(PERMISSIONS.ATTRIBUTION_MANAGE));
  assert.equal(ROLE_PERMISSIONS.MARKETING_ADMIN.includes(PERMISSIONS.PRIVACY_CONSENT_READ), false);
  assert.equal(ROLE_PERMISSIONS.ANALYST.includes(PERMISSIONS.ATTRIBUTION_READ), false);
});

test('F7 migration enforces append-only evidence and Supabase default deny', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations/202609070001_consent_attribution/migration.sql'), 'utf8');
  const hardeningSql = fs.readFileSync(path.join(__dirname, '../prisma/migrations/202609070002_consent_attribution_active_uniqueness/migration.sql'), 'utf8');
  for (const table of ['ConsentPolicy', 'ConsentDecision', 'SubjectIdentityLink', 'Touchpoint', 'AttributionModel', 'Attribution']) {
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`));
  }
  for (const table of ['ConsentDecision', 'SubjectIdentityLink', 'Touchpoint', 'Attribution']) {
    assert.match(sql, new RegExp(`CREATE TRIGGER "${table}_immutable"`));
  }
  assert.match(sql, /CREATE TRIGGER "ConsentPolicy_version_lifecycle"/);
  assert.match(sql, /CREATE TRIGGER "AttributionModel_version_lifecycle"/);
  assert.match(hardeningSql, /ConsentPolicy_one_active_scope_key/);
  assert.match(hardeningSql, /AttributionModel_one_active_key/);
  assert.match(sql, /REVOKE ALL ON "ConsentPolicy"[\s\S]+FROM PUBLIC/);
});
