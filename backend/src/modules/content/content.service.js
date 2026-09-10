const { Prisma } = require('@prisma/client');
const env = require('../../config/env');
const prisma = require('../../config/prisma');
const { writeAuditLog } = require('../audit/audit.service');
const { resolveMarketPolicy } = require('../markets/market.service');
const { observeContentOperation } = require('../observability/metrics');
const { operationalError, requestEvidence } = require('../privacy/privacy-utils');
const { assertSafePath, validateContentVersion } = require('./content-registry');

const ENTRY_TRANSITIONS = Object.freeze({ DRAFT: new Set(['IN_REVIEW', 'RETIRED']), IN_REVIEW: new Set(['DRAFT', 'APPROVED', 'RETIRED']), APPROVED: new Set(['SCHEDULED', 'PUBLISHED', 'RETIRED']), SCHEDULED: new Set(['PUBLISHED', 'RETIRED']), PUBLISHED: new Set(['RETIRED']), RETIRED: new Set() });
const assertEnabled = () => { if (!env.experimentsContentSeoEnabled || !env.contentPublishingEnabled) throw operationalError('Content capability is unavailable.', 'CONTENT_DISABLED', 503); };
const lock = async (tx, id) => { if (typeof tx.$queryRaw === 'function') await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`content:${id}`}, 0)) IS NULL AS acquired`); };

const resolveReferences = async (input, resolved, database) => {
  const result = {};
  if (input.categoryId) {
    const category = await database.category.findUnique({ where: { id: input.categoryId }, select: { id: true, isActive: true } });
    if (!category?.isActive) throw operationalError('Category is unavailable.', 'CONTENT_CATEGORY_INVALID', 400);
    result.categoryId = category.id;
  }
  if (input.serviceId) {
    const service = await database.service.findUnique({ where: { id: input.serviceId }, select: { id: true, isActive: true } });
    if (!service?.isActive) throw operationalError('Service is unavailable.', 'CONTENT_SERVICE_INVALID', 400);
    result.serviceId = service.id;
  }
  if (input.divisionId) {
    const division = await database.administrativeDivision.findUnique({ where: { id: input.divisionId } });
    if (!division || division.countryId !== resolved.market.countryId || division.lifecycle !== 'ACTIVE') throw operationalError('Geography is unavailable.', 'CONTENT_GEOGRAPHY_INVALID', 400);
    result.divisionId = division.id;
  }
  return result;
};

const createEntry = async ({ input, actorId, req, database = prisma }) => {
  assertEnabled();
  const resolved = await resolveMarketPolicy({ marketCode: input.marketCode, client: database, requireActive: false });
  const entry = await database.contentEntry.create({ data: { key: input.key, type: input.type, marketId: resolved.market.id, createdById: actorId } });
  await writeAuditLog({ req, action: 'CONTENT_ENTRY_CREATED', resourceType: 'CONTENT_ENTRY', resourceId: entry.id, after: { key: entry.key, type: entry.type, marketCode: resolved.market.code } }, database);
  observeContentOperation({ operation: 'entry_created', outcome: 'accepted' });
  return entry;
};

const createContentVersion = async ({ entryId, input, actorId, req, database = prisma }) => {
  assertEnabled();
  const work = async (tx) => {
    await lock(tx, entryId);
    const entry = await tx.contentEntry.findUnique({ where: { id: entryId }, include: { market: true } });
    if (!entry) throw operationalError('Content entry not found.', 'CONTENT_ENTRY_NOT_FOUND', 404);
    if (!['DRAFT', 'IN_REVIEW', 'APPROVED'].includes(entry.status)) throw operationalError('Content entry cannot receive a new draft.', 'CONTENT_ENTRY_LOCKED', 409);
    const resolved = await resolveMarketPolicy({ marketCode: entry.market.code, client: tx, requireActive: false });
    if (!resolved.policy || !entry.market.supportedLocales.includes(input.locale)) throw operationalError('Locale or market policy is unavailable.', 'CONTENT_LOCALE_UNSUPPORTED', 400);
    const validated = validateContentVersion({ ...input, marketCode: entry.market.code, type: entry.type });
    const references = await resolveReferences(input, resolved, tx);
    const versionNumber = entry.currentVersion;
    const version = await tx.contentVersion.create({ data: {
      entryId, marketId: entry.marketId, marketPolicyVersionId: resolved.policy.id, version: versionNumber, locale: input.locale, slug: input.slug,
      ...validated, robotsDirective: input.robotsDirective, indexable: false, ...references, createdById: actorId,
    } });
    await tx.contentEntry.update({ where: { id: entryId }, data: { currentVersion: versionNumber + 1, status: 'DRAFT', rowVersion: { increment: 1 } } });
    return version;
  };
  const version = database.$transaction ? await database.$transaction(work) : await work(database);
  await writeAuditLog({ req, action: 'CONTENT_VERSION_CREATED', resourceType: 'CONTENT_VERSION', resourceId: version.id, after: { entryId, version: version.version, digest: version.contentDigest } }, database);
  observeContentOperation({ operation: 'version_created', outcome: 'accepted' });
  return version;
};

const submitForReview = async ({ versionId, actorId, req, database = prisma, now = new Date() }) => {
  assertEnabled();
  const version = await database.contentVersion.findUnique({ where: { id: versionId }, include: { entry: true } });
  if (!version || version.status !== 'DRAFT' || version.entry.status !== 'DRAFT') throw operationalError('Draft is unavailable for review.', 'CONTENT_REVIEW_INVALID', 409);
  const updated = await database.$transaction(async (tx) => {
    await lock(tx, version.entryId);
    await tx.contentVersion.update({ where: { id: versionId }, data: { status: 'IN_REVIEW', submittedAt: now } });
    const entry = await tx.contentEntry.update({ where: { id: version.entryId }, data: { status: 'IN_REVIEW', rowVersion: { increment: 1 } } });
    await tx.outboxEvent.create({ data: { aggregateType: 'ContentVersion', aggregateId: versionId, eventType: 'content.review.requested', payload: { contentVersionId: versionId, contentEntryId: version.entryId }, metadata: { correlationId: req?.context?.correlationId, traceId: req?.context?.traceId } } });
    return entry;
  });
  await writeAuditLog({ req, action: 'CONTENT_SUBMITTED', resourceType: 'CONTENT_VERSION', resourceId: versionId, metadata: { actorId } }, database);
  observeContentOperation({ operation: 'review', outcome: 'submitted' });
  return updated;
};

const reviewContent = async ({ versionId, decision, reason, actorId, req, database = prisma, now = new Date() }) => {
  assertEnabled();
  const result = await database.$transaction(async (tx) => {
    const version = await tx.contentVersion.findUnique({ where: { id: versionId }, include: { entry: true } });
    if (!version || version.status !== 'IN_REVIEW' || version.entry.status !== 'IN_REVIEW') throw operationalError('Content is not awaiting review.', 'CONTENT_REVIEW_INVALID', 409);
    if (version.createdById === actorId) throw operationalError('Author cannot approve their own content.', 'CONTENT_FOUR_EYES_REQUIRED', 403);
    await lock(tx, version.entryId);
    await tx.contentApproval.create({ data: { versionId, decision, reviewerId: actorId, reason } });
    const status = decision === 'APPROVED' ? 'APPROVED' : 'DRAFT';
    await tx.contentVersion.update({ where: { id: versionId }, data: { status, approvedAt: decision === 'APPROVED' ? now : null } });
    const entry = await tx.contentEntry.update({ where: { id: version.entryId }, data: { status, rowVersion: { increment: 1 } } });
    await tx.outboxEvent.create({ data: { aggregateType: 'ContentVersion', aggregateId: versionId, eventType: decision === 'APPROVED' ? 'content.approved' : 'content.rejected', payload: { contentVersionId: versionId, contentEntryId: version.entryId, decision }, metadata: { correlationId: req?.context?.correlationId, traceId: req?.context?.traceId } } });
    return { entry, version };
  });
  await writeAuditLog({ req, action: `CONTENT_${decision}`, resourceType: 'CONTENT_VERSION', resourceId: versionId, reason, metadata: { actorId } }, database);
  observeContentOperation({ operation: 'review', outcome: decision.toLowerCase() });
  return result.entry;
};

const qualityGate = async (version, database) => {
  if (version.robotsDirective !== 'index,follow') return false;
  if (!version.canonicalPath || version.summary.length < 80 || version.body.length < 3) return false;
  if (version.serviceId) { const service = await database.service.findUnique({ where: { id: version.serviceId }, select: { isActive: true } }); if (!service?.isActive) return false; }
  if (version.divisionId) { const division = await database.administrativeDivision.findUnique({ where: { id: version.divisionId }, select: { lifecycle: true } }); if (division?.lifecycle !== 'ACTIVE') return false; }
  return true;
};

const schedulePublication = async ({ versionId, publishAt, expiresAt, actorId, req, database = prisma, now = new Date() }) => {
  assertEnabled();
  const result = await database.$transaction(async (tx) => {
    const version = await tx.contentVersion.findUnique({ where: { id: versionId }, include: { entry: { include: { market: { include: { policies: true } } } } } });
    if (!version || version.status !== 'APPROVED' || version.entry.status !== 'APPROVED') throw operationalError('Only approved content can be scheduled.', 'CONTENT_PUBLICATION_INVALID', 409);
    if (version.createdById === actorId) throw operationalError('Author cannot publish their own content.', 'CONTENT_FOUR_EYES_REQUIRED', 403);
    await lock(tx, version.entryId);
    const currentPolicy = version.entry.market.policies.find((item) => item.version === version.entry.market.currentPolicyVersion && item.status === 'ACTIVE' && item.reviewStatus === 'APPROVED');
    if (!currentPolicy || currentPolicy.id !== version.marketPolicyVersionId) throw operationalError('Content market policy is stale.', 'CONTENT_POLICY_STALE', 409);
    const indexable = version.entry.market.status === 'ACTIVE' && await qualityGate(version, tx);
    const immediate = publishAt <= now;
    const status = immediate ? 'PUBLISHED' : 'SCHEDULED';
    const publication = await tx.contentPublication.create({ data: { versionId, status, path: assertSafePath(version.canonicalPath), locale: version.locale, canonicalPath: version.canonicalPath, indexable, publishAt, publishedAt: immediate ? now : null, expiresAt, publishedById: actorId, ...requestEvidence(req?.context) } });
    await tx.contentVersion.update({ where: { id: versionId }, data: { status, indexable } });
    await tx.contentEntry.update({ where: { id: version.entryId }, data: { status, rowVersion: { increment: 1 } } });
    await tx.outboxEvent.create({ data: { aggregateType: 'ContentPublication', aggregateId: publication.id, eventType: immediate ? 'content.published' : 'content.publication.scheduled', payload: { publicationId: publication.id, contentVersionId: versionId, status }, metadata: { correlationId: req?.context?.correlationId, traceId: req?.context?.traceId } } });
    return publication;
  });
  await writeAuditLog({ req, action: result.status === 'PUBLISHED' ? 'CONTENT_PUBLISHED' : 'CONTENT_SCHEDULED', resourceType: 'CONTENT_PUBLICATION', resourceId: result.id, after: { status: result.status, indexable: result.indexable, publishAt: result.publishAt } }, database);
  observeContentOperation({ operation: 'publication', outcome: result.status.toLowerCase() });
  return result;
};

const publishDueContent = async ({ batchSize = 50, database = prisma, now = new Date() } = {}) => {
  assertEnabled();
  const due = await database.contentPublication.findMany({ where: { status: 'SCHEDULED', publishAt: { lte: now } }, orderBy: [{ publishAt: 'asc' }, { id: 'asc' }], take: Math.min(100, batchSize) });
  let published = 0;
  for (const publication of due) {
    const changed = await database.$transaction(async (tx) => {
      const result = await tx.contentPublication.updateMany({ where: { id: publication.id, status: 'SCHEDULED' }, data: { status: 'PUBLISHED', publishedAt: now } });
      if (!result.count) return false;
      await tx.contentVersion.update({ where: { id: publication.versionId }, data: { status: 'PUBLISHED' } });
      const version = await tx.contentVersion.findUnique({ where: { id: publication.versionId }, select: { entryId: true } });
      await tx.contentEntry.update({ where: { id: version.entryId }, data: { status: 'PUBLISHED', rowVersion: { increment: 1 } } });
      await tx.outboxEvent.create({ data: { aggregateType: 'ContentPublication', aggregateId: publication.id, eventType: 'content.published', payload: { publicationId: publication.id, contentVersionId: publication.versionId, status: 'PUBLISHED' } } });
      return true;
    });
    if (changed) published += 1;
  }
  observeContentOperation({ operation: 'scheduler', outcome: published ? 'published' : 'empty', reason: String(published) });
  return { examined: due.length, published };
};

const retirePublication = async ({ publicationId, reason, actorId, req, database = prisma, now = new Date() }) => {
  assertEnabled();
  const publication = await database.contentPublication.findUnique({ where: { id: publicationId }, include: { version: true } });
  if (!publication || publication.status !== 'PUBLISHED') throw operationalError('Published content not found.', 'CONTENT_PUBLICATION_NOT_FOUND', 404);
  await database.$transaction(async (tx) => {
    await lock(tx, publication.version.entryId);
    await tx.contentPublication.update({ where: { id: publicationId }, data: { status: 'RETIRED', retiredAt: now, indexable: false } });
    await tx.contentVersion.update({ where: { id: publication.versionId }, data: { status: 'RETIRED', indexable: false } });
    await tx.contentEntry.update({ where: { id: publication.version.entryId }, data: { status: 'RETIRED', rowVersion: { increment: 1 } } });
  });
  await writeAuditLog({ req, action: 'CONTENT_RETIRED', resourceType: 'CONTENT_PUBLICATION', resourceId: publicationId, reason, metadata: { actorId } }, database);
  observeContentOperation({ operation: 'publication', outcome: 'retired' });
  return { id: publicationId, status: 'RETIRED' };
};

const listContent = async ({ page = 1, limit = 50, status, type, marketId, database = prisma }) => {
  const where = { ...(status ? { status } : {}), ...(type ? { type } : {}), ...(marketId ? { marketId } : {}) };
  const [items, total] = await Promise.all([database.contentEntry.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit, include: { market: { select: { code: true } }, versions: { orderBy: { version: 'desc' }, take: 1, include: { publication: true, approvals: true } } } }), database.contentEntry.count({ where })]);
  return { items, pagination: { page, limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

module.exports = { ENTRY_TRANSITIONS, createContentVersion, createEntry, listContent, publishDueContent, qualityGate, retirePublication, reviewContent, schedulePublication, submitForReview };
