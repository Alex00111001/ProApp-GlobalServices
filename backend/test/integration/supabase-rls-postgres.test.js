require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
process.env.NODE_ENV = 'test';

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') {
  throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true to run database integration tests deliberately.');
}
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL must point to the isolated PostgreSQL test database.');

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../src/config/prisma');

test.after(async () => prisma.$disconnect());

test('PostgreSQL enforces default-deny RLS across every application table', async () => {
  const tables = await prisma.$queryRaw`
    SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
    ORDER BY c.relname
  `;
  const unprotected = tables.filter((table) => !table.enabled || !table.forced);
  assert.ok(tables.length >= 40, `Expected the application schema, found ${tables.length} tables.`);
  assert.deepEqual(unprotected, []);

  const policies = await prisma.$queryRaw`
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  `;
  assert.deepEqual(policies, []);
});

test('Supabase API roles retain no direct public-schema or table grants', async () => {
  const grants = await prisma.$queryRaw`
    SELECT grantee, privilege_type AS privilege
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  `;
  assert.deepEqual(grants, []);

  const roles = await prisma.$queryRaw`
    SELECT r.rolname AS name, has_schema_privilege(r.oid, 'public', 'USAGE') AS schema_usage
    FROM pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated')
    ORDER BY r.rolname
  `;
  assert.deepEqual(roles, [
    { name: 'anon', schema_usage: false },
    { name: 'authenticated', schema_usage: false },
  ]);
});

test('the trusted Prisma connection explicitly bypasses forced RLS', async () => {
  const [role] = await prisma.$queryRaw`
    SELECT rolname AS name, rolsuper AS superuser, rolbypassrls AS bypass_rls
    FROM pg_roles
    WHERE rolname = current_user
  `;
  assert.ok(role?.superuser || role?.bypass_rls, `Database role ${role?.name || 'unknown'} cannot serve the backend through forced RLS.`);
});
