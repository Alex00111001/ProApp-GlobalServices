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
