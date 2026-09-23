const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { dateTime } = require('./shared.responses');

const contentBlock = outputObject({
  type: z.enum(['heading', 'paragraph', 'list', 'faq', 'callout', 'service_summary', 'location_summary']),
  text: z.string().optional(),
  level: z.number().int().optional(),
  items: z.array(z.string()).optional(),
  question: z.string().optional(),
  answer: z.string().optional(),
});
const publicPage = outputObject({
  key: z.string(),
  type: z.string(),
  marketCode: z.string(),
  locale: z.string(),
  title: z.string(),
  summary: z.string(),
  body: z.array(contentBlock),
  seo: outputObject({
    title: z.string(),
    description: z.string(),
    canonical: z.string().url(),
    robots: z.enum(['index,follow', 'noindex,follow', 'noindex,nofollow']),
    alternates: z.record(z.string(), z.string().url()).optional(),
    openGraph: z.json().nullable(),
    structuredData: z.json().nullable(),
  }),
  publishedAt: dateTime,
  etag: z.string(),
});
const sitemap = outputObject({
  marketCode: z.string(),
  locale: z.string(),
  urls: z.array(outputObject({ location: z.string().url(), lastModified: dateTime })),
  digest: z.string(),
});
const redirect = outputObject({ targetPath: z.string(), httpStatus: z.enum([301, 308, 410]) });

const json = (value) => JSON.parse(JSON.stringify(value));
const pickPage = (value) => json({
  key: value.key, type: value.type, marketCode: value.marketCode, locale: value.locale,
  title: value.title, summary: value.summary, body: value.body,
  seo: {
    title: value.seo?.title, description: value.seo?.description, canonical: value.seo?.canonical,
    robots: value.seo?.robots, ...(value.seo?.alternates ? { alternates: value.seo.alternates } : {}),
    openGraph: value.seo?.openGraph ?? null, structuredData: value.seo?.structuredData ?? null,
  },
  publishedAt: value.publishedAt, etag: value.etag,
});
const pickSitemap = (value) => json({
  marketCode: value.marketCode, locale: value.locale,
  urls: (value.urls || []).map((item) => ({ location: item.location, lastModified: item.lastModified })),
  digest: value.digest,
});
const pickRedirect = (value) => ({ targetPath: value.targetPath, httpStatus: value.httpStatus });

const publicContentResponses = Object.freeze({
  content: defineResponseContract({
    method: 'GET', path: '/api/v1/public/content/{marketCode}/{locale}/{type}/{slug}', operationId: 'publicContent.get',
    responses: { 200: serialized(publicPage, pickPage) },
  }),
  sitemap: defineResponseContract({
    method: 'GET', path: '/api/v1/public/sitemap/{marketCode}/{locale}', operationId: 'publicContent.sitemap',
    responses: { 200: serialized(sitemap, pickSitemap) },
  }),
  redirect: defineResponseContract({
    method: 'GET', path: '/api/v1/public/redirect', operationId: 'publicContent.redirect',
    responses: { 200: serialized(redirect, pickRedirect) },
  }),
});

module.exports = { publicContentResponses, publicContentSchemas: { publicPage, sitemap, redirect } };
