const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const { requestContext } = require('../src/middleware/request-context');
const {
  classifyException,
  errorContract,
  normalizeErrorBody,
  publicErrorFromException,
} = require('../src/shared/http/error-contract');
const { createGlobalErrorHandler } = require('../src/shared/http/global-error-handler');
const { createAuthenticateAdmin } = require('../src/middleware/authenticate-admin');

const FORBIDDEN_PUBLIC_PATTERNS = [
  /stack/i, /select\s+\*/i, /prisma/i, /database_url/i, /postgres:\/\//i,
  /secret-token/i, /password/i, /node_modules/i, /\/internal\/path/i,
];

const assertSafeBody = (body) => {
  const serialized = JSON.stringify(body);
  for (const pattern of FORBIDDEN_PUBLIC_PATTERNS) assert.doesNotMatch(serialized, pattern);
};

const requestJson = async (app, path, headers = {}) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    return { status: response.status, headers: response.headers, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

test('unexpected failures have one environment-independent public contract', () => {
  const hostile = new Error('DATABASE_URL=postgres://user:secret@db SELECT * FROM users /internal/path');
  hostile.stack = `Error: secret-token\n at C:\\repo\\node_modules\\service.js:1:1`;
  hostile.cause = new Error('PrismaClientKnownRequestError password=hidden');
  const result = publicErrorFromException({ thrown: hostile, requestId: 'req-1', correlationId: 'corr-1' });
  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.body, {
    error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR', requestId: 'req-1', correlationId: 'corr-1',
  });
  assertSafeBody(result.body);
});

test('null, undefined, strings and objects thrown never escape into a response', () => {
  for (const thrown of [null, undefined, 'Bearer secret-token-value-123456789', { password: 'hidden' }]) {
    const result = publicErrorFromException({ thrown, requestId: 'req', correlationId: 'corr' });
    assert.equal(result.statusCode, 500);
    assert.equal(result.body.code, 'INTERNAL_ERROR');
    assertSafeBody(result.body);
  }
});

test('Prisma failures map only closed known cases and hide all database details', () => {
  const cases = [
    ['P2002', 409, 'RESOURCE_CONFLICT'], ['P2003', 409, 'RESOURCE_CONFLICT'],
    ['P2025', 404, 'NOT_FOUND'], ['P2034', 409, 'TRANSACTION_CONFLICT'],
    ['P1001', 503, 'SERVICE_UNAVAILABLE'], ['P2024', 503, 'SERVICE_UNAVAILABLE'],
    ['P9999', 500, 'INTERNAL_ERROR'],
  ];
  for (const [code, statusCode, publicCode] of cases) {
    const error = Object.assign(new Error('PrismaClientKnownRequestError SELECT * FROM users'), { code, meta: { target: 'User_email_key' } });
    const result = publicErrorFromException({ thrown: error });
    assert.equal(result.statusCode, statusCode);
    assert.equal(result.body.code, publicCode);
    assertSafeBody(result.body);
  }
});

test('provider outages become stable service unavailable responses', () => {
  for (const error of [
    Object.assign(new Error('provider raw JSON'), { name: 'AbortError' }),
    Object.assign(new Error('connect ECONNRESET api.provider.internal'), { code: 'ECONNRESET' }),
    Object.assign(new Error('Stripe SDK internals'), { name: 'StripeConnectionError' }),
    Object.assign(new Error('email provider rejected request'), { statusCode: 502, code: 'EMAIL_PROVIDER_REJECTED' }),
  ]) {
    const result = publicErrorFromException({ thrown: error });
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.code, 'SERVICE_UNAVAILABLE');
    assert.equal(result.body.error, 'The service is temporarily unavailable.');
    assertSafeBody(result.body);
  }
});

test('validation, authentication, forbidden, conflict and rate limit semantics remain distinct', () => {
  const cases = [[400, 'VALIDATION_ERROR'], [401, 'AUTH_INVALID'], [403, 'FORBIDDEN'], [409, 'CONFLICT'], [429, 'RATE_LIMITED']];
  for (const [statusCode, code] of cases) {
    const error = Object.assign(new Error('Safe domain message.'), { statusCode, code });
    const classified = classifyException(error);
    assert.equal(classified.statusCode, statusCode);
    const result = publicErrorFromException({ thrown: error });
    assert.equal(result.body.code, code);
    assert.equal(result.body.error, 'Safe domain message.');
  }
});

test('internal-looking details are removed even from nominal 4xx messages', () => {
  const body = normalizeErrorBody({
    body: {
      error: 'Prisma SELECT * FROM users /internal/path',
      message: 'C:\\repo\\node_modules\\private.js exposed SQL',
      details: { provider: 'PrismaClient', fields: ['safe-field', '/internal/path'] },
      code: 'BAD_REQUEST',
    },
    statusCode: 400,
  });
  assert.equal(body.error, 'Request failed.');
  assert.equal(body.message, 'Request failed.');
  assert.equal(body.details.provider, '[REDACTED]');
  assert.equal(body.details.fields[0], 'safe-field');
  assert.equal(body.details.fields[1], '[REDACTED]');
  assertSafeBody(body);
});

test('safe error authority removes undeclared fields from every public failure', () => {
  const body = normalizeErrorBody({
    body: { error: 'Invalid input', code: 'VALIDATION_ERROR', providerRequest: 'private', stack: 'private', details: { field: 'email' } },
    statusCode: 400, requestId: 'req-safe', correlationId: 'corr-safe',
  });
  assert.deepEqual(body, {
    error: 'Invalid input', code: 'VALIDATION_ERROR', details: { field: 'email' }, requestId: 'req-safe', correlationId: 'corr-safe',
  });
});

test('real Express response middleware sanitizes direct 5xx bodies', async () => {
  const app = express();
  app.use(requestContext);
  app.use(errorContract);
  app.get('/direct', (req, res) => res.status(500).json({ error: 'Bearer secret-token-value-123456789', stack: '/internal/path', details: 'SELECT * FROM users' }));
  const response = await requestJson(app, '/direct', { 'x-request-id': 'request-direct', 'x-correlation-id': 'corr-direct' });
  assert.equal(response.status, 500);
  assert.equal(response.body.code, 'INTERNAL_ERROR');
  assert.equal(response.body.requestId, 'request-direct');
  assert.equal(response.body.correlationId, 'corr-direct');
  assertSafeBody(response.body);
});

test('only explicitly marked operational health payloads may retain safe 503 detail', async () => {
  const app = express();
  app.use(requestContext);
  app.use(errorContract);
  app.get('/ready', (req, res) => {
    res.locals.publicOperationalResponse = true;
    res.status(503).json({ status: 'OUTAGE', service: 'homeservices-core-api', dependencies: { database: { status: 'OUTAGE', message: 'Dependency unavailable' } } });
  });
  const response = await requestJson(app, '/ready');
  assert.equal(response.status, 503);
  assert.equal(response.body.status, 'OUTAGE');
  assert.equal(response.body.dependencies.database.message, 'Dependency unavailable');
  assertSafeBody(response.body);
});

test('real global handler sanitizes thrown service, database, provider and auth-boundary failures', async () => {
  const reported = [];
  const handler = createGlobalErrorHandler({
    reportError: async (error, req) => { reported.push({ error, requestId: req.context.requestId }); return { event: { id: 'event' } }; },
    ensureIncidentForError: async () => {},
  });
  const app = express();
  app.use(requestContext);
  app.use(errorContract);
  app.get('/service', () => { throw new Error('SELECT * FROM users password=secret'); });
  app.get('/database', () => { throw Object.assign(new Error('Prisma connection failed'), { code: 'P1001' }); });
  app.get('/provider', () => { throw Object.assign(new Error('provider raw payload'), { code: 'ETIMEDOUT' }); });
  app.get('/auth', () => { throw Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'AUTHENTICATION_REQUIRED' }); });
  app.use(handler);
  for (const [path, status, code] of [['/service', 500, 'INTERNAL_ERROR'], ['/database', 503, 'SERVICE_UNAVAILABLE'], ['/provider', 503, 'SERVICE_UNAVAILABLE'], ['/auth', 401, 'AUTHENTICATION_REQUIRED']]) {
    const response = await requestJson(app, path, { 'x-request-id': `request-${path.slice(1)}`, 'x-correlation-id': 'corr' });
    assert.equal(response.status, status);
    assert.equal(response.body.code, code);
    assertSafeBody(response.body);
  }
  assert.equal(reported.length, 3);
});

test('administrative authentication forwards database outages without enumerating accounts', async () => {
  const databaseError = Object.assign(new Error('Prisma DATABASE_URL=postgres://secret SELECT * FROM User'), { code: 'P1001' });
  const middleware = createAuthenticateAdmin(async () => { throw databaseError; });
  const req = { headers: { authorization: 'Bearer opaque-token' }, context: { correlationId: 'corr-auth' }, log: { error() {} } };
  const res = { status() { throw new Error('Database outage must not be rendered as an auth response.'); } };
  const forwarded = await new Promise((resolve) => middleware(req, res, resolve));
  assert.equal(forwarded, databaseError);
});
