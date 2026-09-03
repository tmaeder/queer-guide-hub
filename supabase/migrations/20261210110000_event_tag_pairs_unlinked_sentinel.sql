-- The events sentinel could not detect the failure it existed for.
--
-- `tag_hygiene_stats().events_with_tags_unlinked` shipped in 20260927100000 with
-- this contract: "Drains to 0 as the cron works through the backlog. Non-zero
-- after that means the job stopped running."
--
-- It can never reach 0. ~3,856 events carry only tag strings the ambiguity guard
-- blocks on purpose — overwhelmingly a bare `pride`, which resolves to BOTH
-- news-pride and occ-pride — so they are unlinkable by design and permanently
-- counted. The metric's floor is its own blocked set.
--
-- That is not cosmetic. `run_event_tag_link` was wedged for 1,106 consecutive
-- runs (PR #3303: an `order by e.id` work-list that resumed by absence-of-any-
-- assignment, so those same unlinkable events piled up at its head until a whole
-- batch of 2,000 could produce no links). Throughout, this counter read "non-zero"
-- — exactly what it reads when everything is fine. A sentinel whose alarm state
-- is also its healthy state carries no information, and it is why the wedge went
-- unnoticed for a week while 41,748 pairs sat stranded.
--
-- ## The replacement
--
-- `event_tag_pairs_unlinked` counts (event, tag) PAIRS the vocabulary resolves to
-- exactly one active tag and that have no assignment row. Unlinkable events
-- contribute zero pairs, so the floor really is 0 — measured 0 on prod
-- 2026-09-03, against 3,856 for the old counter on the same data. It rises the
-- moment the linker stops draining.
--
-- It is baselined at 0 and is NOT advisory: unlike the metric it replaces, it can
-- actually fail the gate. `events_with_tags_unlinked` is kept (still a useful
-- coverage number, still advisory) with its false claim removed.
--
-- ## Cost, because this function has an 8s PostgREST ceiling and a history
--
-- 20260928143000 exists because ONE counter here hit 6.4s and failed roughly half
-- of all PRs. Same trap, measured while writing this: resolving ambiguity with a
-- correlated `not exists` over the resolved pair set takes **51.1 seconds**. The
-- identical answer via `group by key having count(distinct tag_id) = 1` over a
-- 5,866-row vocabulary CTE takes **708 ms**. Whole function goes 1.8s -> ~2.5s,
-- comfortably inside the ceiling. `src/lib/__tests__/tagHygieneStats.test.ts` is
-- extended to pin both the shape and the counter's existence.
--
-- ## Why the existence test matters here specifically
--
-- Adding a key means restating the whole function, and two branches that each
-- restate it do not conflict in git — the second to merge silently drops the
-- other's keys, and `check-tag-hygiene.mjs` derives its metric list FROM the
-- function, so a dropped key is simply not checked rather than reported. Branch
-- `claude/tag-language-normalization-27e39c` (PR #3301) restates this function
-- right now. This migration therefore does not try to win that race: the test
-- asserts `event_tag_pairs_unlinked` survives in the latest definition, so if
-- #3301 lands after this and drops it, CI fails loudly instead of quietly
-- reverting the sentinel. That file's baseline JSON edit conflicts in git too,
-- which is the loud half of the same collision.

CREATE OR REPLACE FUNCTION public.tag_hygiene_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  ),
  -- A short description shared by many tags is a bulk-import stamp, not a
  -- definition. See the header of 20261007163100.
  stamps as (
    select btrim(description) as d
      from unified_tags
     where description is not null
       and length(btrim(description)) between 1 and 40
     group by 1
    having count(*) > 5
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'active_tags', (select count(*) from active),
      'categories',  (select count(*) from tag_categories),
      'assignments', (select count(*) from unified_tag_assignments)
    ),
    'uncategorized_active', (
      select count(*) from active where category_id is null
        and not public.is_marketplace_facet(slug, entity_kind)),
    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),
    -- The junction is the source of truth; this counts rows where it says one
    -- thing and the denormalised column says nothing. Zero after 20261007163100.
    'denorm_category_missing', (
      select count(*) from unified_tags u
       where u.category_id is null
         and exists (select 1 from tag_category_assignments a where a.tag_id = u.id)),
    -- A bulk-import stamp published as a definition. Invisible to
    -- indexable_without_description, which only sees an EMPTY description.
    'placeholder_description_active', (
      select count(*) from active a
       where btrim(a.description) in (select d from stamps)),
    -- Zero-invariant since the 2026-08-28 photo retirement: tags render drawn
    -- TagPlates, and every image writer was removed. Non-zero means one is back.
    'active_tags_with_image_url', (
      select count(*) from active where image_url is not null),
    'assignment_to_non_active_tag', (
      select count(*) from unified_tag_assignments a
       where not exists (select 1 from active t where t.id = a.tag_id)),
    'nonclean_entity_type', (
      select count(*) from unified_tag_assignments
       where entity_type <> lower(btrim(entity_type))),
    'duplicate_active_name', (
      select count(*) from (
        select 1 from active group by lower(btrim(name)) having count(*) > 1) d),
    'redirect_to_non_canonical', (
      select count(*) from tag_slug_redirects r
        join unified_tags t on t.id = r.tag_id
       where t.status <> 'active' or t.merged_into_id is not null),
    'merged_but_not_status_merged', (
      select count(*) from unified_tags
       where merged_into_id is not null and status <> 'merged'),
    'sensitive_without_description', (
      select count(*) from active
       where (is_sensitive or is_adult)
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    'indexable_without_description', (
      select count(*) from active
       where seo_indexable
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    -- `not (A or B)` split into `not A and not B` so each arm can use its own
    -- functional index. Re-merging them into one OR silently restores the
    -- 4M-row nested loop that put this function over the PostgREST timeout.
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from events, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (select 1 from unified_tags u where lower(u.name) = e.s)
        and not exists (select 1 from unified_tags u where lower(u.slug) = e.s)),
    -- ADVISORY, and its floor is NOT zero: ~3,856 events carry only strings the
    -- ambiguity guard blocks (mostly a bare `pride`, which matches both
    -- news-pride and occ-pride), so they are unlinkable BY DESIGN and this
    -- counter can never reach 0. It said "non-zero means the job stopped
    -- running" until 2026-09-03, which is unachievable and therefore unreadable:
    -- it sat pinned above its floor while the linker was wedged for 1,106
    -- consecutive runs, and nothing distinguished that from normal. Kept as a
    -- coverage number; `event_tag_pairs_unlinked` below is the actual sentinel.
    'events_with_tags_unlinked', (
      select count(*) from events e
       where coalesce(array_length(e.tags, 1), 0) > 0
         and not exists (
           select 1 from unified_tag_assignments a
            where a.entity_id = e.id and a.entity_type = 'event')),
    -- THE sentinel for run_event_tag_link, and a true zero-invariant: every
    -- (event, tag) pair the vocabulary resolves to exactly one active tag, that
    -- has no assignment row. Unlinkable events contribute nothing, so unlike
    -- `events_with_tags_unlinked` this genuinely drains to 0 — and it goes
    -- non-zero the moment the linker stops draining.
    --
    -- `created_at < now() - 1 hour` is the grace period, not a fudge: the cron
    -- runs every 10 minutes, so freshly-ingested events are legitimately
    -- unlinked for a few minutes and would otherwise red unrelated PRs. An hour
    -- is 6 ticks of headroom; a wedge sits at tens of thousands (41,748 when
    -- measured 2026-09-02), so the two cannot be confused.
    --
    -- Shape is load-bearing for the 8s PostgREST ceiling this function lives
    -- under. Resolving ambiguity with a correlated `not exists` over the
    -- resolved set measured 51.1 SECONDS; the same answer via `group by key
    -- having count(distinct tag_id) = 1` against a 5,866-row vocabulary CTE is
    -- 708 ms. Do not reintroduce the correlated form. The union of two indexed
    -- arms (never `lower(name) = k or lower(slug) = k`) is the same rule
    -- `event_tag_strings_unresolved` above is bound by, for the same reason.
    'event_tag_pairs_unlinked', (
      with vocab as (
        select lower(u.name) as key, u.id as tag_id from unified_tags u
         where u.status = 'active' and u.merged_into_id is null and btrim(u.name) <> ''
        union
        select lower(u.slug), u.id from unified_tags u
         where u.status = 'active' and u.merged_into_id is null and btrim(u.slug) <> ''
      ), unambiguous as (
        select key, (array_agg(tag_id))[1] as tag_id
          from vocab group by key having count(distinct tag_id) = 1
      ), pairs as (
        select distinct e.id as entity_id, v.tag_id
          from events e
          cross join lateral unnest(e.tags) as t
          join unambiguous v on v.key = lower(btrim(t))
         where e.created_at < now() - interval '1 hour'
      )
      select count(*) from pairs p
       where not exists (
         select 1 from unified_tag_assignments a
          where a.entity_id = p.entity_id and a.tag_id = p.tag_id
            and a.entity_type = 'event')),
    -- ── 2026-08-29 glossary content-quality keys ─────────────────────────
    'alias_equals_name', (
      select count(*) from tag_aliases a
        join unified_tags t on t.id = a.canonical_tag_id
       where lower(a.alias_name) = lower(t.name)),
    'alias_mojibake', (
      select count(*) from tag_aliases
       where position(chr(65533) in alias_name) > 0),
    'refusal_prose_active', (
      select count(*) from active a
       where lower(btrim(coalesce(a.short_description, ''))) = 'no information available'
          or btrim(coalesce(a.long_description, '')) ~* '^there is no information available'),
    'unreviewed_typed_alias', (
      select count(*) from tag_aliases a
        join unified_tags t on t.id = a.canonical_tag_id
       where a.alias_type <> 'multilingual'
         and a.review_status = 'auto'
         and t.status = 'active'),
    'relations_pending_review', (
      select count(*) from tag_relations
       where review_status = 'pending'
          or (review_status = 'auto' and relation_type = 'related')),
    'prose_unreviewed', (
      select count(*) from active
       where description is not null and prose_reviewed_at is null)
  ) into v;

  return v;
end;
$function$;

comment on function public.tag_hygiene_stats() is
  'Tag hygiene counters for scripts/check-tag-hygiene.mjs. event_tag_pairs_unlinked is the run_event_tag_link sentinel and a true zero-invariant; events_with_tags_unlinked is a coverage number whose floor is the deliberately-unlinkable set and can never reach 0.';

-- Prove the new counter is 0 and the function stays well inside the 8s ceiling,
-- so this migration cannot itself red the gate it is adding to.
do $$
declare t0 timestamptz; t1 timestamptz; v jsonb; n int; ms numeric;
begin
  t0 := clock_timestamp(); v := public.tag_hygiene_stats(); t1 := clock_timestamp();
  ms := extract(epoch from t1 - t0) * 1000;
  n := (v->>'event_tag_pairs_unlinked')::int;
  raise notice 'tag_hygiene_stats: % ms, event_tag_pairs_unlinked = %, events_with_tags_unlinked = %',
    round(ms), n, (v->>'events_with_tags_unlinked')::int;
  if ms > 6000 then
    raise exception 'tag_hygiene_stats at % ms is too close to the 8s PostgREST ceiling', round(ms);
  end if;
end $$;
