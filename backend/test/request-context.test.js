const test = require('node:test');
const assert = require('node:assert/strict');
const { requestContext, trustedHeader } = require('../src/middleware/request-context');

test('trustedHeader accepts bounded opaque identifiers only', () => {
  assert.equal(trustedHeader('mobile:request-123'), 'mobile:request-123');
  assert.equal(trustedHeader('contains spaces'), undefined);
  assert.equal(trustedHeader('x'.repeat(129)), undefined);
});

test('requestContext preserves trusted IDs and returns response headers', () => {
  const headers = {
    'x-request-id': 'request-1',
    'x-correlation-id': 'journey-1',
    'x-trace-id': 'trace-1',
  };
  const req = { get: (name) => headers[name] };
  const responseHeaders = {};
  const res = { set: (name, value) => typeof name === 'object' ? Object.assign(responseHeaders, name) : (responseHeaders[name] = value) };
  let called = false;

  requestContext(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(req.context.requestId, 'request-1');
  assert.equal(req.context.correlationId, 'journey-1');
  assert.equal(req.context.traceId, 'trace-1');
  assert.match(req.context.spanId, /^[0-9a-f]{16}$/);
  assert.equal(responseHeaders['x-correlation-id'], 'journey-1');
});

test('requestContext propagates a valid W3C traceparent with a new server span', () => {
  const req = { get: (name) => name === 'traceparent' ? '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01' : undefined };
  const responseHeaders = {};
  const res = { set: (name, value) => typeof name === 'object' ? Object.assign(responseHeaders, name) : (responseHeaders[name] = value) };

  requestContext(req, res, () => {});

  assert.equal(req.context.traceId, '0123456789abcdef0123456789abcdef');
  assert.equal(req.context.parentSpanId, '0123456789abcdef');
  assert.match(responseHeaders.traceparent, /^00-0123456789abcdef0123456789abcdef-[0-9a-f]{16}-01$/);
});

test('requestContext generates IDs when incoming values are unsafe', () => {
  const req = { get: () => 'unsafe value' };
  const res = { set: () => {} };

  requestContext(req, res, () => {});

  assert.match(req.context.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(req.context.correlationId, req.context.requestId);
  assert.match(req.context.traceId, /^[0-9a-f]{32}$/);
});
