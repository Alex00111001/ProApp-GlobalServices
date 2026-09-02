const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');

const FUNNEL_STAGES = Object.freeze([
  { eventName: 'app_opened', key: 'visitors', label: 'App abierta' },
  { eventName: 'signup_started', key: 'signupStarted', label: 'Registro iniciado' },
  { eventName: 'signup_completed', key: 'signupCompleted', label: 'Registro completado' },
  { eventName: 'request_created', key: 'requests', label: 'Solicitud creada' },
  { eventName: 'booking_created', key: 'bookings', label: 'Reserva creada' },
  { eventName: 'payment_completed', key: 'payments', label: 'Pago completado' },
  { eventName: 'job_completed', key: 'jobsCompleted', label: 'Servicio completado' },
]);
const operationalError = (message, code, statusCode) => Object.assign(new Error(message), { code, statusCode });
const pageResult = (page, limit, totalItems) => ({ page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) });

const resolveRange = ({ from, to, timezone = 'UTC', ...filters }, now = new Date()) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(now); } catch {
    throw operationalError('Timezone is invalid.', 'INVALID_TIMEZONE', 400);
  }
  const end = to ? new Date(to) : now;
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) throw operationalError('Growth range is invalid.', 'INVALID_GROWTH_RANGE', 400);
  if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60_000) throw operationalError('Growth range cannot exceed 366 days.', 'GROWTH_RANGE_TOO_LARGE', 400);
  if (end.getTime() > now.getTime() + 5 * 60_000) throw operationalError('Growth range cannot extend into the future.', 'GROWTH_RANGE_IN_FUTURE', 400);
  return { from: start, to: end, timezone, ...filters };
};

const eventWhere = (range) => ({
  occurredAt: { gte: range.from, lt: range.to },
  ...(range.campaignId ? { campaignId: range.campaignId } : {}),
  ...(range.countryCode ? { countryCode: range.countryCode } : {}),
});
const leadWhere = (range) => ({
  firstSeenAt: { gte: range.from, lt: range.to },
  ...(range.campaignId ? { campaignId: range.campaignId } : {}),
  ...(range.countryCode ? { countryCode: range.countryCode } : {}),
});
const conversionWhere = (range) => ({
  occurredAt: { gte: range.from, lt: range.to },
  ...(range.campaignId ? { campaignId: range.campaignId } : {}),
  ...(range.countryCode ? { lead: { countryCode: range.countryCode } } : {}),
});

const getGrowthOverview = async (query, client = prisma) => {
  const range = resolveRange(query);
  const eventsWhere = eventWhere(range);
  const [eventCount, leadCount, conversionCount, activeCampaigns, conversions, latestEvent, incompleteEvents] = await Promise.all([
    client.marketingEvent.count({ where: eventsWhere }),
    client.lead.count({ where: leadWhere(range) }),
    client.conversion.count({ where: conversionWhere(range) }),
    client.campaign.count({ where: { status: 'ACTIVE', ...(range.countryCode ? { countryCode: range.countryCode } : {}) } }),
    client.conversion.groupBy({ by: ['type'], where: conversionWhere(range), _count: { _all: true } }),
    client.marketingEvent.findFirst({ where: eventsWhere, orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }),
    client.marketingEvent.count({ where: { ...eventsWhere, OR: [{ subjectKey: null }, { clientEventId: null }] } }),
  ]);
  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), timezone: range.timezone, campaignId: range.campaignId || null, countryCode: range.countryCode || null },
    generatedAt: new Date().toISOString(),
    freshness: { latestEventReceivedAt: latestEvent?.receivedAt?.toISOString() || null, partialData: incompleteEvents > 0 },
    metrics: { events: eventCount, leads: leadCount, conversions: conversionCount, activeCampaigns },
    conversions: Object.fromEntries(conversions.map((row) => [row.type, row._count._all])),
    definitions: {
      events: { label: 'Eventos aceptados', unit: 'count', source: 'MarketingEvent', description: 'Eventos first-party aceptados dentro del rango por occurredAt.' },
      leads: { label: 'Leads observados', unit: 'count', source: 'Lead', description: 'Identidades analíticas seudónimas cuya primera observación cae dentro del rango.' },
      conversions: { label: 'Conversiones', unit: 'count', source: 'Conversion', description: 'Hitos de conversión idempotentes derivados de eventos canónicos.' },
      activeCampaigns: { label: 'Campañas activas', unit: 'count', source: 'Campaign', description: 'Campañas internas con estado ACTIVE; no implica activación en un proveedor externo.' },
    },
  };
};

const buildFunnel = (rows) => {
  const byName = new Map(rows.map((row) => [row.eventName, { occurrences: Number(row.occurrences), subjects: Number(row.subjects) }]));
  const firstSubjects = byName.get(FUNNEL_STAGES[0].eventName)?.subjects || 0;
  return FUNNEL_STAGES.map((stage, index) => {
    const value = byName.get(stage.eventName) || { occurrences: 0, subjects: 0 };
    const previousSubjects = index === 0 ? value.subjects : byName.get(FUNNEL_STAGES[index - 1].eventName)?.subjects || 0;
    return {
      ...stage,
      ...value,
      rateFromFirst: firstSubjects ? ((value.subjects / firstSubjects) * 100).toFixed(2) : '0.00',
      rateFromPrevious: index === 0 ? '100.00' : previousSubjects ? ((value.subjects / previousSubjects) * 100).toFixed(2) : '0.00',
    };
  });
};

const getGrowthFunnel = async (query, client = prisma) => {
  const range = resolveRange(query);
  const filters = [Prisma.sql`"occurredAt" >= ${range.from}`, Prisma.sql`"occurredAt" < ${range.to}`];
  if (range.campaignId) filters.push(Prisma.sql`"campaignId" = ${range.campaignId}`);
  if (range.countryCode) filters.push(Prisma.sql`"countryCode" = ${range.countryCode}`);
  const eventNames = FUNNEL_STAGES.map((stage) => stage.eventName);
  const rows = await client.$queryRaw(Prisma.sql`
    SELECT "eventName", COUNT(*)::int AS occurrences, COUNT(DISTINCT "leadId")::int AS subjects
    FROM "MarketingEvent"
    WHERE ${Prisma.join(filters, ' AND ')} AND "eventName" IN (${Prisma.join(eventNames)})
    GROUP BY "eventName"
  `);
  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), timezone: range.timezone, campaignId: range.campaignId || null, countryCode: range.countryCode || null },
    generatedAt: new Date().toISOString(),
    definition: 'Observed unique pseudonymous leads at each canonical stage. Rates are descriptive, not causal attribution.',
    stages: buildFunnel(rows),
  };
};

const listCampaigns = async ({ page, limit, status, search, countryCode }, client = prisma) => {
  const where = {
    ...(status ? { status } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(search ? { OR: [{ key: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }, { source: { contains: search, mode: 'insensitive' } }] } : {}),
  };
  const [items, totalItems] = await Promise.all([
    client.campaign.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], select: {
      id: true, key: true, name: true, status: true, source: true, medium: true, channel: true, countryCode: true, startsAt: true, endsAt: true, createdAt: true, updatedAt: true,
      _count: { select: { events: true, leads: true, conversions: true } },
    } }),
    client.campaign.count({ where }),
  ]);
  return { items, pagination: pageResult(page, limit, totalItems) };
};

const listLeads = async ({ page, limit, status, campaignId, countryCode }, client = prisma) => {
  const where = { ...(status ? { status } : {}), ...(campaignId ? { campaignId } : {}), ...(countryCode ? { countryCode } : {}) };
  const [rows, totalItems] = await Promise.all([
    client.lead.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }], select: {
      id: true, subjectType: true, status: true, userId: true, professionalId: true, source: true, channel: true, countryCode: true, firstSeenAt: true, lastSeenAt: true, convertedAt: true,
      campaign: { select: { id: true, key: true, name: true } }, _count: { select: { events: true, conversions: true } },
    } }),
    client.lead.count({ where }),
  ]);
  return {
    items: rows.map(({ userId, professionalId, ...lead }) => ({ ...lead, identified: Boolean(userId || professionalId) })),
    pagination: pageResult(page, limit, totalItems),
  };
};

const listConversions = async ({ page, limit, type, campaignId, countryCode }, client = prisma) => {
  const where = { ...(type ? { type } : {}), ...(campaignId ? { campaignId } : {}), ...(countryCode ? { lead: { countryCode } } : {}) };
  const [items, totalItems] = await Promise.all([
    client.conversion.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], select: {
      id: true, type: true, occurredAt: true, createdAt: true,
      campaign: { select: { id: true, key: true, name: true } },
      event: { select: { id: true, eventName: true, correlationId: true } },
      lead: { select: { subjectType: true } },
    } }),
    client.conversion.count({ where }),
  ]);
  return { items, pagination: pageResult(page, limit, totalItems) };
};

module.exports = { FUNNEL_STAGES, buildFunnel, getGrowthFunnel, getGrowthOverview, listCampaigns, listConversions, listLeads, resolveRange };
