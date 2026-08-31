-- Detector for the TRUNCATE/TRIGGER/REFERENCES/MAINTAIN grants revoked in
-- 20260830202340. Consumed by scripts/check-api-role-table-grants.mjs.
--
-- WHY A RECURRING CHECK AND NOT JUST THE REVOKE. The revoke fixed today's 569 objects and
-- the `postgres` default ACL. It cannot fix everything:
--
--   * The `supabase_admin` default ACL in schema public still reads anon=arwdDxtm and
--     CANNOT be altered from here — postgres is not a member of supabase_admin (the same
--     wall documented for net.http_request_queue). A table created by supabase_admin in
--     public would inherit anon TRUNCATE again.
--   * Any future migration may re-GRANT by hand, exactly as the stock baseline did.
--
-- So severity is split rather than failing on everything, because a gate that is
-- permanently red is a gate everyone learns to ignore:
--   'critical' — a real object carries the privilege, or the postgres default ACL grants
--                it again. Both are ours and both are one statement to fix.
--   'info'     — the supabase_admin default ACL. Not fixable from this role; reported so
--                it stays visible and so a NEW supabase_admin-created table shows up as a
--                critical object row the moment it exists.

CREATE OR REPLACE FUNCTION public.api_role_table_privilege_leaks()
 RETURNS TABLE(severity text, object_name text, kind text, role_name text, leaked text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Existing objects that still carry one of the four.
  SELECT 'critical'::text,
         c.oid::regclass::text,
         c.relkind::text,
         ro.rolname::text,
         string_agg(p.priv, ',' ORDER BY p.priv)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   CROSS JOIN (VALUES ('anon'), ('authenticated')) AS ro(rolname)
   CROSS JOIN (VALUES ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) AS p(priv)
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r','p','v','m','f')
     AND has_table_privilege(ro.rolname, c.oid, p.priv)
   GROUP BY 1,2,3,4

  UNION ALL

  -- Future objects: a default ACL that would re-grant. Split by grantor, because only
  -- the postgres one is actionable from here.
  SELECT CASE WHEN d.defaclrole = 'postgres'::regrole THEN 'critical' ELSE 'info' END,
         'ALTER DEFAULT PRIVILEGES (grantor ' || d.defaclrole::regrole::text || ')',
         'default_acl',
         'anon/authenticated',
         d.defaclacl::text
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
   WHERE n.nspname = 'public'
     AND d.defaclobjtype = 'r'
     -- D=TRUNCATE x=REFERENCES t=TRIGGER m=MAINTAIN. Lowercase d is DELETE and must not
     -- match, which is why this is a character class and not a case-insensitive test.
     AND d.defaclacl::text ~ '(anon|authenticated)=[arwd]*[Dxtm]';
$function$;

COMMENT ON FUNCTION public.api_role_table_privilege_leaks() IS
  'Objects/default-ACLs granting TRUNCATE/TRIGGER/REFERENCES/MAINTAIN to anon or authenticated. RLS does not gate TRUNCATE.';

-- This function reads the privilege system, so it must not itself become part of the
-- anon-reachable surface. `FROM anon` ALONE IS A NO-OP while PUBLIC holds the built-in
-- EXECUTE grant — the exact trap that left 50 of 97 functions reachable in the first draft
-- of 20260822100000.
REVOKE EXECUTE ON FUNCTION public.api_role_table_privilege_leaks() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_role_table_privilege_leaks() TO service_role;

DO $$
DECLARE v_crit int; v_anon_can boolean;
BEGIN
  SELECT count(*) INTO v_crit
    FROM public.api_role_table_privilege_leaks() WHERE severity = 'critical';
  IF v_crit <> 0 THEN
    RAISE EXCEPTION 'detector reports % critical leaks immediately after the revoke', v_crit;
  END IF;

  SELECT has_function_privilege('anon', 'public.api_role_table_privilege_leaks()', 'EXECUTE')
    INTO v_anon_can;
  IF v_anon_can THEN
    RAISE EXCEPTION 'the detector is anon-callable — revoke did not take';
  END IF;
END $$;
