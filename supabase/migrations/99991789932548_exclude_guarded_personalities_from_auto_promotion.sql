-- A guarded personality is not auto-promotable. The original selector omitted
-- needs_attention, so rows rejected by date/outing safety triggers reappeared
-- as "Promotable" and were retried by automation.
create or replace function public.personalities_promotable(p_limit int default 500)
returns table (
  id uuid,
  name text,
  lgbti_relevance_score numeric,
  lgbti_connection text,
  has_bio boolean,
  has_image boolean,
  wikidata_qid text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    p.id, p.name, p.lgbti_relevance_score, p.lgbti_connection,
    (p.bio is not null and length(trim(p.bio)) > 30) as has_bio,
    (p.image_url is not null) as has_image,
    p.wikidata_qid
  from public.personalities p
  where p.visibility = 'draft'
    and p.duplicate_of_id is null
    and coalesce(p.review_status, '') <> 'archived'
    and not coalesce(p.needs_attention, false)
    and p.is_adult = false
    and p.lgbti_relevance_score >= 0.7
    and (
      (p.bio is not null and length(trim(p.bio)) > 30)
      or (p.description is not null and length(trim(p.description)) > 30)
    )
    and p.image_url is not null
    and p.wikidata_qid is not null
    and p.wikidata_qid not like 'SKIP_%'
    and coalesce(p.enrichment_status->'personhood'->>'verdict', '') <> 'non_person'
  order by p.lgbti_relevance_score desc, p.view_count desc nulls last, p.name
  limit greatest(p_limit, 1);
$$;

comment on function public.personalities_promotable(int) is
  'Unguarded personalities eligible for Moderate-gate auto-publish: no attention flag, non-adult, relevance>=0.7, bio/description + image + real Wikidata QID, not a non-person, draft and not archived.';

do $verify$
begin
  if exists(
    select 1 from public.personalities_promotable(100000) x
    join public.personalities p using(id)
    where p.needs_attention
  ) then
    raise exception 'guarded personality leaked into auto-promotion selector';
  end if;
end
$verify$;
