-- A fresh extraction of the same publisher page can put page chrome in
-- normalized content while leaving the actual RSS episode capture identical.
-- The raw publisher content hash, identifiers, timestamps, and media bindings
-- still have to match. The canonical decision and all staged evidence survive.
do $patch$
declare
  definition text:=pg_get_functiondef('api_private.reconcile_exact_news_source_duplicates(integer,boolean)'::regprocedure);
  replacement record;
begin
  for replacement in select * from (values
    ($old$ from public.ingestion_staging s join public.news_articles article on article.url=s.normalized_data#>>'{urls,0}'$old$,
     $new$ from public.ingestion_staging s join public.news_articles article on article.url=s.normalized_data#>>'{urls,0}'
 cross join lateral (
  select exists (
   select 1
   where article.media_type='podcast' and article.audio_url~'^https://[^/?#]+/[^?#]+'
    and article.last_quality_run_at is not null and article.quality_status in ('passed','rejected')
    and article.quality_decision->>'isSatire'='false' and article.quality_decision->>'isAdvertorial'='false'
    and article.auto_publish_blocked_reasons <@ array['manual_review_requested','low_relevance','low_quality','low_confidence','image_unusable','truncated_body']::text[]
    and s.enriched_data->>'quality_status'='review'
    and jsonb_typeof(s.enriched_data->'auto_publish_blocked_reasons')='array'
    and s.enriched_data->'auto_publish_blocked_reasons' ?| array['low_relevance','low_quality','low_confidence','image_unusable','truncated_body']
    and s.enriched_data->'auto_publish_blocked_reasons' <@ '["manual_review_requested","low_relevance","low_quality","low_confidence","image_unusable","truncated_body"]'::jsonb
    and s.source_entity_id=article.url
    and s.normalized_data->>'description'=s.raw_data->>'content'
    and s.normalized_data#>>'{metadata,excerpt}'=s.raw_data->>'content'
    and (
      nullif(s.normalized_data->>'content','') is null
      or s.normalized_data->>'content'=s.raw_data->>'content'
      or (s.normalized_data#>>'{extraction_meta,method}'='worker:fetch'
       and s.normalized_data#>'{extraction_meta,applied}'='true'::jsonb
       and coalesce(s.normalized_data#>'{sanitize_meta,critical_paywall}','false'::jsonb)='false'::jsonb)
    )
    and coalesce(s.enriched_data#>>'{review_source_text_recovery,status}','') in ('','no_gain')
    and not exists (
      select 1 from public.admin_review_cases c
      join public.admin_review_automation_jobs j on j.case_id=c.id
      where c.active and c.item->>'queue_type'='staging' and c.item->>'id'=s.id::text
       and j.status='running' and j.lease_expires_at>now()
    )
  ) original_podcast_replay
 ) evidence$new$),
    ($old$   and s.enriched_data->'auto_publish_blocked_reasons' <@ '["manual_review_requested","low_relevance","low_confidence","image_unusable","truncated_body"]'::jsonb
  ))$old$,
     $new$   and s.enriched_data->'auto_publish_blocked_reasons' <@ '["manual_review_requested","low_relevance","low_confidence","image_unusable","truncated_body"]'::jsonb
  )
  or evidence.original_podcast_replay)$new$),
    ($old$ and article.duplicate_of_id is null and article.quality_status='passed'
 and article.archived_at is null
 and article.quality_decision->>'shouldPublish'='true'
 and ($old$,
     $new$ and article.duplicate_of_id is null and article.archived_at is null
 and (
  evidence.original_podcast_replay
  or (article.quality_status='passed' and article.quality_decision->>'shouldPublish'='true' and ($new$),
    ($old$   and article.quality_decision->>'isRelevant'='true')
 )
 and case when jsonb_typeof(s.normalized_data->'urls')$old$,
     $new$   and article.quality_decision->>'isRelevant'='true')
  ))
 )
 and case when jsonb_typeof(s.normalized_data->'urls')$new$),
    ($old$ and coalesce(s.normalized_data->>'content',s.normalized_data->>'description','')=s.raw_data->>'content'$old$,
     $new$ and (evidence.original_podcast_replay or coalesce(s.normalized_data->>'content',s.normalized_data->>'description','')=s.raw_data->>'content')$new$)
  ) replacements(before_text,after_text) loop
    if (length(definition)-length(replace(definition,replacement.before_text,'')))/length(replacement.before_text)<>1 then
      raise exception 'Exact news source deduplication contract changed';
    end if;
    definition:=replace(definition,replacement.before_text,replacement.after_text);
  end loop;
  execute definition;
end $patch$;
