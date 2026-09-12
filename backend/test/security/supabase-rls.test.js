const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertAuditOptIn,
  verifySupabaseTarget,
} = require('../../scripts/audit-supabase-default-deny');

const migrationPath = path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  '202609010003_supabase_rls_hardening',
  'migration.sql'
);

const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const defaultDenySql = fs.readFileSync(path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  '202609010004_public_schema_default_deny',
  'migration.sql'
), 'utf8');
const supportControlSql = fs.readFileSync(path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  '202609020001_operations_support_control',
  'migration.sql'
), 'utf8');
const growthDataSql = fs.readFileSync(path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  '202609020002_growth_data',
  'migration.sql'
), 'utf8');
const f10Sql = fs.readFileSync(path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  '202609100001_supply_demand_ai_operations',
  'migration.sql'
), 'utf8');
const currentSchemaDefaultDenySql = fs.readFileSync(path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  '202609110003_supabase_current_schema_default_deny',
  'migration.sql'
), 'utf8');

const enabledTables = [...migrationSql.matchAll(/ALTER TABLE "([^"]+)" ENABLE ROW LEVEL SECURITY;/g)].map((match) => match[1]);
const forcedTables = [...migrationSql.matchAll(/ALTER TABLE "([^"]+)" FORCE ROW LEVEL SECURITY;/g)].map((match) => match[1]);

test('Supabase hardening migration enables and forces RLS on every public table', () => {
  assert.equal(enabledTables.length, forcedTables.length);
  assert.deepEqual(forcedTables, enabledTables);
  assert.equal(new Set(enabledTables).size, enabledTables.length);
  assert.ok(enabledTables.length >= 40);
  assert.match(migrationSql, /REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated;/);
  assert.match(migrationSql, /REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;/);
  assert.match(migrationSql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;/);
  assert.match(migrationSql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;/);
  assert.match(migrationSql, /REVOKE ALL ON TABLE "User" FROM PUBLIC, anon, authenticated;/);
  assert.doesNotMatch(migrationSql, /CREATE POLICY/i);
  assert.doesNotMatch(migrationSql, /SECURITY DEFINER/i);
  assert.doesNotMatch(migrationSql, /grant .* to .*anon/i);
  assert.doesNotMatch(migrationSql, /grant .* to .*authenticated/i);
  assert.match(defaultDenySql, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;/);
  assert.match(defaultDenySql, /c\.relname <> '_prisma_migrations'/);
  assert.match(defaultDenySql, /ALTER TABLE public\.%I FORCE ROW LEVEL SECURITY/);
  assert.match(defaultDenySql, /DROP POLICY %I ON %I\.%I/);
});

test('operations support tables preserve the Supabase default-deny posture', () => {
  for (const table of ['SupportCase', 'SupportCaseComment', 'SupportCaseEvent']) {
    assert.match(supportControlSql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`));
    assert.match(supportControlSql, new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`));
  }

  assert.match(supportControlSql, /REVOKE ALL ON "SupportCase", "SupportCaseComment", "SupportCaseEvent" FROM PUBLIC;/);
  assert.match(supportControlSql, /REVOKE ALL ON "SupportCase", "SupportCaseComment", "SupportCaseEvent" FROM anon;/);
  assert.match(supportControlSql, /REVOKE ALL ON "SupportCase", "SupportCaseComment", "SupportCaseEvent" FROM authenticated;/);
  assert.doesNotMatch(supportControlSql, /CREATE POLICY/i);
  assert.doesNotMatch(supportControlSql, /SECURITY DEFINER/i);
});

test('growth data tables preserve idempotency and the Supabase default-deny posture', () => {
  for (const table of ['Campaign', 'Lead', 'Conversion']) {
    assert.match(growthDataSql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`));
    assert.match(growthDataSql, new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`));
  }
  assert.match(growthDataSql, /CREATE UNIQUE INDEX "MarketingEvent_clientEventId_key"/);
  assert.match(growthDataSql, /CREATE UNIQUE INDEX "Conversion_eventId_key"/);
  assert.match(growthDataSql, /REVOKE ALL ON "Campaign", "Lead", "Conversion" FROM PUBLIC;/);
  assert.doesNotMatch(growthDataSql, /CREATE POLICY/i);
  assert.doesNotMatch(growthDataSql, /ON DELETE CASCADE/i);
});

test('F10 evidence and governance tables are forced-RLS default deny with durable invariants', () => {
  const tables = [
    'SupplyDemandMetricDefinition', 'SupplyDemandObservation', 'SupplyDemandSnapshot', 'MarketReadinessPolicy',
    'MarketReadinessEvaluation', 'ExpansionCandidate', 'ExpansionEvaluation', 'OperationalRecommendation',
    'AIProvider', 'AIModelPolicy', 'AIPromptTemplate', 'AIPromptVersion', 'AIOperationDefinition', 'AIOperationVersion',
    'AIOperationExecution', 'AIInputReference', 'AIOutputArtifact', 'AIEvaluation', 'AIApproval', 'AICostRecord',
  ];
  for (const table of tables) {
    assert.match(f10Sql, new RegExp(`ALTER TABLE public\\.%I ENABLE ROW LEVEL SECURITY`));
    assert.ok(f10Sql.includes(`'${table}'`));
  }
  assert.match(f10Sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(f10Sql, /REVOKE ALL ON TABLE public\.%I FROM service_role/);
  assert.match(f10Sql, /SupplyDemandSnapshot_append_only/);
  assert.match(f10Sql, /AIOutputArtifact_append_only/);
  assert.match(f10Sql, /AIPromptVersion_four_eyes_check/);
  assert.match(f10Sql, /AIOperationExecution_idempotencyKey_key/);
  assert.match(f10Sql, /FOR UPDATE SKIP LOCKED|AIOperationExecution_status_nextAttemptAt_idx/);
  assert.doesNotMatch(f10Sql, /CREATE POLICY/i);
  assert.doesNotMatch(f10Sql, /ON DELETE CASCADE/i);
});

test('final schema hardening closes tables, views, routines and future public objects', () => {
  const migrationDirectories = fs.readdirSync(path.join(__dirname, '..', '..', 'prisma', 'migrations'), {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  const hardeningMigration = '202609110003_supabase_current_schema_default_deny';
  const hardeningIndex = migrationDirectories.indexOf(hardeningMigration);
  assert.notEqual(hardeningIndex, -1, 'The release hardening migration is required.');
  for (const successor of migrationDirectories.slice(hardeningIndex + 1)) {
    const successorSql = fs.readFileSync(path.join(__dirname, '..', '..', 'prisma', 'migrations', successor, 'migration.sql'), 'utf8');
    assert.doesNotMatch(
      successorSql,
      /CREATE\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|PROCEDURE|SEQUENCE|TYPE|SCHEMA)|CREATE\s+POLICY|GRANT\s+|DISABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      `${successor} expands the database/Data API surface and requires a reviewed default-deny successor.`
    );
  }
  assert.match(currentSchemaDefaultDenySql, /BEGIN;/);
  assert.match(currentSchemaDefaultDenySql, /SET LOCAL lock_timeout = '5s';/);
  assert.match(currentSchemaDefaultDenySql, /REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;/);
  assert.match(currentSchemaDefaultDenySql, /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;/);
  assert.match(currentSchemaDefaultDenySql, /REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;/);
  assert.match(currentSchemaDefaultDenySql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;/);
  assert.match(currentSchemaDefaultDenySql, /ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON ROUTINES FROM PUBLIC;/);
  assert.match(currentSchemaDefaultDenySql, /ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TYPES FROM PUBLIC;/);
  assert.match(currentSchemaDefaultDenySql, /ARRAY\['anon', 'authenticated', 'service_role'\]/);
  assert.match(currentSchemaDefaultDenySql, /REVOKE USAGE ON TYPE public\.%I FROM PUBLIC/);
  assert.match(currentSchemaDefaultDenySql, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/);
  assert.match(currentSchemaDefaultDenySql, /ALTER TABLE public\.%I FORCE ROW LEVEL SECURITY/);
  assert.match(currentSchemaDefaultDenySql, /DROP POLICY %I ON %I\.%I/);
  assert.match(currentSchemaDefaultDenySql, /has_type_privilege\(api_role, type_object\.oid, 'USAGE'\)/);
  assert.match(currentSchemaDefaultDenySql, /pg_has_role\(api_role, acl\.grantee, 'USAGE'\)/);
  assert.match(currentSchemaDefaultDenySql, /application_relation\.relowner = default_acl\.defaclrole/);
  assert.match(currentSchemaDefaultDenySql, /RAISE EXCEPTION 'Supabase default-deny verification failed:/);
  assert.match(currentSchemaDefaultDenySql, /COMMIT;/);
  assert.doesNotMatch(currentSchemaDefaultDenySql, /CREATE\s+POLICY/i);
  assert.doesNotMatch(currentSchemaDefaultDenySql, /GRANT\s+/i);
  assert.doesNotMatch(currentSchemaDefaultDenySql, /DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM|UPDATE\s+[^;]+\s+SET/i);
});

test('live audit refuses an unconfirmed or mismatched Supabase target', () => {
  const projectRef = 'qwqvzlhxkolgzyaxacfe';
  assert.deepEqual(
    verifySupabaseTarget(`postgresql://postgres@db.${projectRef}.supabase.co:5432/postgres`, projectRef),
    { projectRef, connectionKind: 'direct', database: 'postgres' }
  );
  assert.deepEqual(
    verifySupabaseTarget(`postgresql://postgres.${projectRef}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`, projectRef),
    { projectRef, connectionKind: 'pooler', database: 'postgres' }
  );
  assert.throws(
    () => verifySupabaseTarget('postgresql://postgres@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres', projectRef),
    /does not match/
  );
  assert.throws(
    () => verifySupabaseTarget(`postgresql://postgres@db.${projectRef}.supabase.co:5432/postgres`, 'invalid'),
    /20-character/
  );
  assert.throws(() => assertAuditOptIn(undefined), /ALLOW_LIVE_SECURITY_AUDIT=true/);
  assert.doesNotThrow(() => assertAuditOptIn('true'));
});

test('live audit covers effective inherited/default/type privileges and exposed public PostgREST', () => {
  const auditSource = fs.readFileSync(path.join(
    __dirname,
    '..',
    '..',
    'scripts',
    'audit-supabase-default-deny.js'
  ), 'utf8');

  assert.match(auditSource, /has_type_privilege\(role\.oid, type_object\.oid, 'USAGE'\)/);
  assert.match(auditSource, /pg_has_role\(role\.oid, acl\.grantee, 'USAGE'\)/);
  assert.match(auditSource, /EFFECTIVE_PUBLIC_DEFAULT_PRIVILEGE_FOR_DATA_API_ROLE/);
  assert.match(auditSource, /applicationOwnerNames\.has\(grant\.owner_name\)/);
  assert.match(auditSource, /platformManagedDefaultPrivileges/);
  assert.match(auditSource, /POSTGREST_EXPOSES_PUBLIC_SCHEMA/);
});
