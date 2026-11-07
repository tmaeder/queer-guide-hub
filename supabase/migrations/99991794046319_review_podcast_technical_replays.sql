-- An identical podcast capture can be retired even if one copy has
-- technical review flags. The canonical episode and its flags are preserved.
do $patch$
declare
  definition text:=pg_get_functiondef('api_private.reconcile_exact_news_source_duplicates(integer,boolean)'::regprocedure);
  replacement record;
begin
  for replacement in select * from (values
    ($old$   and s.enriched_data->'auto_publish_blocked_reasons' @> '["manual_review_requested"]'::jsonb
   and s.enriched_data->'auto_publish_blocked_reasons' ?| array['low_relevance','low_confidence']
   and s.enriched_data->'auto_publish_blocked_reasons' <@ '["manual_review_requested","low_relevance","low_confidence","image_unusable"]'::jsonb$old$,
     $new$   and s.enriched_data->'auto_publish_blocked_reasons' ?| array['low_relevance','low_confidence','truncated_body','image_unusable']
   and s.enriched_data->'auto_publish_blocked_reasons' <@ '["manual_review_requested","low_relevance","low_confidence","image_unusable","truncated_body"]'::jsonb$new$),
    ($old$   and s.enriched_data#>'{quality_decision,needsManualReview}'='true'::jsonb
$old$,
     $new$$new$),
    ($old$ and article.auto_publish_blocked_reasons='{}'::text[]
 and article.quality_decision->>'shouldPublish'='true'
 and api_private.review_news_machine_outcome(jsonb_build_object('quality_status',article.quality_status,
  'auto_publish',true,'quality_decision',article.quality_decision,
  'auto_publish_blocked_reasons',to_jsonb(article.auto_publish_blocked_reasons)))='publish'$old$,
     $new$ and article.archived_at is null
 and article.quality_decision->>'shouldPublish'='true'
 and (
  (article.auto_publish_blocked_reasons='{}'::text[]
   and api_private.review_news_machine_outcome(jsonb_build_object('quality_status',article.quality_status,
    'auto_publish',true,'quality_decision',article.quality_decision,
    'auto_publish_blocked_reasons',to_jsonb(article.auto_publish_blocked_reasons)))='publish')
  or (article.media_type='podcast' and article.audio_url~'^https://[^/?#]+/[^?#]+'
   and cardinality(article.auto_publish_blocked_reasons)>0
   and article.auto_publish_blocked_reasons <@ array['truncated_body','image_unusable']::text[]
   and article.quality_decision->>'isSatire'='false'
   and article.quality_decision->>'isAdvertorial'='false'
   and article.quality_decision->>'needsManualReview'='false'
   and article.quality_decision->>'isRelevant'='true')
 )$new$),
    ($old$identical source capture already exists in a policy-passing catalogue article; catalogue content and publication unchanged; no human review claimed.$old$,
     $new$identical source capture already exists in the catalogue. The existing article retains its content, status, and quality flags.$new$)
  ) replacements(before_text,after_text) loop
    if (length(definition)-length(replace(definition,replacement.before_text,'')))/length(replacement.before_text)<>1 then
      raise exception 'Exact news source deduplication contract changed';
    end if;
    definition:=replace(definition,replacement.before_text,replacement.after_text);
  end loop;
  execute definition;
end $patch$;
