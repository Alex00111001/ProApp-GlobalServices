process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  SUPPORT_TRANSITIONS,
  assignSupportCase,
  transitionSupportCase,
} = require('../src/modules/admin/support-case.service');
const { supportCaseCreateSchema } = require('../src/validators/admin-operations.validators');

test('support case lifecycle exposes only deliberate forward and reopen transitions', () => {
  assert.deepEqual(SUPPORT_TRANSITIONS.OPEN, ['TRIAGED']);
  assert.deepEqual(SUPPORT_TRANSITIONS.CLOSED, ['IN_PROGRESS']);
  assert.throws(() => supportCaseCreateSchema.parse({ subject: 'Bad', description: 'short', category: 'OTHER' }));
});

test('support case transition is conditional, auditable and clears closure timestamps on reopen', async () => {
  let current = { id: 'case-1', status: 'CLOSED', resolvedAt: new Date(), closedAt: new Date() };
  const events = []; const audits = [];
  const tx = {
    supportCase: {
      findUnique: async () => current,
      updateMany: async ({ where, data }) => { if (where.status !== current.status) return { count: 0 }; current = { ...current, ...data }; return { count: 1 }; },
    },
    supportCaseEvent: { create: async ({ data }) => { events.push(data); return data; } },
    outboxEvent: { create: async ({ data }) => data },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
  };
  const client = { $transaction: async (work) => work(tx) };
  const result = await transitionSupportCase({ id: 'case-1', toStatus: 'IN_PROGRESS', actorId: 'admin-1', reason: 'Customer supplied the required evidence', context: { correlationId: 'corr-1' } }, client);
  assert.equal(result.supportCase.status, 'IN_PROGRESS');
  assert.equal(result.supportCase.resolvedAt, null);
  assert.equal(result.supportCase.closedAt, null);
  assert.equal(events[0].eventType, 'REOPENED');
  assert.equal(audits[0].correlationId, 'corr-1');
});

test('support assignment does not trust the legacy ADMIN role without active RBAC', async () => {
  const tx = {
    supportCase: { findUnique: async () => ({ id: 'case-1', assignedToId: null, status: 'OPEN' }) },
    user: { findUnique: async () => ({ id: 'legacy-admin', role: 'ADMIN', isActive: true }) },
    userRoleAssignment: { findMany: async () => [] },
  };
  const client = { $transaction: async (work) => work(tx) };
  await assert.rejects(
    () => assignSupportCase({ id: 'case-1', assignedToId: 'legacy-admin', actorId: 'admin-1', reason: 'Assign to verified support operator' }, client),
    (error) => error.code === 'INVALID_SUPPORT_ASSIGNEE'
  );
});
