-- Known-item retrieval eval for search_hybrid (plan §8.2), run directly in SQL.
-- For a random sample of entities per type, query search_hybrid by the entity's
-- own title and measure the rank of its own doc in the top-10 → Recall@10 + MRR@10.
-- Label-free intrinsic quality proxy; run via psql or the Supabase SQL editor.
-- (No client timeout there, so the all-types pass below is fine; over PostgREST
-- it would exceed short RPC timeouts — sample fewer per type if you hit that.)
--
-- Baselines observed on the full corpus (2026-05-31):
--   country        Recall@10 1.00  MRR@10 1.00
--   marketplace    Recall@10 1.00  MRR@10 0.96
--   tag            Recall@10 1.00  MRR@10 0.95
--   personality    Recall@10 1.00  MRR@10 0.92
--   queer_village  Recall@10 1.00  MRR@10 0.86
--   city           Recall@10 1.00  MRR@10 0.77   (globally-duplicate city names)
--   venue          Recall@10 0.89  MRR@10 0.61   (the reliable regression gate)
--   event / news   intentionally noisier — events: past events are hidden and
--                  same-title recurring/per-city variants + the imminence boost
--                  mean a random future event isn't top-10 for its own bare title;
--                  news: ranked by relevance only (recency decay is a §14 follow-up).
--                  Judge these with distinctive queries, not bare titles.

-- All "stable-title" types in one pass (n per type configurable via the limit).
with sample as (
  select entity_type, entity_id, title,
         row_number() over (partition by entity_type order by random()) as rn
  from public.search_documents
  where title is not null and length(btrim(title)) >= 4
    and entity_type in ('venue','city','country','personality','tag','queer_village','marketplace')
),
s as (select * from sample where rn <= 80),
ranked as (
  select s.entity_type, s.entity_id,
    (select min(ord)
     from jsonb_array_elements(
       (public.search_hybrid(s.title, null, array[s.entity_type]::text[], '{}'::jsonb, null, null, null, now(), 10, 0))->'hits'
     ) with ordinality as h(val, ord)
     where (h.val->>'objectID') = s.entity_id::text) as rnk
  from s
)
select entity_type,
       count(*) as n,
       round((count(rnk)::numeric / count(*)), 3) as recall_at_10,
       round(avg(case when rnk is not null then 1.0 / rnk else 0 end)::numeric, 3) as mrr_at_10,
       count(*) filter (where rnk = 1) as rank1
from ranked
group by entity_type
order by recall_at_10 desc, mrr_at_10 desc;
