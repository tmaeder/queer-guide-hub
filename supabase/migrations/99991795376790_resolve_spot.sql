-- Spots P3a: /spots/:slug needs to know whether a slug names a place or an organisation.
--
-- Spec: docs/superpowers/specs/2026-11-22-spots-unification-design.md
--
-- Reads the profile tables, not public.spots: spots has no public grant (it mirrors gated and
-- draft rows), and the answer must match what /venues/:slug and /organizations/:slug already
-- resolve, including their slug redirects. Visibility stays with those pages: a gated venue
-- still answers 'place', so the venue page shows its usual sign-in gate instead of a 404.
-- A place wins when a venue and an organisation share a slug (3,209 today, ~1,266 after the
-- P2 fold); P3b suffixes the organisation side.

create function public.resolve_spot(p_slug text)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when exists (select 1 from public.venues v where v.slug = p_slug and v.duplicate_of_id is null) then 'place'
    when exists (select 1 from public.organizations o where o.slug = p_slug and o.duplicate_of_id is null) then 'organization'
    when exists (select 1 from public.venue_slug_redirects r where r.old_slug = p_slug) then 'place'
    when exists (select 1 from public.org_slug_redirects r where r.old_slug = p_slug) then 'organization'
  end
$$;

revoke execute on function public.resolve_spot(text) from public;
grant execute on function public.resolve_spot(text) to anon, authenticated;

do $verify$
begin
  if public.resolve_spot('__no_such_spot__') is not null then
    raise exception 'resolve_spot answers for a slug that does not exist';
  end if;
end
$verify$;
