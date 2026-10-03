-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261002084048 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
begin;

-- Apply functions historically received `{ "value": ... }`. Some producers
-- legitimately persist a JSON scalar instead. Object extraction against a
-- scalar returns SQL NULL, so the old implementation could close a review as
-- approved without applying the proposed value.
create or replace function public._apply_review_value(
  p_reg public.review_field_registry,
  p_entity_id uuid,
  p_proposed jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_extra text := '';
  v_val jsonb;
  v_text text;
  v_key text;
  c text;
begin
  for c in select jsonb_array_elements_text(coalesce(p_reg.apply_args->'touch','[]'::jsonb))
  loop v_extra := v_extra || format(', %I = now()', c); end loop;
  for c in select jsonb_array_elements_text(coalesce(p_reg.apply_args->'set_true','[]'::jsonb))
  loop v_extra := v_extra || format(', %I = true', c); end loop;

  if jsonb_typeof(p_proposed) = 'object' then
    v_val := p_proposed -> p_reg.value_key;
    v_text := p_proposed ->> p_reg.value_key;
  else
    v_val := p_proposed;
    v_text := p_proposed #>> '{}';
  end if;

  case p_reg.apply_mode
  when 'text' then
    execute format('update public.%I set %I = $1 %s where id = $2',
                   p_reg.target_table, p_reg.target_column, v_extra)
      using v_text, p_entity_id;

  when 'text_required' then
    v_text := nullif(btrim(v_text), '');
    if v_text is null then
      raise exception 'proposed value is empty for field %', p_reg.field
        using errcode = '22023';
    end if;
    execute format('update public.%I set %I = $1 %s where id = $2',
                   p_reg.target_table, p_reg.target_column, v_extra)
      using v_text, p_entity_id;

  when 'text_truncated' then
    execute format('update public.%I set %I = left($1, %s) %s where id = $2',
                   p_reg.target_table, p_reg.target_column,
                   (p_reg.apply_args->>'max_len')::int, v_extra)
      using coalesce(v_text, ''), p_entity_id;

  when 'int_clamped' then
    execute format('update public.%I set %I = greatest(%s, least(%s, round($1)::int)) %s where id = $2',
                   p_reg.target_table, p_reg.target_column,
                   (p_reg.apply_args->>'min')::int, (p_reg.apply_args->>'max')::int, v_extra)
      using v_text::numeric, p_entity_id;

  when 'text_array_union' then
    execute format(
      'update public.%I set %I = ('
      ' select array(select distinct unnest('
      ' coalesce(%I, ''{}''::text[]) ||'
      ' coalesce((select array_agg(distinct t.s) from jsonb_array_elements_text($1) t(s)), ''{}''::text[])'
      ' ) order by 1)) %s where id = $2',
      p_reg.target_table, p_reg.target_column, p_reg.target_column, v_extra)
      using coalesce(v_val, p_proposed), p_entity_id;

  when 'jsonb_array_to_text_array' then
    execute format(
      'update public.%I set %I = array(select jsonb_array_elements_text($1)) %s where id = $2',
      p_reg.target_table, p_reg.target_column, v_extra)
      using coalesce(v_val, p_proposed), p_entity_id;

  when 'geo_latlng' then
    execute format(
      'update public.%I set %I = ($1->>''lat'')::numeric, %I = ($1->>''lng'')::numeric %s '
      'where id = $2 and $1->>''lat'' is not null and $1->>''lng'' is not null',
      p_reg.target_table, p_reg.apply_args->>'lat_col',
      p_reg.apply_args->>'lng_col', v_extra)
      using coalesce(v_val, p_proposed), p_entity_id;

  when 'jsonb_shallow_merge' then
    v_key := nullif(btrim(coalesce(p_reg.apply_args->>'merge_key', '')), '');
    v_text := nullif(btrim(v_text), '');
    if v_key is null then
      raise exception 'apply_args.merge_key is required for jsonb_shallow_merge (field %)', p_reg.field
        using errcode = '22023';
    end if;
    if v_text is null then
      raise exception 'proposed value is empty for field %', p_reg.field
        using errcode = '22023';
    end if;
    execute format(
      'update public.%I set %I = coalesce(%I, ''{}''::jsonb) || jsonb_build_object($1::text, $2::text) %s '
      'where id = $3',
      p_reg.target_table, p_reg.target_column, p_reg.target_column, v_extra)
      using v_key, v_text, p_entity_id;

  else
    raise exception 'unsupported apply mode: %', p_reg.apply_mode
      using errcode = '22023';
  end case;
end
$function$;

revoke all on function public._apply_review_value(public.review_field_registry, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public._apply_review_value(public.review_field_registry, uuid, jsonb)
  to service_role;

-- The badge links to triage_src_quality_personality, so it must count exactly
-- that source. needs_attention remains a separate engine-health metric.
create or replace function public.get_admin_counts()
returns jsonb language plpgsql security definer set search_path to 'public'
as $admin_counts$
declare
  result jsonb; estimates jsonb; v_sla jsonb := '{}'::jsonb;
  v_cnt bigint; v_overdue bigint; r record;
  sla_feedback_h constant int := 48;
  sla_event_quality_h constant int := 336;
begin
  if not has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  select jsonb_object_agg(relname,reltuples::bigint) into estimates
  from pg_class where relnamespace='public'::regnamespace and relname=any(array[
    'venues','events','news_articles','personalities','cities','countries','hotels',
    'queer_villages','marketplace_listings','community_groups','unified_tags',
    'cms_pages','email_ingestions','workflow_runs','scrape_sources','content_links',
    'community_submissions','redirects']);
  result := coalesce(estimates,'{}'::jsonb);
  for r in select queue_key,view_name,count_key,count_prefix,sla_hours
           from triage_sources where active order by queue_key loop
    execute format(
      'select count(*),count(*) filter(where created_at < now() - %L::interval) from public.%I',
      r.sla_hours || ' hours',r.view_name) into v_cnt,v_overdue;
    result := result || jsonb_build_object(r.count_prefix||r.count_key,v_cnt)
      || jsonb_build_object(r.count_prefix||r.count_key||'_overdue',v_overdue);
    v_sla := v_sla || jsonb_build_object(r.count_key,r.sla_hours);
  end loop;
  result := result || jsonb_build_object(
    'review_feedback',(select count(*) from community_submissions
      where content_type='feedback' and feedback_status in ('new','under_review')),
    'review_feedback_overdue',(select count(*) from community_submissions
      where content_type='feedback' and feedback_status in ('new','under_review')
        and submitted_at < now()-(sla_feedback_h||' hours')::interval),
    'review_group_requests',(select count(*) from group_join_requests where status='pending'),
    'quality_existence',(select count(*) from entity_existence_audit
      where action='flag' and reverted_at is null),
    'quality_glossary',coalesce((select total_count from public.tag_editorial_queue(1,0,null) limit 1),0),
    'quality_personality',(select count(*) from public.triage_src_quality_personality),
    'quality_event',(select count(*) from public.event_quality_issues where status='open'),
    'quality_event_overdue',(select count(*) from public.event_quality_issues
      where status='open' and severity in ('critical','high')
        and detected_at<now()-(sla_event_quality_h||' hours')::interval),
    'sla_hours',v_sla||jsonb_build_object('feedback',sla_feedback_h,
      'quality_event',sla_event_quality_h)
  );
  return result;
end
$admin_counts$;

revoke all on function public.get_admin_counts() from public, anon;
grant execute on function public.get_admin_counts() to authenticated, service_role;

do $verify$
declare
  v_apply text := pg_get_functiondef(
    'public._apply_review_value(public.review_field_registry,uuid,jsonb)'::regprocedure);
  v_counts text := pg_get_functiondef('public.get_admin_counts()'::regprocedure);
begin
  if position('jsonb_typeof(p_proposed)' in v_apply) = 0
     or position('p_proposed #>> ''{}''' in v_apply) = 0 then
    raise exception 'scalar proposal normalization is missing';
  end if;
  if position('triage_src_quality_personality' in v_counts) = 0 then
    raise exception 'personality badge is not derived from its triage source';
  end if;
  if has_function_privilege('anon',
       'public._apply_review_value(public.review_field_registry,uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public._apply_review_value(public.review_field_registry,uuid,jsonb)', 'EXECUTE') then
    raise exception '_apply_review_value is exposed to an API role';
  end if;
end
$verify$;

commit;
;
