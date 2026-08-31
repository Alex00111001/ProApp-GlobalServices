require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const baselinePath = path.join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '00000000000000_baseline',
  'migration.sql'
);

const normalizeType = (value) => String(value)
  .replace(/\bDECIMAL\b/gi, 'numeric')
  .replace(/TIMESTAMP\((\d+)\)(?!\s+without time zone)/gi, 'timestamp($1) without time zone')
  .replace(/public\./gi, '')
  .replace(/"/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const parseBaseline = (sql) => {
  const tables = new Map();
  for (const match of sql.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)) {
    const columns = new Map();
    for (const line of match[2].split(/\r?\n/)) {
      const column = line.match(/^\s{4}"([^"]+)"\s+(.+?)(?:\s+NOT NULL|\s+DEFAULT|,\s*$)/);
      if (!column) continue;
      columns.set(column[1], {
        type: normalizeType(column[2]),
        nullable: !/\sNOT NULL(?:\s|,|$)/.test(line),
      });
    }
    tables.set(match[1], columns);
  }

  const enums = new Map();
  for (const match of sql.matchAll(/CREATE TYPE "([^"]+)" AS ENUM \(([^;]+)\);/g)) {
    enums.set(match[1], [...match[2].matchAll(/'((?:''|[^'])*)'/g)].map((item) => item[1].replace(/''/g, "'")));
  }

  return {
    tables,
    enums,
    indexes: new Set([...sql.matchAll(/CREATE(?: UNIQUE)? INDEX "([^"]+)"/g)].map((match) => match[1])),
    constraints: new Set([...sql.matchAll(/CONSTRAINT "([^"]+)"/g)].map((match) => match[1])),
  };
};

const compareSets = (expected, actual) => ({
  missing: [...expected].filter((value) => !actual.has(value)).sort(),
  extra: [...actual].filter((value) => !expected.has(value)).sort(),
});

const main = async () => {
  if (!process.env.DIRECT_URL) {
    throw new Error('DIRECT_URL must be configured for the baseline audit.');
  }

  const baseline = parseBaseline(fs.readFileSync(baselinePath, 'utf8'));
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  try {
    const columnResult = await client.query(`
        SELECT c.relname AS table_name, a.attname AS column_name,
               format_type(a.atttypid, a.atttypmod) AS data_type,
               NOT a.attnotnull AS nullable
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY c.relname, a.attnum
      `);
    const enumResult = await client.query(`
        SELECT t.typname AS enum_name, e.enumlabel AS enum_value
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        ORDER BY t.typname, e.enumsortorder
      `);
    const indexResult = await client.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname"
    );
    const constraintResult = await client.query(`
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
        ORDER BY con.conname
      `);

    const actualTables = new Map();
    for (const row of columnResult.rows) {
      if (!actualTables.has(row.table_name)) actualTables.set(row.table_name, new Map());
      actualTables.get(row.table_name).set(row.column_name, {
        type: normalizeType(row.data_type),
        nullable: row.nullable,
      });
    }
    const actualEnums = new Map();
    for (const row of enumResult.rows) {
      if (!actualEnums.has(row.enum_name)) actualEnums.set(row.enum_name, []);
      actualEnums.get(row.enum_name).push(row.enum_value);
    }

    const missingTables = [];
    const extraTables = [...actualTables.keys()].filter((name) => !baseline.tables.has(name)).sort();
    const columnMismatches = [];
    const extraColumns = [];
    for (const [tableName, expectedColumns] of baseline.tables) {
      const actualColumns = actualTables.get(tableName);
      if (!actualColumns) {
        missingTables.push(tableName);
        continue;
      }
      const names = compareSets(new Set(expectedColumns.keys()), new Set(actualColumns.keys()));
      for (const name of names.missing) columnMismatches.push({ table: tableName, column: name, issue: 'missing' });
      for (const name of names.extra) extraColumns.push({ table: tableName, column: name });
      for (const [columnName, expected] of expectedColumns) {
        const actual = actualColumns.get(columnName);
        if (!actual) continue;
        if (expected.type !== actual.type || expected.nullable !== actual.nullable) {
          columnMismatches.push({ table: tableName, column: columnName, expected, actual });
        }
      }
    }

    const enumMismatches = [];
    for (const [enumName, expectedValues] of baseline.enums) {
      const actualValues = actualEnums.get(enumName);
      if (!actualValues || JSON.stringify(actualValues) !== JSON.stringify(expectedValues)) {
        enumMismatches.push({ enum: enumName, expected: expectedValues, actual: actualValues || null });
      }
    }

    const indexes = compareSets(
      baseline.indexes,
      new Set(indexResult.rows.map((row) => row.indexname))
    );
    const constraints = compareSets(
      baseline.constraints,
      new Set(constraintResult.rows.map((row) => row.conname))
    );
    const blockers = {
      missingTables: missingTables.sort(),
      columnMismatches,
      enumMismatches,
      missingIndexes: indexes.missing,
      missingConstraints: constraints.missing,
    };
    const passed = Object.values(blockers).every((items) => items.length === 0);
    console.log(JSON.stringify({
      passed,
      baseline: {
        tables: baseline.tables.size,
        enums: baseline.enums.size,
        indexes: baseline.indexes.size,
        constraints: baseline.constraints.size,
      },
      blockers,
      allowedAdditionalObjects: {
        tables: extraTables,
        columns: extraColumns,
        indexes: indexes.extra.filter((name) => !baseline.constraints.has(name)),
        constraints: constraints.extra,
      },
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
