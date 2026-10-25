-- A service-only policy must not inherit extra browser grants on restore.
-- Run only against the disposable snapshot database, before pending migrations.
DO $verify$
DECLARE t record; checked integer:=0;
BEGIN
  FOR t IN
    SELECT n.nspname,c.relname,c.oid FROM pg_policy p
    JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE p.polname='service_role_backend_access'
      AND p.polroles=ARRAY['service_role'::regrole::oid]
  LOOP
    IF has_table_privilege('anon',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_table_privilege('authenticated',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'Snapshot widened backend table grants: %.%',t.nspname,t.relname;
    END IF;
    checked:=checked+1;
  END LOOP;
  RAISE NOTICE 'Verified backend-only grants on % snapshot tables',checked;
END $verify$;
