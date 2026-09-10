const env = require('../../config/env');
const prisma = require('../../config/prisma');
const { writeAuditLog } = require('../audit/audit.service');
const { resolveMarketPolicy } = require('../markets/market.service');
const { observeContentOperation } = require('../observability/metrics');
const { canonicalDigest, operationalError } = require('../privacy/privacy-utils');
const { assertSafePath, canonicalPathFor } = require('../content/content-registry');

const assertPublicEnabled = () => { if (!env.experimentsContentSeoEnabled || !env.publicSeoEnabled) throw operationalError('Public SEO capability is unavailable.', 'PUBLIC_SEO_DISABLED', 503); };
const publicContentSelect = {
  id: true, locale: true, slug: true, title: true, summary: true, body: true, seoTitle: true,
  metaDescription: true, canonicalPath: true, robotsDirective: true, indexable: true,
  openGraph: true, structuredData: true, contentDigest: true,
  entry: { select: { key: true, type: true, market: { select: { code: true, status: true, supportedLocales: true } } } },
};

const getPublishedContent = async ({ marketCode, locale, type, slug, database = prisma, now = new Date() }) => {
  assertPublicEnabled();
  const resolved = await resolveMarketPolicy({ marketCode, client: database, requireActive: true, now });
  if (!resolved.market.supportedLocales.includes(locale)) throw operationalError('Published content is unavailable.', 'PUBLIC_CONTENT_NOT_FOUND', 404);
  const path = canonicalPathFor({ marketCode: resolved.market.code, locale, type, slug });
  const publication = await database.contentPublication.findFirst({ where: { path, status: 'PUBLISHED', publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { publishedAt: true, version: { select: publicContentSelect } } });
  if (!publication || publication.version.entry.type !== type || publication.version.canonicalPath !== path) throw operationalError('Published content is unavailable.', 'PUBLIC_CONTENT_NOT_FOUND', 404);
  const version = publication.version;
  return {
    key: version.entry.key, type: version.entry.type, marketCode: version.entry.market.code, locale: version.locale,
    title: version.title, summary: version.summary, body: version.body,
    seo: { title: version.seoTitle, description: version.metaDescription, canonical: `${env.publicWebBaseUrl}${version.canonicalPath}`, robots: version.indexable ? version.robotsDirective : 'noindex,nofollow', openGraph: version.openGraph, structuredData: version.structuredData },
    publishedAt: publication.publishedAt, etag: version.contentDigest,
  };
};

const assertNoRedirectLoop = async ({ sourcePath, targetPath, database }) => {
  let cursor = targetPath;
  const seen = new Set([sourcePath]);
  for (let hops = 0; hops < 10; hops += 1) {
    if (seen.has(cursor)) throw operationalError('Redirect would create a loop.', 'SEO_REDIRECT_LOOP', 409);
    seen.add(cursor);
    const next = await database.seoRedirect.findUnique({ where: { sourcePath: cursor }, select: { targetPath: true, status: true } });
    if (!next || next.status !== 'ACTIVE') return;
    cursor = next.targetPath;
  }
  throw operationalError('Redirect chain exceeds the allowed depth.', 'SEO_REDIRECT_CHAIN_LIMIT', 409);
};

const createRedirect = async ({ sourcePath, targetPath, httpStatus, reason, contentEntryId, actorId, req, database = prisma }) => {
  const source = assertSafePath(sourcePath, 'sourcePath');
  const target = assertSafePath(targetPath, 'targetPath');
  if (source === target || ![301, 308, 410].includes(httpStatus) || (httpStatus === 410 && target !== '/gone')) throw operationalError('Redirect contract is invalid.', 'SEO_REDIRECT_INVALID', 400);
  if (httpStatus !== 410) await assertNoRedirectLoop({ sourcePath: source, targetPath: target, database });
  const redirect = await database.seoRedirect.create({ data: { sourcePath: source, targetPath: target, httpStatus, reason, contentEntryId, createdById: actorId } });
  await writeAuditLog({ req, action: 'SEO_REDIRECT_CREATED', resourceType: 'SEO_REDIRECT', resourceId: redirect.id, after: { sourcePath: source, targetPath: target, httpStatus } }, database);
  observeContentOperation({ operation: 'redirect', outcome: 'created' });
  return redirect;
};

const resolveRedirect = async ({ path, database = prisma }) => {
  assertPublicEnabled();
  const sourcePath = assertSafePath(path);
  const redirect = await database.seoRedirect.findUnique({ where: { sourcePath }, select: { targetPath: true, httpStatus: true, status: true } });
  if (!redirect || redirect.status !== 'ACTIVE') return null;
  return { targetPath: redirect.targetPath, httpStatus: redirect.httpStatus };
};

const buildSitemap = async ({ marketCode, locale, database = prisma, now = new Date(), persist = true }) => {
  assertPublicEnabled();
  const resolved = await resolveMarketPolicy({ marketCode, client: database, requireActive: true, now });
  if (!resolved.market.supportedLocales.includes(locale)) throw operationalError('Sitemap locale is unavailable.', 'SITEMAP_LOCALE_UNAVAILABLE', 404);
  const rows = await database.contentPublication.findMany({ where: { status: 'PUBLISHED', locale, indexable: true, publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], version: { entry: { marketId: resolved.market.id }, status: 'PUBLISHED', indexable: true } }, orderBy: [{ canonicalPath: 'asc' }, { publishedAt: 'asc' }], take: 50_001, select: { canonicalPath: true, publishedAt: true, version: { select: { updatedAt: true } } } });
  if (rows.length > 50_000) throw operationalError('Sitemap exceeds its bounded size.', 'SITEMAP_LIMIT_EXCEEDED', 409);
  const unique = [...new Map(rows.map((row) => [row.canonicalPath, row])).values()];
  const urls = unique.map((row) => ({ location: `${env.publicWebBaseUrl}${row.canonicalPath}`, lastModified: row.version.updatedAt }));
  const digest = canonicalDigest(urls);
  if (persist) await database.seoSitemapSnapshot.create({ data: { marketId: resolved.market.id, locale, status: 'GENERATED', urlCount: urls.length, digest } });
  observeContentOperation({ operation: 'sitemap', outcome: 'generated', reason: urls.length ? 'nonempty' : 'empty' });
  return { marketCode: resolved.market.code, locale, urls, digest };
};

const listRedirects = async ({ page = 1, limit = 50, status, database = prisma }) => {
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([database.seoRedirect.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }), database.seoRedirect.count({ where })]);
  return { items, pagination: { page, limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

module.exports = { assertNoRedirectLoop, buildSitemap, createRedirect, getPublishedContent, listRedirects, resolveRedirect };
