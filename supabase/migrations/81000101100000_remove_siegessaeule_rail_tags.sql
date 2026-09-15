-- Remove the five `siegessaeule-*` tags.
--
-- They are not vocabulary. `scripts/data-quality/import-berlin-events.mjs`
-- stamped the SOURCE'S OWN SECTION RAIL onto every row it imported —
-- siegessaeule.de/termine/ publishes five rails (mix, kultur, bars, clubs,
-- sex) and the importer wrote `siegessaeule-<rail>` straight through. The
-- result is a tag naming a foreign magazine's site navigation, filed in
-- `Venue Types`, `Culture & Community` and `Sex & Kink`, on 2,860 events:
--
--   siegessaeule-mix     1360   siegessaeule-sex     242
--   siegessaeule-kultur   906   siegessaeule-clubs    84
--   siegessaeule-bars     268
--
-- NOTHING IS LOST. The rail survives on the event itself — the importer
-- writes it to `metadata.category` (events) and `metadata.rails` (venues) —
-- so provenance is intact and only the reader-facing tag goes away.
--
-- DEPRECATED, NOT DELETED. A hard DELETE on `unified_tags` is unprecedented
-- in this repo and irreversible; deprecation is the house pattern and is
-- what actually removes a tag from every surface: measured, 0 of 5,271
-- deprecated tags are in `search_documents` against 4,725 of 4,725 active.
-- The assignments, relations, category rows and the free-text strings in
-- `events.tags` ARE deleted, because a deprecated tag with 2,860 live
-- assignments is still rendered by the event card and still a live search
-- facet (1,561 event documents carried it in `facets`).
--
-- The producer is sealed in the same change (both `siegessaeule-${…}`
-- expressions removed from the importer). It is a one-shot operator script
-- with NO cron and NO `admin_automations` row — verified, not assumed — so
-- sealing the script is the whole producer story; there is nothing to
-- disable and nothing that regenerates these nightly.
--
-- Dry-run on prod in a rolled-back transaction: assign=2860 rel=30 cat=5
-- events=2860 in 2912ms deprecated=5, residue 0/0/0.

do $$
declare
  v_ids uuid[];
  n_assign int;
  n_rel int;
  n_cat int;
  n_events int;
  n_tags int;
begin
  perform set_config('app.actor', 'migration:81000101100000_remove_siegessaeule_rail_tags', true);

  select array_agg(id) into v_ids from unified_tags where slug like 'siegessaeule-%';

  -- Soft on preconditions: a concurrent session may legitimately have merged
  -- or deprecated one of these already. Nothing to do is not a failure.
  if v_ids is null then
    raise notice 'no siegessaeule-* tags present; nothing to do';
    return;
  end if;

  delete from unified_tag_assignments where tag_id = any(v_ids);
  get diagnostics n_assign = row_count;

  delete from tag_relations where source_tag_id = any(v_ids) or target_tag_id = any(v_ids);
  get diagnostics n_rel = row_count;

  delete from tag_category_assignments where tag_id = any(v_ids);
  get diagnostics n_cat = row_count;

  -- `events.tags` is free text (which is how these landed: no normalizer gates
  -- it — `normalize_event_taxonomy` covers event_type/target_groups/
  -- accessibility/age_restriction and never touches `tags`). It feeds the
  -- search facet independently of the junction, so both have to be cleared.
  -- One statement: since the pipeline overhaul this enqueues into
  -- `search_reindex_queue` rather than indexing inline, measured at 2.9s for
  -- all 2,860 rows.
  update events
     set tags = (select coalesce(array_agg(x), '{}') from unnest(tags) x where x not like 'siegessaeule-%')
   where exists (select 1 from unnest(tags) y where y like 'siegessaeule-%');
  get diagnostics n_events = row_count;

  update unified_tags
     set status             = 'deprecated',
         seo_indexable      = false,
         usage_count        = 0,
         deprecated_at      = now(),
         deprecation_reason = 'scrape artifact: siegessaeule.de section rail, not vocabulary (81000101100000)'
   where id = any(v_ids)
     and status is distinct from 'deprecated';
  get diagnostics n_tags = row_count;

  raise notice 'siegessaeule: assignments=% relations=% categories=% events=% deprecated=%',
    n_assign, n_rel, n_cat, n_events, n_tags;
end $$;

-- Hard on postconditions: assert the state reached, not the rows changed.
-- Counting rows CHANGED passes trivially on a re-run; counting rows in the
-- BAD state is what a re-run and a concurrent repair both have to satisfy.
do $verify$
declare
  v_active int;
  v_assign int;
  v_events int;
  v_indexable int;
begin
  select count(*) into v_active from unified_tags where slug like 'siegessaeule-%' and status = 'active';
  select count(*) into v_indexable from unified_tags where slug like 'siegessaeule-%' and seo_indexable;
  select count(*) into v_assign
    from unified_tag_assignments a join unified_tags u on u.id = a.tag_id
   where u.slug like 'siegessaeule-%';
  select count(*) into v_events
    from events where exists (select 1 from unnest(tags) y where y like 'siegessaeule-%');

  if v_active <> 0 or v_indexable <> 0 or v_assign <> 0 or v_events <> 0 then
    raise exception 'siegessaeule residue: active=% indexable=% assignments=% events=%',
      v_active, v_indexable, v_assign, v_events;
  end if;
end $verify$;
