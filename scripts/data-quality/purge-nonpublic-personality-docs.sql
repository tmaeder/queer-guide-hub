-- C-2 (audit 2026-06-05). Run in a loop until it affects 0 rows. Removes search
-- docs for personalities that are no longer public (demoted to draft / private).
-- Batched (ctid-limited) because search_documents holds vector embeddings and a
-- single delete exceeds the statement timeout.
delete from public.search_documents
 where ctid in (
   select sd.ctid
     from public.search_documents sd
     join public.personalities p on p.id = sd.entity_id
    where sd.entity_type = 'personality' and p.visibility <> 'public'
    limit 3000
 );
