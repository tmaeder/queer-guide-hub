-- Algolia search connector roles (rolbypassrls=true) inherit SELECT from
-- default privileges and would index internal notes into the public search
-- index. Revoke explicitly for every algolia connector role.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'algolia\_%' ESCAPE '\' LOOP
    EXECUTE format('REVOKE ALL ON public.personality_internal_notes FROM %I', r.rolname);
  END LOOP;
END $$;
