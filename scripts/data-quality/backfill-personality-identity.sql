-- One-shot batched backfill for C-2 (audit 2026-06-05). Run in a loop until it
-- affects 0 rows. Each pass touches <=500 rows once (single search_documents
-- re-index per row) so it completes well under the statement timeout.
--   * preserves the raw label in lgbti_connection_source (provenance)
--   * demotes public, living "Gay adult performer" rows to draft (human review)
--   * remaps the two unconsented scrape values to the non-asserting 'unclear'
-- Drain condition: WHERE lgbti_connection still holds a raw value.
update public.personalities p
   set lgbti_connection_source = coalesce(p.lgbti_connection_source, p.lgbti_connection),
       visibility = case
         when p.lgbti_connection = 'Gay adult performer'
              and p.visibility = 'public' and p.is_living
         then 'draft' else p.visibility end,
       lgbti_connection = 'unclear',
       updated_at = now()
 where p.id in (
   select id from public.personalities
   where lgbti_connection in ('Gay adult performer', 'lgbtq_listed_source')
   order by id limit 500
 );
