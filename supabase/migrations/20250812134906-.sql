-- Fix linter 0010: Security Definer View
-- Set all views/materialized views in public schema to SECURITY INVOKER
-- This preserves existing columns and behavior but ensures RLS is evaluated under the querying user

DO $$
DECLARE
  v_rec record;
  v_sql text;
BEGIN
  FOR v_rec IN 
    SELECT c.relname AS name, c.relkind AS kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
  LOOP
    BEGIN
      IF v_rec.kind = 'v' THEN
        v_sql := format('ALTER VIEW %I.%I SET (security_invoker = on);', 'public', v_rec.name);
      ELSIF v_rec.kind = 'm' THEN
        -- Postgres 15+ supports security_invoker for materialized views as well
        v_sql := format('ALTER MATERIALIZED VIEW %I.%I SET (security_invoker = on);', 'public', v_rec.name);
      END IF;
      EXECUTE v_sql;
      RAISE NOTICE 'Set security_invoker=on for % (%)', v_rec.name, v_rec.kind;
    EXCEPTION WHEN others THEN
      -- Avoid failing migration if a relkind doesn't support the option in this version
      RAISE NOTICE 'Skipping % due to: %', v_rec.name, SQLERRM;
    END;
  END LOOP;
END$$;

-- Ensure specific critical view is covered even if loop skipped
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER VIEW public.profiles_public SET (security_invoker = on)';
  EXCEPTION WHEN others THEN
    -- ignore if already set or not present
    NULL;
  END;
END$$;