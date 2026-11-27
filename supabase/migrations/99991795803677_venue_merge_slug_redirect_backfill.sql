-- 9,522 merged venues had no row in venue_slug_redirects, so their old URLs
-- 404 (e.g. /venues/kaiserbruendl). _venue_merge_core writes the redirect, but
-- rows merged by writing duplicate_of_id directly (bulk dedup passes, review
-- tools) skipped it. Measured 2026-11-27: every one points straight at a live
-- venue and none of their slugs is used by a live venue.
--
-- 1. Backfill: redirect each merged slug to the live end of its chain.
-- 2. Seal: an AFTER trigger writes the redirect whenever duplicate_of_id is
--    set by any writer. on conflict do nothing keeps the merge core's own
--    insert (and any earlier redirect for that slug) authoritative.

create or replace function public.venue_live_terminal(p_id uuid)
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_cur  uuid := p_id;
  v_next uuid;
begin
  for i in 1..20 loop
    select duplicate_of_id into v_next from public.venues where id = v_cur;
    if not found then return null; end if;
    if v_next is null then return v_cur; end if;
    v_cur := v_next;
  end loop;
  return null; -- cycle or absurd chain: no redirect rather than a wrong one
end $$;

insert into public.venue_slug_redirects (old_slug, venue_id)
select v.slug, public.venue_live_terminal(v.duplicate_of_id)
from public.venues v
where v.duplicate_of_id is not null
  and v.slug is not null
  and public.venue_live_terminal(v.duplicate_of_id) is not null
  and not exists (select 1 from public.venues l where l.slug = v.slug and l.duplicate_of_id is null)
on conflict (old_slug) do nothing;

create or replace function public.venues_merged_slug_redirect()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target uuid;
begin
  if new.slug is null or new.duplicate_of_id is null then
    return null;
  end if;
  v_target := public.venue_live_terminal(new.duplicate_of_id);
  if v_target is null then
    return null;
  end if;
  insert into public.venue_slug_redirects (old_slug, venue_id)
  values (new.slug, v_target)
  on conflict (old_slug) do nothing;
  return null;
end $$;

revoke all on function public.venues_merged_slug_redirect() from public, anon, authenticated;
revoke all on function public.venue_live_terminal(uuid) from public, anon, authenticated;

drop trigger if exists trg_venues_merged_slug_redirect on public.venues;
create trigger trg_venues_merged_slug_redirect
  after update of duplicate_of_id on public.venues
  for each row
  when (new.duplicate_of_id is not null and old.duplicate_of_id is distinct from new.duplicate_of_id)
  execute function public.venues_merged_slug_redirect();

do $verify$
declare
  v_missing int;
begin
  select count(*) into v_missing
  from public.venues v
  where v.duplicate_of_id is not null and v.slug is not null
    and public.venue_live_terminal(v.duplicate_of_id) is not null
    and not exists (select 1 from public.venues l where l.slug = v.slug and l.duplicate_of_id is null)
    and not exists (select 1 from public.venue_slug_redirects r where r.old_slug = v.slug);
  if v_missing <> 0 then
    raise exception 'venue merge redirects still missing for % rows', v_missing;
  end if;
end $verify$;
