const prisma = require('../../config/prisma');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('./permission-catalog');

const bootstrapRbac = async (client = prisma) => {
  const permissions = {};
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
    const permissionKeys = grants.includes('*') ? Object.values(PERMISSIONS) : grants;
    for (const permissionKey of permissionKeys) {
      await client.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permissions[permissionKey].id } },
        update: {},
        create: { roleId: role.id, permissionId: permissions[permissionKey].id },
      });
    }
  }
};

if (require.main === module) {
  bootstrapRbac()
    .then(() => console.log('RBAC catalog synchronized.'))
    .finally(() => prisma.$disconnect());
}

module.exports = { bootstrapRbac };
