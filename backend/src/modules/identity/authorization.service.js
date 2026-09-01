const { roleGrantsPermission } = require('./permission-catalog');

const getPermissionKeys = async (user, client, options = {}) => {
  if (!user) return new Set();
  const { allowLegacyAdmin = true } = options;
  // Compatibility bridge until every legacy ADMIN has explicit assignments.
  if (allowLegacyAdmin && user.role === 'ADMIN') return new Set(['*']);

  const database = client || require('../../config/prisma');
  const assignments = await database.userRoleAssignment.findMany({
    where: { userId: user.id, status: 'ACTIVE' },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const keys = new Set();
  for (const assignment of assignments) {
    if (roleGrantsPermission(assignment.role.key, '*')) keys.add('*');
    for (const grant of assignment.role.permissions) keys.add(grant.permission.key);
  }
  return keys;
};

const hasPermission = async (user, permission, client, options) => {
  if (!user) return false;
  const keys = await getPermissionKeys(user, client, options);
  return keys.has('*') || keys.has(permission);
};

module.exports = { getPermissionKeys, hasPermission };
