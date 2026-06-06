-- Fix: compute_visibility_score referenced m.latitude/m.longitude on
-- marketplace_listings, which have no geo columns — the scorer errored for the
-- 'marketplace_listing' type (and would crash the nightly batch when it reached
-- them). Marketplace listings are products with no location, so geo is
-- not-applicable (1.0), same as news/personalities. Only the marketplace SELECT
-- and the geo-not-applicable branch change; all other axes are unchanged.
create or replace function public.compute_visibility_score(p_entity_type text, p_entity_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tags numeric := 0; v_geo numeric := 0; v_image_score numeric := 0; v_dates numeric := 0;
  v_text numeric := 0; v_syn numeric := 0; v_query numeric := 0.5;
  n_tags text[] := array[]::text[];
  v_suggestions text[] := array[]::text[];
  w_tag numeric := 0.20; w_geo numeric := 0.15; w_image numeric := 0.15;
  w_date numeric := 0.10; w_text numeric := 0.20; w_syn numeric := 0.10; w_query numeric := 0.10;
  v_axis_weights jsonb;
  v_title text; v_description text; v_lat numeric; v_lng numeric; v_timezone text;
  v_image_url text; v_images text[]; v_image_hash text; v_published_at timestamptz;
  v_start_date timestamptz; v_end_date timestamptz; v_recurrence jsonb; v_status text;
  v_assign_type text; v_tag_count int; v_syn_hits int; v_cluster_count int;
  v_title_len int; v_desc_len int; v_score numeric; v_breakdown jsonb; v_found boolean := false;
begin
  select settings->'axis_weights' into v_axis_weights from public.search_settings_versions
    where index_name='visibility_score' and channel='active' order by version desc limit 1;
  if v_axis_weights is not null then
    w_tag := coalesce((v_axis_weights->>'tags')::numeric, w_tag);
    w_geo := coalesce((v_axis_weights->>'geo')::numeric, w_geo);
    w_image := coalesce((v_axis_weights->>'images')::numeric, w_image);
    w_date := coalesce((v_axis_weights->>'dates')::numeric, w_date);
    w_text := coalesce((v_axis_weights->>'text')::numeric, w_text);
    w_syn := coalesce((v_axis_weights->>'synonyms')::numeric, w_syn);
    w_query := coalesce((v_axis_weights->>'queries')::numeric, w_query);
  end if;

  v_assign_type := case p_entity_type
    when 'venue' then 'venue' when 'event' then 'event'
    when 'news_article' then 'article' when 'article' then 'article'
    when 'marketplace_listing' then 'listing' when 'listing' then 'listing'
    when 'personality' then 'profile' when 'profile' then 'profile'
    when 'group' then 'group' else null end;

  if p_entity_type = 'venue' then
    select v.name, v.description, v.latitude, v.longitude, v.images into v_title, v_description, v_lat, v_lng, v_images from public.venues v where v.id = p_entity_id;
    v_found := found;
  elsif p_entity_type = 'event' then
    select e.title, e.description, e.latitude, e.longitude, e.images, e.start_date, e.end_date, e.recurrence_rule, e.status
      into v_title, v_description, v_lat, v_lng, v_images, v_start_date, v_end_date, v_recurrence, v_status
      from public.events e where e.id = p_entity_id;
    v_found := found;
  elsif p_entity_type in ('news_article','article') then
    select n.title, n.content, n.image_url, n.image_hash, n.published_at into v_title, v_description, v_image_url, v_image_hash, v_published_at
      from public.news_articles n where n.id = p_entity_id;
    v_found := found;
  elsif p_entity_type in ('marketplace_listing','listing') then
    select m.title, m.description, m.images, m.status into v_title, v_description, v_images, v_status
      from public.marketplace_listings m where m.id = p_entity_id;
    v_found := found;
  elsif p_entity_type in ('personality','profile') then
    select p.name, p.description, p.image_url into v_title, v_description, v_image_url from public.personalities p where p.id = p_entity_id;
    v_found := found;
  elsif p_entity_type = 'city' then
    select c.name, c.latitude, c.longitude, c.timezone into v_title, v_lat, v_lng, v_timezone from public.cities c where c.id = p_entity_id;
    v_found := found;
  elsif p_entity_type = 'country' then
    select co.name, co.latitude, co.longitude, co.timezone into v_title, v_lat, v_lng, v_timezone from public.countries co where co.id = p_entity_id;
    v_found := found;
  else
    return jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id, 'score', 0, 'breakdown', '{}'::jsonb, 'suggestions', to_jsonb(array['Unknown entity type: ' || p_entity_type]), 'computed_at', now());
  end if;
  if not v_found then
    return jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id, 'score', 0, 'breakdown', '{}'::jsonb, 'suggestions', to_jsonb(array['Entity not found']), 'computed_at', now());
  end if;

  if v_assign_type is null then v_tags := 1.0; n_tags := array_append(n_tags, 'tags not used');
  else
    select count(*)::int into v_tag_count from public.unified_tag_assignments uta join public.unified_tags ut on ut.id = uta.tag_id
      where uta.entity_id = p_entity_id and uta.entity_type = v_assign_type and ut.status = 'active' and ut.merged_into_id is null;
    v_tags := least(v_tag_count::numeric / 3.0, 1.0);
    n_tags := array_append(n_tags, format('%s active tag(s)', v_tag_count));
  end if;

  if p_entity_type in ('news_article','article','personality','profile','marketplace_listing','listing') then v_geo := 1.0;
  else
    if v_lat is null or v_lng is null then v_geo := 0.0;
    elsif v_lat = 0 and v_lng = 0 then v_geo := 0.0;
    elsif v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then v_geo := 0.2;
    else v_geo := 0.8; if v_timezone is not null and v_timezone <> '' then v_geo := 1.0; end if; end if;
  end if;

  declare has_image boolean := ((v_image_url is not null and v_image_url <> '') or (v_images is not null and array_length(v_images, 1) is not null));
  begin
    if p_entity_type in ('country','city') then v_image_score := 0.5;
    elsif not has_image then v_image_score := 0.0;
    else v_image_score := 0.7; if v_image_hash is not null and v_image_hash <> '' then v_image_score := 1.0; end if; end if;
  end;

  if p_entity_type = 'event' then
    if v_start_date is null then v_dates := 0.0;
    else
      v_dates := 0.7;
      if v_end_date is not null then v_dates := v_dates + 0.15; end if;
      if v_recurrence is not null then v_dates := v_dates + 0.15; end if;
      if v_start_date < (now() - interval '7 days') and v_recurrence is null then v_dates := greatest(v_dates - 0.4, 0); end if;
      if v_dates > 1.0 then v_dates := 1.0; end if;
    end if;
  elsif p_entity_type in ('news_article','article') then
    if v_published_at is null then v_dates := 0.0; else v_dates := 1.0; end if;
  else v_dates := 1.0; end if;

  v_title_len := coalesce(length(v_title), 0);
  v_desc_len := coalesce(length(v_description), 0);
  declare title_score numeric; desc_score numeric;
  begin
    if v_title_len = 0 then title_score := 0;
    elsif v_title_len < 10 then title_score := 0.4;
    elsif v_title_len < 20 then title_score := 0.7;
    else title_score := 1.0; end if;
    if p_entity_type in ('city','country') then v_text := title_score;
    else
      if v_desc_len = 0 then desc_score := 0;
      elsif v_desc_len < 80 then desc_score := 0.4;
      elsif v_desc_len < 200 then desc_score := 0.7;
      else desc_score := 1.0; end if;
      v_text := title_score * 0.4 + desc_score * 0.6;
    end if;
  end;

  if v_title is null or v_title = '' then v_syn := 0.5;
  else
    select count(*)::int into v_syn_hits from public.search_synonyms ss
     where ss.status = 'active' and (exists (select 1 from unnest(ss.terms) t where position(lower(t) in lower(v_title)) > 0) or exists (select 1 from unnest(ss.replacements) r where position(lower(r) in lower(v_title)) > 0));
    if v_syn_hits = 0 then v_syn := 0.5; else v_syn := least(0.5 + (v_syn_hits::numeric * 0.25), 1.0); end if;
  end if;

  if v_assign_type is null then v_query := 0.5;
  else
    select count(distinct tc.id)::int into v_cluster_count from public.unified_tag_assignments uta
      join public.topic_cluster_tags tct on tct.tag_id = uta.tag_id
      join public.topic_clusters tc on tc.id = tct.cluster_id and tc.status = 'active'
      where uta.entity_id = p_entity_id and uta.entity_type = v_assign_type;
    if v_cluster_count = 0 then v_query := 0.5; else v_query := least(0.5 + (v_cluster_count::numeric * 0.1), 1.0); end if;
  end if;

  v_score := v_tags*w_tag + v_geo*w_geo + v_image_score*w_image + v_dates*w_date + v_text*w_text + v_syn*w_syn + v_query*w_query;
  v_breakdown := jsonb_build_object(
    'tags', jsonb_build_object('score', round(v_tags,3), 'weight', w_tag),
    'geo', jsonb_build_object('score', round(v_geo,3), 'weight', w_geo),
    'images', jsonb_build_object('score', round(v_image_score,3), 'weight', w_image),
    'dates', jsonb_build_object('score', round(v_dates,3), 'weight', w_date),
    'text', jsonb_build_object('score', round(v_text,3), 'weight', w_text),
    'synonyms', jsonb_build_object('score', round(v_syn,3), 'weight', w_syn),
    'queries', jsonb_build_object('score', round(v_query,3), 'weight', w_query));
  return jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id, 'score', round(v_score,3), 'breakdown', v_breakdown, 'suggestions', to_jsonb(v_suggestions), 'computed_at', now());
end $function$;
