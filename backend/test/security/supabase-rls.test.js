const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

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
