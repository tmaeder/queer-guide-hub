-- 72 pending category suggestions name a category that no longer exists.
--
-- All 72 predate the taxonomy-v3 cutover and propose a stop 20261006150000
-- deleted — that migration was mine, so this is my debris. They are
-- unapprovable BY CONSTRUCTION rather than merely stale:
-- tag_category_assignments.category_id carries a FK to tag_categories, so an
-- admin clicking approve gets a foreign-key violation. 16% of the review
-- queue was a landmine.
--
-- Nothing surfaced it because the queue has never been worked: zero of its
-- ~440 category suggestions have been approved or applied since 2026-06-07.
-- A queue nobody reads cannot report that its contents stopped being valid,
-- which is the same shape as the other defects this program found — a
-- producer with no consumer, and derived state outliving the thing it was
-- derived from.
--
-- 'superseded', not 'rejected': rejected means a human judged the proposal
-- wrong. Nobody judged these; the taxonomy changed underneath them.
--
-- Deliberately NOT touched: the remaining pending suggestions. 115 of them
-- are is_sensitive/is_adult, and approving one flips human_reviewed=true,
-- which by the apply path's own comment "releases the SEO index hold on
-- sensitive/adult tag pages" — publishing them to search engines. That is a
-- decision about sensitive and adult LGBTQ+ content and belongs to a person.
-- This clears what CANNOT be approved; it does not approve what can.

set local statement_timeout = '600s';

do $$
declare v_n int; v_left int;
begin
  perform set_config('app.actor', 'migration:20261027110000_supersede_dangling_category_suggestions', true);

  update ai_suggestions s
     set status = 'superseded',
         review_notes = coalesce(s.review_notes || ' | ', '')
           || 'superseded 20261027110000: proposed category no longer exists (deleted by the taxonomy-v3 cutover, 20261006150000)'
   where s.entity_type = 'unified_tags'
     and s.suggestion_type = 'category'
     and s.status = 'pending'
     and not exists (
       select 1 from tag_categories c
        where c.id = (s.proposed_value->>'category_id')::uuid);
  get diagnostics v_n = row_count;

  select count(*) into v_left
    from ai_suggestions s
   where s.entity_type = 'unified_tags'
     and s.suggestion_type = 'category'
     and s.status = 'pending'
     and not exists (
       select 1 from tag_categories c
        where c.id = (s.proposed_value->>'category_id')::uuid);
  if v_left > 0 then
    raise exception 'dangling category suggestions: % still pending', v_left;
  end if;

  raise notice 'superseded % dangling category suggestion(s)', v_n;
end $$;
