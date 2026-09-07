require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
process.env.NODE_ENV = 'test';
process.env.GROWTH_DATA_ENABLED = 'true';
process.env.CONSENT_ATTRIBUTION_ENABLED = 'true';
process.env.GROWTH_PSEUDONYM_SECRET ||= 'f7-growth-pseudonym-test-secret-with-32-characters';
process.env.GROWTH_IDENTITY_PROOF_SECRET ||= 'f7-identity-proof-test-secret-with-32-characters';

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true deliberately.');
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL must point to the isolated Supabase test database.');

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const prisma = require('../../src/config/prisma');
const app = require('../../src/app');
const { hashPassword } = require('../../src/utils/password');
const { generateToken } = require('../../src/middleware/auth');
const { bootstrapRbac } = require('../../src/modules/identity/bootstrap-rbac');
const { createAdminSession } = require('../../src/modules/identity/admin-session.service');
const { trackEvent } = require('../../src/modules/growth/events/event.service');

const runId = `f7.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
const ids = { users: [], decisions: [], links: [], touchpoints: [], models: [], policies: [], events: [], conversions: [], leads: [], attributions: [] };
let passwordHash;

const createUser = async (label, roleId) => {
  const user = await prisma.user.create({ data: {
    email: `${runId}-${label}@example.test`.toLowerCase(), phone: `+349${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`,
    passwordHash, firstName: label, lastName: 'F7Test', role: 'CLIENT', countryCode: 'ES', registrationLocale: 'es',
  } });
  ids.users.push(user.id);
  if (roleId) await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId, status: 'ACTIVE' } });
  return user;
};

test.before(async () => { await bootstrapRbac(prisma); passwordHash = await hashPassword('integration-password'); });

test.after(async () => {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL homeservices.allow_immutable_cleanup = 'true'");
    await tx.attribution.deleteMany({ where: { conversionId: { in: ids.conversions } } });
    await tx.touchpoint.deleteMany({ where: { id: { in: ids.touchpoints } } });
    await tx.consentDecision.deleteMany({ where: { id: { in: ids.decisions } } });
    await tx.subjectIdentityLink.deleteMany({ where: { id: { in: ids.links } } });
  });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [...ids.decisions, ...ids.links, ...ids.touchpoints, ...ids.models, ...ids.policies, ...ids.events, ...ids.conversions, ...ids.attributions] } } });
  await prisma.conversion.deleteMany({ where: { id: { in: ids.conversions } } });
  await prisma.marketingEvent.deleteMany({ where: { id: { in: ids.events } } });
  await prisma.lead.deleteMany({ where: { id: { in: ids.leads } } });
  await prisma.attributionModel.deleteMany({ where: { id: { in: ids.models } } });
  await prisma.consentPolicy.deleteMany({ where: { id: { in: ids.policies } } });
  await prisma.adminSession.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids.users } }, { correlationId: { startsWith: runId } }] } });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.$disconnect();
});

test('Supabase test proves F7 policy, consent, identity, touchpoints, attribution, RBAC and audit end to end', async () => {
  const [complianceRole, marketingRole, analystRole] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { key: 'COMPLIANCE_ADMIN' } }),
    prisma.role.findUniqueOrThrow({ where: { key: 'MARKETING_ADMIN' } }),
    prisma.role.findUniqueOrThrow({ where: { key: 'ANALYST' } }),
  ]);
  const creator = await createUser('PolicyCreator', complianceRole.id);
  const reviewer = await createUser('PolicyReviewer', complianceRole.id);
  const marketer = await createUser('AttributionManager', marketingRole.id);
  const analyst = await createUser('Analyst', analystRole.id);
  const customer = await createUser('Customer', null);
  const otherCustomer = await createUser('OtherCustomer', null);
  const sessions = await Promise.all([creator, reviewer, marketer, analyst].map((user) => createAdminSession({ email: user.email, password: 'integration-password', userAgent: 'f7-test', ipAddress: '127.0.0.1' }, prisma)));
  const [creatorSession, reviewerSession, marketerSession, analystSession] = sessions;
  const adminHeaders = (session, correlationId) => ({ authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json', 'x-correlation-id': correlationId });
  const customerHeaders = (user, correlationId) => ({ authorization: `Bearer ${generateToken({ userId: user.id, role: user.role })}`, 'content-type': 'application/json', 'x-correlation-id': correlationId });
  const server = http.createServer(app); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const policyBody = {
      key: `marketing-${runId.replaceAll('.', '-')}`, purpose: 'marketing_attribution', version: 1, countryCode: 'ES', locale: 'es', legalBasis: 'consent', enforcementMode: 'EXPLICIT_GRANT',
      documentReference: `https://legal.example.test/${runId}/marketing-v1`, documentDigest: 'a'.repeat(64), retentionDays: 365, reason: 'Create isolated F7 consent policy.',
    };
    const createdPolicyResponse = await fetch(`${base}/v1/admin/privacy/policies`, { method: 'POST', headers: adminHeaders(creatorSession, `${runId}-policy-create`), body: JSON.stringify(policyBody) });
    assert.equal(createdPolicyResponse.status, 201); const createdPolicy = (await createdPolicyResponse.json()).policy; ids.policies.push(createdPolicy.id);
    const selfReview = await fetch(`${base}/v1/admin/privacy/policies/${createdPolicy.id}/review`, { method: 'POST', headers: adminHeaders(creatorSession, `${runId}-policy-self-review`), body: JSON.stringify({ reviewStatus: 'APPROVED', reviewReference: 'LEGAL-F7-INTEGRATION', reason: 'Attempt invalid self review.' }) });
    assert.equal(selfReview.status, 409);
    const reviewed = await fetch(`${base}/v1/admin/privacy/policies/${createdPolicy.id}/review`, { method: 'POST', headers: adminHeaders(reviewerSession, `${runId}-policy-review`), body: JSON.stringify({ reviewStatus: 'APPROVED', reviewReference: 'LEGAL-F7-INTEGRATION', reason: 'Independent isolated test review.' }) });
    assert.equal(reviewed.status, 200);
    const activated = await fetch(`${base}/v1/admin/privacy/policies/${createdPolicy.id}/status`, { method: 'PATCH', headers: adminHeaders(reviewerSession, `${runId}-policy-active`), body: JSON.stringify({ status: 'ACTIVE', reason: 'Activate only in isolated test environment.' }) });
    assert.equal(activated.status, 200); assert.equal((await activated.json()).policy.status, 'ACTIVE');

    for (const type of ['FIRST_TOUCH', 'LAST_TOUCH']) {
      const key = `${type.toLowerCase().replace('_', '-')}-${runId.replaceAll('.', '-')}`;
      const modelResponse = await fetch(`${base}/v1/admin/attribution/models`, { method: 'POST', headers: adminHeaders(marketerSession, `${runId}-model-${type}`), body: JSON.stringify({ key, version: 1, name: `${type} integration`, type, purpose: 'marketing_attribution', windowDays: 30, reason: `Create ${type} isolated model.` }) });
      assert.equal(modelResponse.status, 201); const model = (await modelResponse.json()).model; ids.models.push(model.id);
      const activeModel = await fetch(`${base}/v1/admin/attribution/models/${model.id}/status`, { method: 'PATCH', headers: adminHeaders(marketerSession, `${runId}-model-active-${type}`), body: JSON.stringify({ status: 'ACTIVE', reason: `Activate ${type} isolated model.` }) });
      assert.equal(activeModel.status, 200);
    }

    const grantPayload = { idempotencyKey: `${runId}:grant:marketing`, policyId: createdPolicy.id, policyVersion: 1, purpose: 'marketing_attribution', countryCode: 'ES', locale: 'es', decision: 'GRANTED', source: 'CLIENT_SETTINGS', evidence: { interaction: 'separate_optional_control' } };
    const grantResponse = await fetch(`${base}/v1/privacy/consents`, { method: 'POST', headers: customerHeaders(customer, `${runId}-grant`), body: JSON.stringify(grantPayload) });
    assert.equal(grantResponse.status, 201); const grant = (await grantResponse.json()).decision; ids.decisions.push(grant.id);
    const grantRecord = await prisma.consentDecision.findUniqueOrThrow({ where: { id: grant.id } });
    await assert.rejects(() => prisma.consentDecision.create({ data: {
      idempotencyKey: `${runId}:invalid:purpose`, policyId: createdPolicy.id, policyVersion: 1,
      purpose: 'forged_purpose', subjectKey: grantRecord.subjectKey, subjectType: grantRecord.subjectType,
      userId: customer.id, decision: 'GRANTED', source: 'INTEGRATION_TEST',
    } }));
    await assert.rejects(() => prisma.touchpoint.create({ data: {
      idempotencyKey: `${runId}:invalid:retroactive`, subjectKey: grantRecord.subjectKey,
      subjectType: grantRecord.subjectType, userId: customer.id, policyId: createdPolicy.id,
      policyVersion: 1, consentDecisionId: grant.id, source: 'integration_test',
      occurredAt: new Date(grantRecord.occurredAt.getTime() - 1),
    } }));
    const grantReplay = await fetch(`${base}/v1/privacy/consents`, { method: 'POST', headers: customerHeaders(customer, `${runId}-grant-replay`), body: JSON.stringify(grantPayload) });
    assert.equal(grantReplay.status, 200); assert.equal((await grantReplay.json()).duplicate, true);

    for (const [index, source] of ['newsletter', 'partner'].entries()) {
      const response = await fetch(`${base}/v1/privacy/touchpoints`, { method: 'POST', headers: customerHeaders(customer, `${runId}-touch-${index}`), body: JSON.stringify({
        idempotencyKey: `${runId}:touchpoint:${index}`, purpose: 'marketing_attribution', countryCode: 'ES', locale: 'es', policyId: createdPolicy.id, policyVersion: 1,
        source, medium: 'first_party', referrer: `https://example.test/article-${index}?token=must-not-persist`, landingUrl: `/join-${index}?email=must-not-persist`, occurredAt: new Date().toISOString(), context: { placement: `hero_${index}` },
      }) });
      assert.equal(response.status, 201); const body = await response.json(); ids.touchpoints.push(body.touchpoint.id); assert.equal(body.sanitized, true);
    }

    const event = await trackEvent({ eventId: `${runId}:conversion:event`, eventName: 'signup_completed', source: 'first_party', geography: { countryCode: 'ES' } }, { userId: customer.id }, prisma, { requestId: `${runId}-conversion`, correlationId: `${runId}-conversion`, traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) });
    ids.events.push(event.event.id); ids.leads.push(event.event.leadId); ids.conversions.push(event.conversion.id);
    const results = await prisma.attribution.findMany({ where: { conversionId: event.conversion.id }, include: { model: true, touchpoint: true } });
    ids.attributions.push(...results.map((item) => item.id));
    assert.equal(results.length, 2);
    assert.equal(results.find((item) => item.model.type === 'FIRST_TOUCH').touchpoint.source, 'newsletter');
    assert.equal(results.find((item) => item.model.type === 'LAST_TOUCH').touchpoint.source, 'partner');
    assert.equal(await prisma.conversion.count({ where: { eventId: event.event.id } }), 1);

    const proofResponse = await fetch(`${base}/v1/privacy/identity-proofs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ anonymousId: `${runId}:anonymous-subject` }) });
    assert.equal(proofResponse.status, 201); const proof = (await proofResponse.json()).proof;
    const linkResponse = await fetch(`${base}/v1/privacy/identity/reconcile`, { method: 'POST', headers: customerHeaders(customer, `${runId}-link`), body: JSON.stringify({ proof }) });
    assert.equal(linkResponse.status, 201); ids.links.push((await linkResponse.json()).id);
    const spoof = await fetch(`${base}/v1/privacy/identity/reconcile`, { method: 'POST', headers: customerHeaders(otherCustomer, `${runId}-spoof`), body: JSON.stringify({ proof }) });
    assert.equal(spoof.status, 409);

    const withdrawalResponse = await fetch(`${base}/v1/privacy/consents/withdrawals`, { method: 'POST', headers: customerHeaders(customer, `${runId}-withdraw`), body: JSON.stringify({ idempotencyKey: `${runId}:withdraw:marketing`, purpose: 'marketing_attribution', source: 'CLIENT_SETTINGS', evidence: { interaction: 'explicit_withdrawal_button' } }) });
    assert.equal(withdrawalResponse.status, 201); ids.decisions.push((await withdrawalResponse.json()).withdrawal.id);
    const blocked = await fetch(`${base}/v1/privacy/touchpoints`, { method: 'POST', headers: customerHeaders(customer, `${runId}-blocked-touch`), body: JSON.stringify({ idempotencyKey: `${runId}:touchpoint:blocked`, purpose: 'marketing_attribution', countryCode: 'ES', locale: 'es', policyId: createdPolicy.id, policyVersion: 1, source: 'newsletter' }) });
    assert.equal(blocked.status, 403); assert.equal((await blocked.json()).code, 'CONSENT_ENFORCEMENT_DENIED');

    const consentRead = await fetch(`${base}/v1/admin/privacy/consents?purpose=marketing_attribution`, { headers: adminHeaders(reviewerSession, `${runId}-consent-read`) });
    assert.equal(consentRead.status, 200); const consentText = await consentRead.text(); assert.doesNotMatch(consentText, /subjectKey|anonymous-subject|must-not-persist|@example\.test/);
    const marketingDenied = await fetch(`${base}/v1/admin/privacy/consents`, { headers: adminHeaders(marketerSession, `${runId}-marketing-denied`) });
    assert.equal(marketingDenied.status, 403);
    const analystDenied = await fetch(`${base}/v1/admin/attribution/results`, { headers: adminHeaders(analystSession, `${runId}-analyst-denied`) });
    assert.equal(analystDenied.status, 403);
    const attributionRead = await fetch(`${base}/v1/admin/attribution/results?conversionId=${event.conversion.id}`, { headers: adminHeaders(marketerSession, `${runId}-attribution-read`) });
    assert.equal(attributionRead.status, 200); assert.equal((await attributionRead.json()).items.length, 2);

    await assert.rejects(() => prisma.consentDecision.update({ where: { id: grant.id }, data: { source: 'TAMPERED' } }));
    assert.equal(await prisma.auditLog.count({ where: { actorId: reviewer.id, action: 'ADMIN_CONSENT_HISTORY_READ' } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { actorId: marketer.id, action: 'AUTHORIZATION_DENIED', resourceId: 'privacy.consent.read' } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { actorId: analyst.id, action: 'AUTHORIZATION_DENIED', resourceId: 'attribution.read' } }), 1);
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
