-- Final Supabase Data API deny boundary for the complete schema at this point in history.
-- HomeServices clients use backend HTTP APIs; public PostgREST/GraphQL access is not an
-- application contract. This migration is idempotent and intentionally creates no policy.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE ON TYPES FROM PUBLIC;
-- Global defaults also flow into public. PostgreSQL grants routine EXECUTE and type
-- USAGE to PUBLIC globally by default, and a schema-scoped revoke cannot remove a
-- global grant. Remove every Data API-facing global default for the migration owner.
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TYPES FROM PUBLIC;

DO $block$
DECLARE
  api_role text;
  target record;
BEGIN
  -- service_role is included because this application does not use the Supabase Data API.
  -- The trusted backend connects directly to PostgreSQL with a separately protected role.
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON ROUTINES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE ON TYPES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON ROUTINES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TYPES FROM %I', api_role);
    END IF;
  END LOOP;

  -- Type privileges are not covered by REVOKE ... ON ALL TABLES/ROUTINES. Remove
  -- access to user-defined enums, domains, ranges and standalone composite types.
  FOR target IN
    SELECT type_object.typname AS type_name
    FROM pg_type type_object
    JOIN pg_namespace namespace ON namespace.oid = type_object.typnamespace
    LEFT JOIN pg_class relation ON relation.oid = type_object.typrelid
    WHERE namespace.nspname = 'public'
      AND type_object.typtype IN ('e', 'd', 'r', 'm', 'c')
      AND (type_object.typtype <> 'c' OR relation.relkind = 'c')
    ORDER BY type_object.typname
  LOOP
    EXECUTE format('REVOKE USAGE ON TYPE public.%I FROM PUBLIC', target.type_name);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE USAGE ON TYPE public.%I FROM %I', target.type_name, api_role);
      END IF;
    END LOOP;
  END LOOP;

  FOR target IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target.table_name);
  END LOOP;

  -- No public-schema policy is part of the approved backend-only access model.
  FOR target IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', target.policyname, target.schemaname, target.tablename);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname <> '_prisma_migrations'
      AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'Supabase default-deny verification failed: a public application table is not forced-RLS';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public') THEN
    RAISE EXCEPTION 'Supabase default-deny verification failed: a public policy remains';
  END IF;

  -- REVOKE from a role does not remove privileges inherited from a parent role.
  -- Abort rather than mutating an unknown group role that may have other consumers.
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      IF has_schema_privilege(api_role, 'public', 'USAGE')
         OR has_schema_privilege(api_role, 'public', 'CREATE') THEN
        RAISE EXCEPTION 'Supabase default-deny verification failed: role % retains effective public schema access', api_role;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN (VALUES
          ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
        ) AS privilege(privilege_type)
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm')
          AND has_table_privilege(api_role, relation.oid, privilege.privilege_type)
      ) THEN
        RAISE EXCEPTION 'Supabase default-deny verification failed: role % retains effective table or view access', api_role;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
        CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) AS privilege(privilege_type)
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm')
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND has_column_privilege(api_role, relation.oid, attribute.attnum, privilege.privilege_type)
      ) THEN
        RAISE EXCEPTION 'Supabase default-deny verification failed: role % retains effective column access', api_role;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM pg_proc routine
        JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
        WHERE namespace.nspname = 'public'
          AND has_function_privilege(api_role, routine.oid, 'EXECUTE')
      ) THEN
        RAISE EXCEPTION 'Supabase default-deny verification failed: role % retains effective routine access', api_role;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM pg_class sequence
        JOIN pg_namespace namespace ON namespace.oid = sequence.relnamespace
        CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS privilege(privilege_type)
        WHERE namespace.nspname = 'public'
          AND sequence.relkind = 'S'
          AND has_sequence_privilege(api_role, sequence.oid, privilege.privilege_type)
      ) THEN
        RAISE EXCEPTION 'Supabase default-deny verification failed: role % retains effective sequence access', api_role;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM pg_type type_object
        JOIN pg_namespace namespace ON namespace.oid = type_object.typnamespace
        LEFT JOIN pg_class relation ON relation.oid = type_object.typrelid
        WHERE namespace.nspname = 'public'
          AND type_object.typtype IN ('e', 'd', 'r', 'm', 'c')
          AND (type_object.typtype <> 'c' OR relation.relkind = 'c')
          AND has_type_privilege(api_role, type_object.oid, 'USAGE')
      ) THEN
        RAISE EXCEPTION 'Supabase default-deny verification failed: role % retains effective type access', api_role;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM pg_default_acl default_acl
        LEFT JOIN pg_namespace namespace ON namespace.oid = default_acl.defaclnamespace
        CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) acl
        WHERE (default_acl.defaclnamespace = 0 OR namespace.nspname = 'public')
          -- Hosted Supabase owns separate platform defaults through supabase_admin;
          -- postgres cannot alter those ACLs. Fail only for owners of application
          -- tables, whose future objects are controlled by this migration chain.
          AND EXISTS (
            SELECT 1
            FROM pg_class application_relation
            JOIN pg_namespace application_namespace
              ON application_namespace.oid = application_relation.relnamespace
            WHERE application_namespace.nspname = 'public'
              AND application_relation.relkind IN ('r', 'p')
              AND application_relation.relname <> '_prisma_migrations'
              AND application_relation.relowner = default_acl.defaclrole
          )
          AND CASE
            WHEN acl.grantee = 0 THEN true
            ELSE pg_has_role(api_role, acl.grantee, 'USAGE')
          END
      ) THEN
        RAISE EXCEPTION 'Supabase default-deny verification failed: role % retains an effective global or public default privilege', api_role;
      END IF;
    END IF;
  END LOOP;
END;
$block$;

COMMIT;
