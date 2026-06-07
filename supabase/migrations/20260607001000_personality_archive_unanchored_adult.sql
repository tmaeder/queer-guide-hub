-- Phase 1 of the personalities content-quality remediation
-- (docs/plans/2026-06-07-personalities-content-quality-design.md).
--
-- The corpus is 56% bulk-imported adult performers. Per the approved curation
-- decision: KEEP the Wikidata-anchored ones (~4,155, independently notable),
-- SOFT-ARCHIVE the unanchored remainder (~2,857, of which 752 carry no signal at
-- all). Reversible — no deletes.
--
-- "Archived" = review_status='archived' + seo_indexable=false + visibility=draft.
-- These rows are excluded from every public surface and from search, but stay in
-- the table with their provenance (lgbti_connection_source) intact.
--
-- Reverse key is the predicate itself (is_adult AND wikidata_qid IS NULL). This
-- gives a self-healing property: if Phase 2 reconciliation later assigns a
-- wikidata_qid to an archived row, it no longer matches the archive predicate and
-- can be promoted back out of the archive (see the unarchive helper below).
--
-- Disk note: of the 2,857 targets, all but 4 are already draft and only 4 are
-- present in search_documents, so the search-reindex cascade is trivial. Safe as
-- a single transactional statement.

begin;

update public.personalities
   set review_status   = 'archived',
       seo_indexable   = false,
       visibility      = 'draft',
       needs_attention = false,
       updated_at      = now()
 where duplicate_of_id is null
   and is_adult
   and wikidata_qid is null
   and review_status is distinct from 'archived';

-- Reversible: promote an archived adult row back to the review queue. Intended
-- for rows that since gained a provenance anchor (wikidata_qid) via Phase 2, or
-- for manual operator rescue. Returns the number of rows un-archived.
create or replace function public.unarchive_personality(p_id uuid)
returns integer
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  with upd as (
    update public.personalities
       set review_status   = 'pending',
           needs_attention = true,
           updated_at      = now()
     where id = p_id
       and review_status = 'archived'
    returning 1
  )
  select count(*)::integer from upd;
$$;

grant execute on function public.unarchive_personality(uuid) to authenticated, service_role;

commit;
