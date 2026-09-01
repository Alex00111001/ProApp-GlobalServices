require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
const prisma = require('../../config/prisma');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('./permission-catalog');
const { logger } = require('../observability/logger');

const bootstrapRbac = async (client = prisma) => {
  const permissions = {};
  const roles = {};
  for (const key of Object.values(PERMISSIONS)) {
    permissions[key] = await client.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }

  for (const [key, grants] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await client.role.upsert({
      where: { key },
      update: { name: key, isSystem: true },
      create: { key, name: key, isSystem: true },
    });
    roles[key] = role;
    const permissionKeys = grants.includes('*') ? Object.values(PERMISSIONS) : grants;
    await client.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: permissionKeys.map((permissionKey) => permissions[permissionKey].id) },
      },
    });
    for (const permissionKey of permissionKeys) {
      await client.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permissions[permissionKey].id } },
        update: {},
        create: { roleId: role.id, permissionId: permissions[permissionKey].id },
      });
    }
  }

  const legacyAdmins = await client.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  for (const user of legacyAdmins) {
    await client.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roles.SUPER_ADMIN.id } },
      update: { status: 'ACTIVE', revokedAt: null },
      create: { userId: user.id, roleId: roles.SUPER_ADMIN.id, status: 'ACTIVE' },
    });
  }
};

if (require.main === module) {
  bootstrapRbac()
    .then(() => logger.info('RBAC catalog synchronized'))
    .finally(() => prisma.$disconnect());
}

module.exports = { bootstrapRbac };
