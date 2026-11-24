import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';

test('professional API sends booking transitions and surfaces a rejected transition', async (t) => {
  const bookingId = '11111111-1111-4111-8111-111111111111';
  const credential = 'synthetic-professional-session';
  const requests = [];
  const replies = [
    [200, { message: 'Booking confirmed successfully', booking: { id: bookingId, status: 'CONFIRMED' }, duplicate: false }],
    [200, { message: 'Booking started successfully', booking: { id: bookingId, status: 'IN_PROGRESS' }, duplicate: false }],
    [200, { message: 'Booking completed successfully', booking: { id: bookingId, status: 'COMPLETED' }, payout: null, duplicate: false }],
    [409, {
      error: 'Booking cannot be started from current status', code: 'BOOKING_TRANSITION_CONFLICT',
      requestId: 'fixture-request', correlationId: 'fixture-correlation',
    }],
  ];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const [status, payload] = replies[requests.length] ?? [500, { error: 'Unexpected request' }];
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body: Buffer.concat(chunks).toString(),
    });
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const previousApiUrl = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => {
    if (previousApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previousApiUrl;
  });
  process.env.EXPO_PUBLIC_API_URL = `http://127.0.0.1:${server.address().port}/api`;
  t.mock.module('expo-secure-store', {
    namedExports: {
      getItemAsync: async (key) => {
        assert.equal(key, 'professional_auth_token');
        return credential;
      },
    },
  });
  const { api, getApiError } = await import('../src/services/api.ts');

  for (const [index, transition] of [api.confirmBooking, api.startBooking, api.completeBooking].entries()) {
    assert.deepEqual(await transition(bookingId), replies[index][1]);
  }
  await assert.rejects(api.startBooking(bookingId), (error) => {
    assert.equal(error.response?.status, 409);
    assert.deepEqual(error.response?.data, replies[3][1]);
    assert.equal(getApiError(error), replies[3][1].error);
    return true;
  });
  assert.deepEqual(requests, ['confirm', 'start', 'complete', 'start'].map((action) => ({
    method: 'POST',
    url: `/api/bookings/${bookingId}/${action}`,
    authorization: `Bearer ${credential}`,
    body: '',
  })));
});
