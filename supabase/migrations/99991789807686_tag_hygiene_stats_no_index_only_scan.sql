-- tag_hygiene_stats(): stop using index-only scans.
--
-- This function is the `Tag hygiene has not regressed` step of
-- `Critical data-quality gates`, a REQUIRED check on every PR. PostgREST
-- connects as `authenticator`, whose rolconfig pins statement_timeout = 8s;
-- `service_role` has no rolconfig, so `set role` does not raise it. It has now
-- timed out with 57014 four times -- most recently 2026-09-18 -- each time on a
-- PR whose diff it has nothing to do with, and each time passing on re-run.
-- That is a cold-call margin problem, not a correctness bug.
--
-- THE EVENTS HALF WAS INVESTIGATED AND IS NOT THE CAUSE. Recorded here so the
-- next reader does not re-derive it: a covering partial index on events
-- (`(id) include (tags, created_at) where coalesce(array_length(tags,1),0) > 0`,
-- 471 pages) was BUILT AND MEASURED in a rolled-back transaction on prod and
-- takes the `ev` CTE from 16,112 blocks to 6,294. Real, and only 9.6% of the
-- total. It is deliberately NOT shipped -- see the bottom of this header.
--
-- THE CAUSE IS `ev_assign`, THE CTE NEXT TO THE ONE THE LAST PASS FIXED.
-- Measured on prod 2026-09-18 by BUFFERS over the whole function body -- never
-- warm wall time, which has pointed at the wrong arm twice in this function's
-- history:
--
--     ev_assign (index-only scan, 64,714 heap fetches)  45,945 blk   46%
--     event_tag_strings_unresolved (incl. the ev scan)  17,990 blk   18%
--     denorm_category_missing                            5,668 blk
--     event_tag_pairs_unlinked                           4,070 blk
--     uta_rollup (seq scan, WHOLE table)                 3,675 blk
--     everything else                                   ~22,951 blk
--     TOTAL                                            100,299 blk
--
-- `uta_rollup` reads all 264,185 rows of `unified_tag_assignments` in 3,675
-- blocks. `ev_assign` spends 45,945 blocks reading the 88,144-row
-- `entity_type = 'event'` SUBSET of that same table -- 12.5x worse than reading
-- the whole thing. The index it picks is
-- `unified_tag_assignments_tag_id_entity_id_entity_type_key`, where
-- `entity_type` is the THIRD column, so `Index Cond: (entity_type = 'event')`
-- is a filter applied while scanning the entire 24 MB index, not a seek -- and
-- then 64,714 heap fetches on top.
--
-- This is the SAME pathology 70000101100000 removed from `uta_rollup`, in the
-- CTE immediately below it, and it is the THIRD recorded occurrence on this
-- instance. The mechanism is that the planner believes heap fetches are free:
-- `pg_class.relallvisible` is only updated by VACUUM/ANALYZE, writes since then
-- clear visibility-map bits without touching it, and these tables are written
-- continuously. Measured the same day: `unified_tag_assignments` reads
-- relallvisible = relpages = 3,675, i.e. the planner expects ZERO heap fetches,
-- and the scan performs 64,714.
--
-- A MIGRATION CANNOT FIX THE VISIBILITY MAP -- VACUUM cannot run inside a
-- transaction, and an ANALYZE here is undone by the next bulk write. What it
-- CAN do is stop this function depending on the visibility map at all. Every
-- arm is either a whole-table aggregation or a small indexed lookup; none of
-- them benefits from an index-only scan, and each one is a latent 12x
-- regression waiting on the next autovacuum lag.
--
--     scans changed         ev_assign 45,945 -> 3,675 (seq)
--                           tag_category_assignments IOS -> seq
--     total blocks         100,299 -> 55,149   (1.82x)
--
-- WALL TIME IS A WASH AND THAT IS EXPECTED -- alternated warm on prod, new
-- 1,681/1,079 ms against old 1,402/1,018 ms. The seq scan pays CPU to discard
-- 176,041 non-event rows that the index scan skipped; it saves 45,150 BLOCKS.
-- Warm, every one of those blocks is a shared_buffers hit and the trade looks
-- flat. The failure mode is the COLD call, where they are physical reads. Quote
-- blocks when re-measuring this. Do not "re-optimise" it on a stopwatch.
--
-- WHY THE EVENTS INDEX IS NOT ALSO SHIPPED. It would take the total to ~48,211
-- instead of 55,149 -- about 7k more blocks -- and it costs a new index on
-- `events`, a 126 MB table on the ingest write path, whose CREATE INDEX takes a
-- write-blocking SHARE lock. Worse, it BUYS BACK the exact dependency this
-- migration exists to remove: it only pays while the visibility map is fresh.
-- Its 6,294-block reading was taken 7 minutes after an autovacuum and already
-- carried 5,868 heap fetches. 7k blocks is not worth re-acquiring the failure
-- mode. If the events half ever does need attention, fix the visibility map
-- (autovacuum settings on `events`), not the query.
--
-- OUTPUT IS UNCHANGED, and structurally so: this is a planner directive, which
-- cannot change a result. Verified anyway, on prod, in ONE statement so both
-- sides see one snapshot -- `old = new` returned true with no differing key.
-- The probe function was built by injecting this one line into
-- `pg_get_functiondef()` of the LIVE function, so the body it compared against
-- was byte-identical by construction rather than by retyping.
--
-- THE BODY BELOW IS 70000101100000 VERBATIM (prosrc md5
-- a7ed49bf570ac4e02b43dbf2d5936bde, verified equal to the live function before
-- this file was written, so nothing concurrent is being reverted). The ONLY
-- change is the SET clause.

create or replace function public.tag_hygiene_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 -- The whole change. See the header: every index-only scan in this function is
 -- a bet that the visibility map is fresh, and on this instance it is not.
 SET enable_indexonlyscan TO 'off'
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
declare src text; n int; cfg text[];
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname = 'public' and p.proname = 'tag_hygiene_stats';

  if src is null then
    raise exception 'tag_hygiene_stats is not defined';
  end if;

  -- THE CHANGE THIS MIGRATION EXISTS FOR.
  --
  -- `create or replace function` RESETS proconfig wholesale when the new
  -- definition omits the SET clause. So a later restatement that forgets this
  -- one line silently reinstates the 45,945-block index-only scan while every
  -- other assertion in this block still passes, and the gate goes back to
  -- flaking on unrelated PRs with nothing anywhere saying why. Both settings are
  -- asserted: adding the second must not cost the first, and losing search_path
  -- on a SECURITY DEFINER function is a security defect, not a performance one.
  select p.proconfig into cfg
    from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname = 'public' and p.proname = 'tag_hygiene_stats';

  if cfg is null or not ('enable_indexonlyscan=off' = any(cfg)) then
    raise exception
      'tag_hygiene_stats lost SET enable_indexonlyscan=off; the ev_assign index-only scan is back (proconfig=%)',
      cfg;
  end if;

  if not ('search_path=public' = any(cfg)) then
    raise exception 'tag_hygiene_stats lost SET search_path=public (proconfig=%)', cfg;
  end if;

  -- ── 70000101100000's invariants, carried forward unchanged ───────────────
  -- The three shared CTEs exist.
  if position('uta_rollup as materialized' in src) = 0
     or position('ev_assign as materialized' in src) = 0
     or position('ev as materialized' in src) = 0 then
    raise exception 'a shared CTE is missing; the duplicated scans are back';
  end if;

  -- No counter reads the hot tables directly. `unified_tag_assignments` may
  -- appear exactly twice, once in each CTE that scans it; `events` exactly once,
  -- in `ev`. A third mention of either is a counter that re-scans.
  select count(*) into n from regexp_matches(src, 'from unified_tag_assignments', 'g');
  if n <> 2 then
    raise exception 'unified_tag_assignments is read % times, expected 2', n;
  end if;

  select count(*) into n from regexp_matches(src, 'from events', 'g');
  if n <> 1 then
    raise exception 'events is read % times, expected 1', n;
  end if;

  -- The 20260928143000 invariant. Re-merging the two arms into one OR restores
  -- a 4M-row nested loop.
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
