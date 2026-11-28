process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const prisma = require('../src/config/prisma');
const auth = require('../src/middleware/auth');
const { publicErrorFromException } = require('../src/shared/http/error-contract');

// Isolate identity and persistence while keeping Express parsing, role guards,
// the mounted router, controller and response serializer in the request path.
const originalAuthenticate = auth.authenticate;
auth.authenticate = (req, res, next) => {
  const professional = req.path.startsWith('/professional/');
  req.user = professional
    ? { role: 'PROFESSIONAL', professionalProfile: { id: 'professional-fixture' } }
    : { role: 'CLIENT', clientProfile: { id: 'client-fixture' } };
  next();
};
const router = require('../src/routes/booking.routes');
auth.authenticate = originalAuthenticate;

let server;
let baseUrl;
let calls;
const originalFindMany = prisma.booking.findMany;
const originalCount = prisma.booking.count;

test.before(async () => {
  prisma.booking.findMany = async (args) => { calls.push(args); return []; };
  prisma.booking.count = async () => 0;
  const app = express();
  app.set('query parser', 'simple');
  app.use('/api/bookings', router);
  app.use((error, req, res, next) => {
    const result = publicErrorFromException({ thrown: error });
    res.status(result.statusCode).json(result.body);
  });
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/bookings`;
});

test.after(async () => {
  prisma.booking.findMany = originalFindMany;
  prisma.booking.count = originalCount;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

for (const [path, owner] of [
  ['/client/my-bookings', { clientId: 'client-fixture' }],
  ['/professional/my-bookings', { professionalId: 'professional-fixture' }],
]) {
  test(`${path} parses pagination and status on the mounted HTTP route`, async () => {
    for (const [query, page, limit, status] of [
      ['', 1, 10, undefined],
      ['?page=1&limit=10', 1, 10, undefined],
      ['?page=01&limit=2.0&status=CONFIRMED', 1, 2, 'CONFIRMED'],
      ['?page=100000&limit=50', 100000, 50, undefined],
    ]) {
      calls = [];
      const response = await fetch(`${baseUrl}${path}${query}`);
      assert.equal(response.status, 200, query);
      assert.deepEqual(await response.json(), {
        bookings: [], pagination: { currentPage: page, totalPages: 0, totalItems: 0 },
      });
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].where, status ? { ...owner, status } : owner);
      assert.equal(calls[0].skip, (page - 1) * limit);
      assert.equal(calls[0].take, limit);
    }
  });

  test(`${path} rejects invalid queries before reading bookings`, async () => {
    for (const query of [
      '?page=', '?limit=', '?page=1&page=2', '?limit=1&limit=2',
      '?page=0', '?page=100001', '?limit=0', '?limit=51', '?limit=1.5',
      '?status=UNKNOWN', '?page%5B%5D=2', '?role=CLIENT',
    ]) {
      calls = [];
      const response = await fetch(`${baseUrl}${path}${query}`);
      assert.equal(response.status, 400, query);
      assert.equal(calls.length, 0, query);
    }
  });
}
