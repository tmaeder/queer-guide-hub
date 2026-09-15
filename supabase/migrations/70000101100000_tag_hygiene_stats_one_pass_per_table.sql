-- tag_hygiene_stats(): one pass per hot table.
--
-- This function is the `Tag hygiene has not regressed` step of
-- `Critical data-quality gates`, a REQUIRED check on every PR. PostgREST
-- connects as `authenticator`, whose rolconfig pins statement_timeout = 8s;
-- `service_role` has no rolconfig, so `set role` does not raise it. On
-- 2026-09-14 the call took 8.3s and failed PR #3719 with 57014 — a PR whose
-- diff it has nothing to do with. It passed on re-run. Three other PRs called
-- the same function against the same database inside 40 seconds and passed.
--
-- The function had already been optimised once, for the `event_tag_strings_unresolved`
-- OR-to-two-arms split (see 20260928143000 and the header comment kept below),
-- and had crept back to 20-40% of the ceiling.
--
-- THE CAUSE WAS NOT THE ARM THAT WAS LOOKED AT. Measured on prod 2026-09-15
-- with `explain (analyze, buffers)` over the whole function body — buffers,
-- not wall time, because wall time on a warm cache hides physical I/O and is
-- what made the earlier reading point at the wrong arm:
--
--     counter                        blocks     ms
--     totals.assignments            153,102  164      <- index-only scan
--     assignment_to_non_active_tag  153,102  343      <- the SAME scan again
--     event_tag_pairs_unlinked       76,631  573
--     events_with_tags_unlinked      62,288  120
--     event_tag_strings_unresolved   18,005  224
--     everything else                31,869
--     TOTAL                         494,997 1,718 warm
--
-- Two thirds of the function is `unified_tag_assignments`, not `events`. The
-- two 153,102-block entries are the SAME index-only scan run twice, with
-- 210,470 heap fetches each — against a heap that is only 3,597 blocks. A
-- plain seq scan of that table costs 3,597 blocks and 77 ms, i.e. the index-only
-- scan is 42x worse than reading the whole table.
--
-- Why the planner chose it: `unified_tag_assignments` has never been vacuumed
-- or analysed (`last_vacuum`, `last_autovacuum`, `last_analyze`,
-- `last_autoanalyze` all NULL on 2026-09-15). Its `relallvisible` equals its
-- stale `relpages` (2,926, against a real 3,597), so the planner believes every
-- heap page is all-visible and the index-only scan needs no heap access at all.
-- It needs 210,470. `pg_stat_user_tables.n_live_tup` reads 14,922 for a table
-- holding 264,261 rows, so the row estimates are wrong in the same direction.
-- That is an operational condition this migration deliberately does NOT try to
-- fix: a migration runs inside a transaction and VACUUM cannot, and an ANALYZE
-- here would be undone by the next bulk write. What a migration CAN own is not
-- doing the same expensive scan five times, which is cheaper whether or not the
-- visibility map is healthy.
--
-- THE FIX is three shared CTEs, each read once and referenced by several
-- counters. A non-recursive CTE referenced more than once is not inlined, so
-- these materialise; `materialized` is written out anyway so the intent
-- survives a reader who does not know that rule. Verified from the plan, not
-- assumed:
--
--     scans of events                   3  ->  1
--     scans of unified_tag_assignments  5  ->  2   (and seq, not index-only)
--     total blocks                494,997  ->  57,585   (8.6x)
--     warm wall time                1,750 ms -> 1,390 ms
--
-- Warm wall time moves much less than blocks because a warm block is a
-- shared_buffers hit. Blocks are the number that matters here: the failure mode
-- is a COLD call, where those 437,000 extra blocks are physical reads. Quote
-- blocks when re-measuring this, not the warm milliseconds.
--
-- OUTPUT IS UNCHANGED. Verified on prod by evaluating the old function and the
-- new body in ONE statement, so both see one snapshot: `old = new` returned
-- true with no differing key. Re-run that comparison rather than eyeballing
-- counts if this body is ever restated — the corpus moves between calls.
--
-- Each shared CTE is equivalence-preserving for a reason worth stating once:
--
--   uta_rollup   `active` is keyed on `unified_tags.id` (primary key, unique),
--                so `not exists (select 1 from active t where t.id = a.tag_id)`
--                and `left join active t on t.id = a.tag_id where t.id is null`
--                count the same rows. The three counters folded in here are the
--                only three that read the whole table.
--
--   ev_assign    both remaining consumers filter `entity_type = 'event'`, so
--                the slice is pushed into the CTE and neither restates it.
--
--   ev           all three event counters are blind to an event with no tags:
--                `unnest` of an empty or null array yields no rows, and
--                `events_with_tags_unlinked` already carried the filter
--                explicitly. Restricting the shared set to non-empty `tags` is
--                therefore equivalent, and takes it from 49,020 rows to 36,924.
--                `created_at` stays on the CTE because `event_tag_pairs_unlinked`
--                needs its 1-hour grace window.
--
-- Everything else is 20261221100000 verbatim, including its header's own lesson
-- about `create or replace` applied out of version order. `unified_tags` is
-- untouched: it is scanned seven times, but it is 2,671 blocks and every scan
-- carries a different predicate, so folding those is a bigger change for about
-- 5% of the remaining cost.

create or replace function public.tag_hygiene_stats()
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
  ),
  -- ── ONE pass per hot table; see the migration header ─────────────────
  uta_rollup as materialized (
    select count(*) as total,
           count(*) filter (where t.id is null) as non_active,
           count(*) filter (where a.entity_type <> lower(btrim(a.entity_type))) as nonclean
      from unified_tag_assignments a
      left join active t on t.id = a.tag_id
  ),
  ev_assign as materialized (
    select a.entity_id, a.tag_id
      from unified_tag_assignments a
     where a.entity_type = 'event'
  ),
  ev as materialized (
    select e.id, e.tags, e.created_at
      from events e
     where coalesce(array_length(e.tags, 1), 0) > 0
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'active_tags', (select count(*) from active),
      'categories',  (select count(*) from tag_categories),
      'assignments', (select total from uta_rollup)
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
    'assignment_to_non_active_tag', (select non_active from uta_rollup),
    'nonclean_entity_type', (select nonclean from uta_rollup),
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
    'indexable_marketplace_facet', (
      select count(*) from active
       where seo_indexable
         and public.is_marketplace_facet(slug, entity_kind)),
    -- `not (A or B)` split into `not A and not B` so each arm can use its own
    -- functional index. Re-merging them into one OR silently restores the
    -- 4M-row nested loop that put this function over the PostgREST timeout.
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from ev, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (select 1 from unified_tags u where lower(u.name) = e.s)
        and not exists (select 1 from unified_tags u where lower(u.slug) = e.s)),
    -- Drains to 0 as the cron works through the backlog. Non-zero after that
    -- means the job stopped running.
    'events_with_tags_unlinked', (
      select count(*) from ev e
       where not exists (
         select 1 from ev_assign a where a.entity_id = e.id)),
    -- Carried forward from 20261211110000 (PR #3323), NOT authored here.
    --
    -- `create or replace` overwrites the whole body, so two branches that each
    -- restate this function do not conflict in git — the one that APPLIES last
    -- silently wins the entire key set. This migration sorts above 20261211110000
    -- and therefore applies after it, so omitting this counter would delete it.
    -- src/lib/__tests__/tagHygieneStats.test.ts asserts it survives in the latest
    -- definition, so that deletion fails CI rather than passing quietly.
    --
    -- What it is: THE sentinel for run_event_tag_link, and a true zero-invariant.
    -- `events_with_tags_unlinked` above cannot reach 0 — ~3,856 events carry only
    -- strings the ambiguity guard blocks by design — so it read "non-zero" for
    -- 1,106 consecutive runs while the linker was wedged. Pairs fix that: an
    -- unlinkable event contributes none.
    --
    -- Shape is load-bearing for the 8s PostgREST ceiling: resolving ambiguity with
    -- a correlated `not exists` over the resolved set measured 51.1 SECONDS; the
    -- `group by key having count(distinct tag_id) = 1` form below is 708 ms for the
    -- identical answer. The 1-hour grace period keeps a normal 10-minute cron lag
    -- from reding unrelated PRs.
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
          from ev e
          cross join lateral unnest(e.tags) as t
          join unambiguous v on v.key = lower(btrim(t))
         where e.created_at < now() - interval '1 hour'
      )
      select count(*) from pairs p
       where not exists (
         select 1 from ev_assign a
          where a.entity_id = p.entity_id and a.tag_id = p.tag_id)),
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
       where description is not null and prose_reviewed_at is null),
    -- ── 2026-09-02 language sentinels ────────────────────────────────────
    -- A slug that lost a diacritic to a hyphen (Bühne -> b-hne), because a
    -- producer hand-slugged without transliterating and its slug beat both DB
    -- triggers.
    --
    -- The non-ASCII term is LOAD-BEARING and must never be dropped. Without it
    -- the predicate matches 115 active rows of which only 8 are defects: the
    -- other 106 are DELIBERATE namespace prefixes on ASCII names (mat-silicone
    -- = 4,643 uses, news-education, occ-pride, genre-horror, vibe-bold), and
    -- "repairing" those renames them and breaks thousands of links.
    --
    -- status <> 'merged' is equally load-bearing: a merged row keeps its own
    -- slug as its redirect trail and resolves via merged_into_id, so repairing
    -- caf -> cafe would break the historical /tags/caf URL. Ten rows are
    -- legitimately lossy for that reason and must not be counted.
    'slug_diacritic_lossy', (
      select count(*) from unified_tags
       where status <> 'merged'
         and name ~ '[^\x00-\x7F]'
         and slug is distinct from public.normalize_tag_slug(name)),
    -- U+FFFD in a tag NAME. Mirrors the existing alias_mojibake idiom.
    -- Excludes merged for the same reason as above: exactly one row carries
    -- this today, `M?Llerian`, and it is merged — a frozen historical artifact
    -- whose name is a redirect key, not rendered prose. Recorded here rather
    -- than silently scoped away.
    'name_mojibake', (
      select count(*) from unified_tags
       where status <> 'merged'
         and position(chr(65533) in name) > 0),
    -- A scraped hashtag concatenation published as vocabulary
    -- ("Pulse #Mordopfer #Hassverbrechen" was a tag NAME, and indexable).
    'name_contains_hashtag', (
      select count(*) from unified_tags
       where status = 'active' and name like '%#%'),
    -- Asserts trg_tag_language_guard still holds. It rejects Cyrillic/CJK/
    -- Arabic/Greek/Hebrew/Thai/Devanagari outright, which is deterministic and
    -- cannot false-positive. Non-zero means the trigger was dropped or bypassed
    -- by a writer that does not go through it.
    'non_latin_name', (
      select count(*) from unified_tags
       where name ~ '[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ一-鿿가-힯]')
  ) into v;

  return v;
end;
$function$;

-- Postconditions. Assert the REACHED state, not the number of edits: a count of
-- changed things reads zero both when the work is already done and when it never
-- ran. These check the function as the database now holds it.
do $verify$
declare src text; n int;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname = 'public' and p.proname = 'tag_hygiene_stats';

  if src is null then
    raise exception 'tag_hygiene_stats is not defined';
  end if;

  -- The three shared CTEs exist.
  if position('uta_rollup as materialized' in src) = 0
     or position('ev_assign as materialized' in src) = 0
     or position('ev as materialized' in src) = 0 then
    raise exception 'a shared CTE is missing; the duplicated scans are back';
  end if;

  -- No counter reads the hot tables directly any more. `unified_tag_assignments`
  -- may appear exactly twice, once in each CTE that scans it; `events` exactly
  -- once, in `ev`. A third mention of either is a counter that re-scans.
  select count(*) into n from regexp_matches(src, 'from unified_tag_assignments', 'g');
  if n <> 2 then
    raise exception 'unified_tag_assignments is read % times, expected 2', n;
  end if;

  select count(*) into n from regexp_matches(src, 'from events', 'g');
  if n <> 1 then
    raise exception 'events is read % times, expected 1', n;
  end if;

  -- The 20260928143000 invariant this function was optimised for the first
  -- time. Re-merging the two arms into one OR restores a 4M-row nested loop.
  if position('or lower(u.slug)' in src) > 0 then
    raise exception 'event_tag_strings_unresolved re-merged its two NOT EXISTS arms';
  end if;

  -- The function still EXECUTES and still returns every counter. Calling it is
  -- the point: a body that is syntactically valid but references a CTE that is
  -- no longer in scope installs cleanly and fails at call time, in CI, on
  -- somebody else's PR. `assert_admin_or_internal()` returns early for a session
  -- with no JWT claims, which is what `db push` is, so this is reachable here.
  --
  -- 27, counted from the live response rather than from the SQL text, because
  -- check-tag-hygiene.mjs derives its metric list from that response too: a
  -- counter that vanishes is simply not checked, with no "expected metric
  -- missing" failure anywhere.
  select count(*) into n from jsonb_object_keys(public.tag_hygiene_stats());
  if n <> 27 then
    raise exception 'tag_hygiene_stats returns % top-level keys, expected 27', n;
  end if;
end $verify$;
