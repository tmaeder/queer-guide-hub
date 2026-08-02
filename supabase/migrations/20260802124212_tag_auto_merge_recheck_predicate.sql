-- run_tag_auto_merge trusted a boolean frozen at proposal time.
--
-- tag_merge_review.lexical_variant is computed by refresh_tag_merge_candidates()
-- when the row is INSERTED, using whatever tag_slugs_are_variants() meant that
-- day. Narrowing that predicate (20260802104812) therefore did NOT clean the
-- rows already sitting in the queue: three still carried lexical_variant=true
-- from the old substring/levenshtein rule --
--     big-brother / brother        (substring)
--     market      / marketplace    (substring)
--     nantaimori  / nyotaimori     (levenshtein 2)
-- -- and run_tag_auto_merge selects on exactly that stored flag. Anyone running
-- it would have merged three pairs of distinct concepts, using a rule that had
-- already been deleted.
--
-- Two fixes, because either alone is insufficient:
--   1. Backfill the stored flag for open rows (cleans today's queue).
--   2. Make run_tag_auto_merge RE-EVALUATE the predicate at merge time and skip
--      any row that no longer qualifies (stops the next predicate change from
--      recreating the same hazard). A stored boolean is a cache; the merge is
--      irreversible enough to deserve the live check.
--
-- Verified after applying: run_tag_auto_merge(0.90, 25) returns 0. Before, it
-- would have merged 5 pairs, 3 of them destructively.

update public.tag_merge_review r
   set lexical_variant = public.tag_slugs_are_variants(c.slug, d.slug)
  from public.unified_tags c, public.unified_tags d
 where c.id = r.canonical_id and d.id = r.duplicate_id
   and r.status = 'pending'
   and r.lexical_variant is distinct from public.tag_slugs_are_variants(c.slug, d.slug);

-- Rows whose pair the plural merge already resolved are decided, not pending.
update public.tag_merge_review r
   set status = 'auto_merged', decided_at = now(), decided_by = 'auto',
       reason = coalesce(reason, '') || ' | resolved by tag_plural_merge'
  from public.unified_tags d
 where d.id = r.duplicate_id and r.status = 'pending' and d.status = 'merged';

create or replace function public.run_tag_auto_merge(
  p_min_similarity numeric default 0.97,
  p_limit int default 25
)
returns int
language plpgsql security definer
set search_path = public
as $fn$
declare r record; v_n int := 0;
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'admin:tag-auto-merge', true);

  for r in
    select rv.id, rv.canonical_id, rv.duplicate_id, c.slug cslug, d.slug dslug
      from public.tag_merge_review rv
      join public.unified_tags c on c.id = rv.canonical_id
      join public.unified_tags d on d.id = rv.duplicate_id
     where rv.status = 'pending'
       and rv.lexical_variant = true
       and rv.similarity >= p_min_similarity
       and c.status = 'active' and d.status = 'active'
     order by rv.similarity desc
     limit greatest(p_limit, 0)
  loop
    -- Re-evaluate rather than trusting the stored flag: it may predate the
    -- current definition of "lexical variant".
    if not public.tag_slugs_are_variants(r.cslug, r.dslug) then
      update public.tag_merge_review
         set lexical_variant = false,
             reason = coalesce(reason,'') || ' | stale lexical flag, re-checked and cleared'
       where id = r.id;
      continue;
    end if;

    begin
      perform public.merge_tag_concept(r.canonical_id, r.duplicate_id, 'auto', 'auto:lexical-variant');
      update public.tag_merge_review set status='auto_merged', decided_at=now(), decided_by='auto' where id=r.id;
      v_n := v_n + 1;
    exception when others then
      update public.tag_merge_review set status='rejected', decided_at=now(), decided_by='auto',
             reason = coalesce(reason,'')||' | auto-merge failed: '||sqlerrm where id=r.id;
    end;
  end loop;
  return v_n;
end;
$fn$;

revoke all on function public.run_tag_auto_merge(numeric, int) from public;
grant execute on function public.run_tag_auto_merge(numeric, int) to service_role;

do $do$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.tag_merge_review r
    join public.unified_tags c on c.id = r.canonical_id
    join public.unified_tags d on d.id = r.duplicate_id
   where r.status = 'pending' and r.lexical_variant
     and not public.tag_slugs_are_variants(c.slug, d.slug);
  if v_bad > 0 then raise exception '% pending rows still carry a stale lexical_variant flag', v_bad; end if;
end $do$;
