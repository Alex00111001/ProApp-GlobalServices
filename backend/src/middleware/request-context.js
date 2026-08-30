const { randomUUID } = require('node:crypto');

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const trustedHeader = (value) =>
  typeof value === 'string' && SAFE_ID.test(value) ? value : undefined;

const requestContext = (req, res, next) => {
  const requestId = trustedHeader(req.get('x-request-id')) || randomUUID();
  const correlationId = trustedHeader(req.get('x-correlation-id')) || requestId;
  const traceId = trustedHeader(req.get('x-trace-id')) || randomUUID().replaceAll('-', '');

  req.context = Object.freeze({ requestId, correlationId, traceId });
  res.set({
    'x-request-id': requestId,
    'x-correlation-id': correlationId,
    'x-trace-id': traceId,
  });

  next();
};

module.exports = { requestContext, trustedHeader };
