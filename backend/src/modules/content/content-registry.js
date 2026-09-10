const { z } = require('zod');
const { canonicalDigest, operationalError, sanitizePrivateObject } = require('../privacy/privacy-utils');

const BLOCK_TYPES = new Set(['heading', 'paragraph', 'list', 'faq', 'callout', 'service_summary', 'location_summary']);
const SCRIPT_LIKE = /<\/?(?:script|iframe|object|embed|style|svg)|javascript:|data:text\/html|on[a-z]+\s*=/i;
const SAFE_PATH = /^\/[a-z0-9][a-z0-9/_-]{0,239}$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ROBOTS = new Set(['index,follow', 'noindex,follow', 'noindex,nofollow']);

const safeText = (value, name, maximum) => {
  const text = String(value || '').trim();
  if (!text || text.length > maximum || SCRIPT_LIKE.test(text) || /[<>]/.test(text)) throw operationalError(`${name} is unsafe or outside its allowed length.`, 'CONTENT_TEXT_INVALID', 400, { field: name });
  return text;
};

const sanitizeBlocks = (body) => {
  const blocks = z.array(z.object({
    type: z.string(),
    text: z.string().max(5000).optional(),
    level: z.number().int().min(2).max(4).optional(),
    items: z.array(z.string().max(500)).max(50).optional(),
    question: z.string().max(500).optional(),
    answer: z.string().max(3000).optional(),
  }).strict()).min(1).max(100).parse(body);
  return blocks.map((block, index) => {
    if (!BLOCK_TYPES.has(block.type)) throw operationalError('Content block type is not allowlisted.', 'CONTENT_BLOCK_INVALID', 400, { index });
    const cleaned = { type: block.type };
    for (const [field, value] of Object.entries(block)) {
      if (field === 'type' || value === undefined) continue;
      cleaned[field] = Array.isArray(value) ? value.map((item) => safeText(item, `body.${index}.${field}`, 500)) : typeof value === 'string' ? safeText(value, `body.${index}.${field}`, field === 'text' ? 5000 : 3000) : value;
    }
    if (block.type === 'faq' && (!cleaned.question || !cleaned.answer)) throw operationalError('FAQ blocks require question and answer.', 'CONTENT_BLOCK_INVALID', 400);
    if (block.type === 'list' && !cleaned.items?.length) throw operationalError('List blocks require items.', 'CONTENT_BLOCK_INVALID', 400);
    if (!['faq', 'list'].includes(block.type) && !cleaned.text) throw operationalError('Content block requires text.', 'CONTENT_BLOCK_INVALID', 400);
    return cleaned;
  });
};

const canonicalPathFor = ({ marketCode, locale, type, slug }) => `/${marketCode.toLowerCase()}/${locale.toLowerCase()}/${type.toLowerCase().replaceAll('_', '-')}/${slug}`;
const validateContentVersion = (input) => {
  if (!SAFE_SLUG.test(input.slug)) throw operationalError('Slug is invalid.', 'CONTENT_SLUG_INVALID', 400);
  const body = sanitizeBlocks(input.body);
  const title = safeText(input.title, 'title', 160);
  const summary = safeText(input.summary, 'summary', 500);
  const seoTitle = safeText(input.seoTitle, 'seoTitle', 65);
  const metaDescription = safeText(input.metaDescription, 'metaDescription', 170);
  if (!ROBOTS.has(input.robotsDirective)) throw operationalError('Robots directive is invalid.', 'SEO_ROBOTS_INVALID', 400);
  const openGraph = input.openGraph ? sanitizePrivateObject(input.openGraph, { maxDepth: 2, maxKeys: 12, maxString: 500 }) : undefined;
  const provenance = input.provenance ? sanitizePrivateObject(input.provenance, { maxDepth: 2, maxKeys: 12, maxString: 300 }) : undefined;
  const qualityEvidence = sanitizePrivateObject(input.qualityEvidence, { maxDepth: 3, maxKeys: 20, maxString: 500 });
  const structuredData = input.structuredData ? sanitizePrivateObject(input.structuredData, { maxDepth: 4, maxKeys: 30, maxString: 500 }) : undefined;
  if (structuredData) {
    const allowedTypes = new Set(['WebPage', 'FAQPage', 'BreadcrumbList', 'Service']);
    if (structuredData['@context'] !== 'https://schema.org' || !allowedTypes.has(structuredData['@type'])) throw operationalError('Structured data type is not allowlisted.', 'SEO_STRUCTURED_DATA_INVALID', 400);
    const encoded = JSON.stringify(structuredData);
    if (/"(?:aggregateRating|review|offers|price|priceCurrency|availability)"\s*:/i.test(encoded)) throw operationalError('Structured data contains unsupported claims.', 'SEO_STRUCTURED_DATA_UNSUPPORTED_CLAIM', 400);
  }
  const canonicalPath = canonicalPathFor(input);
  return { body, title, summary, seoTitle, metaDescription, openGraph, provenance, qualityEvidence, structuredData, canonicalPath, contentDigest: canonicalDigest({ body, title, summary, seoTitle, metaDescription, openGraph, structuredData }) };
};

const assertSafePath = (path, field = 'path') => {
  const value = String(path || '').trim().toLowerCase();
  if (!SAFE_PATH.test(value) || value.includes('//') || value.includes('..') || value.includes('%2f') || value.includes('%5c') || value.includes('\\')) throw operationalError(`${field} is unsafe.`, 'SEO_PATH_INVALID', 400);
  return value;
};

module.exports = { BLOCK_TYPES, ROBOTS, assertSafePath, canonicalPathFor, sanitizeBlocks, validateContentVersion };
