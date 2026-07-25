-- Dedup Truth Engine — follow-up: disambiguate merge_entities calls (2026-07-25)
--
-- Prod has TWO merge_entities overloads: the soft reversible dispatcher
-- merge_entities(p_type, p_keep_id, p_drop_id) and a LEGACY hard-delete
-- merge_entities(p_entity_type, p_keep_id, p_remove_id, p_merged_data default '{}')
-- whose defaulted 4th arg makes a positional 3-arg call ambiguous (42725).
-- Named-parameter notation resolves uniquely to the soft dispatcher (the same
-- fix the duplicates console uses). Re-declares approve_dedup_review and
-- run_dedup_truth_sweep with named-arg calls; no behavior change otherwise.

CREATE OR REPLACE FUNCTION public.approve_dedup_review(p_id uuid, p_keep_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  q record; v_keep uuid; v_drop uuid; v_result jsonb; v_audit uuid;
begin
  perform public.assert_admin_or_internal();

  select * into q from public.dedup_review_queue where id = p_id and status = 'open' for update;
  if not found then raise exception 'dedup review % not found or not open', p_id; end if;

  v_keep := q.keep_id; v_drop := q.drop_id;
  if p_keep_id is not null then
    if p_keep_id = q.drop_id then v_keep := q.drop_id; v_drop := q.keep_id;
    elsif p_keep_id <> q.keep_id then raise exception 'p_keep_id must be one of the pair';
    end if;
  end if;

  if q.entity_type = 'venue' then v_result := public.merge_venues(v_keep, v_drop);
  elsif q.entity_type = 'city' then v_result := public.merge_cities(v_keep, v_drop);
  else v_result := public.merge_entities(p_type => q.entity_type, p_keep_id => v_keep, p_drop_id => v_drop);
  end if;
  v_audit := (v_result->>'audit_id')::uuid;

  update public.dedup_review_queue
     set status = 'approved', merge_audit_id = v_audit, keep_id = v_keep, drop_id = v_drop,
         reviewer_id = auth.uid(), reviewed_at = now()
   where id = p_id;

  -- The dropped row can no longer be part of any other open suggestion.
  update public.dedup_review_queue
     set status = 'superseded', reviewed_at = now()
   where status = 'open' and entity_type = q.entity_type
     and (keep_id = v_drop or drop_id = v_drop);

  perform public._dedup_set_needs_attention(q.entity_type, v_keep, false);
  perform public._dedup_write_corroboration_signal(q.entity_type, v_keep, v_drop, v_audit, q.reason);

  return jsonb_build_object('approved', true, 'audit_id', v_audit,
                            'entity_type', q.entity_type, 'keep_id', v_keep, 'drop_id', v_drop);
end; $function$;

CREATE OR REPLACE FUNCTION public.run_dedup_truth_sweep(
  p_type text, p_mode text DEFAULT 'queue_only', p_merge_cap int DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp'
AS $function$
declare
  r record;
  v_sql text;
  v_keep uuid; v_drop uuid; v_keep_t text; v_drop_t text;
  v_result jsonb; v_audit uuid; v_ins int;
  v_merged int := 0; v_queued int := 0; v_skipped int := 0; v_capped int := 0;
  v_would_merge int := 0; v_would_queue int := 0;
  v_queue_cap constant int := 200;
begin
  perform public.assert_admin_or_internal();
  if p_mode not in ('dry_run','queue_only','full') then
    raise exception 'unknown mode %', p_mode;
  end if;

  -- Common candidate shape: a_id, b_id, a_title, b_title, is_auto, conf,
  -- reason, dm (distance), aq/af/ac + bq/bf/bc (canonical ranking inputs).
  v_sql := case p_type
  when 'venue' then $q$
    with live as (
      select id, name, latitude lat, longitude lng, city, city_id,
             public.dedup_despace(name) dsp, public.dedup_core_tokens(name, city) core,
             quality_score::numeric q, is_featured::boolean f, created_at::timestamptz c
      from public.venues
      where duplicate_of_id is null and closed_at is null
        and review_status is distinct from 'archived'
        and data_source is distinct from 'refuge-restrooms'
        and name_normalized is not null and length(name_normalized) >= 3)
    select * from (
      select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
             (a.lat is not null and b.lat is not null
              and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150) is_auto,
             case when a.lat is not null and b.lat is not null
                   and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                  then 0.97 else 0.85::numeric end conf,
             case when a.lat is not null and b.lat is not null
                   and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                  then 'despace_geo' else 'despace_no_geo' end reason,
             public.haversine_m(a.lat,a.lng,b.lat,b.lng) dm,
             a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
      from live a join live b on a.city_id = b.city_id and a.id < b.id and a.dsp = b.dsp
      where length(a.dsp) >= 4
      union all
      select a.id, b.id, a.name, b.name,
             (a.lat is not null and b.lat is not null
              and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150),
             case when a.lat is not null and b.lat is not null
                   and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                  then 0.92 else 0.75 end,
             case when a.lat is not null and b.lat is not null
                   and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                  then 'core_token_geo' else 'core_token_no_geo' end,
             public.haversine_m(a.lat,a.lng,b.lat,b.lng),
             a.q, a.f, a.c, b.q, b.f, b.c
      from live a join live b on a.city_id = b.city_id and a.id < b.id
        and a.core = b.core and a.dsp <> b.dsp
      where cardinality(a.core) >= 1
    ) u order by is_auto desc, conf desc limit 800 $q$
  when 'event' then $q$
    with live as (
      select id, title, venue_id, start_date, public.dedup_despace(title) dsp,
             quality_score::numeric q, is_featured::boolean f, created_at::timestamptz c
      from public.events
      where duplicate_of_id is null and coalesce(status,'') <> 'archived'
        and title_normalized is not null and length(title_normalized) >= 3
        and start_date > now() - interval '90 days')
    select a.id a_id, b.id b_id, a.title a_title, b.title b_title,
           (a.venue_id is not null and a.venue_id = b.venue_id
            and abs(extract(epoch from (a.start_date - b.start_date))) < 48*3600) is_auto,
           case when a.venue_id is not null and a.venue_id = b.venue_id
                 and abs(extract(epoch from (a.start_date - b.start_date))) < 48*3600
                then 0.97 else 0.80::numeric end conf,
           case when a.venue_id is not null and a.venue_id = b.venue_id
                 and abs(extract(epoch from (a.start_date - b.start_date))) < 48*3600
                then 'despace_same_venue_48h' else 'title_day_no_venue' end reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.id < b.id and a.dsp = b.dsp
      and a.start_date::date = b.start_date::date
    where length(a.dsp) >= 4
    order by is_auto desc limit 800 $q$
  when 'marketplace' then $q$
    with live as (
      select id, title, merchant_domain,
             public.dedup_despace(title) dsp, public.dedup_core_tokens(title, null) core,
             quality_score::numeric q, featured::boolean f, created_at::timestamptz c
      from public.marketplace_listings
      where duplicate_of_id is null and status = 'active' and merchant_domain is not null
        and title_normalized is not null and length(title_normalized) >= 3)
    select * from (
      select a.id a_id, b.id b_id, a.title a_title, b.title b_title,
             true is_auto, 0.97::numeric conf, 'same_merchant_key' reason,
             null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
      from live a join live b on a.merchant_domain = b.merchant_domain
        and a.id < b.id and a.dsp = b.dsp
      where length(a.dsp) >= 4
      union all
      select a.id, b.id, a.title, b.title, false, 0.75, 'same_merchant_tokens',
             null::double precision, a.q, a.f, a.c, b.q, b.f, b.c
      from live a join live b on a.merchant_domain = b.merchant_domain
        and a.id < b.id and a.core = b.core and a.dsp <> b.dsp
      where cardinality(a.core) >= 1
    ) u order by is_auto desc limit 800 $q$
  when 'city' then $q$
    with live as (
      select id, name, country_id, latitude lat, longitude lng,
             public.dedup_despace(name) dsp,
             completeness_score::numeric q, is_capital::boolean f, created_at::timestamptz c
      from public.cities
      where duplicate_of_id is null and shell_status is distinct from 'merged')
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           (a.lat is not null and b.lat is not null
            and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 10000) is_auto,
           case when a.lat is not null and b.lat is not null
                 and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 10000
                then 0.97 else 0.85::numeric end conf,
           case when a.lat is not null and b.lat is not null
                 and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 10000
                then 'despace_geo' else 'despace_no_geo' end reason,
           public.haversine_m(a.lat,a.lng,b.lat,b.lng) dm,
           a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.country_id = b.country_id and a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
    order by is_auto desc limit 800 $q$
  when 'personality' then $q$
    with live as (
      select id, name, wikidata_qid, birth_date, public.dedup_despace(name) dsp,
             quality_score::numeric q, is_featured::boolean f, created_at::timestamptz c
      from public.personalities
      where duplicate_of_id is null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           ((a.wikidata_qid is not null and a.wikidata_qid = b.wikidata_qid)
            or (a.birth_date is not null and a.birth_date = b.birth_date)) is_auto,
           case when (a.wikidata_qid is not null and a.wikidata_qid = b.wikidata_qid)
                  or (a.birth_date is not null and a.birth_date = b.birth_date)
                then 0.97 else 0.75::numeric end conf,
           case when (a.wikidata_qid is not null and a.wikidata_qid = b.wikidata_qid)
                  or (a.birth_date is not null and a.birth_date = b.birth_date)
                then 'despace_corroborated' else 'despace_namesake' end reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
    order by is_auto desc limit 800 $q$
  when 'hotel' then $q$
    with live as (
      select id, name, city_id, latitude::numeric lat, longitude::numeric lng,
             public.dedup_despace(name) dsp,
             null::numeric q, featured::boolean f, created_at::timestamptz c
      from public.hotels
      where duplicate_of_id is null and city_id is not null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           (a.lat is not null and b.lat is not null
            and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150) is_auto,
           case when a.lat is not null and b.lat is not null
                 and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                then 0.96 else 0.80::numeric end conf,
           case when a.lat is not null and b.lat is not null
                 and public.haversine_m(a.lat,a.lng,b.lat,b.lng) < 150
                then 'despace_geo' else 'despace_no_geo' end reason,
           public.haversine_m(a.lat,a.lng,b.lat,b.lng) dm,
           a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.city_id = b.city_id and a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
    order by is_auto desc limit 800 $q$
  when 'queer_village' then $q$
    with live as (
      select id, name, city_id, public.dedup_despace(name) dsp,
             completeness_score::numeric q, featured::boolean f, created_at::timestamptz c
      from public.queer_villages
      where duplicate_of_id is null and city_id is not null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           true is_auto, 0.96::numeric conf, 'despace_same_city' reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.city_id = b.city_id and a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
    limit 800 $q$
  when 'organization' then $q$
    with live as (
      select id, name, city_id, website_domain, public.dedup_despace(name) dsp,
             completeness_score::numeric q, false::boolean f, created_at::timestamptz c
      from public.organizations
      where duplicate_of_id is null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           (a.website_domain is not null and a.website_domain = b.website_domain) is_auto,
           case when a.website_domain is not null and a.website_domain = b.website_domain
                then 0.96 else 0.80::numeric end conf,
           case when a.website_domain is not null and a.website_domain = b.website_domain
                then 'despace_domain' else 'despace_same_city' end reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.id < b.id and a.dsp = b.dsp
      and ((a.website_domain is not null and a.website_domain = b.website_domain)
           or (a.city_id is not null and a.city_id = b.city_id))
    where length(a.dsp) >= 4
    order by is_auto desc limit 800 $q$
  when 'group' then $q$
    with live as (
      select id, name, nullif(lower(btrim(coalesce(city,''))),'') cty,
             public.dedup_despace(name) dsp,
             member_count::numeric q, featured::boolean f, created_at::timestamptz c
      from public.community_groups
      where duplicate_of_id is null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           (a.cty is not null and a.cty = b.cty) is_auto,
           case when a.cty is not null and a.cty = b.cty then 0.95 else 0.70::numeric end conf,
           case when a.cty is not null and a.cty = b.cty
                then 'despace_same_city' else 'despace_only' end reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
    order by is_auto desc limit 800 $q$
  when 'milestone' then $q$
    with live as (
      select id, title, extract(year from date) yr, public.dedup_despace(title) dsp,
             null::numeric q, false::boolean f, created_at::timestamptz c
      from public.milestones
      where duplicate_of_id is null and date is not null)
    select a.id a_id, b.id b_id, a.title a_title, b.title b_title,
           true is_auto, 0.95::numeric conf, 'title_year' reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.yr = b.yr and a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 6
    limit 800 $q$
  when 'news' then $q$
    with live as (
      select id, title, source_id, published_at::date pday, public.dedup_despace(title) dsp,
             quality_score::numeric q, is_featured::boolean f, created_at::timestamptz c
      from public.news_articles
      where duplicate_of_id is null and published_at > now() - interval '90 days')
    select a.id a_id, b.id b_id, a.title a_title, b.title b_title,
           (a.source_id is not null and a.source_id = b.source_id) is_auto,
           case when a.source_id is not null and a.source_id = b.source_id
                then 0.97 else 0.70::numeric end conf,
           case when a.source_id is not null and a.source_id = b.source_id
                then 'same_source_day' else 'cross_source_same_day' end reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.pday = b.pday and a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 6
    order by is_auto desc limit 800 $q$
  when 'country' then $q$
    with live as (
      select id, name, public.dedup_despace(name) dsp,
             content_completeness_score::numeric q, false::boolean f, created_at::timestamptz c
      from public.countries
      where duplicate_of_id is null)
    select a.id a_id, b.id b_id, a.name a_title, b.name b_title,
           true is_auto, 0.95::numeric conf, 'despace' reason,
           null::double precision dm, a.q aq, a.f af, a.c ac, b.q bq, b.f bf, b.c bc
    from live a join live b on a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 4
    limit 800 $q$
  else null end;

  if v_sql is null then raise exception 'unsupported type %', p_type; end if;

  for r in execute v_sql loop
    -- rejection memory: an admin already said "not a duplicate"
    if exists (
      select 1 from public.dedup_review_queue
      where entity_type = p_type and status = 'rejected'
        and least(keep_id, drop_id) = least(r.a_id, r.b_id)
        and greatest(keep_id, drop_id) = greatest(r.a_id, r.b_id)
    ) then v_skipped := v_skipped + 1; continue; end if;

    -- canonical pick: quality desc -> featured -> oldest
    if (coalesce(r.aq,-1) >  coalesce(r.bq,-1))
       or (coalesce(r.aq,-1) = coalesce(r.bq,-1) and coalesce(r.af,false) and not coalesce(r.bf,false))
       or (coalesce(r.aq,-1) = coalesce(r.bq,-1) and coalesce(r.af,false) = coalesce(r.bf,false) and r.ac <= r.bc)
    then v_keep := r.a_id; v_drop := r.b_id; v_keep_t := r.a_title; v_drop_t := r.b_title;
    else v_keep := r.b_id; v_drop := r.a_id; v_keep_t := r.b_title; v_drop_t := r.a_title; end if;

    if p_mode = 'dry_run' then
      if r.is_auto then v_would_merge := v_would_merge + 1;
      else v_would_queue := v_would_queue + 1; end if;
      continue;
    end if;

    if r.is_auto and p_mode = 'full' then
      if v_merged >= p_merge_cap then v_capped := v_capped + 1; continue; end if;
      begin
        if p_type = 'venue' then v_result := public.merge_venues(v_keep, v_drop);
        elsif p_type = 'city' then v_result := public.merge_cities(v_keep, v_drop);
        else v_result := public.merge_entities(p_type => p_type, p_keep_id => v_keep, p_drop_id => v_drop);
        end if;
        v_audit := (v_result->>'audit_id')::uuid;
        v_merged := v_merged + 1;
        update public.dedup_review_queue
           set status = 'superseded', reviewed_at = now()
         where status = 'open' and entity_type = p_type
           and (keep_id = v_drop or drop_id = v_drop);
        perform public._dedup_write_corroboration_signal(p_type, v_keep, v_drop, v_audit, r.reason);
      exception when others then v_skipped := v_skipped + 1;
      end;
    else
      if v_queued >= v_queue_cap then v_capped := v_capped + 1; continue; end if;
      insert into public.dedup_review_queue
        (entity_type, keep_id, drop_id, cluster, confidence, reason, source)
      values (p_type, v_keep, v_drop,
              jsonb_build_object(
                'keep', jsonb_build_object('id', v_keep, 'title', v_keep_t),
                'drop', jsonb_build_object('id', v_drop, 'title', v_drop_t),
                'distance_m', r.dm, 'match_type', r.reason, 'auto_eligible', r.is_auto),
              r.conf, r.reason, 'sweep')
      on conflict do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then
        v_queued := v_queued + 1;
        perform public._dedup_set_needs_attention(p_type, v_keep, true);
        perform public._dedup_set_needs_attention(p_type, v_drop, true);
      end if;
    end if;
  end loop;

  if p_mode = 'full' and v_merged > 0 then
    perform public.collapse_entity_dup_chains(p_type);
  end if;

  return jsonb_build_object('type', p_type, 'mode', p_mode,
    'auto_merged', v_merged, 'queued', v_queued, 'skipped', v_skipped, 'capped', v_capped,
    'would_merge', v_would_merge, 'would_queue', v_would_queue);
end; $function$;
