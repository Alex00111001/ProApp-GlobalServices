require('dotenv').config();
process.env.DATABASE_URL ||= process.env.DIRECT_URL;
process.env.NODE_ENV = 'test';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') {
  throw new Error('Set RUN_DATABASE_INTEGRATION_TESTS=true to run database integration tests deliberately.');
}
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL must point to the isolated PostgreSQL test database.');

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../src/config/prisma');
const migrationSql = fs.readFileSync(path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  '202609110003_supabase_current_schema_default_deny',
  'migration.sql'
), 'utf8');
const createPgClient = () => new Client({ connectionString: process.env.DIRECT_URL });

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

test('Supabase Data API roles retain no direct public-schema, object or routine grants', async () => {
  const grants = await prisma.$queryRaw`
    SELECT grantee, privilege_type AS privilege
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
  `;
  assert.deepEqual(grants, []);

  const effectiveTablePrivileges = await prisma.$queryRaw`
    SELECT relation.relname AS object_name, role.rolname AS grantee, privilege.privilege_type
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN pg_roles role
    CROSS JOIN (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) AS privilege(privilege_type)
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm')
      AND role.rolname IN ('anon', 'authenticated', 'service_role')
      AND has_table_privilege(role.oid, relation.oid, privilege.privilege_type)
  `;
  assert.deepEqual(effectiveTablePrivileges, []);

  const columnGrants = await prisma.$queryRaw`
    SELECT table_name, column_name, grantee, privilege_type AS privilege
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
  `;
  assert.deepEqual(columnGrants, []);

  const effectiveColumnPrivileges = await prisma.$queryRaw`
    SELECT relation.relname AS object_name, attribute.attname AS column_name,
           role.rolname AS grantee, privilege.privilege_type
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
    CROSS JOIN pg_roles role
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) AS privilege(privilege_type)
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND role.rolname IN ('anon', 'authenticated', 'service_role')
      AND has_column_privilege(role.oid, relation.oid, attribute.attnum, privilege.privilege_type)
  `;
  assert.deepEqual(effectiveColumnPrivileges, []);

  const routineGrants = await prisma.$queryRaw`
    SELECT grantee, routine_name, privilege_type AS privilege
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
  `;
  assert.deepEqual(routineGrants, []);

  const effectiveRoutinePrivileges = await prisma.$queryRaw`
    SELECT routine.proname AS object_name, role.rolname AS grantee
    FROM pg_proc routine
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    CROSS JOIN pg_roles role
    WHERE namespace.nspname = 'public'
      AND role.rolname IN ('anon', 'authenticated', 'service_role')
      AND has_function_privilege(role.oid, routine.oid, 'EXECUTE')
  `;
  assert.deepEqual(effectiveRoutinePrivileges, []);

  const usageGrants = await prisma.$queryRaw`
    SELECT grantee, object_type, object_name, privilege_type AS privilege
    FROM information_schema.usage_privileges
    WHERE object_schema = 'public'
      AND object_type = 'SEQUENCE'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
  `;
  assert.deepEqual(usageGrants, []);

  const effectiveSequencePrivileges = await prisma.$queryRaw`
    SELECT sequence.relname AS object_name, role.rolname AS grantee, privilege.privilege_type
    FROM pg_class sequence
    JOIN pg_namespace namespace ON namespace.oid = sequence.relnamespace
    CROSS JOIN pg_roles role
    CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS privilege(privilege_type)
    WHERE namespace.nspname = 'public'
      AND sequence.relkind = 'S'
      AND role.rolname IN ('anon', 'authenticated', 'service_role')
      AND has_sequence_privilege(role.oid, sequence.oid, privilege.privilege_type)
  `;
  assert.deepEqual(effectiveSequencePrivileges, []);

  const typeGrants = await prisma.$queryRaw`
    SELECT type_object.typname AS object_name,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
           acl.privilege_type AS privilege
    FROM pg_type type_object
    JOIN pg_namespace namespace ON namespace.oid = type_object.typnamespace
    LEFT JOIN pg_class relation ON relation.oid = type_object.typrelid
    CROSS JOIN LATERAL aclexplode(COALESCE(type_object.typacl, acldefault('T', type_object.typowner))) acl
    WHERE namespace.nspname = 'public'
      AND type_object.typtype IN ('e', 'd', 'r', 'm', 'c')
      AND (type_object.typtype <> 'c' OR relation.relkind = 'c')
      AND (acl.grantee = 0 OR pg_get_userbyid(acl.grantee) IN ('anon', 'authenticated', 'service_role'))
  `;
  assert.deepEqual(typeGrants, []);

  const effectiveTypePrivileges = await prisma.$queryRaw`
    SELECT type_object.typname AS object_name, role.rolname AS grantee
    FROM pg_type type_object
    JOIN pg_namespace namespace ON namespace.oid = type_object.typnamespace
    LEFT JOIN pg_class relation ON relation.oid = type_object.typrelid
    CROSS JOIN pg_roles role
    WHERE namespace.nspname = 'public'
      AND type_object.typtype IN ('e', 'd', 'r', 'm', 'c')
      AND (type_object.typtype <> 'c' OR relation.relkind = 'c')
      AND role.rolname IN ('anon', 'authenticated', 'service_role')
      AND has_type_privilege(role.oid, type_object.oid, 'USAGE')
  `;
  assert.deepEqual(effectiveTypePrivileges, []);

  const roles = await prisma.$queryRaw`
    SELECT r.rolname AS name, has_schema_privilege(r.oid, 'public', 'USAGE') AS schema_usage
    FROM pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
    ORDER BY r.rolname
  `;
  assert.deepEqual(roles, [
    { name: 'anon', schema_usage: false },
    { name: 'authenticated', schema_usage: false },
    { name: 'service_role', schema_usage: false },
  ]);

  const effectiveDefaultPrivileges = await prisma.$queryRaw`
    SELECT pg_get_userbyid(default_acl.defaclrole) AS owner_name,
           COALESCE(namespace.nspname, '*') AS schema_name,
           role.rolname AS grantee,
           acl.privilege_type AS privilege
    FROM pg_default_acl default_acl
    LEFT JOIN pg_namespace namespace ON namespace.oid = default_acl.defaclnamespace
    CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) acl
    CROSS JOIN pg_roles role
    WHERE (default_acl.defaclnamespace = 0 OR namespace.nspname = 'public')
      AND role.rolname IN ('anon', 'authenticated', 'service_role')
      AND CASE
        WHEN acl.grantee = 0 THEN true
        ELSE pg_has_role(role.oid, acl.grantee, 'USAGE')
      END
  `;
  assert.deepEqual(effectiveDefaultPrivileges, []);
});

test('future public tables, sequences, routines and types inherit no Data API grants', async () => {
  await prisma.$executeRawUnsafe('CREATE TABLE public.homeservices_default_table_probe (id serial PRIMARY KEY)');
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION public.homeservices_default_routine_probe()
    RETURNS integer LANGUAGE sql IMMUTABLE AS 'SELECT 1'
  `);
  await prisma.$executeRawUnsafe("CREATE TYPE public.homeservices_default_type_probe AS ENUM ('A')");

  try {
    const effectivePrivileges = await prisma.$queryRaw`
      SELECT role.rolname AS grantee, probe.object_type, probe.privilege
      FROM pg_roles role
      CROSS JOIN LATERAL (
        SELECT 'TABLE'::text AS object_type, 'SELECT'::text AS privilege
        WHERE has_table_privilege(role.oid, 'public.homeservices_default_table_probe', 'SELECT')
        UNION ALL
        SELECT 'SEQUENCE', 'USAGE'
        WHERE has_sequence_privilege(role.oid, 'public.homeservices_default_table_probe_id_seq', 'USAGE')
        UNION ALL
        SELECT 'ROUTINE', 'EXECUTE'
        WHERE has_function_privilege(role.oid, 'public.homeservices_default_routine_probe()', 'EXECUTE')
        UNION ALL
        SELECT 'TYPE', 'USAGE'
        WHERE has_type_privilege(role.oid, 'public.homeservices_default_type_probe', 'USAGE')
      ) probe
      WHERE role.rolname IN ('anon', 'authenticated', 'service_role')
    `;
    assert.deepEqual(effectivePrivileges, []);
  } finally {
    await prisma.$executeRawUnsafe('DROP TYPE IF EXISTS public.homeservices_default_type_probe');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS public.homeservices_default_routine_probe()');
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS public.homeservices_default_table_probe');
  }
});

test('the final hardening migration is idempotent', async () => {
  const client = createPgClient();
  await client.connect();
  try {
    await client.query(migrationSql);
    await client.query(migrationSql);
  } finally {
    await client.end();
  }
});

test('the migration aborts when a Data API role retains inherited access', async () => {
  const client = createPgClient();
  await client.connect();
  try {
    await client.query('CREATE ROLE homeservices_rls_inherited_probe NOLOGIN');
    await client.query('GRANT homeservices_rls_inherited_probe TO anon');
    await client.query('GRANT USAGE ON SCHEMA public TO homeservices_rls_inherited_probe');
    await client.query('GRANT SELECT ON TABLE public."Category" TO homeservices_rls_inherited_probe');

    await assert.rejects(
      client.query(migrationSql),
      /retains effective public schema access/
    );
    await client.query('ROLLBACK');

    const [effective] = (await client.query(`
      SELECT has_schema_privilege('anon', 'public', 'USAGE') AS schema_usage,
             has_table_privilege('anon', 'public."Category"', 'SELECT') AS table_select
    `)).rows;
    assert.deepEqual(effective, { schema_usage: true, table_select: true });
  } finally {
    await client.query('REVOKE SELECT ON TABLE public."Category" FROM homeservices_rls_inherited_probe').catch(() => {});
    await client.query('REVOKE USAGE ON SCHEMA public FROM homeservices_rls_inherited_probe').catch(() => {});
    await client.query('REVOKE homeservices_rls_inherited_probe FROM anon').catch(() => {});
    await client.query('DROP ROLE IF EXISTS homeservices_rls_inherited_probe').catch(() => {});
    await client.end();
  }
});

test('a lock timeout rolls back grants, policies, RLS and default-privilege changes', async () => {
  const setupClient = createPgClient();
  const lockClient = createPgClient();
  const migrationClient = createPgClient();
  await Promise.all([setupClient.connect(), lockClient.connect(), migrationClient.connect()]);

  try {
    await setupClient.query('CREATE TABLE public.homeservices_rls_rollback_probe (id integer)');
    await setupClient.query('ALTER TABLE public.homeservices_rls_rollback_probe ENABLE ROW LEVEL SECURITY');
    await setupClient.query('CREATE POLICY homeservices_rollback_policy ON public.homeservices_rls_rollback_probe FOR SELECT TO anon USING (true)');
    await setupClient.query('GRANT USAGE ON SCHEMA public TO anon');
    await setupClient.query('GRANT SELECT ON TABLE public.homeservices_rls_rollback_probe TO anon');
    await setupClient.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon');

    await lockClient.query('BEGIN');
    await lockClient.query('LOCK TABLE public.homeservices_rls_rollback_probe IN ACCESS SHARE MODE');

    await assert.rejects(
      migrationClient.query(migrationSql),
      (error) => error?.code === '55P03' && /lock timeout/.test(error.message)
    );
    await migrationClient.query('ROLLBACK');

    const [state] = (await setupClient.query(`
      SELECT relation.relrowsecurity AS rls_enabled,
             relation.relforcerowsecurity AS rls_forced,
             has_schema_privilege('anon', 'public', 'USAGE') AS schema_usage,
             has_table_privilege('anon', 'public.homeservices_rls_rollback_probe', 'SELECT') AS table_select,
             (SELECT count(*)::integer FROM pg_policies
              WHERE schemaname = 'public'
                AND tablename = 'homeservices_rls_rollback_probe'
                AND policyname = 'homeservices_rollback_policy') AS policy_count,
             (SELECT count(*)::integer
              FROM pg_default_acl default_acl
              JOIN pg_namespace namespace ON namespace.oid = default_acl.defaclnamespace
              CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) acl
              WHERE namespace.nspname = 'public'
                AND acl.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')
                AND acl.privilege_type = 'SELECT') AS default_select_count
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'homeservices_rls_rollback_probe'
    `)).rows;
    assert.deepEqual(state, {
      rls_enabled: true,
      rls_forced: false,
      schema_usage: true,
      table_select: true,
      policy_count: 1,
      default_select_count: 1,
    });
  } finally {
    await lockClient.query('ROLLBACK').catch(() => {});
    await setupClient.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM anon').catch(() => {});
    await setupClient.query('REVOKE USAGE ON SCHEMA public FROM anon').catch(() => {});
    await setupClient.query('DROP TABLE IF EXISTS public.homeservices_rls_rollback_probe').catch(() => {});
    await Promise.all([setupClient.end(), lockClient.end(), migrationClient.end()]);
  }
});

test('the trusted Prisma connection explicitly bypasses forced RLS', async () => {
  const [role] = await prisma.$queryRaw`
    SELECT rolname AS name, rolsuper AS superuser, rolbypassrls AS bypass_rls
    FROM pg_roles
    WHERE rolname = current_user
  `;
  assert.ok(role?.superuser || role?.bypass_rls, `Database role ${role?.name || 'unknown'} cannot serve the backend through forced RLS.`);
});
