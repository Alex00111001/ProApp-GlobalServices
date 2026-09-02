process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';
process.env.CORS_ORIGINS = 'https://trusted.example';

const assert = require('node:assert/strict');
const test = require('node:test');
const app = require('../src/app');

let server;
let baseUrl;

test.before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('unknown routes preserve the mobile error field and add traceable stable fields', async () => {
  const response = await fetch(`${baseUrl}/api/not-a-route`, {
    headers: { 'x-correlation-id': 'mobile-contract-1' },
  });
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, 'Route not found');
  assert.equal(body.code, 'ROUTE_NOT_FOUND');
  assert.equal(body.correlationId, 'mobile-contract-1');
  assert.equal(response.headers.get('x-correlation-id'), 'mobile-contract-1');
  assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.match(response.headers.get('x-trace-id'), /^[0-9a-f]{32}$/);
});

test('rejected CORS requests still return the global error and trace contract', async () => {
  const response = await fetch(`${baseUrl}/api/not-a-route`, {
    headers: {
      origin: 'https://untrusted.example',
      'x-correlation-id': 'cors-contract-1',
    },
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, 'CORS_ORIGIN_DENIED');
  assert.equal(body.correlationId, 'cors-contract-1');
  assert.equal(response.headers.get('x-correlation-id'), 'cors-contract-1');
});

test('liveness remains independent while readiness fails closed on unavailable dependencies', async () => {
  const live = await fetch(`${baseUrl}/health/live`, { headers: { 'x-correlation-id': 'health-live-1' } });
  const liveBody = await live.json();
  assert.equal(live.status, 200);
  assert.equal(liveBody.status, 'HEALTHY');
  assert.equal(liveBody.correlationId, 'health-live-1');

  const ready = await fetch(`${baseUrl}/health/ready`, { headers: { 'x-correlation-id': 'health-ready-1' } });
  const readyBody = await ready.json();
  assert.equal(ready.status, 503);
  assert.equal(readyBody.status, 'OUTAGE');
  assert.equal(readyBody.correlationId, 'health-ready-1');
  assert.doesNotMatch(JSON.stringify(readyBody), /postgres(?:ql)?:\/\/|password|localhost:5432/i);
});

test('operational telemetry endpoints remain permission protected', async () => {
  const response = await fetch(`${baseUrl}/api/admin/operations/metrics`, {
    headers: { 'x-correlation-id': 'ops-auth-1' },
  });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.correlationId, 'ops-auth-1');
});

test('versioned admin APIs require the dedicated administrative session contract', async () => {
  const response = await fetch(`${baseUrl}/api/v1/admin/users`, {
    headers: { 'x-correlation-id': 'admin-auth-1' },
  });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.code, 'ADMIN_AUTHENTICATION_REQUIRED');
  assert.equal(body.correlationId, 'admin-auth-1');
});

test('versioned operations APIs cannot fall back to the legacy administrative JWT', async () => {
  const response = await fetch(`${baseUrl}/api/v1/admin/operations/overview`, {
    headers: { 'x-correlation-id': 'operations-admin-auth-1' },
  });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.code, 'ADMIN_AUTHENTICATION_REQUIRED');
  assert.equal(body.correlationId, 'operations-admin-auth-1');
});

test('admin refresh fails safely without cookie and CSRF verifier', async () => {
  const response = await fetch(`${baseUrl}/api/v1/admin/auth/refresh`, {
    method: 'POST',
    headers: { 'x-correlation-id': 'admin-refresh-1' },
  });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.code, 'ADMIN_REFRESH_REQUIRED');
  assert.equal(body.correlationId, 'admin-refresh-1');
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
});
