require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
const prisma = require('../../config/prisma');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('./permission-catalog');
const { logger } = require('../observability/logger');

const bootstrapRbac = async (client = prisma) => {
  const permissionKeys = Object.values(PERMISSIONS);
  await client.permission.createMany({
    data: permissionKeys.map((key) => ({ key })),
    skipDuplicates: true,
  });
  const permissionRows = await client.permission.findMany({
    where: { key: { in: permissionKeys } },
    select: { id: true, key: true },
  });
  const permissions = Object.fromEntries(permissionRows.map((permission) => [permission.key, permission]));
  if (permissionRows.length !== permissionKeys.length) {
    throw new Error('RBAC permission catalog synchronization is incomplete.');
  }

  const roleEntries = Object.entries(ROLE_PERMISSIONS);
  await client.role.createMany({
    data: roleEntries.map(([key]) => ({ key, name: key, isSystem: true })),
    skipDuplicates: true,
  });
  await Promise.all(roleEntries.map(([key]) => client.role.update({
    where: { key },
    data: { name: key, isSystem: true },
  })));
  const roleRows = await client.role.findMany({
    where: { key: { in: roleEntries.map(([key]) => key) } },
    select: { id: true, key: true },
  });
  const roles = Object.fromEntries(roleRows.map((role) => [role.key, role]));
  if (roleRows.length !== roleEntries.length) {
    throw new Error('RBAC role catalog synchronization is incomplete.');
  }

  for (const [key, grants] of roleEntries) {
    const role = roles[key];
    const permissionKeys = grants.includes('*') ? Object.values(PERMISSIONS) : grants;
    const permissionIds = permissionKeys.map((permissionKey) => permissions[permissionKey].id);
    await client.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
    await client.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: permissionIds },
      },
    });
  }

  const legacyAdmins = await client.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  if (legacyAdmins.length > 0) {
    const legacyAdminIds = legacyAdmins.map((user) => user.id);
    await client.userRoleAssignment.createMany({
      data: legacyAdminIds.map((userId) => ({ userId, roleId: roles.SUPER_ADMIN.id, status: 'ACTIVE' })),
      skipDuplicates: true,
    });
    await client.userRoleAssignment.updateMany({
      where: { userId: { in: legacyAdminIds }, roleId: roles.SUPER_ADMIN.id },
      data: { status: 'ACTIVE', revokedAt: null },
    });
  }
};

if (require.main === module) {
  bootstrapRbac()
    .then(() => logger.info('RBAC catalog synchronized'))
    .finally(() => prisma.$disconnect());
}

module.exports = { bootstrapRbac };
