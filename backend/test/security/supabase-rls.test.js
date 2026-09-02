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
