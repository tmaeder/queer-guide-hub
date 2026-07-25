-- Dedup Truth Engine — P2: nightly confidence-scored sweep (2026-07-25)
--
-- One sweep across all 12 merge-capable types. Exact-identity pairs (per-type
-- gates below, all built on the shared dedup_despace/dedup_core_tokens keys +
-- geo corroboration) auto-merge through the reversible merge cores; ambiguous
-- pairs land in dedup_review_queue (P1) for the admin gate. Modes:
--   dry_run    — count only, zero writes (rollout step 1)
--   queue_only — queue EVERYTHING incl. auto-eligible pairs (rollout step 2)
--   full       — auto-merge exact-identity, queue the rest (steady state)
-- The effective mode for the cron run lives in admin_automations.conditions
-- ({"mode": "..."}), so the rollout flips with a plain UPDATE, no migration.
--
-- Per-type exact-identity (auto) gates:
--   venue        despace/core key + same city + <150 m   (mirrors run_venue_fuzzy_automerge)
--   event        despace title + same venue + start ±48h (stricter than the 6:15 trigram sweep)
--   marketplace  despace title + same merchant_domain    (mirrors the 6:00 sweep)
--   city         despace name + same country + <10 km
--   hotel        despace name + same city + <150 m
--   queer_village despace name + same city
--   organization despace name + same website_domain
--   group        despace name + same city text
--   milestone    despace title + same year
--   news         despace title + same source + same published day
--   country      despace name (tiny table)
--   personality  despace name + equal non-null wikidata_qid OR birth_date
--                (namesake risk: name-only person matches ALWAYS queue at 0.75)
--
-- Disk-churn discipline: merges fire search_documents triggers, so auto-merges
-- are hard-capped per type per run (default 300) and queue inserts capped at 200.
-- The existing event/marketplace 6:00/6:15 sweeps keep running unchanged.

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
        else v_result := public.merge_entities(p_type, v_keep, v_drop);
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

-- ── Cron driver: loops the 12 types; mode comes from its automation row ──────

CREATE OR REPLACE FUNCTION public.run_dedup_truth_sweep_all(p_mode text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp'
AS $function$
declare
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_conditions jsonb; v_started_at timestamptz := now();
  v_mode text; v_type text; v_out jsonb := '[]'::jsonb; v_one jsonb;
  v_types constant text[] := array['venue','event','marketplace','personality','city',
    'hotel','milestone','organization','news','queer_village','country','group'];
begin
  perform public.assert_admin_or_internal();

  select id, enabled, conditions into v_automation_id, v_enabled, v_conditions
  from public.admin_automations where slug = 'dedup_truth_sweep';

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'dedup_truth_sweep', v_started_at, 'success', 0, 0)
  returning id into v_run_id;

  if v_automation_id is not null and v_enabled is distinct from true then
    update public.admin_automation_runs
      set finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
      where id = v_run_id;
    update public.admin_automations
      set last_run_at = v_started_at, last_run_status = 'paused' where id = v_automation_id;
    return jsonb_build_object('skipped', true, 'reason', 'paused');
  end if;

  v_mode := coalesce(p_mode, v_conditions->>'mode', 'queue_only');

  foreach v_type in array v_types loop
    begin
      v_one := public.run_dedup_truth_sweep(v_type, v_mode);
    exception when others then
      v_one := jsonb_build_object('type', v_type, 'error', SQLERRM);
    end;
    v_out := v_out || jsonb_build_array(v_one);
  end loop;

  update public.admin_automation_runs
    set finished_at = now(), summary = jsonb_build_object('mode', v_mode, 'results', v_out)
    where id = v_run_id;
  if v_automation_id is not null then
    update public.admin_automations
      set last_run_at = v_started_at, last_run_status = 'success' where id = v_automation_id;
  end if;

  return jsonb_build_object('mode', v_mode, 'results', v_out);
end; $function$;

REVOKE ALL ON FUNCTION public.run_dedup_truth_sweep(text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_dedup_truth_sweep_all(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_dedup_truth_sweep(text, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_dedup_truth_sweep_all(text) TO authenticated, service_role;
