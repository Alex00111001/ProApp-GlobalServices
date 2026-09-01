const { randomUUID } = require('node:crypto');
const { context, trace } = require('@opentelemetry/api');

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i;
const NON_ZERO = /[1-9a-f]/i;

const trustedHeader = (value) =>
  typeof value === 'string' && SAFE_ID.test(value) ? value : undefined;

const parseTraceparent = (value) => {
  if (typeof value !== 'string') return undefined;
  const match = TRACEPARENT.exec(value.trim());
  if (!match || !NON_ZERO.test(match[1]) || !NON_ZERO.test(match[2])) return undefined;
  return { traceId: match[1].toLowerCase(), parentSpanId: match[2].toLowerCase(), traceFlags: match[3].toLowerCase() };
};

const requestContext = (req, res, next) => {
  const requestId = trustedHeader(req.get('x-request-id')) || randomUUID();
  const correlationId = trustedHeader(req.get('x-correlation-id')) || requestId;
  const upstreamTrace = parseTraceparent(req.get('traceparent'));
  const activeSpan = trace.getSpan(context.active());
  const activeSpanContext = activeSpan?.spanContext();
  const traceId = activeSpanContext?.traceId || upstreamTrace?.traceId
    || trustedHeader(req.get('x-trace-id')) || randomUUID().replaceAll('-', '');
  const spanId = activeSpanContext?.spanId || randomUUID().replaceAll('-', '').slice(0, 16);

  req.context = Object.freeze({
    requestId,
    correlationId,
    traceId,
    spanId,
    parentSpanId: upstreamTrace?.parentSpanId,
  });
  res.set({
    'x-request-id': requestId,
    'x-correlation-id': correlationId,
    'x-trace-id': traceId,
  });
  if (/^[\da-f]{32}$/i.test(traceId)) {
    res.set('traceparent', `00-${traceId.toLowerCase()}-${spanId}-${upstreamTrace?.traceFlags || '01'}`);
  }

  activeSpan?.setAttributes({
    'homeservices.request_id': requestId,
    'homeservices.correlation_id': correlationId,
  });

  next();
};

module.exports = { parseTraceparent, requestContext, trustedHeader };
