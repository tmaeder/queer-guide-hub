-- `status` and `deprecated_at` disagreed, and the two reader surfaces read
-- different columns, so the same tag was simultaneously a live page and absent
-- from site search.
--
--   fetchTagWithCategories        -> status = 'active'        (renders /tags/:slug)
--   search_documents_index_tags   -> deprecated_at is null    (indexes into search)
--
-- 299 rows sat in a state where those two answers differ:
--   297 x  status='active'     + deprecated_at NOT NULL -> page live, NOT searchable
--     2 x  status='deprecated' + deprecated_at NULL     -> page 404s, IS searchable
--
-- WHO WROTE IT. The 2026-06-05 audit did its job correctly: it set BOTH columns
-- (tag_change_log shows 219 rows moving active->deprecated with the timestamp in
-- the same statement). What un-did it is `source-tags-extract`, node 1 of the
-- weekly `tags-ingestion` DAG (`0 5 * * 0`). It re-derives tag names from the
-- free-text `venues.tags` / `events.tags` / `personalities.tags` arrays and
-- upserts `{name, slug, status:'active'}` on conflict (slug) -- so ON CONFLICT
-- DO UPDATE wrote `status` back to 'active' and never touched `deprecated_at`.
-- Every revival in the log lands Sunday 05:00-05:01 in ~200-row chunks (that
-- function's CHUNK size), across 2026-06-07, 06-14, 06-21, 08-02, 08-09, 08-16
-- and 08-23. The companion PR makes that upsert insert-only, which is the
-- correct semantics for a node whose job is minting vocabulary from scraped
-- free text -- it has no business overwriting a curated row.
--
-- WHY THE AUDIT'S VERDICT NO LONGER HOLDS. Its criterion was "no entity
-- assignments, relations, synonyms, or aliases". Measured against
-- `unified_tag_assignments`, which on 2026-06-05 held 5,439 rows of the 181,950
-- it holds today -- 3%. The reconciler that populates it from those same
-- free-text arrays, `run_tag_assignment_reconcile`, shipped in
-- `20260607144000`, TWO DAYS AFTER the audit. So the audit was not measuring
-- orphanhood; it was measuring the reconciler's absence. Re-running its exact
-- criterion today: 190 of the 297 have real links, and 43 more are glossary
-- entries carrying prose / a wikidata id / diagnostic codes but no assignments
-- (a definition is content even when nothing is tagged with it). The head of
-- the list is core platform vocabulary -- `lgbtiq` (3,234 assignments), `berlin`
-- (1,706), `sauna` (1,370), `kink` (1,361), `clothing-optional` (1,690) -- none
-- of them returnable by site search for the last three months.
--
-- WHY THIS DOES NOT JUST WIDEN THE INDEXER. Exactly ONE of the 297 is dead
-- (`lavenderscare-suizid`) and it gets the deprecation the audit intended.
--
-- That number was 64 before the free-text check in step 0 existed, and the
-- 63-row difference is this migration's own lesson repeating one level down. A
-- first pass classified by the junction table alone -- the same source the
-- 2026-06-05 audit trusted -- and condemned `schriftsteller`, `aktivist`,
-- `schauspieler` and `politiker` as bare orphans. They are carried by 642, 475,
-- 452 and 416 personality records. They hold no junction rows only because
-- `run_tag_assignment_reconcile` reads `venues`, `news_articles` and
-- `community_groups` and NEVER `personalities` or `events`. **A coverage gap in
-- the instrument is indistinguishable from absence in the thing measured.**
--
-- `usage_count` cannot be used as the second opinion either: the same reconciler
-- recomputes it from the same junction table, so all 64 read `usage_count = 0`
-- while hundreds of personality records carried them. Two "independent" signals
-- that share an upstream are one signal.
--
-- FOLLOW-UP, deliberately not done here: `run_tag_assignment_reconcile` should
-- probably cover `personalities` and `events` too. That would create thousands
-- of junction rows and a matching reindex wave, so it is its own change with its
-- own batching decision -- not a rider on a repair migration.
--
-- The split falls on a line already drawn in the data: of the 297, ZERO
-- seo_indexable rows are bare orphans and ZERO bare orphans are seo_indexable.
-- The SEO gate has been classifying this cohort correctly all along, entirely
-- independently of `deprecated_at`. Note this migration does NOT make search
-- follow `seo_indexable` -- 890 of the 3,748 currently-indexed tags are
-- `seo_indexable=false`, so noindex-for-crawlers deliberately does not mean
-- absent-from-site-search, and that convention is left alone.
--
-- Finally the state is made unrepresentable, because the divergence is only
-- possible while two columns can contradict each other and each reader believes
-- a different one.

-- NO explicit `begin;`/`commit;` in this file, deliberately, and this is the
-- reason the bad revision's damage persisted while its bookkeeping did not.
-- `supabase db push` sends the migration and then INSERTs the
-- `supabase_migrations.schema_migrations` row; an explicit COMMIT inside the
-- file closes that transaction early, so on 2026-08-29 the data changes stuck
-- and the version was never recorded -- the migration stayed "pending" while
-- prod already carried its effects. Every writer here therefore runs inside one
-- DO block, matching the pattern in `20261006140100_tag_refile_deterministic`
-- and `20261006140000_tag_taxonomy_v3_tree`, both of which verifiably set
-- `app.actor` on prod.
do $migration$
declare
  v_delisted int;
  v_bad      int;
begin

-- The audit stamped 51 human_reviewed rows; log_unified_tag_change() raises if a
-- `system:%` actor touches one, and 'system:trigger' is the default. It must be
-- set INSIDE this block: set_config(..., true) is transaction-local, and a bare
-- `set local` outside a transaction only warns and does nothing.
perform set_config('app.actor', 'migration:20261008110000', true);

-- ---------------------------------------------------------------------------
-- 0. Every tag string any entity actually carries, from the free-text `tags[]`
--    arrays THEMSELVES rather than from the junction table.
--
--    THIS IS THE LOAD-BEARING STEP, and leaving it out reproduces the very
--    mistake this migration exists to correct. `run_tag_assignment_reconcile`
--    materializes `unified_tag_assignments` from `venues`, `news_articles` and
--    `community_groups` -- it does NOT read `personalities` or `events`. So a
--    tag carried only by those two tables has zero junction rows and looks
--    exactly like an orphan, which is the same coverage-gap-mistaken-for-
--    orphanhood that made the 2026-06-05 audit wrong in the first place.
--
--    Measured: 54 of the 64 rows a junction-only test called "bare orphans" are
--    live German profession vocabulary on personality records --
--    `schriftsteller` on 642 people, `strafverfolgung` on 491, `aktivist` on
--    475, `schauspieler` on 452, `politiker` on 416. Delisting those would have
--    pointed a tag chip on 642 personality pages at a 404.
--
--    Built once as a set rather than as a correlated EXISTS per tag, so each of
--    the four tables is scanned once instead of ~300 times.
-- ---------------------------------------------------------------------------
create temp table _referenced_tag_keys on commit drop as
  select distinct lower(trim(tag)) as k
  from (
    select unnest(tags) as tag from public.venues          where tags is not null
    union all
    select unnest(tags)           from public.events        where tags is not null
    union all
    select unnest(tags)           from public.personalities where tags is not null
    union all
    select unnest(tags)           from public.news_articles where tags is not null
  ) s
  where tag is not null and trim(tag) <> '';
create index on _referenced_tag_keys (k);

-- ---------------------------------------------------------------------------
-- 0b. SELF-REPAIR of a previous run of THIS migration.
--
--     An earlier revision of this file shipped without the step-0 free-text
--     check and ran on prod at 2026-08-29 11:55:14Z. It committed -- 215 revived,
--     82 delisted -- but `supabase_migrations` never recorded the version,
--     because this file carries its own `begin;`/`commit;` and the explicit
--     COMMIT closed the transaction before db push could write its bookkeeping
--     row. So the data changed and the migration still counts as pending, which
--     is why this corrected file gets to run again at all.
--
--     81 of those 82 were wrongly delisted -- live German profession vocabulary.
--     Step 1 below cannot rescue them: it only considers rows that are still
--     `status='active'`, and these are now `deprecated`. They are identified
--     from `tag_change_log` by this migration's own actor string, which is
--     exact -- no guessing at which rows were ours -- and re-checked against the
--     free-text set so a row that genuinely deserved delisting stays delisted.
--
--     Harmless on a database where the bad revision never ran: the change-log
--     predicate simply matches nothing.
-- ---------------------------------------------------------------------------
update public.unified_tags t
   set status             = 'active',
       deprecated_at      = null,
       deprecation_reason = null
 where t.status = 'deprecated'
   and exists (
     select 1 from public.tag_change_log l
      where l.tag_id = t.id
        and l.actor = 'migration:20261008110000'
        and l.before_data->>'status' = 'active'
        and l.after_data->>'status'  = 'deprecated'
   )
   and (
        exists (select 1 from _referenced_tag_keys k where k.k in (t.slug, lower(t.name)))
     or exists (select 1 from public.unified_tag_assignments a where a.tag_id = t.id)
   );

-- ---------------------------------------------------------------------------
-- 1. Revive: the tag is linked, is referenced by an entity's own free text, or
--    is a glossary entry with content of its own.
--    Clearing deprecated_at is what puts it back into search_documents --
--    trg_search_documents_tag lists both deprecated_at and status in its
--    UPDATE OF scope, so the reindex enqueues without an explicit call.
-- ---------------------------------------------------------------------------
with revive as (
  select t.id
  from public.unified_tags t
  where t.status = 'active'
    and t.deprecated_at is not null
    and (
         exists (select 1 from public.unified_tag_assignments a where a.tag_id = t.id)
      or exists (select 1 from public.tag_relations r where r.source_tag_id = t.id or r.target_tag_id = t.id)
      or exists (select 1 from public.search_synonyms s where s.tag_id = t.id)
      or exists (select 1 from public.tag_aliases al where al.canonical_tag_id = t.id)
      or exists (select 1 from _referenced_tag_keys k where k.k in (t.slug, lower(t.name)))
      or coalesce(length(t.long_description), 0) >= 200
      or t.wikidata_id is not null
      or exists (select 1 from public.tag_medical_codes mc where mc.tag_id = t.id)
    )
)
update public.unified_tags t
   set deprecated_at      = null,
       deprecation_reason = null
  from revive r
 where t.id = r.id;

-- ---------------------------------------------------------------------------
-- 2. Delist: whatever step 1 did not revive. Nothing links it, no entity's free
--    text mentions it, and it has no content of its own. deprecated_at already
--    says so; status now agrees, and the page stops resolving.
--
--    Measured at ONE row, `lavenderscare-suizid` -- a hashtag fragment from the
--    German import, `usage_count = 0` and already `seo_indexable = false`, so it
--    is reachable from neither search nor a sitemap.
--
--    The count is asserted below rather than trusted. If a future re-run would
--    delist a large set, that is the signal that the reference check has gone
--    blind again (a renamed column, a new entity table nobody added here) and it
--    must fail rather than quietly 404 live vocabulary.
-- ---------------------------------------------------------------------------
-- The UPDATE lives inside the block because GET DIAGNOSTICS only reports the
-- row count of a statement in its OWN PL/pgSQL block -- a separate `do $$` after
-- a bare UPDATE reads zero and the guard would pass vacuously.
update public.unified_tags t
     set status = 'deprecated'
   where t.status = 'active'
     and t.deprecated_at is not null;
  get diagnostics v_delisted = row_count;

  raise notice 'tag divergence repair: delisted % row(s)', v_delisted;
  if v_delisted > 25 then
    raise exception 'refusing to delist % tags: expected ~1. The free-text reference check in step 0 has probably gone blind -- verify it before re-running.', v_delisted;
  end if;

-- ---------------------------------------------------------------------------
-- 3. The mirror image: deprecated with no timestamp, so the page 404s while the
--    row stays in search. Two rows (`craig-johnston`, `sonja-eggerickx`).
--    Stamped rather than revived -- the 404 is the surface a human chose.
-- ---------------------------------------------------------------------------
update public.unified_tags
   set deprecated_at      = coalesce(deprecated_at, now()),
       deprecation_reason = coalesce(deprecation_reason,
         'migration 20261008110000: status was deprecated with no deprecated_at, so the page 404''d while the row stayed in search')
 where status = 'deprecated'
   and deprecated_at is null;

-- ---------------------------------------------------------------------------
-- 4. Make the contradiction unrepresentable. 'merged' rows all carry a
--    timestamp (192/192) and must keep it, so the constraint is stated as the
--    equivalence the two readers assume: active <=> not deprecated.
-- ---------------------------------------------------------------------------
end $migration$;

-- DROP-then-ADD, because the bad revision described in step 0b already created
-- this constraint on prod and a bare ADD would abort the re-run with
-- "constraint already exists" -- leaving the 81 wrongly-delisted tags dead and
-- blocking every later migration in the queue behind it.
alter table public.unified_tags
  drop constraint if exists unified_tags_status_matches_deprecated_at;
alter table public.unified_tags
  add constraint unified_tags_status_matches_deprecated_at
  check ((status = 'active') = (deprecated_at is null));

do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.unified_tags
   where (status = 'active') <> (deprecated_at is null);
  if v_bad <> 0 then
    raise exception 'status/deprecated_at divergence not cleared: % rows', v_bad;
  end if;
end $$;

