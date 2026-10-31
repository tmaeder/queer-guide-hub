-- Leave the public/narrow profile unchanged. Only full-corpus service consumers
-- use a separately fenced query that evaluates the guarded detector once per
-- eligible city. Three full scans remain; this is not a timeout-guarantee.
do $full_profile_cache$
declare
  original_view text := pg_get_viewdef('public.city_quality_profile'::regclass, true);
  optimized_view text;
  fact_anchor text := ' AS current_description_hash';
  predicate_pattern text := '\m(public\.)?city_description_is_wrong_subject\(f\.description\)';
  cache_expression text := $expression$,
    CASE WHEN b.seo_indexable AND NULLIF(btrim(b.description), ''::text) IS NOT NULL
      THEN public.city_description_is_wrong_subject(b.description)
      ELSE false END AS description_wrong_subject_cached$expression$;
  expected_columns text[] := array[
    'id','name','slug','country_id','shell_status','lifecycle_cohort','seo_indexable',
    'publication_ready','blockers','warnings','issue_codes','lifecycle_score',
    'identity_score','geo_score','content_score','editorial_score','imagery_score',
    'relationships_score','taxonomy_score','provenance_score','freshness_score',
    'translation_score','venue_count','event_count','unlinked_venue_candidates',
    'unlinked_event_candidates','relationship_country_mismatches','wrong_namesake_events',
    'category_other_count','categorized_entity_count','category_average_confidence',
    'category_disagreement_count','category_evidence_count','selected_image_url',
    'verified_image','image_has_provenance','duplicate_image_count','duplicate_phash_count',
    'translation_count','completeness_score','trust_score','updated_at','last_verified_at'
  ];
  actual_columns text[];
  old_view_metadata jsonb;
  helper_oid oid;
  occurrences integer;
  consumer record;
  consumer_oid oid;
  consumer_definition text;
  consumer_code text;
  consumer_metadata jsonb;
  old_references integer;
  new_references integer;
begin
  select array_agg(attname::text order by attnum) into actual_columns
  from pg_attribute where attrelid='public.city_quality_profile'::regclass and attnum>0 and not attisdropped;
  if actual_columns is distinct from expected_columns then
    raise exception 'City quality full-profile output shape changed';
  end if;
  if original_view !~ '\mfacts AS MATERIALIZED[[:space:]]*\('
     or position('description_wrong_subject_cached' in original_view)>0 then
    raise exception 'Unexpected public city quality facts definition';
  end if;
  select count(*) into occurrences from regexp_matches(original_view,predicate_pattern,'g');
  if occurrences<>1 then raise exception 'Expected one city description assessment predicate, found %',occurrences;end if;
  if (length(original_view)-length(replace(original_view,fact_anchor,'')))/length(fact_anchor)<>1
     or original_view !~ 'AS current_description_hash[[:space:]]+FROM base b' then
    raise exception 'City quality facts anchor changed';
  end if;
  select jsonb_build_object('acl',relacl,'options',reloptions,'owner',relowner)
  into old_view_metadata from pg_class where oid='public.city_quality_profile'::regclass;
  optimized_view := replace(original_view,fact_anchor,fact_anchor||cache_expression);
  optimized_view := regexp_replace(optimized_view,predicate_pattern,'f.description_wrong_subject_cached','g');

  -- Refuse to replace an independently changed helper. SET search_path fences
  -- SQL-function inlining; SECURITY INVOKER never adds table/RLS privileges.
  helper_oid:=to_regprocedure('public._city_quality_full_profile()');
  if helper_oid is not null and not exists(
    select 1 from pg_proc where oid=helper_oid
      and prosrc=optimized_view and prorettype='public.city_quality_profile'::regtype
      and proretset and not prosecdef and provolatile='s'
      and proconfig=array['search_path=public, extensions, pg_temp']
  ) then raise exception 'Existing city full-profile helper changed';end if;
  execute format($ddl$
    create or replace function public._city_quality_full_profile()
    returns setof public.city_quality_profile
    language sql stable security invoker set search_path to public,extensions,pg_temp
    as %L
  $ddl$,optimized_view);
  revoke all on function public._city_quality_full_profile() from public,anon,authenticated;
  grant execute on function public._city_quality_full_profile() to service_role;

  -- Change only the three full-profile references. Preserve every original
  -- consumer body clause, signature, guard, owner, ACL and function attribute.
  for consumer in select * from(values
    ('public._city_quality_scorecard()',1),
    ('public.run_city_quality_issue_sync(integer)',2)
  ) c(signature,expected_references)
  loop
    consumer_oid:=to_regprocedure(consumer.signature);
    if consumer_oid is null then raise exception 'Missing city quality consumer %',consumer.signature;end if;
    select pg_get_functiondef(consumer_oid),
      regexp_replace(pg_get_functiondef(consumer_oid),'--[^'||chr(10)||']*','','g'),
      to_jsonb(p)-'prosrc'-'prosqlbody'
    into consumer_definition,consumer_code,consumer_metadata from pg_proc p where oid=consumer_oid;
    select count(*) into old_references from regexp_matches(consumer_code,'\mpublic\.city_quality_profile\M','g');
    select count(*) into new_references from regexp_matches(consumer_code,'\mpublic\._city_quality_full_profile\(\)','g');
    if old_references=consumer.expected_references and new_references=0 then
      execute regexp_replace(consumer_definition,'\mpublic\.city_quality_profile\M','public._city_quality_full_profile()','g');
    elsif old_references<>0 or new_references<>consumer.expected_references then
      raise exception 'Unexpected full-profile references in %',consumer.signature;
    end if;
    if consumer_metadata is distinct from(
      select to_jsonb(p)-'prosrc'-'prosqlbody' from pg_proc p where oid=consumer_oid
    ) then raise exception 'City quality consumer attributes changed: %',consumer.signature;end if;
  end loop;
  if original_view is distinct from pg_get_viewdef('public.city_quality_profile'::regclass,true)
     or old_view_metadata is distinct from(
       select jsonb_build_object('acl',relacl,'options',reloptions,'owner',relowner)
       from pg_class where oid='public.city_quality_profile'::regclass
     ) then raise exception 'Public city quality view changed';end if;
end;
$full_profile_cache$;
