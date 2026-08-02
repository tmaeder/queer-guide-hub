-- An alias must never shadow a different LIVE tag.
--
-- 142 rows in tag_aliases had an alias_slug identical to the slug of a
-- different, still-active tag -- i.e. they asserted "X is just another name for
-- Y" while X was itself a real tag with its own content:
--     lgbtq        (2,057 uses) -> non-heterosexual (2 uses)
--     accessibility(1,966)      -> accessible       (2)
--     film         (880)        -> cinema           (11)
--     restaurant   (516)        -> eateries         (2)
--     us           (160)        -> s-a-m            (4)
--     india        (97)         -> hindu            (79)
-- 12,572 tag usages sit behind the shadowed side. All 142 were alias_type
-- 'multilingual', from a bulk generation pass.
--
-- This was not inert. trg_sync_tag_alias_to_search_synonym bridges every alias
-- into search_synonyms, so all 142 were live as status='approved',
-- is_one_way=true REWRITES: a search for "restaurant" was being rewritten to
-- "eateries", and "india" to "hindu". That is a search-quality bug and, in the
-- india/hindu case, a conflation worth removing on its own merits.
--
-- search_synonyms.tag_alias_id is ON DELETE SET NULL, so deleting the alias
-- alone would leave the rewrite in place and merely orphan it. The synonym rows
-- must go first.
--
-- Merged tags are deliberately NOT affected: merge_tag_concept legitimately
-- records the absorbed slug as an alias, and by then that tag is status
-- 'merged', not 'active'. The guard keys on active only -- verified by
-- confirming the 52 plural aliases created by the plural auto-merge survive.

do $do$
declare v_syn int; v_ali int;
begin
  perform set_config('app.actor', 'admin:tag-alias-shadow-cleanup', true);

  create temp table _bad_alias on commit drop as
    select a.id
      from public.tag_aliases a
      join public.unified_tags t on t.id = a.canonical_tag_id
      join public.unified_tags u
        on lower(u.slug) = lower(a.alias_slug) and u.status = 'active'
     where u.id <> t.id;

  delete from public.search_synonyms s using _bad_alias b where s.tag_alias_id = b.id;
  get diagnostics v_syn = row_count;

  delete from public.tag_aliases a using _bad_alias b where a.id = b.id;
  get diagnostics v_ali = row_count;

  raise notice 'removed % shadowing aliases and % search synonyms', v_ali, v_syn;
end $do$;

create or replace function public.tag_alias_reject_shadow()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare v_owner uuid;
begin
  select u.id into v_owner
    from public.unified_tags u
   where lower(u.slug) = lower(NEW.alias_slug)
     and u.status = 'active'
     and u.id <> NEW.canonical_tag_id
   limit 1;

  if v_owner is not null then
    raise exception
      'tag alias %s would shadow the live tag with the same slug', NEW.alias_slug
      using hint = 'A slug that is itself an active tag cannot be an alias for a different tag. Merge them, or record a tag_relations edge instead.';
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists trg_tag_alias_reject_shadow on public.tag_aliases;
create trigger trg_tag_alias_reject_shadow
  before insert or update of alias_slug, canonical_tag_id on public.tag_aliases
  for each row execute function public.tag_alias_reject_shadow();

do $do$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
    join public.unified_tags u on lower(u.slug) = lower(a.alias_slug) and u.status = 'active'
   where u.id <> t.id;
  if v_bad > 0 then raise exception '% shadowing aliases remain', v_bad; end if;
end $do$;
