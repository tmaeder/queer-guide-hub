-- Known-item retrieval eval for search_hybrid (plan §8.2), run directly in SQL.
-- For a random sample of entities, query search_hybrid by the entity's own title
-- and measure the rank of its own doc in the top-10 → Recall@10 + MRR@10.
-- Label-free intrinsic quality proxy; run via psql or the Supabase SQL editor.
--
-- Baselines observed on the venues+events pilot (2026-05-31, n=200):
--   venue : Recall@10 0.89, MRR@10 0.61, rank-1 48%   <- clean signal
--   event : noisier — event titles are highly non-unique (recurring / per-city
--           variants) and the imminence boost ranks SOONER same-title events
--           first, so a randomly sampled future event is often not top-10 for
--           its own bare title. Past events are intentionally hidden. Use
--           distinctive queries (not bare titles) to judge event relevance.

-- Venues (the reliable gate; expect Recall@10 >= ~0.85):
with sample as (
  select entity_id, title
  from public.search_documents
  where entity_type = 'venue' and title is not null and length(title) >= 4
  order by random() limit 200
),
ranked as (
  select s.entity_id,
    (select min(ord)
     from jsonb_array_elements(
       (public.search_hybrid(s.title, null, array['venue']::text[], '{}'::jsonb, null, null, null, now(), 10, 0))->'hits'
     ) with ordinality as h(val, ord)
     where (h.val->>'objectID') = s.entity_id::text) as rnk
  from sample s
)
select 'venue' as entity_type,
       count(*) as n,
       round((count(rnk)::numeric / count(*)), 3) as recall_at_10,
       round(avg(case when rnk is not null then 1.0 / rnk else 0 end)::numeric, 3) as mrr_at_10,
       count(*) filter (where rnk = 1) as rank1
from ranked;
