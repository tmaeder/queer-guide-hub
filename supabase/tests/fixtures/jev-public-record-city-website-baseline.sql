-- Production projection captured 2026-11-18 before the prepared official_website fix.
CREATE OR REPLACE FUNCTION api_private.jev_public_record(j jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_object_agg(key,case when key='urls' then api_private.jev_source_urls(value)
 when jsonb_typeof(value)='string' then to_jsonb(left(value#>>'{}',18000)) else value end)
 from jsonb_each(case when jsonb_typeof(j)='object' then j else '{}'::jsonb end) where key=any(array['id','name','title','description','short_description','long_description',
 'body','content','website','source_url','url','urls','address','city_id','country_id','latitude','longitude','start_date','end_date',
 'venue_name','venue_id','event_type','category','entity_type','entity_id','field','proposed_value','current_value','citations',
 'locale','suggestion_type','keep_id','drop_id','organization_id','milestone_id','canonical_id','duplicate_id','series_key',
 'data_source','external_id','status','review_status','disposition','quality_status','shell_status','duplicate_of_id','closed_at',
 'human_reviewed','seo_indexable','publication_role','image_url','image_license','image_attribution','reason','issue_code',
 'evidence','source_content','source_url','normalized_data','enriched_data','confidence','proposed_role_kind','milestone_id_1','milestone_id_2']);
$function$;
