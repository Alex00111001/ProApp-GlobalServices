const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');

const identity = {
  user: outputObject({
    id: z.string(), email: z.string(), firstName: z.string(), lastName: z.string(),
    avatarUrl: z.string().nullable(), role: z.string(), isActive: z.boolean(), countryCode: z.string(),
  }),
  roles: z.array(outputObject({ id: z.string(), key: z.string(), name: z.string() })),
  permissions: z.array(z.string()),
};
const session = outputObject({ id: z.string(), expiresAt: z.string() });
const sessionPayload = outputObject({
  accessToken: z.string(), csrfToken: z.string(), accessTokenExpiresInSeconds: z.number().int().positive(),
  session, ...identity,
});
const contract = (method, path, operationId, status, schema) => defineResponseContract({
  method, path, operationId, responses: { [status]: serialized(schema) },
});

const adminSessionResponses = Object.freeze({
  login: contract('POST', '/api/v1/admin/auth/login', 'adminSession.login', 201, sessionPayload),
  refresh: contract('POST', '/api/v1/admin/auth/refresh', 'adminSession.refresh', 200, sessionPayload),
  me: contract('GET', '/api/v1/admin/auth/me', 'adminSession.me', 200, outputObject({ ...identity, session })),
  list: contract('GET', '/api/v1/admin/auth/sessions', 'adminSession.list', 200, outputObject({
    sessions: z.array(outputObject({
      id: z.string(), status: z.enum(['ACTIVE', 'REVOKED', 'EXPIRED']), expiresAt: z.string(),
      lastSeenAt: z.string(), revokedAt: z.string().nullable(), revocationReason: z.string().nullable(),
      createdAt: z.string(), current: z.boolean(),
    })),
  })),
});

module.exports = { adminSessionResponses };
