const { sanitizeTelemetry, redactText } = require('../../modules/observability/redaction');

const STATUS_CODES = Object.freeze({
  400: 'BAD_REQUEST', 401: 'AUTHENTICATION_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
  409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY', 429: 'RATE_LIMITED', 502: 'SERVICE_UNAVAILABLE',
  503: 'SERVICE_UNAVAILABLE', 504: 'SERVICE_UNAVAILABLE',
});

const PUBLIC_MESSAGES = Object.freeze({
  INTERNAL_ERROR: 'An unexpected error occurred.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
  REQUEST_FAILED: 'Request failed.',
});

const PRISMA_ERROR_CLASSIFICATION = Object.freeze({
  P2002: { statusCode: 409, code: 'RESOURCE_CONFLICT' },
  P2003: { statusCode: 409, code: 'RESOURCE_CONFLICT' },
  P2025: { statusCode: 404, code: 'NOT_FOUND' },
  P2034: { statusCode: 409, code: 'TRANSACTION_CONFLICT' },
  P1001: { statusCode: 503, code: 'SERVICE_UNAVAILABLE' },
  P1002: { statusCode: 503, code: 'SERVICE_UNAVAILABLE' },
  P1008: { statusCode: 503, code: 'SERVICE_UNAVAILABLE' },
  P1017: { statusCode: 503, code: 'SERVICE_UNAVAILABLE' },
  P2024: { statusCode: 503, code: 'SERVICE_UNAVAILABLE' },
});

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH',
  'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
]);
const TRANSIENT_ERROR_NAMES = new Set([
  'AbortError', 'PrismaClientInitializationError', 'PrismaClientRustPanicError',
  'StripeConnectionError', 'StripeAPIError',
]);
const INTERNAL_DETAIL_PATTERN = /(?:\bprisma(?:client)?\b|\bsql\b|\bselect\s+.+\s+from\b|\binsert\s+into\b|\bupdate\s+.+\s+set\b|\bdelete\s+from\b|database_url|node_modules|(?:^|\s)[a-z]:\\|\/(?:home|internal|private|proc|srv|usr|var)\/)/i;
const STABLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,79}$/;

const codeForStatus = (statusCode) => STATUS_CODES[statusCode] || 'INTERNAL_ERROR';
const statusFrom = (value) => {
  const candidate = Number(value);
  return Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : null;
};
const stableCode = (value) => typeof value === 'string' && STABLE_CODE_PATTERN.test(value) && !/^P\d{4}$/.test(value)
  ? value
  : null;
const throwableToError = (value) => {
  if (value instanceof Error) return value;
  const error = new Error('A non-Error value was thrown.');
  error.name = 'NonErrorThrown';
  error.thrownType = value === null ? 'null' : typeof value;
  return error;
};

const classifyException = (thrown) => {
  const error = throwableToError(thrown);
  if (error.name === 'ZodError' || error.name === 'ValidationError') {
    return { error, statusCode: 400, code: stableCode(error.code) || 'VALIDATION_ERROR' };
  }
  const prisma = PRISMA_ERROR_CLASSIFICATION[error.code];
  if (prisma) return { error, ...prisma };
  const explicitStatus = statusFrom(error.statusCode ?? error.status);
  if (explicitStatus) {
    if (explicitStatus >= 500) {
      const unavailable = explicitStatus >= 502 && explicitStatus <= 504;
      return { error, statusCode: unavailable ? 503 : 500, code: unavailable ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR' };
    }
    return { error, statusCode: explicitStatus, code: stableCode(error.code) || codeForStatus(explicitStatus) };
  }
  if (TRANSIENT_ERROR_CODES.has(error.code) || TRANSIENT_ERROR_NAMES.has(error.name)) {
    return { error, statusCode: 503, code: 'SERVICE_UNAVAILABLE' };
  }
  return { error, statusCode: 500, code: 'INTERNAL_ERROR' };
};

const genericMessage = (statusCode) => statusCode >= 502 && statusCode <= 504
  ? PUBLIC_MESSAGES.SERVICE_UNAVAILABLE
  : statusCode >= 500 ? PUBLIC_MESSAGES.INTERNAL_ERROR : PUBLIC_MESSAGES.REQUEST_FAILED;
const sanitizePublicMessage = (value, statusCode) => {
  if (statusCode >= 500) return genericMessage(statusCode);
  const message = redactText(value).trim();
  return !message || INTERNAL_DETAIL_PATTERN.test(message) ? genericMessage(statusCode) : message;
};

const scrubInternalPublicDetails = (value) => {
  if (typeof value === 'string') {
    return INTERNAL_DETAIL_PATTERN.test(value) ? '[REDACTED]' : value;
  }
  if (Array.isArray(value)) return value.map(scrubInternalPublicDetails);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubInternalPublicDetails(item)]));
  }
  return value;
};

const normalizeErrorBody = ({ body, statusCode, requestId, correlationId }) => {
  const source = body && typeof body === 'object' && !Array.isArray(body)
    ? body
    : { error: typeof body === 'string' ? body : undefined };
  if (statusCode >= 500) {
    const unavailable = statusCode >= 502 && statusCode <= 504;
    return {
      ...(source.success === false ? { success: false } : {}),
      error: genericMessage(statusCode),
      code: unavailable ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR',
      ...(requestId ? { requestId } : {}),
      ...(correlationId ? { correlationId } : {}),
    };
  }
  const safeSource = scrubInternalPublicDetails(sanitizeTelemetry(source));
  return {
    ...safeSource,
    ...(Object.hasOwn(source, 'message') ? { message: sanitizePublicMessage(source.message, statusCode) } : {}),
    error: sanitizePublicMessage(source.error || source.message, statusCode),
    code: stableCode(source.code) || codeForStatus(statusCode),
    ...(requestId ? { requestId } : {}),
    ...(correlationId ? { correlationId } : {}),
  };
};

const publicErrorFromException = ({ thrown, requestId, correlationId }) => {
  const classification = classifyException(thrown);
  return {
    statusCode: classification.statusCode,
    body: normalizeErrorBody({ body: { error: classification.error.message, code: classification.code }, statusCode: classification.statusCode, requestId, correlationId }),
    error: classification.error,
  };
};

const errorContract = (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400) return originalJson(body);
    if (res.locals?.publicOperationalResponse === true) return originalJson(sanitizeTelemetry(body));
    return originalJson(normalizeErrorBody({
      body,
      statusCode: res.statusCode,
      requestId: req.context?.requestId,
      correlationId: req.context?.correlationId,
    }));
  };
  next();
};

module.exports = {
  INTERNAL_DETAIL_PATTERN, PRISMA_ERROR_CLASSIFICATION, PUBLIC_MESSAGES, STATUS_CODES,
  classifyException, codeForStatus, errorContract, normalizeErrorBody, publicErrorFromException,
  sanitizePublicMessage, scrubInternalPublicDetails, stableCode, throwableToError,
};
