const env = require('../../config/env');
const { sanitizeTelemetry } = require('../../modules/observability/redaction');

const STATUS_CODES = Object.freeze({
  400: 'BAD_REQUEST',
  401: 'AUTHENTICATION_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
});

const codeForStatus = (statusCode) => STATUS_CODES[statusCode] || 'INTERNAL_ERROR';

const normalizeErrorBody = ({ body, statusCode, correlationId, isProduction = env.isProduction }) => {
  const source = body && typeof body === 'object' && !Array.isArray(body)
    ? body
    : { error: typeof body === 'string' ? body : undefined };
  const normalized = {
    ...sanitizeTelemetry(source),
    error: source.error || (statusCode >= 500 ? 'Internal server error' : 'Request failed'),
    code: source.code || codeForStatus(statusCode),
    correlationId,
  };

  if (isProduction && statusCode >= 500) {
    normalized.error = 'Internal server error';
    normalized.code = 'INTERNAL_ERROR';
    delete normalized.message;
    delete normalized.details;
    delete normalized.stack;
  }

  return normalized;
};

const errorContract = (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400) return originalJson(body);
    return originalJson(normalizeErrorBody({
      body,
      statusCode: res.statusCode,
      correlationId: req.context?.correlationId,
    }));
  };
  next();
};

module.exports = { STATUS_CODES, codeForStatus, errorContract, normalizeErrorBody };
