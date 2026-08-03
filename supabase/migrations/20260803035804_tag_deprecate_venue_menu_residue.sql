-- Deprecate restaurant-menu scrape residue still sitting in the live vocabulary.
--
-- 'bacon', 'cheesecake', 'mashed-potatoes', 'wagyu-beef' and ~150 like them are
-- active tags flagged is_adult. They came from the TripAdvisor venue scrape and
-- were filed under Sexuality & Kink by the 2026-04-11 kink-checklist import.
--
-- The candidate set is DERIVED, not eyeballed. A tag qualifies only if all
-- three hold:
--   1. every one of its assignments is venue-type;
--   2. public.normalize_venue_tags() -- the venue controlled vocabulary, which
--      is default-reject -- refuses the slug;
--   3. it appears in ZERO live venues.tags.
-- (2) and (3) together mean the 2026-06-13 venue-tag cleanup already judged and
-- removed it; only the orphaned tag row and its stale junction rows survived.
-- So this is not a new judgement, it is finishing one already made.
--
-- KEEP-LIST: the signal is good but not perfect -- a genuine kink term can also
-- happen to have only stale venue rows. 'kitten', 'brat' (pet play / BDSM
-- brat), 'muscle' (body type) and 'kinky-boots' (the musical) are excluded by
-- hand. kink_items.unified_tag_slug would have been the principled guard but it
-- is populated on only 20 of 138 rows, so it cannot carry this.
--
-- Deprecation, not deletion: restore_deprecated_tag(id) reverses it, and the
-- deprecation_reason records why.

do $do$
declare r record; v_n int := 0;
begin
  perform set_config('app.actor', 'admin:tag-menu-residue-20260803', true);

  for r in
    select t.id, t.slug
      from public.unified_tags t
     where t.status = 'active'
       and t.slug not in ('kitten','brat','muscle','kinky-boots','leather','silk','cigars')
       and (select count(*) from public.unified_tag_assignments u where u.tag_id = t.id) > 0
       and (select count(*) from public.unified_tag_assignments u
             where u.tag_id = t.id and u.entity_type in ('venues','venue'))
           = (select count(*) from public.unified_tag_assignments u where u.tag_id = t.id)
       and not exists (select 1 from public.venues v where t.slug = any(v.tags))
       and cardinality(public.normalize_venue_tags(array[t.slug])) = 0
  loop
    update public.unified_tags
       set status = 'deprecated', deprecated_at = now(),
           deprecation_reason = 'venue menu/scrape residue: rejected by the venue vocabulary and present on no live venue'
     where id = r.id;
    v_n := v_n + 1;
  end loop;
  raise notice 'deprecated % venue-residue tags', v_n;
end $do$;

-- The two mass-mistagged news terms. Their assignments are provably bogus:
-- 'stay-at-home-dominant' is attached to 2,914 articles about Bridgerton, Derry
-- Girls and Christian books, and 'crops' to 2,635 general-news articles -- and
-- BOTH appear on zero live news_articles.tags, so the news-tag cleanup already
-- removed them upstream. Only the junction rows survived, and they are what
-- inflates usage_count and drags the tags into Safe Mode.
-- The tags themselves are kept (a stay-at-home Dominant and a riding crop are
-- real kink concepts); only the false assignments go.
delete from public.unified_tag_assignments u
 using public.unified_tags t
 where u.tag_id = t.id
   and t.slug in ('stay-at-home-dominant','crops')
   and u.entity_type in ('news','news_article')
   and not exists (select 1 from public.news_articles n
                    where n.id = u.entity_id and t.slug = any(n.tags));

select public.recount_unified_tag_usage_for(
  array(select id from public.unified_tags where slug in ('stay-at-home-dominant','crops')));

do $do$
declare v_bad int;
begin
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug in ('bacon','cheesecake','mashed-potatoes','wagyu-beef','chicken');
  if v_bad > 0 then raise exception '% menu-residue tags are still active', v_bad; end if;

  select count(*) into v_bad from public.unified_tags
   where status <> 'active' and slug in ('kitten','brat','age-play','edge-play','pet-play');
  if v_bad > 0 then raise exception '% genuine kink tags were wrongly deprecated', v_bad; end if;
end $do$;;
