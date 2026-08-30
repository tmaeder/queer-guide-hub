-- One pending suggestion asks to file a marketplace facet into the glossary.
--
-- `spandex` is the un-prefixed twin of `mat-spandex`; 20261012100000 unfiled it
-- and 20261018130000 taught every selector to skip its kind. The suggestion
-- predates both and would undo them if an admin approved it — the review queue
-- is the one path left that still writes a category by hand.
--
-- The producer is already closed (tags_due_for_category no longer offers
-- facets, so the sweep cannot mint another) and the applier now refuses one
-- via public.is_marketplace_facet(). This clears the row that was minted while
-- both holes were open, so the queue contains no suggestion that is designed
-- to fail.
--
-- 'superseded', not 'rejected': rejected means a human judged the proposal
-- wrong. Nobody judged these — the rule changed underneath them, which is
-- what superseded is for.
--
-- SECOND CLASS, same reason: 72 pending suggestions propose a category_id
-- that no longer exists. All 72 predate the v3 cutover and name a stop
-- 20261006150000 deleted — my own migration invalidated them. They are
-- unapprovable by construction, not merely stale:
-- tag_category_assignments.category_id carries a FK to tag_categories, so an
-- admin clicking approve gets a foreign-key violation, and 16% of the queue
-- is a landmine.
--
-- This is the same shape as the queue's other defect (#3212): a review queue
-- accumulating rows that CANNOT be actioned, in a queue nobody had worked
-- since 2026-06-07, so nothing ever surfaced it.

set local statement_timeout = '600s';

do $$
declare v_n int; v_stale int; v_left int;
begin
  perform set_config('app.actor', 'migration:20261023120000_supersede_facet_category_suggestion', true);

  update ai_suggestions s
     set status = 'superseded',
         review_notes = coalesce(s.review_notes || ' | ', '')
           || 'superseded 20261023120000: target is a marketplace facet (is_marketplace_facet), which belongs to no glossary category'
    from unified_tags t
   where t.id = s.entity_id
     and s.entity_type = 'unified_tags'
     and s.suggestion_type = 'category'
     and s.status = 'pending'
     and public.is_marketplace_facet(t.slug, t.entity_kind);
  get diagnostics v_n = row_count;

  select count(*) into v_left
    from ai_suggestions s
    join unified_tags t on t.id = s.entity_id
   where s.entity_type = 'unified_tags' and s.suggestion_type = 'category'
     and s.status = 'pending'
     and public.is_marketplace_facet(t.slug, t.entity_kind);
  if v_left > 0 then
    raise exception 'facet suggestions: % still pending', v_left;
  end if;

  -- Suggestions naming a category the v3 cutover deleted.
  update ai_suggestions s
     set status = 'superseded',
         review_notes = coalesce(s.review_notes || ' | ', '')
           || 'superseded 20261023120000: proposed category no longer exists (deleted by the v3 cutover, 20261006150000)'
   where s.entity_type = 'unified_tags'
     and s.suggestion_type = 'category'
     and s.status = 'pending'
     and not exists (
       select 1 from tag_categories c
        where c.id = (s.proposed_value->>'category_id')::uuid);
  get diagnostics v_stale = row_count;

  select count(*) into v_left
    from ai_suggestions s
   where s.entity_type = 'unified_tags' and s.suggestion_type = 'category'
     and s.status = 'pending'
     and not exists (
       select 1 from tag_categories c
        where c.id = (s.proposed_value->>'category_id')::uuid);
  if v_left > 0 then
    raise exception 'stale-category suggestions: % still pending', v_left;
  end if;

  raise notice 'superseded: % facet, % dangling-category', v_n, v_stale;
end $$;
