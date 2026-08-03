-- /tags/<merged-slug> threw 42501 for every logged-out visitor.
--
-- Found by an end-to-end run against production using the ANON key, after the
-- same calls had passed repeatedly under a privileged role. resolve_tag_slug()
-- is SECURITY INVOKER and reads tag_slug_redirects; that table had RLS enabled
-- with a "readable by all" SELECT policy USING (true) -- but no GRANT to anon.
-- A policy without a grant is unreachable, so the RPC failed outright with
--     permission denied for table tag_slug_redirects
-- meaning the 172 redirects added to stop merged tags 404'ing were themselves
-- broken for exactly the users who hit them. Every service-role check had
-- passed; only the anon path exposed it.
--
-- tag_aliases has the identical shape (RLS + "Public read" USING (true), no
-- anon grant), so search_tags_with_aliases() was already failing for anon
-- before any of this work -- a pre-existing bug this run happened to surface.
--
-- SECOND FINDING, from asserting the grant state rather than assuming it: anon
-- held INSERT/UPDATE/DELETE on BOTH tables while lacking SELECT -- exactly
-- inverted. It is not currently exploitable, because every write policy gates
-- on auth.uid() IS NOT NULL (tag_aliases) or is service_role-only
-- (tag_slug_redirects), so RLS refuses the write. But the grants serve no
-- purpose and leave RLS as the only thing between an anonymous request and a
-- table that feeds search_synonyms -- an alias insert is bridged into an
-- approved one-way search rewrite by trigger. Revoked as defence in depth.
--
-- Verified against production with the anon key after applying: reads 200,
-- INSERT/DELETE 401 on both tables.
grant select on public.tag_slug_redirects to anon;
grant select on public.tag_aliases to anon;

revoke insert, update, delete on public.tag_slug_redirects from anon;
revoke insert, update, delete on public.tag_aliases from anon;

do $do$
begin
  if not has_table_privilege('anon', 'public.tag_slug_redirects', 'SELECT')
     or not has_table_privilege('anon', 'public.tag_aliases', 'SELECT') then
    raise exception 'anon still cannot read the tag routing tables';
  end if;

  if has_table_privilege('anon', 'public.tag_slug_redirects', 'INSERT')
     or has_table_privilege('anon', 'public.tag_slug_redirects', 'UPDATE')
     or has_table_privilege('anon', 'public.tag_slug_redirects', 'DELETE')
     or has_table_privilege('anon', 'public.tag_aliases', 'INSERT')
     or has_table_privilege('anon', 'public.tag_aliases', 'UPDATE')
     or has_table_privilege('anon', 'public.tag_aliases', 'DELETE') then
    raise exception 'anon still holds write privileges on the tag routing tables';
  end if;

  -- authenticated must keep the access the admin alias UI depends on
  if not has_table_privilege('authenticated', 'public.tag_aliases', 'INSERT') then
    raise exception 'revoke was too broad: authenticated lost INSERT on tag_aliases';
  end if;
end $do$;
