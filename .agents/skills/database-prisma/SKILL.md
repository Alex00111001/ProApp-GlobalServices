---
name: database-prisma
description: Design, migrate, query, and audit the HomeServices PostgreSQL database through Prisma 7. Use for schema changes, migrations, indexes, transactions, baselines, query behavior, or data compatibility.
---

# Database and Prisma

Treat PostgreSQL as the system of record and migration history as production code.

## Required context

Read `docs/DATABASE_MIGRATIONS.md`, the data sections of `docs/IMPLEMENTATION_PLAN.md`, `backend/prisma/schema.prisma`, `backend/prisma.config.ts`, and all migrations that affect the target models.

## Rules

- Baseline an existing database before applying migrations; never reset shared or production data.
- Prefer additive, nullable, or default-safe changes; backfill resumably before tightening constraints.
- Preserve legacy columns and enum values through expand/read-new/contract phases.
- Use `Decimal` or explicitly defined minor units for money and store ISO currency.
- Add indexes for foreign keys and observed timestamp/state access paths; justify uniqueness and cascade behavior.
- Protect event ingestion, financial posting, refunds, commissions, and payouts with database-backed idempotency.
- Keep financial/audit rows immutable; correct through reversals or controlled anonymization.
- Put multi-record invariants inside explicit transactions and analyze concurrency, retries, and locks.
- Do not use `prisma db push` as a substitute for reviewed migration history.

## Verification

Run formatting, validation, client generation, migration SQL review, and the smallest relevant unit/integration suite. Use an isolated PostgreSQL database for integration tests. Never run reset, deploy, or destructive migration commands against an unidentified target.

External Prisma or Supabase skills may supplement this skill only when their entry in `docs/agent-governance/EXTERNAL_SKILLS_REGISTER.md` is approved for the exact version and scope.
