select b.id,b.slug,b.brand_key,b.display_name,b.product_count,b.publication_status,
count(l.id) filter(where l.status='active' and l.duplicate_of_id is null) actual_active,
count(l.id) filter(where l.status='active' and l.overview_eligible) eligible_all_ratings,
count(l.id) filter(where l.status='active' and l.overview_eligible and l.content_rating in ('sfw','suggestive')) public_visible,
count(l.id) filter(where l.status='active' and l.content_rating in ('sfw','suggestive')) public_rating_products,
count(l.id) filter(where l.status='active' and l.content_rating in ('sfw','suggestive') and not l.overview_eligible) hidden_by_image_or_quality,
count(l.id) filter(where l.status='active' and 'no_qualified_overview_image'=any(l.overview_exclusion_reasons)) missing_qualified_image,
count(l.id) filter(where l.status='active' and cardinality(l.images)>0) has_product_images,
coalesce(array_agg(distinct l.content_rating) filter(where l.status='active'),'{}') content_ratings,
(b.story is not null) has_description,(b.logo_url is not null) has_logo
from marketplace_brands b left join marketplace_listings l on l.brand_key=b.brand_key
where b.publication_status='published' group by b.id order by b.display_name;
