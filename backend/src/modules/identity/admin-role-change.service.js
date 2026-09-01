const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { Prisma } = require('@prisma/client');
const { writeAuditLog } = require('../audit/audit.service');

const httpError = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const maskEmail = (email) => {
  const [local, domain] = String(email || '').split('@');
  return domain ? `${local.slice(0, 2)}***@${domain}` : '—';
};
const roleChangeInclude = {
  role: { select: { id: true, key: true, name: true } },
  targetUser: { select: { id: true, firstName: true, lastName: true, email: true } },
  requestedBy: { select: { id: true, firstName: true, lastName: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
};

const loadRoleChange = (id, client) => client.adminRoleChangeRequest.findUnique({
  where: { id },
  include: roleChangeInclude,
}).then((change) => change && ({
  ...change,
  targetUser: { ...change.targetUser, email: undefined, emailMasked: maskEmail(change.targetUser.email) },
}));

const ensureEnabled = (enabled) => {
  if (!enabled) throw httpError(409, 'ADMIN_ROLE_CHANGES_DISABLED', 'Administrative role changes are disabled.');
};

const requestRoleChange = async ({ targetUserId, roleId, action, reason, idempotencyKey, req }, client = prisma, options = {}) => {
  ensureEnabled(options.enabled ?? env.adminRoleChangesEnabled);
  const existing = await client.adminRoleChangeRequest.findUnique({ where: { idempotencyKey } });
  if (existing) return loadRoleChange(existing.id, client);

  const createdId = await client.$transaction(async (tx) => {
    // Interactive transactions use one checked-out connection. Keep its queries
    // sequential so the pg driver never receives overlapping client.query calls.
    const target = await tx.user.findUnique({ where: { id: targetUserId }, select: { id: true, isActive: true } });
    const role = await tx.role.findUnique({ where: { id: roleId }, select: { id: true, key: true, isSystem: true } });
    const assignment = await tx.userRoleAssignment.findUnique({ where: { userId_roleId: { userId: targetUserId, roleId } } });
    if (!target) throw httpError(404, 'ROLE_TARGET_NOT_FOUND', 'Role target user was not found.');
    if (!role) throw httpError(404, 'ROLE_NOT_FOUND', 'Administrative role was not found.');
    if (!target.isActive && action === 'GRANT') throw httpError(409, 'ROLE_TARGET_INACTIVE', 'Cannot grant access to an inactive account.');
    if (action === 'GRANT' && assignment?.status === 'ACTIVE') throw httpError(409, 'ROLE_ALREADY_ASSIGNED', 'The role is already active.');
    if (action === 'REVOKE' && assignment?.status !== 'ACTIVE') throw httpError(409, 'ROLE_NOT_ASSIGNED', 'The role is not active.');

    const created = await tx.adminRoleChangeRequest.create({
      data: { targetUserId, roleId, action, reason, idempotencyKey, requestedById: req.user.id },
    });
    await writeAuditLog({
      req,
      action: 'ADMIN_ROLE_CHANGE_REQUESTED',
      resourceType: 'ADMIN_ROLE_CHANGE_REQUEST',
      resourceId: created.id,
      reason,
      after: { targetUserId, roleId, roleKey: role.key, action, status: 'REQUESTED' },
    }, tx);
    return created.id;
  });
  return loadRoleChange(createdId, client);
};

const decideRoleChange = async ({ id, decision, reason, req }, client = prisma, options = {}) => {
  ensureEnabled(options.enabled ?? env.adminRoleChangesEnabled);
  const decidedId = await client.$transaction(async (tx) => {
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AdminRoleChangeRequest" WHERE "id" = ${id} FOR UPDATE`);
    }
    const request = await tx.adminRoleChangeRequest.findUnique({
      where: { id },
    });
    if (!request) throw httpError(404, 'ROLE_CHANGE_REQUEST_NOT_FOUND', 'Role change request was not found.');
    if (request.status !== 'REQUESTED') return request.id;
    if (request.requestedById === req.user.id) throw httpError(409, 'ROLE_CHANGE_FOUR_EYES_REQUIRED', 'The requester cannot review the same role change.');
    if (request.targetUserId === req.user.id) throw httpError(409, 'ROLE_CHANGE_SELF_REVIEW_FORBIDDEN', 'An administrator cannot review a change to their own access.');

    if (decision === 'REJECT') {
      const rejected = await tx.adminRoleChangeRequest.update({
        where: { id },
        data: { status: 'REJECTED', reviewedById: req.user.id, reviewedAt: new Date(), decisionReason: reason },
      });
      await writeAuditLog({
        req, action: 'ADMIN_ROLE_CHANGE_REJECTED', resourceType: 'ADMIN_ROLE_CHANGE_REQUEST', resourceId: id,
        reason, before: { status: 'REQUESTED' }, after: { status: 'REJECTED' },
      }, tx);
      return rejected.id;
    }

    if (request.action === 'GRANT') {
      await tx.userRoleAssignment.upsert({
        where: { userId_roleId: { userId: request.targetUserId, roleId: request.roleId } },
        update: { status: 'ACTIVE', grantedBy: req.user.id, grantedAt: new Date(), revokedAt: null },
        create: { userId: request.targetUserId, roleId: request.roleId, status: 'ACTIVE', grantedBy: req.user.id },
      });
    } else {
      const updated = await tx.userRoleAssignment.updateMany({
        where: { userId: request.targetUserId, roleId: request.roleId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      if (updated.count !== 1) throw httpError(409, 'ROLE_ASSIGNMENT_CHANGED', 'The active role assignment changed before approval.');
      await tx.adminSession.updateMany({
        where: { userId: request.targetUserId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'ROLE_REVOKED' },
      });
    }

    const executed = await tx.adminRoleChangeRequest.update({
      where: { id },
      data: {
        status: 'EXECUTED', reviewedById: req.user.id, reviewedAt: new Date(),
        decisionReason: reason, executedAt: new Date(),
      },
    });
    await writeAuditLog({
      req, action: 'ADMIN_ROLE_CHANGE_EXECUTED', resourceType: 'ADMIN_ROLE_CHANGE_REQUEST', resourceId: id,
      reason,
      before: { status: 'REQUESTED' },
      after: { status: 'EXECUTED', targetUserId: request.targetUserId, roleId: request.roleId, action: request.action },
    }, tx);
    return executed.id;
  });
  return loadRoleChange(decidedId, client);
};

const listRoles = async (client = prisma) => client.role.findMany({
  orderBy: { key: 'asc' },
  select: {
    id: true, key: true, name: true, description: true, isSystem: true,
    permissions: { select: { permission: { select: { id: true, key: true, description: true } } } },
    _count: { select: { assignments: true } },
  },
});

const listRoleChangeRequests = async ({ status = 'REQUESTED', take = 100 } = {}, client = prisma) => {
  const requests = await client.adminRoleChangeRequest.findMany({
    where: { status }, take, orderBy: { requestedAt: 'asc' },
    include: roleChangeInclude,
  });
  return requests.map((request) => ({
    ...request,
    targetUser: { ...request.targetUser, email: undefined, emailMasked: maskEmail(request.targetUser.email) },
  }));
};

module.exports = { decideRoleChange, ensureEnabled, listRoleChangeRequests, listRoles, requestRoleChange };
