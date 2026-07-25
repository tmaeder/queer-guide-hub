-- P0 Task 2 review fix: the 6 legacy tag_relations rows were relation_type='distinct_from'
-- (anti-merge guards for confusable concepts: Trans/Non-Binary, HIV/AIDS, Non-Binary/Intersex,
-- Drag/Trans, Non-Binary/Trans, Queer History/Pride). Task 2 folded them to 'related', which would
-- let semantic-dedup MERGE them. Preserve the "keep distinct" intent in the purpose-built
-- tag_relationship_exclusions table, and remove them from the positive-relation curated graph.
--
-- NOTE: tag_relationship_exclusions enforces CHECK (tag1_id < tag2_id) + UNIQUE (tag1_id, tag2_id),
-- i.e. one canonical row per unordered pair. Two of the six legacy rows (ids 83dd… and 9d76…) are
-- the SAME unordered pair Non-Binary<->Trans in opposite directions, so they collapse to a single
-- exclusion. We canonicalize endpoints with least()/greatest() and DISTINCT the doubled pair, then
-- delete all six legacy rows from tag_relations. Result: 5 distinct exclusions, 0 legacy relations.
insert into public.tag_relationship_exclusions (tag1_id, tag2_id, reason)
select distinct
       least(r.source_tag_id, r.target_tag_id)    as tag1_id,
       greatest(r.source_tag_id, r.target_tag_id) as tag2_id,
       'legacy distinct_from — confusable concepts, do not auto-merge (P0 Task 2 review fix)'
from public.tag_relations r
where r.id in (
  '3228eb1f-88ce-459b-a6b7-7e9812d75b9a','4c0e29bd-5ae5-477b-9e87-8a1c13ac99d8',
  '83dd14eb-6771-41b5-9974-d476707e7466','9915e44a-cf1d-45b0-aa70-79cac73b7550',
  '9d76d61d-9c9d-4548-95de-34d13c5f77e2','c10510d6-5877-45e8-b268-1a03400ea577')
  and not exists (
    select 1 from public.tag_relationship_exclusions e
    where e.tag1_id = least(r.source_tag_id, r.target_tag_id)
      and e.tag2_id = greatest(r.source_tag_id, r.target_tag_id));

delete from public.tag_relations
where id in (
  '3228eb1f-88ce-459b-a6b7-7e9812d75b9a','4c0e29bd-5ae5-477b-9e87-8a1c13ac99d8',
  '83dd14eb-6771-41b5-9974-d476707e7466','9915e44a-cf1d-45b0-aa70-79cac73b7550',
  '9d76d61d-9c9d-4548-95de-34d13c5f77e2','c10510d6-5877-45e8-b268-1a03400ea577');
