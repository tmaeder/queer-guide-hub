-- Ops-RPC hardening (security lints 0028/0029 follow-up).
-- Two moves:
--   1. The five ops RPCs the admin UI actually calls get an internal gate
--      (assert_admin_or_internal): admins/moderators via PostgREST pass,
--      service_role passes, direct DB sessions (pg_cron as postgres) pass,
--      any other signed-in user gets 42501.
--   2. Every other admin/ops SECURITY DEFINER RPC has no frontend caller
--      (verified by grep over src/, workers/, supabase/functions/) — EXECUTE
--      revoked from authenticated as well; service_role only.

-- 1) Shared gate -------------------------------------------------------------
create or replace function public.assert_admin_or_internal()
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  -- Direct DB session (pg_cron as postgres, owner, psql): no JWT context.
  if v_claims is null then
    return;
  end if;
  -- PostgREST with the service key (edge functions, workers, scripts).
  if coalesce(v_claims->>'role', '') = 'service_role' then
    return;
  end if;
  -- Signed-in users need an elevated role.
  if has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]) then
    return;
  end if;
  raise exception 'unauthorized' using errcode = '42501';
end;
$$;
revoke execute on function public.assert_admin_or_internal() from public, anon;
grant execute on function public.assert_admin_or_internal() to authenticated, service_role;

-- 2) Gate the five UI-used ops RPCs ------------------------------------------

CREATE OR REPLACE FUNCTION public.event_field_coverage()
 RETURNS TABLE(data_source text, total bigint, pct_no_desc numeric, pct_no_end numeric, pct_no_tz numeric, pct_no_venue numeric, pct_no_img numeric, pct_no_geo numeric, pct_no_url numeric, pct_no_target numeric, pct_no_a11y numeric, pct_no_relev numeric, avg_trust numeric, avg_quality numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.assert_admin_or_internal();
  select
    case when grouping(data_source) = 1 then 'ALL'
         else coalesce(data_source, '(none)') end                                              as data_source,
    count(*)                                                                                    as total,
    round(100.0 * count(*) filter (where description is null or length(trim(description)) < 20) / count(*), 1) as pct_no_desc,
    round(100.0 * count(*) filter (where end_date is null) / count(*), 1)                       as pct_no_end,
    round(100.0 * count(*) filter (where timezone is null) / count(*), 1)                       as pct_no_tz,
    round(100.0 * count(*) filter (where venue_id is null) / count(*), 1)                       as pct_no_venue,
    round(100.0 * count(*) filter (where images is null or array_length(images, 1) is null) / count(*), 1) as pct_no_img,
    round(100.0 * count(*) filter (where latitude is null or longitude is null) / count(*), 1)  as pct_no_geo,
    round(100.0 * count(*) filter (where ticket_url is null and website is null) / count(*), 1) as pct_no_url,
    round(100.0 * count(*) filter (where target_groups is null or array_length(target_groups, 1) is null) / count(*), 1) as pct_no_target,
    round(100.0 * count(*) filter (where accessibility_attributes is null or array_length(accessibility_attributes, 1) is null) / count(*), 1) as pct_no_a11y,
    round(100.0 * count(*) filter (where lgbti_relevance_score is null) / count(*), 1)          as pct_no_relev,
    round(avg(trust_score), 1)                                                                  as avg_trust,
    round(avg(quality_score), 1)                                                                as avg_quality
  from public.events
  where duplicate_of_id is null
  group by rollup (data_source)
  order by grouping(data_source) desc, count(*) desc;
$function$;

CREATE OR REPLACE FUNCTION public.find_duplicate_clusters(p_content_type text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select public.assert_admin_or_internal();
  with norm as (
    select entity_id, title, city, country, slug,
           lower(unaccent(btrim(coalesce(title,'')))) as nt,
           coalesce(lower(unaccent(btrim(city))), '')  as nc,
           case when p_content_type in ('event','festival','news') and start_date is not null
                then to_char((start_date at time zone 'UTC'), 'YYYY-MM-DD') else '' end as nd
    from public.search_documents
    where entity_type = p_content_type and title is not null and length(btrim(title)) >= 3
  ),
  groups as (
    select nt, nc, nd, count(*) as c,
           jsonb_agg(jsonb_build_object('id', entity_id, 'title', title, 'city', city,
                                        'country', country, 'slug', slug)
                     order by slug nulls last) as members
    from norm group by nt, nc, nd having count(*) > 1
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object('normalized_title', nt, 'city', nullif(nc,''),
                                        'day', nullif(nd,''), 'count', c, 'members', members) order by c desc)
    from (select * from groups order by c desc, nt limit greatest(p_limit, 0)) x
  ), '[]'::jsonb);
$function$;

CREATE OR REPLACE FUNCTION public.tag_quality_scorecard()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.assert_admin_or_internal();
  WITH a AS (SELECT * FROM public.unified_tags WHERE status='active')
  SELECT jsonb_build_object(
    'active_total', (SELECT count(*) FROM a),
    'mean_score', (SELECT round(avg(quality_score),1) FROM a WHERE quality_score IS NOT NULL),
    'mean_confidence', (SELECT round(avg(confidence_score),2) FROM a WHERE confidence_score IS NOT NULL),
    'scored', (SELECT count(*) FROM a WHERE quality_score IS NOT NULL),
    'gaps', jsonb_build_object(
      'description', (SELECT count(*) FROM a WHERE (quality_breakdown->>'desc')::numeric < 1),
      'image',      (SELECT count(*) FROM a WHERE (quality_breakdown->>'image')::numeric < 1),
      'category',   (SELECT count(*) FROM a WHERE (quality_breakdown->>'category')::numeric < 1),
      'i18n',       (SELECT count(*) FROM a WHERE (quality_breakdown->>'i18n')::numeric < 1),
      'links',      (SELECT count(*) FROM a WHERE (quality_breakdown->>'links')::numeric < 1),
      'used',       (SELECT count(*) FROM a WHERE (quality_breakdown->>'used')::numeric < 1),
      'embedding',  (SELECT count(*) FROM a WHERE (quality_breakdown->>'embedding')::numeric < 1)
    ),
    'buckets', jsonb_build_object(
      'p0_20',  (SELECT count(*) FROM a WHERE quality_score < 20),
      'p20_40', (SELECT count(*) FROM a WHERE quality_score >= 20 AND quality_score < 40),
      'p40_60', (SELECT count(*) FROM a WHERE quality_score >= 40 AND quality_score < 60),
      'p60_80', (SELECT count(*) FROM a WHERE quality_score >= 60 AND quality_score < 80),
      'p80_100',(SELECT count(*) FROM a WHERE quality_score >= 80)
    ),
    'review', jsonb_build_object(
      'human_reviewed', (SELECT count(*) FROM a WHERE human_reviewed IS TRUE),
      'reviewed',       (SELECT count(*) FROM a WHERE verification_status='reviewed'),
      'auto',           (SELECT count(*) FROM a WHERE verification_status='auto'),
      'unverified',     (SELECT count(*) FROM a WHERE verification_status='unverified')
    ),
    'sensitive_unreviewed', (SELECT count(*) FROM a WHERE (is_sensitive OR is_adult) AND human_reviewed IS NOT TRUE)
  );
$function$;

CREATE OR REPLACE FUNCTION public.venues_due_for_amenity_backfill(p_limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, name text, category text, description text, tags text[], amenities text[], accessibility_attributes text[], platform_ids jsonb, last_refreshed_at timestamp with time zone, refresh_reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.assert_admin_or_internal();
  SELECT
    v.id, v.name, v.category, v.description, v.tags, v.amenities,
    v.accessibility_attributes, v.platform_ids, v.last_refreshed_at,
    CASE
      WHEN coalesce(array_length(v.amenities,1),0) = 0 THEN 'no_amenities'
      WHEN coalesce(array_length(v.accessibility_attributes,1),0) = 0 THEN 'no_accessibility'
      WHEN v.amenities_verified IS NOT TRUE THEN 'unverified'
      ELSE 'stale'
    END AS refresh_reason
  FROM public.venues v
  WHERE v.closed_at IS NULL AND v.duplicate_of_id IS NULL
  ORDER BY
    (coalesce(array_length(v.amenities,1),0) > 0),
    (coalesce(array_length(v.accessibility_attributes,1),0) > 0),
    (v.amenities_verified IS TRUE),
    v.last_refreshed_at ASC NULLS FIRST
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$function$;

CREATE OR REPLACE FUNCTION public.run_hotel_safety_backfill(p_batch integer DEFAULT 500, p_hotel_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started timestamptz := now(); v_examined int := 0; v_changed int := 0;
  rec record; v_in jsonb; v_out jsonb;
BEGIN
  PERFORM public.assert_admin_or_internal();
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug='hotel_safety_backfill';
  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id,'hotel_safety_backfill',v_started,'success',0,0) RETURNING id INTO v_run_id;

  IF p_hotel_id IS NULL AND (v_enabled IS DISTINCT FROM true) THEN
    UPDATE public.admin_automation_runs SET finished_at=now(),
      summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  FOR rec IN
    SELECT h.id, h.amenities, co.name AS country_name, co.equality_score,
           (co.lgbti_criminalization->>'legal')='false'      AS criminalizing,
           (co.lgbti_criminalization->>'death_penalty')='Yes' AS death_penalty,
           co.lgbti_criminalization->>'penalty'              AS penalty,
           uu.u->>'summary' AS unions_summary
    FROM public.hotels h
    JOIN public.countries co ON co.id=h.country_id
    LEFT JOIN LATERAL (SELECT CASE WHEN co.lgbti_same_sex_unions ~ '^\s*\{'
                                   THEN co.lgbti_same_sex_unions::jsonb ELSE '{}'::jsonb END AS u) uu ON true
    WHERE (p_hotel_id IS NOT NULL AND h.id=p_hotel_id)
       OR (p_hotel_id IS NULL AND (
             h.queer_safety_notes IS NULL
             OR h.queer_safety_notes ILIKE 'LGBTQ+-host accommodation listed on misterb&b%'
             OR h.queer_safety_notes ILIKE '%equality score%'))
    LIMIT p_batch
  LOOP
    v_examined := v_examined + 1;
    v_in := jsonb_build_object('surface','hotel','country_name',rec.country_name,
      'equality_score',rec.equality_score,'criminalizing',rec.criminalizing,
      'death_penalty',rec.death_penalty,'penalty',rec.penalty,'unions_summary',rec.unions_summary,
      'hotel_signals', jsonb_build_object(
        'gay_district',     'gay-district' = ANY(rec.amenities),
        'host_tips',        rec.amenities && ARRAY['host-shares-gay-local-tips','happy-to-share-local-tips'],
        'venues_nearby',    'lgbtq-venues-nearby' = ANY(rec.amenities),
        'clothing_optional', rec.amenities && ARRAY['clothing-optional-accepted','clothing-optional','nudism-allowed']));
    v_out := public.compose_safety_note(v_in);
    UPDATE public.hotels SET queer_safety_notes = v_out->>'note' WHERE id=rec.id;
    v_changed := v_changed + 1;
  END LOOP;

  UPDATE public.admin_automation_runs SET finished_at=now(), items_examined=v_examined,
    items_changed=v_changed, summary=jsonb_build_object('examined',v_examined,'changed',v_changed)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('examined',v_examined,'changed',v_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  RAISE;
END; $function$;

-- 3) No frontend caller -> service_role only ---------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'admin_synonyms_counts','admin_synonyms_list',
        'search_analytics_summary','search_analytics_top_queries','search_analytics_zero_results',
        'search_visibility_worst','assert_search_hybrid_contract',
        'release_gate_checks','trust_safety_gate_status',
        'personalities_nonperson_candidates','personality_quality_overview','venue_quality_stats',
        'cities_due_for_refresh','countries_due_for_enrichment','events_needing_moat_enrich',
        'news_due_for_refresh','marketplace_due_for_tagging','venues_due_for_refresh',
        'venues_misplaced','venues_needing_geocode','tags_due_for_category',
        'triage_stuck_city_safety_reviews','marketplace_brands_pending',
        'refresh_news_corroboration','assign_personality_profession_tags','backfill_personality_geo',
        'build_personality_relationships','marketplace_register_brands','compute_city_completeness',
        'unarchive_personality',
        'run_amenity_coverage_summary','run_city_completeness_recompute','run_city_coverage_radar',
        'run_city_safety_backfill','run_city_trust_recompute','run_country_completeness_recompute',
        'run_event_completeness_recompute','run_event_coverage_radar','run_event_inherit_moat_from_venue',
        'run_event_trust_recompute','run_i18n_cron_auth_fix','run_marketplace_ownership_apply',
        'run_marketplace_review_autotriage','run_marketplace_tag_backfill',
        'run_marketplace_tag_coverage_summary','run_marketplace_tag_llm',
        'run_news_quality_recompute','run_news_trust_recompute','run_profession_normalize_backfill',
        'run_tag_assignment_reconcile','run_tag_quality_recompute','run_venue_coord_snap',
        'run_visibility_score_batch','run_marketplace_quality_recompute'
      ])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
  end loop;
end $$;
