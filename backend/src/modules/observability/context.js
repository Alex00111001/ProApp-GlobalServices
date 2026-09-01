const { context, propagation, trace } = require('@opentelemetry/api');
const { sanitizeTelemetry } = require('./redaction');

const TRACE_ID = /^[\da-f]{32}$/i;
const SPAN_ID = /^[\da-f]{16}$/i;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TRACEPARENT = /^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/i;

const resolveRequestContext = (source = {}) => source.context || source.requestContext || source;

const telemetryMetadata = (source = {}, metadata = {}) => {
  const requestContext = resolveRequestContext(source);
  const carrier = {};
  propagation.inject(context.active(), carrier);
  if (!carrier.traceparent && TRACE_ID.test(requestContext.traceId || '') && SPAN_ID.test(requestContext.spanId || '')) {
    carrier.traceparent = `00-${requestContext.traceId.toLowerCase()}-${requestContext.spanId.toLowerCase()}-01`;
  }
  const sanitized = sanitizeTelemetry({
    ...metadata,
  });
  for (const key of ['requestId', 'correlationId', 'traceId', 'traceparent', 'tracestate']) delete sanitized[key];
  if (SAFE_ID.test(requestContext.requestId || '')) sanitized.requestId = requestContext.requestId;
  if (SAFE_ID.test(requestContext.correlationId || '')) sanitized.correlationId = requestContext.correlationId;
  if (SAFE_ID.test(requestContext.traceId || '')) sanitized.traceId = requestContext.traceId;
  if (TRACEPARENT.test(carrier.traceparent || '')) sanitized.traceparent = carrier.traceparent.toLowerCase();
  return sanitized;
};

const runWithTelemetryMetadata = (metadata = {}, spanName, operation) => {
  const carrier = {
    traceparent: metadata.traceparent,
    tracestate: metadata.tracestate,
  };
  const parent = propagation.extract(context.active(), carrier);
  const tracer = trace.getTracer('homeservices-core-api');
  return tracer.startActiveSpan(spanName, {}, parent, async (span) => {
    try {
      span.setAttributes({
        'homeservices.request_id': metadata.requestId || '',
        'homeservices.correlation_id': metadata.correlationId || '',
      });
      return await operation({
        requestId: metadata.requestId,
        correlationId: metadata.correlationId,
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
      });
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
};

module.exports = { resolveRequestContext, runWithTelemetryMetadata, telemetryMetadata };
