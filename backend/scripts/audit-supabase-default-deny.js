require('dotenv').config();

const { Client } = require('pg');

const API_PRINCIPALS = ['PUBLIC', 'anon', 'authenticated', 'service_role'];
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

const verifySupabaseTarget = (connectionString, expectedProjectRef) => {
  const expected = String(expectedProjectRef || '').trim().toLowerCase();
  if (!PROJECT_REF_PATTERN.test(expected)) {
    throw new Error('EXPECTED_SUPABASE_PROJECT_REF must be a 20-character lowercase Supabase project ref.');
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DIRECT_URL must be a valid PostgreSQL connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DIRECT_URL must use the postgres or postgresql protocol.');
  }

  const hostname = url.hostname.toLowerCase();
  const username = decodeURIComponent(url.username || '').toLowerCase();
  const isDirect = hostname === `db.${expected}.supabase.co`;
  const isPooler = hostname.endsWith('.pooler.supabase.com')
    && (username === `postgres.${expected}` || username.endsWith(`.${expected}`));

  if (!isDirect && !isPooler) {
    throw new Error('DIRECT_URL does not match EXPECTED_SUPABASE_PROJECT_REF; refusing to connect.');
  }

  return {
    projectRef: expected,
    connectionKind: isDirect ? 'direct' : 'pooler',
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || null,
  };
};

const assertAuditOptIn = (value) => {
  if (value !== 'true') {
    throw new Error('Set ALLOW_LIVE_SECURITY_AUDIT=true to authorize this read-only live audit.');
  }
};

const compact = (rows, keys, limit = 25) => rows.slice(0, limit).map((row) => Object.fromEntries(
  keys.map((key) => [key, row[key]])
));

const main = async () => {
  if (!process.env.DIRECT_URL) {
    throw new Error('DIRECT_URL is required and must not be committed.');
  }
  assertAuditOptIn(process.env.ALLOW_LIVE_SECURITY_AUDIT);
  const target = verifySupabaseTarget(
    process.env.DIRECT_URL,
    process.env.EXPECTED_SUPABASE_PROJECT_REF
  );

  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionStarted = true;
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL application_name = 'homeservices-supabase-security-audit'");

    const identity = (await client.query(`
      SELECT current_database() AS database_name,
             current_user AS role_name,
             current_setting('transaction_read_only') AS transaction_read_only
    `)).rows[0];

    const runtimeRole = (await client.query(`
      SELECT rolname AS role_name, rolsuper AS superuser, rolbypassrls AS bypass_rls
      FROM pg_roles
      WHERE rolname = current_user
    `)).rows[0];

    const tables = (await client.query(`
      SELECT c.relname AS object_name,
             pg_get_userbyid(c.relowner) AS owner_name,
             c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND c.relname <> '_prisma_migrations'
      ORDER BY c.relname
    `)).rows;

    const policies = (await client.query(`
      SELECT tablename AS object_name, policyname AS policy_name,
             COALESCE(array_to_string(roles, ','), '') AS roles
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `)).rows;

    const tableGrants = (await client.query(`
      SELECT table_name AS object_name, grantee, privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND grantee = ANY($1::text[])
      ORDER BY table_name, grantee, privilege_type
    `, [API_PRINCIPALS])).rows;

    const effectiveTablePrivileges = (await client.query(`
      SELECT c.relname AS object_name, role.rolname AS grantee, privilege.privilege_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN pg_roles role
      CROSS JOIN (VALUES
        ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
      ) AS privilege(privilege_type)
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm')
        AND role.rolname = ANY($1::text[])
        AND has_table_privilege(role.oid, c.oid, privilege.privilege_type)
      ORDER BY c.relname, role.rolname, privilege.privilege_type
    `, [API_PRINCIPALS])).rows;

    const columnGrants = (await client.query(`
      SELECT table_name AS object_name, column_name, grantee, privilege_type
      FROM information_schema.column_privileges
      WHERE table_schema = 'public'
        AND grantee = ANY($1::text[])
      ORDER BY table_name, column_name, grantee, privilege_type
    `, [API_PRINCIPALS])).rows;

    const effectiveColumnPrivileges = (await client.query(`
      SELECT c.relname AS object_name, attribute.attname AS column_name,
             role.rolname AS grantee, privilege.privilege_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute attribute ON attribute.attrelid = c.oid
      CROSS JOIN pg_roles role
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) AS privilege(privilege_type)
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm')
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND role.rolname = ANY($1::text[])
        AND has_column_privilege(role.oid, c.oid, attribute.attnum, privilege.privilege_type)
      ORDER BY c.relname, attribute.attname, role.rolname, privilege.privilege_type
    `, [API_PRINCIPALS])).rows;

    const routineGrants = (await client.query(`
      SELECT routine_name AS object_name, grantee, privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND grantee = ANY($1::text[])
      ORDER BY routine_name, grantee, privilege_type
    `, [API_PRINCIPALS])).rows;

    const effectiveRoutinePrivileges = (await client.query(`
      SELECT procedure.proname AS object_name, role.rolname AS grantee, 'EXECUTE' AS privilege_type
      FROM pg_proc procedure
      JOIN pg_namespace n ON n.oid = procedure.pronamespace
      CROSS JOIN pg_roles role
      WHERE n.nspname = 'public'
        AND role.rolname = ANY($1::text[])
        AND has_function_privilege(role.oid, procedure.oid, 'EXECUTE')
      ORDER BY procedure.proname, role.rolname
    `, [API_PRINCIPALS])).rows;

    const usageGrants = (await client.query(`
      SELECT object_type, object_name, grantee, privilege_type
      FROM information_schema.usage_privileges
      WHERE object_schema = 'public'
        AND object_type = 'SEQUENCE'
        AND grantee = ANY($1::text[])
      ORDER BY object_type, object_name, grantee, privilege_type
    `, [API_PRINCIPALS])).rows;

    const effectiveSequencePrivileges = (await client.query(`
      SELECT sequence.relname AS object_name, role.rolname AS grantee, privilege.privilege_type
      FROM pg_class sequence
      JOIN pg_namespace n ON n.oid = sequence.relnamespace
      CROSS JOIN pg_roles role
      CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS privilege(privilege_type)
      WHERE n.nspname = 'public'
        AND sequence.relkind = 'S'
        AND role.rolname = ANY($1::text[])
        AND has_sequence_privilege(role.oid, sequence.oid, privilege.privilege_type)
      ORDER BY sequence.relname, role.rolname, privilege.privilege_type
    `, [API_PRINCIPALS])).rows;

    const typeGrants = (await client.query(`
      SELECT type_object.typname AS object_name,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
             acl.privilege_type
      FROM pg_type type_object
      JOIN pg_namespace n ON n.oid = type_object.typnamespace
      LEFT JOIN pg_class relation ON relation.oid = type_object.typrelid
      CROSS JOIN LATERAL aclexplode(COALESCE(type_object.typacl, acldefault('T', type_object.typowner))) acl
      WHERE n.nspname = 'public'
        AND type_object.typtype IN ('e', 'd', 'r', 'm', 'c')
        AND (type_object.typtype <> 'c' OR relation.relkind = 'c')
        AND (acl.grantee = 0 OR pg_get_userbyid(acl.grantee) = ANY($1::text[]))
      ORDER BY type_object.typname, grantee, acl.privilege_type
    `, [API_PRINCIPALS])).rows;

    const effectiveTypePrivileges = (await client.query(`
      SELECT type_object.typname AS object_name, role.rolname AS grantee, 'USAGE' AS privilege_type
      FROM pg_type type_object
      JOIN pg_namespace n ON n.oid = type_object.typnamespace
      LEFT JOIN pg_class relation ON relation.oid = type_object.typrelid
      CROSS JOIN pg_roles role
      WHERE n.nspname = 'public'
        AND type_object.typtype IN ('e', 'd', 'r', 'm', 'c')
        AND (type_object.typtype <> 'c' OR relation.relkind = 'c')
        AND role.rolname = ANY($1::text[])
        AND has_type_privilege(role.oid, type_object.oid, 'USAGE')
      ORDER BY type_object.typname, role.rolname
    `, [API_PRINCIPALS])).rows;

    const schemaGrants = (await client.query(`
      SELECT CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
             acl.privilege_type
      FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) acl
      WHERE n.nspname = 'public'
        AND (acl.grantee = 0 OR pg_get_userbyid(acl.grantee) = ANY($1::text[]))
      ORDER BY grantee, privilege_type
    `, [API_PRINCIPALS])).rows;

    const effectiveSchemaPrivileges = (await client.query(`
      SELECT role.rolname AS grantee, privilege.privilege_type
      FROM pg_roles role
      CROSS JOIN (VALUES ('USAGE'), ('CREATE')) AS privilege(privilege_type)
      WHERE role.rolname = ANY($1::text[])
        AND has_schema_privilege(role.oid, 'public', privilege.privilege_type)
      ORDER BY role.rolname, privilege.privilege_type
    `, [API_PRINCIPALS])).rows;

    const defaultPrivilegeGrants = (await client.query(`
      SELECT pg_get_userbyid(d.defaclrole) AS owner_name,
             COALESCE(n.nspname, '*') AS schema_name,
             CASE d.defaclobjtype
               WHEN 'r' THEN 'TABLE'
               WHEN 'S' THEN 'SEQUENCE'
               WHEN 'f' THEN 'ROUTINE'
               WHEN 'T' THEN 'TYPE'
               ELSE d.defaclobjtype::text
             END AS object_type,
             CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
             acl.privilege_type
      FROM pg_default_acl d
      LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
      WHERE (d.defaclnamespace = 0 OR n.nspname = 'public')
        AND (acl.grantee = 0 OR pg_get_userbyid(acl.grantee) = ANY($1::text[]))
      ORDER BY owner_name, schema_name, object_type, grantee, privilege_type
    `, [API_PRINCIPALS])).rows;

    const effectiveDefaultPrivileges = (await client.query(`
      SELECT pg_get_userbyid(d.defaclrole) AS owner_name,
             COALESCE(n.nspname, '*') AS schema_name,
             CASE d.defaclobjtype
               WHEN 'r' THEN 'TABLE'
               WHEN 'S' THEN 'SEQUENCE'
               WHEN 'f' THEN 'ROUTINE'
               WHEN 'T' THEN 'TYPE'
               ELSE d.defaclobjtype::text
             END AS object_type,
             role.rolname AS grantee,
             acl.privilege_type
      FROM pg_default_acl d
      LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
      CROSS JOIN pg_roles role
      WHERE (d.defaclnamespace = 0 OR n.nspname = 'public')
        AND role.rolname = ANY($1::text[])
        AND CASE
          WHEN acl.grantee = 0 THEN true
          ELSE pg_has_role(role.oid, acl.grantee, 'USAGE')
        END
      ORDER BY owner_name, schema_name, object_type, role.rolname, acl.privilege_type
    `, [API_PRINCIPALS])).rows;

    const applicationOwnerNames = new Set(tables.map((table) => table.owner_name));
    const applicationDefaultPrivilegeGrants = defaultPrivilegeGrants.filter(
      (grant) => applicationOwnerNames.has(grant.owner_name)
    );
    const effectiveApplicationDefaultPrivileges = effectiveDefaultPrivileges.filter(
      (grant) => applicationOwnerNames.has(grant.owner_name)
    );
    const platformManagedDefaultPrivileges = defaultPrivilegeGrants.filter(
      (grant) => !applicationOwnerNames.has(grant.owner_name)
    );

    const views = (await client.query(`
      SELECT c.relname AS object_name,
             CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED_VIEW' END AS object_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
      ORDER BY c.relname
    `)).rows;

    const securityDefinerFunctions = (await client.query(`
      SELECT p.proname AS object_name,
             pg_get_function_identity_arguments(p.oid) AS arguments
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
      ORDER BY p.proname, arguments
    `)).rows;

    const exposedSchemaSettings = (await client.query(`
      SELECT replace(config, 'pgrst.db_schemas=', '') AS schemas
      FROM pg_db_role_setting settings
      JOIN pg_roles role ON role.oid = settings.setrole
      CROSS JOIN LATERAL unnest(settings.setconfig) AS entry(config)
      WHERE role.rolname = 'authenticator'
        AND config LIKE 'pgrst.db_schemas=%'
      ORDER BY schemas
    `)).rows.map((row) => row.schemas);
    const exposedSchemas = [...new Set(exposedSchemaSettings.flatMap((schemas) => String(schemas)
      .split(',')
      .map((schema) => schema.trim())
      .filter(Boolean)))].sort();

    const storageObjectsPresent = (await client.query(
      "SELECT to_regclass('storage.objects') IS NOT NULL AS present"
    )).rows[0].present;
    const storageBucketsPresent = (await client.query(
      "SELECT to_regclass('storage.buckets') IS NOT NULL AS present"
    )).rows[0].present;

    const publicBuckets = storageBucketsPresent
      ? (await client.query(`
          SELECT id::text AS bucket_id, name AS bucket_name
          FROM storage.buckets
          WHERE public = true
          ORDER BY name
        `)).rows
      : [];
    const storageClientPolicies = storageObjectsPresent
      ? (await client.query(`
          SELECT tablename AS object_name, policyname AS policy_name,
                 COALESCE(array_to_string(roles, ','), '') AS roles
          FROM pg_policies
          WHERE schemaname = 'storage'
            AND tablename IN ('objects', 'buckets')
            AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
          ORDER BY tablename, policyname
        `)).rows
      : [];

    const unprotectedTables = tables.filter((row) => !row.rls_enabled || !row.rls_forced);
    const violations = [];
    const addViolation = (code, rows) => {
      if (rows.length > 0) violations.push({ code, count: rows.length });
    };

    if (tables.length === 0) violations.push({ code: 'PUBLIC_SCHEMA_HAS_NO_APPLICATION_TABLES', count: 1 });
    addViolation('PUBLIC_TABLE_WITHOUT_FORCED_RLS', unprotectedTables);
    addViolation('PUBLIC_RLS_POLICY_OUTSIDE_BACKEND_ONLY_MODEL', policies);
    addViolation('PUBLIC_TABLE_OR_VIEW_GRANT_TO_DATA_API_ROLE', tableGrants);
    addViolation('EFFECTIVE_PUBLIC_TABLE_OR_VIEW_ACCESS_FOR_DATA_API_ROLE', effectiveTablePrivileges);
    addViolation('PUBLIC_COLUMN_GRANT_TO_DATA_API_ROLE', columnGrants);
    addViolation('EFFECTIVE_PUBLIC_COLUMN_ACCESS_FOR_DATA_API_ROLE', effectiveColumnPrivileges);
    addViolation('PUBLIC_ROUTINE_GRANT_TO_DATA_API_ROLE', routineGrants);
    addViolation('EFFECTIVE_PUBLIC_ROUTINE_ACCESS_FOR_DATA_API_ROLE', effectiveRoutinePrivileges);
    addViolation('PUBLIC_SEQUENCE_GRANT_TO_DATA_API_ROLE', usageGrants);
    addViolation('EFFECTIVE_PUBLIC_SEQUENCE_ACCESS_FOR_DATA_API_ROLE', effectiveSequencePrivileges);
    addViolation('PUBLIC_TYPE_GRANT_TO_DATA_API_ROLE', typeGrants);
    addViolation('EFFECTIVE_PUBLIC_TYPE_ACCESS_FOR_DATA_API_ROLE', effectiveTypePrivileges);
    addViolation('PUBLIC_SCHEMA_GRANT_TO_DATA_API_ROLE', schemaGrants);
    addViolation('EFFECTIVE_PUBLIC_SCHEMA_ACCESS_FOR_DATA_API_ROLE', effectiveSchemaPrivileges);
    addViolation('PUBLIC_DEFAULT_PRIVILEGE_TO_DATA_API_ROLE', applicationDefaultPrivilegeGrants);
    addViolation(
      'EFFECTIVE_PUBLIC_DEFAULT_PRIVILEGE_FOR_DATA_API_ROLE',
      effectiveApplicationDefaultPrivileges
    );
    addViolation('POSTGREST_EXPOSES_PUBLIC_SCHEMA', exposedSchemas.filter((schema) => schema === 'public'));
    addViolation('PUBLIC_SUPABASE_STORAGE_BUCKET', publicBuckets);
    addViolation('SUPABASE_STORAGE_CLIENT_POLICY', storageClientPolicies);
    if (!runtimeRole?.superuser && !runtimeRole?.bypass_rls) {
      violations.push({ code: 'AUDITED_DATABASE_ROLE_CANNOT_BYPASS_FORCED_RLS', count: 1 });
    }

    const passed = violations.length === 0 && identity.transaction_read_only === 'on';
    const result = {
      status: passed ? 'PASS_SQL_CONTROLS_MANUAL_PLATFORM_CHECKS_REMAIN' : 'FAIL',
      target,
      connection: {
        database: identity.database_name,
        role: identity.role_name,
        readOnly: identity.transaction_read_only === 'on',
        roleBypassesRls: Boolean(runtimeRole?.superuser || runtimeRole?.bypass_rls),
      },
      inventory: {
        publicTables: tables.length,
        publicViews: views.length,
        publicSecurityDefinerFunctions: securityDefinerFunctions.length,
        supabaseStorageSchemaPresent: storageObjectsPresent || storageBucketsPresent,
        configuredPostgrestSchemas: exposedSchemas,
        platformManagedDefaultPrivileges: platformManagedDefaultPrivileges.length,
      },
      violations,
      evidence: {
        unprotectedTables: compact(unprotectedTables, ['object_name', 'rls_enabled', 'rls_forced']),
        publicPolicies: compact(policies, ['object_name', 'policy_name', 'roles']),
        tableOrViewGrants: compact(tableGrants, ['object_name', 'grantee', 'privilege_type']),
        effectiveTableOrViewPrivileges: compact(effectiveTablePrivileges, ['object_name', 'grantee', 'privilege_type']),
        columnGrants: compact(columnGrants, ['object_name', 'column_name', 'grantee', 'privilege_type']),
        effectiveColumnPrivileges: compact(effectiveColumnPrivileges, ['object_name', 'column_name', 'grantee', 'privilege_type']),
        routineGrants: compact(routineGrants, ['object_name', 'grantee', 'privilege_type']),
        effectiveRoutinePrivileges: compact(effectiveRoutinePrivileges, ['object_name', 'grantee', 'privilege_type']),
        usageGrants: compact(usageGrants, ['object_type', 'object_name', 'grantee', 'privilege_type']),
        effectiveSequencePrivileges: compact(effectiveSequencePrivileges, ['object_name', 'grantee', 'privilege_type']),
        typeGrants: compact(typeGrants, ['object_name', 'grantee', 'privilege_type']),
        effectiveTypePrivileges: compact(effectiveTypePrivileges, ['object_name', 'grantee', 'privilege_type']),
        schemaGrants: compact(schemaGrants, ['grantee', 'privilege_type']),
        effectiveSchemaPrivileges: compact(effectiveSchemaPrivileges, ['grantee', 'privilege_type']),
        defaultPrivilegeGrants: compact(defaultPrivilegeGrants, ['owner_name', 'schema_name', 'object_type', 'grantee', 'privilege_type']),
        effectiveDefaultPrivileges: compact(effectiveDefaultPrivileges, ['owner_name', 'schema_name', 'object_type', 'grantee', 'privilege_type']),
        platformManagedDefaultPrivileges: compact(platformManagedDefaultPrivileges, ['owner_name', 'schema_name', 'object_type', 'grantee', 'privilege_type']),
        views: compact(views, ['object_name', 'object_type']),
        securityDefinerFunctions: compact(securityDefinerFunctions, ['object_name', 'arguments']),
        publicBuckets: compact(publicBuckets, ['bucket_id', 'bucket_name']),
        storageClientPolicies: compact(storageClientPolicies, ['object_name', 'policy_name', 'roles']),
      },
      manualChecksRequired: [
        'Confirm in Supabase Dashboard that the Data API is disabled for this backend-only application.',
        'Supabase-managed default privileges owned by non-application roles remain platform controls; review them after platform changes.',
        'Rerun Supabase Security Advisor and retain evidence that exposure warnings are cleared.',
        'Confirm no consumer outside this repository depends on PostgREST, GraphQL, supabase-js, RPC, or Supabase Storage client access.',
      ],
    };

    console.log(JSON.stringify(result, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Connection cleanup still runs; the audit never commits database changes.
      }
    }
    await client.end();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({
      status: 'ERROR',
      code: error.code || 'AUDIT_FAILED',
      message: error.message,
    }));
    process.exitCode = 1;
  });
}

module.exports = {
  assertAuditOptIn,
  verifySupabaseTarget,
};
