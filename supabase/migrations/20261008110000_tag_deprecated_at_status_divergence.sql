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
-- WHY THIS DOES NOT JUST WIDEN THE INDEXER. 64 of the 297 ARE still genuinely
-- orphaned and bare: German occupation fragments from the old slugifier
-- (`schauspieler`, `politiker`, `regisseur`, `grohandelskaufmann`), import
-- residue (`admiralduncan-mordopfer-hassverbrechen`), a bare date
-- (`december-29-1973`). Indexing those would add exactly the dead-end results
-- the audit existed to remove. They get the deprecation the audit intended.
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

-- NO `begin;` / `commit;` HERE, AND THAT IS THE ACTUAL ROOT CAUSE OF THE ABORT.
--
-- This file used to carry its own transaction. `supabase db push` opens one,
-- sends the migration body, and THEN inserts the `schema_migrations` row. The
-- explicit COMMIT closed that transaction early, so on 2026-08-29 11:55:14Z the
-- DATA committed (215 revived, 82 delisted, the constraint created) while the
-- VERSION was never recorded -- prod carried the full effects and `db push`
-- still considered the file pending. The next push re-ran it, hit
-- `42710 constraint already exists` on the un-guarded ADD below, and stopped
-- sixteen migrations short of the head.
--
-- So the guard alone is not enough: without removing the COMMIT the version
-- still never records and this file re-runs on every deploy forever.
-- `set local` works without it because db push supplies the transaction.

-- The audit stamped 51 human_reviewed rows; log_unified_tag_change() raises if a
-- `system:%` actor touches one, and 'system:trigger' is the default.
set local app.actor = 'migration:20261008110000';

-- ---------------------------------------------------------------------------
-- 1. Revive: the tag is linked, or is a glossary entry with its own content.
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
-- 2. Delist: still orphaned by the audit's own criterion and carrying no
--    content of its own. deprecated_at already says so; status now agrees.
-- ---------------------------------------------------------------------------
update public.unified_tags t
   set status = 'deprecated'
 where t.status = 'active'
   and t.deprecated_at is not null;

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
--    Guarded because this file's OWN earlier run created the constraint — see the
--    transaction note at the top; nobody hand-applied it — and a bare ADD
--    CONSTRAINT raises 42710 ("already exists"), which aborts the push and takes
--    every LATER migration with it.
--    That is what happened at 12:30Z: sixteen migrations applied, then this one
--    stopped the queue. Skipping when present loses nothing, because the
--    existing constraint is definitionally identical
--    (`CHECK (((status = 'active'::text) = (deprecated_at IS NULL)))`,
--    convalidated) and the assertion below runs either way.
do $constraint$
begin
  if not exists (
    select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'unified_tags'
       and c.conname = 'unified_tags_status_matches_deprecated_at'
  ) then
    alter table public.unified_tags
      add constraint unified_tags_status_matches_deprecated_at
      check ((status = 'active') = (deprecated_at is null));
  end if;
end
$constraint$;

do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.unified_tags
   where (status = 'active') <> (deprecated_at is null);
  if v_bad <> 0 then
    raise exception 'status/deprecated_at divergence not cleared: % rows', v_bad;
  end if;
end $$;
