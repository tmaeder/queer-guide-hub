begin;

-- A country has one canonical cover compatibility URL. Remove stale cover
-- links left behind when a replacement was mirrored so duplicate detection and
-- health probes evaluate the image the page actually renders.
delete from public.image_asset_links l
using public.countries c, public.image_assets ia
where l.entity_type='country' and l.role='cover'
  and l.entity_id=c.id and l.asset_id=ia.id
  and c.duplicate_of_id is null
  and coalesce(c.curated_image_url,c.image_url) is not null
  and ia.url is distinct from coalesce(c.curated_image_url,c.image_url);

-- Provider licences and local-storage status are deterministic metadata. Keep
-- the normalized asset registry aligned with the compatibility country row.
update public.countries c
set image_metadata=coalesce(c.image_metadata,'{}'::jsonb)
  || case
    when c.image_metadata->>'source'='pexels' and nullif(c.image_metadata->>'license','') is null
      then jsonb_build_object('license','Pexels License')
    when c.image_metadata->>'source'='unsplash' and nullif(c.image_metadata->>'license','') is null
      then jsonb_build_object('license','Unsplash License')
    else '{}'::jsonb end
  || case when coalesce(c.curated_image_url,c.image_url,'') ~* '(img\.queer\.guide|/storage/v1/object/public/)'
      then jsonb_build_object('stored_locally',true) else '{}'::jsonb end,
    updated_at=now()
where c.duplicate_of_id is null;

update public.image_assets ia
set source=coalesce(nullif(c.image_metadata->>'source',''),ia.source),
    source_ref=coalesce(nullif(c.image_metadata->>'source_url',''),
      nullif(c.image_metadata->>'photographer_url',''),ia.source_ref),
    license=coalesce(nullif(c.image_metadata->>'license',''),ia.license),
    attribution=coalesce(nullif(c.image_metadata->>'photographer',''),ia.attribution),
    alt_text=coalesce(nullif(c.image_metadata->>'alt',''),ia.alt_text),
    metadata=coalesce(ia.metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
      'stored_locally',case when coalesce(c.curated_image_url,c.image_url,'') ~*
        '(img\.queer\.guide|/storage/v1/object/public/)' then true else null end,
      'relevance_review',nullif(c.image_metadata->>'relevance_review',''),
      'relevance_review_reason',nullif(c.image_metadata->>'relevance_review_reason',''))),
    updated_at=now()
from public.image_asset_links l
join public.countries c on c.id=l.entity_id
where l.asset_id=ia.id and l.entity_type='country' and l.role='cover'
  and ia.url=coalesce(c.curated_image_url,c.image_url);

update public.ai_suggestions s
set status='applied',approved_at=coalesce(approved_at,now()),applied_at=now(),updated_at=now(),
    review_notes=concat_ws(' ',review_notes,'Resolved by documented country-cover relevance disposition.')
from public.countries c
where s.entity_type='country' and s.entity_id=c.id
  and s.suggestion_type='image_replacement' and s.status='pending'
  and s.proposed_value->>'action'='review_country_cover_relevance'
  and c.image_metadata->>'relevance_review' in ('approved','exception_approved');

commit;
