-- Every merged tag slug must keep resolving.
--
-- resolve_tag_slug() answers from unified_tags (active only) then falls back to
-- tag_slug_redirects. merge_tag_concept() records the absorbed slug in
-- tag_aliases but writes NO redirect row, and the existing
-- log_unified_tag_slug_redirect trigger only fires when the slug column itself
-- CHANGES -- which a merge never does; it flips `status` instead.
--
-- Result: /tags/caf 404'd after 'caf' was merged into 'cafe', even though the
-- merge was correct and the alias existed. Only run_tag_plural_merge() inserted
-- redirects, and only for the pairs it handled -- every other merge path (admin
-- approval, the nightly dedup sweep, the diacritic repair) left dead URLs
-- behind. 172 redirects exist after this backfill; 118 of them predate it.
--
-- A trigger on the status flip covers all of them at once, including future
-- callers, instead of each one having to remember.
create or replace function public.log_unified_tag_merge_redirect()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare v_target text;
begin
  if NEW.status = 'merged' and NEW.merged_into_id is not null
     and (OLD.status is distinct from NEW.status
          or OLD.merged_into_id is distinct from NEW.merged_into_id) then
    select slug into v_target from public.unified_tags where id = NEW.merged_into_id;
    if v_target is not null and v_target <> NEW.slug then
      insert into public.tag_slug_redirects (old_slug, new_slug, tag_id)
      values (NEW.slug, v_target, NEW.merged_into_id)
      -- DO UPDATE, not DO NOTHING: a slug can be merged, unmerged, then merged
      -- into a different canonical, and a stale row would route to the wrong tag.
      on conflict (old_slug) do update
        set new_slug = excluded.new_slug, tag_id = excluded.tag_id;
    end if;
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists trg_unified_tags_merge_redirect on public.unified_tags;
create trigger trg_unified_tags_merge_redirect
  after update of status, merged_into_id on public.unified_tags
  for each row execute function public.log_unified_tag_merge_redirect();

-- Backfill every historical merge that never got a redirect.
insert into public.tag_slug_redirects (old_slug, new_slug, tag_id)
select d.slug, c.slug, c.id
  from public.unified_tags d
  join public.unified_tags c on c.id = d.merged_into_id
 where d.status = 'merged' and c.status = 'active' and c.slug <> d.slug
on conflict (old_slug) do nothing;

do $do$
begin
  if (select id from public.resolve_tag_slug('caf')) is null then
    raise exception 'resolve_tag_slug(caf) still returns nothing after backfill';
  end if;
end $do$;
