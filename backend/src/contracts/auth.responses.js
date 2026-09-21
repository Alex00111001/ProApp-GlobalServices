const { z } = require('zod');
const { defineResponseContract, outputObject, serialized } = require('../shared/http/response-contract');
const { customerSession, messageResponse } = require('./shared.responses');

const contract = (method, path, operationId, responses) => defineResponseContract({ method, path, operationId, responses });
const refreshResponse = outputObject({
  token: z.string().min(1), accessToken: z.string().min(1), refreshToken: z.string().min(32), session: customerSession,
});

const authResponses = Object.freeze({
  refresh: contract('POST', '/api/auth/refresh', 'customerSession.refresh', { 200: serialized(refreshResponse) }),
  requestPasswordRecovery: contract('POST', '/api/auth/password-recovery/request', 'customerPassword.requestRecovery', { 202: messageResponse }),
  confirmPasswordRecovery: contract('POST', '/api/auth/password-recovery/confirm', 'customerPassword.confirmRecovery', { 200: messageResponse }),
  requestEmailVerification: contract('POST', '/api/auth/email-verification/request', 'customerEmail.requestVerification', {
    202: outputObject({ accepted: z.boolean(), alreadyVerified: z.boolean() }),
  }),
  confirmEmailVerification: contract('POST', '/api/auth/email-verification/confirm', 'customerEmail.confirmVerification', {
    200: outputObject({ verified: z.literal(true) }),
  }),
  logout: contract('POST', '/api/auth/logout', 'customerSession.logout', { 204: null }),
  listSessions: contract('GET', '/api/auth/sessions', 'customerSession.list', {
    200: serialized(outputObject({ sessions: z.array(customerSession).max(100) })),
  }),
  revokeSession: contract('POST', '/api/auth/sessions/{sessionId}/revoke', 'customerSession.revoke', { 204: null }),
  changePassword: contract('POST', '/api/auth/change-password', 'customerPassword.change', { 200: messageResponse }),
});

module.exports = { authResponses };
