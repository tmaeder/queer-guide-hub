-- Fix linter 0010: Security Definer View
-- Ensure all views in the public schema run with SECURITY INVOKER semantics
-- so RLS and privileges are evaluated as the querying user.

DO $$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN 
    SELECT c.relname AS name, c.relkind AS kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
  LOOP
    BEGIN
      IF v_rec.kind = 'v' THEN
        EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = on);', 'public', v_rec.name);
      ELSIF v_rec.kind = 'm' THEN
        -- Best-effort for materialized views on PG15+
        EXECUTE format('ALTER MATERIALIZED VIEW %I.%I SET (security_invoker = on);', 'public', v_rec.name);
      END IF;
    EXCEPTION WHEN others THEN
      -- Skip objects that don't support this option on this PG version
      RAISE NOTICE 'Skipping % due to: %', v_rec.name, SQLERRM;
    END;
  END LOOP;
END$$;

-- Explicitly cover critical views used by the app (idempotent)
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER VIEW public.profiles_public SET (security_invoker = on)';
  EXCEPTION WHEN others THEN
    NULL;
  END;
END$$;