require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
process.env.NODE_ENV = 'test';
process.env.GROWTH_DATA_ENABLED = 'true';

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true deliberately.');
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL must point to the isolated Supabase test database.');

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const prisma = require('../../src/config/prisma');
const app = require('../../src/app');
const { hashPassword } = require('../../src/utils/password');
const { bootstrapRbac } = require('../../src/modules/identity/bootstrap-rbac');
const { createAdminSession } = require('../../src/modules/identity/admin-session.service');
const { trackEvent } = require('../../src/modules/growth/events/event.service');

const runId = `growth.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
const userIds = [];
const eventIds = [];
let campaignId;
let leadId;
let passwordHash;

const createUser = async (label, roleId) => {
  const user = await prisma.user.create({ data: {
    email: `${runId}-${label}@example.test`.toLowerCase(),
    phone: `${Date.now()}${Math.floor(Math.random() * 100_000)}`,
    passwordHash,
    firstName: label,
    lastName: 'GrowthTest',
    role: 'CLIENT',
    countryCode: 'ES',
  } });
  userIds.push(user.id);
  if (roleId) await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId, status: 'ACTIVE' } });
  return user;
};

test.before(async () => {
  await bootstrapRbac(prisma);
  passwordHash = await hashPassword('integration-password');
});

test.after(async () => {
  if (eventIds.length) {
    await prisma.conversion.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateType: 'MarketingEvent', aggregateId: { in: eventIds } }, ...(campaignId ? [{ aggregateType: 'Campaign', aggregateId: campaignId }] : [])] } });
    await prisma.marketingEvent.deleteMany({ where: { id: { in: eventIds } } });
  }
  if (leadId) await prisma.lead.deleteMany({ where: { id: leadId } });
  if (campaignId) await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.adminSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { correlationId: { startsWith: runId } }] } });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test('Supabase test proves growth idempotency, privacy, RBAC and audited lifecycle end to end', async () => {
  const [marketingRole, analystRole] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { key: 'MARKETING_ADMIN' } }),
    prisma.role.findUniqueOrThrow({ where: { key: 'ANALYST' } }),
  ]);
  const marketing = await createUser('Marketing', marketingRole.id);
  const analyst = await createUser('Analyst', analystRole.id);
  const customer = await createUser('Customer', null);
  const [marketingSession, analystSession] = await Promise.all([
    createAdminSession({ email: marketing.email, password: 'integration-password', userAgent: 'growth-test', ipAddress: '127.0.0.1' }, prisma),
    createAdminSession({ email: analyst.email, password: 'integration-password', userAgent: 'growth-test', ipAddress: '127.0.0.1' }, prisma),
  ]);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/admin/growth`;
  const marketingHeaders = { authorization: `Bearer ${marketingSession.accessToken}`, 'content-type': 'application/json' };

  try {
    const createdResponse = await fetch(`${baseUrl}/campaigns`, {
      method: 'POST',
      headers: { ...marketingHeaders, 'x-correlation-id': `${runId}-campaign-create` },
      body: JSON.stringify({ key: `f6-${runId.replaceAll('.', '-')}`, name: 'F6 integration campaign', source: 'integration', channel: 'first-party', countryCode: 'ES', reason: 'Create isolated F6 integration evidence' }),
    });
    assert.equal(createdResponse.status, 201);
    campaignId = (await createdResponse.json()).campaign.id;

    const activeResponse = await fetch(`${baseUrl}/campaigns/${campaignId}/status`, {
      method: 'PATCH',
      headers: { ...marketingHeaders, 'x-correlation-id': `${runId}-campaign-active` },
      body: JSON.stringify({ status: 'ACTIVE', reason: 'Activate isolated integration campaign' }),
    });
    assert.equal(activeResponse.status, 200);
    assert.equal((await activeResponse.json()).campaign.status, 'ACTIVE');

    const clientEventId = `${runId}:signup-completed`;
    const first = await trackEvent({
      eventId: clientEventId,
      eventName: 'signup_completed',
      anonymousId: `${runId}:raw-anonymous`,
      utm: { campaign: `f6-${runId.replaceAll('.', '-')}`, source: 'integration' },
      geography: { countryCode: 'ES' },
      metadata: { note: 'customer@example.test', cohort: 'integration' },
    }, { userId: customer.id }, prisma, { requestId: `${runId}-event`, correlationId: `${runId}-event`, traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) });
    eventIds.push(first.event.id);
    leadId = first.event.leadId;
    const replay = await trackEvent({ eventId: clientEventId, eventName: 'signup_completed' }, { userId: customer.id }, prisma, {});
    assert.equal(replay.duplicate, true);
    assert.equal(replay.event.id, first.event.id);
    assert.equal(await prisma.marketingEvent.count({ where: { clientEventId } }), 1);
    assert.equal(await prisma.conversion.count({ where: { eventId: first.event.id } }), 1);
    assert.equal(await prisma.lead.count({ where: { id: leadId, status: 'CONVERTED' } }), 1);

    const overviewResponse = await fetch(`${baseUrl}/overview?campaignId=${campaignId}&countryCode=ES`, { headers: { ...marketingHeaders, 'x-correlation-id': `${runId}-overview` } });
    assert.equal(overviewResponse.status, 200);
    const overview = await overviewResponse.json();
    assert.equal(overview.metrics.events, 1);
    assert.equal(overview.metrics.leads, 1);
    assert.equal(overview.metrics.conversions, 1);
    assert.equal(overview.metrics.activeCampaigns, 1);

    const leadsResponse = await fetch(`${baseUrl}/leads?campaignId=${campaignId}`, { headers: { ...marketingHeaders, 'x-correlation-id': `${runId}-leads` } });
    assert.equal(leadsResponse.status, 200);
    const leadsText = await leadsResponse.text();
    const leads = JSON.parse(leadsText);
    assert.equal(leads.items[0].identified, true);
    assert.doesNotMatch(leadsText, new RegExp(customer.id));
    assert.doesNotMatch(leadsText, /subjectKey|raw-anonymous|customer@example\.test/);

    const conversionsResponse = await fetch(`${baseUrl}/conversions?campaignId=${campaignId}`, { headers: { ...marketingHeaders, 'x-correlation-id': `${runId}-conversions` } });
    assert.equal(conversionsResponse.status, 200);
    const conversionsText = await conversionsResponse.text();
    assert.equal(JSON.parse(conversionsText).items[0].type, 'SIGNUP');
    assert.doesNotMatch(conversionsText, new RegExp(customer.id));
    assert.doesNotMatch(conversionsText, /subjectKey|raw-anonymous|customer@example\.test/);

    const analystDenied = await fetch(`${baseUrl}/overview`, { headers: { authorization: `Bearer ${analystSession.accessToken}`, 'x-correlation-id': `${runId}-analyst-denied` } });
    assert.equal(analystDenied.status, 403);
    assert.equal((await analystDenied.json()).code, 'INSUFFICIENT_PERMISSION');

    assert.equal(await prisma.auditLog.count({ where: { actorId: marketing.id, action: { in: ['growth.campaign_created', 'growth.campaign_status_changed', 'ADMIN_GROWTH_LEADS_READ', 'ADMIN_GROWTH_CONVERSIONS_READ'] } } }), 4);
    assert.equal(await prisma.auditLog.count({ where: { actorId: analyst.id, action: 'AUTHORIZATION_DENIED', resourceId: 'marketing.read' } }), 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
