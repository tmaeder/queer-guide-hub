-- A fresh model verdict about a repeated podcast capture is evidence about
-- the copy. Its exact enclosure, source text and publisher identity still
-- bind it to the already-published episode.
do $patch$
declare
 definition text:=pg_get_functiondef('api_private.reconcile_exact_news_source_duplicates(integer,boolean)'::regprocedure);
 old_verdict text:=$old$ and s.enriched_data#>>'{quality_decision,needsManualReview}'='false'
 and s.enriched_data#>>'{quality_decision,isRelevant}'='true'
 and s.enriched_data#>>'{quality_decision,shouldPublish}'='true'$old$;
 new_verdict text:=$new$ and (
  (s.enriched_data#>>'{quality_decision,needsManualReview}'='false'
   and s.enriched_data#>>'{quality_decision,isRelevant}'='true'
   and s.enriched_data#>>'{quality_decision,shouldPublish}'='true'
   and not(coalesce(s.enriched_data->'auto_publish_blocked_reasons','[]')?|array['manual_review_requested','entity_links_pending_review']))
  or (
   article.media_type='podcast' and article.audio_url~'^https://[^/?#]+/[^?#]+'
   and s.enriched_data->>'quality_status'='review'
   and s.enriched_data#>'{quality_decision,needsManualReview}'='true'::jsonb
   and jsonb_typeof(s.enriched_data->'auto_publish_blocked_reasons')='array'
   and s.enriched_data->'auto_publish_blocked_reasons' @> '["manual_review_requested"]'::jsonb
   and s.enriched_data->'auto_publish_blocked_reasons' ?| array['low_relevance','low_confidence']
   and s.enriched_data->'auto_publish_blocked_reasons' <@ '["manual_review_requested","low_relevance","low_confidence","image_unusable"]'::jsonb
  ))$new$;
 old_blockers text:=$old$ and not(coalesce(s.enriched_data->'auto_publish_blocked_reasons','[]')?|array['manual_review_requested','entity_links_pending_review'])$old$;
begin
 if (length(definition)-length(replace(definition,old_verdict,'')))/length(old_verdict)<>1
  or (length(definition)-length(replace(definition,old_blockers,'')))/length(old_blockers)<>1
 then raise exception 'Exact news source deduplication contract changed';end if;
 execute replace(replace(definition,old_blockers,''),old_verdict,new_verdict);
end $patch$;
