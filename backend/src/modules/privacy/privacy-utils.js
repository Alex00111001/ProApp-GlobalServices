const { createHash, createHmac } = require('node:crypto');
const { growthPseudonymSecret } = require('../../config/env');
const { telemetryMetadata } = require('../observability/context');

const PRIVATE_KEY = /password|passcode|token|authorization|secret|api[_-]?key|card|cvv|cvc|iban|bank|email|phone|(?:first|last|full)[_-]?name|address|postal|ip[_-]?address|user[_-]?agent|latitude|longitude|coordinates|anonymous[_-]?id|session[_-]?id|payment/i;
const EMAIL_LIKE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const BEARER_LIKE = /\b(?:bearer\s+|sk_|rk_|pk_|whsec_|eyJ)[A-Za-z0-9._-]{12,}/i;
const PAYMENT_LIKE = /\b(?:\d[ -]*?){13,19}\b/;
const PHONE_LIKE = /(?:^|\s)\+?\d[\d ().-]{7,}\d(?:$|\s)/;
const OPAQUE_SECRET_LIKE = /(?:^|[/\s])(?=[A-Za-z0-9_-]{32,}(?:[/\s]|$))(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+/;
const SAFE_IDENTIFIER = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const operationalError = (message, code, statusCode = 400, metadata) => Object.assign(new Error(message), {
  code,
  statusCode,
  metadata,
});

const digest = (value) => createHash('sha256').update(String(value)).digest('hex');
const pseudonymize = (type, value, secret = growthPseudonymSecret) =>
  createHmac('sha256', secret).update(`${type}:${value}`).digest('hex');

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};

const canonicalDigest = (value) => digest(JSON.stringify(canonicalize(value)));

const assertSafeText = (value, field) => {
  if (typeof value !== 'string') return;
  if (EMAIL_LIKE.test(value) || BEARER_LIKE.test(value) || PAYMENT_LIKE.test(value) || PHONE_LIKE.test(value) || OPAQUE_SECRET_LIKE.test(value)) {
    throw operationalError(`${field} contains prohibited private data.`, 'PRIVACY_BOUNDARY_VIOLATION', 400, { field });
  }
};

const sanitizePrivateObject = (value, { maxDepth = 4, maxKeys = 50, maxString = 500 } = {}, depth = 0, path = 'evidence') => {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    assertSafeText(value, path);
    return value.slice(0, maxString);
  }
  if (depth >= maxDepth) throw operationalError(`${path} is too deeply nested.`, 'PRIVACY_CONTEXT_TOO_DEEP', 400);
  if (Array.isArray(value)) return value.slice(0, maxKeys).map((item, index) => sanitizePrivateObject(item, { maxDepth, maxKeys, maxString }, depth + 1, `${path}[${index}]`));
  if (typeof value !== 'object') return undefined;
  const entries = Object.entries(value);
  if (entries.length > maxKeys) throw operationalError(`${path} contains too many fields.`, 'PRIVACY_CONTEXT_TOO_LARGE', 400);
  return Object.fromEntries(entries.map(([key, item]) => {
    if (PRIVATE_KEY.test(key)) throw operationalError(`${path}.${key} is prohibited.`, 'PRIVACY_BOUNDARY_VIOLATION', 400, { field: key });
    return [key, sanitizePrivateObject(item, { maxDepth, maxKeys, maxString }, depth + 1, `${path}.${key}`)];
  }));
};

const normalizeOperationalIdentifier = (value, field, maximum = 64) => {
  const normalized = String(value || '').trim().toLowerCase();
  assertSafeText(normalized, field);
  if (!normalized || normalized.length > maximum || !SAFE_IDENTIFIER.test(normalized)) {
    throw operationalError(`${field} must be a bounded identifier.`, 'INVALID_OPERATIONAL_IDENTIFIER', 400, { field });
  }
  return normalized;
};

const requestEvidence = (context = {}) => {
  const metadata = telemetryMetadata(context);
  return { requestId: metadata.requestId, correlationId: metadata.correlationId, traceId: metadata.traceId };
};
const asynchronousEvidence = (context = {}) => telemetryMetadata(context);

module.exports = {
  PRIVATE_KEY,
  assertSafeText,
  asynchronousEvidence,
  canonicalDigest,
  digest,
  normalizeOperationalIdentifier,
  operationalError,
  pseudonymize,
  requestEvidence,
  sanitizePrivateObject,
};
