-- Every public personality page failed for signed-out readers.
--
-- `personality_public_profiles` is a SECURITY INVOKER view (granted to anon) that
-- reads `public.tag_assignments_norm`, also SECURITY INVOKER. An invoker view
-- reads its sources with the CALLER's privileges, and anon held no SELECT on
-- `tag_assignments_norm` (its ACL read `anon=awd`, the shape a re-created view
-- gets from this schema's default privileges: write without read). So every
-- anonymous read of the profile view raised
--   42501 permission denied for view tag_assignments_norm
-- and the page, which treats that read as fatal, redirected to /personalities.
-- Measured on prod 2026-11-03: /personalities/pyotr-ilyich-tchaikovsky and every
-- other detail URL bounced to the list for a signed-out visitor.
--
-- Granting SELECT exposes nothing new. The view is a plain projection of
-- `unified_tag_assignments` (tag_id, entity_id, a normalised entity_type), which
-- anon can already read under its own RLS, and security_invoker means that RLS
-- still applies through the view.

grant select on public.tag_assignments_norm to anon;

do $verify$
begin
  if not has_table_privilege('anon', 'public.tag_assignments_norm', 'select') then
    raise exception 'anon still cannot read tag_assignments_norm';
  end if;
  -- The grant is only safe while the view stays an invoker view: a definer view
  -- would read the base table as its owner and bypass RLS.
  if not exists (
    select 1 from pg_class
    where oid = 'public.tag_assignments_norm'::regclass
      and 'security_invoker=true' = any(coalesce(reloptions, '{}'))
  ) then
    raise exception 'tag_assignments_norm is no longer security_invoker; grant would bypass RLS';
  end if;
end $verify$;
