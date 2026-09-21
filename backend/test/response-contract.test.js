process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';
const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { z } = require('zod');
const { createGlobalErrorHandler } = require('../src/shared/http/global-error-handler');
const { errorContract } = require('../src/shared/http/error-contract');
const { defineResponseContract, outputObject, responseContract } = require('../src/shared/http/response-contract');

const request = async (handler) => {
  const app = express();
  app.use((req, res, next) => { req.context = { requestId: 'req-test', correlationId: 'corr-test' }; next(); });
  app.use(errorContract);
  app.get('/test', responseContract(defineResponseContract({
    operationId: 'test.response',
    responses: { 200: outputObject({ id: z.string().uuid(), name: z.string() }), 204: null },
  })), handler);
  app.use(createGlobalErrorHandler({ reportError: async () => ({}), ensureIncidentForError: async () => {} }));
  const server = app.listen(0);
  try {
    const address = server.address();
    return await fetch(`http://127.0.0.1:${address.port}/test`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test('response contract strips undeclared fields at the runtime serialization boundary', async () => {
  const response = await request((req, res) => res.json({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Safe', passwordHash: 'must-not-leave',
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Safe' });
});

test('response contract fails closed on schema or success-status drift', async () => {
  for (const handler of [
    (req, res) => res.json({ id: 'not-a-uuid', name: 'Invalid' }),
    (req, res) => res.status(201).json({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Wrong status' }),
  ]) {
    const response = await request(handler);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR', requestId: 'req-test', correlationId: 'corr-test',
    });
  }
});

test('empty 204 responses are explicitly contracted', async () => {
  const response = await request((req, res) => res.status(204).send());
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
});
