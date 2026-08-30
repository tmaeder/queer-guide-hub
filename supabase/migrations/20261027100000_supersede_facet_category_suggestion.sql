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
-- wrong. Nobody judged this one — the rule changed underneath it, which is
-- what superseded is for.

set local statement_timeout = '600s';

do $$
declare v_n int; v_left int;
begin
  perform set_config('app.actor', 'migration:20261023110000_supersede_facet_category_suggestion', true);

  update ai_suggestions s
     set status = 'superseded',
         review_notes = coalesce(s.review_notes || ' | ', '')
           || 'superseded 20261023110000: target is a marketplace facet (is_marketplace_facet), which belongs to no glossary category'
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

  raise notice 'facet suggestions: superseded %', v_n;
end $$;
