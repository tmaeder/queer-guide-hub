-- People-layer rethink — Phase 4: real ephemeral geo presence + nearby discovery
-- + safety gating for person discovery.
--
-- Presence lives in its OWN table (never on profiles) so a per-ping write does
-- not storm the trg_search_documents_* sync triggers (CLAUDE.md storm rule).
-- Coordinates are stored ALREADY fuzzed (grid-snapped); raw coords are passed to
-- the SECURITY DEFINER presence_upsert which owns the snap — a modified client
-- cannot bypass it. Rows are ephemeral (short TTL) and opt-in (visibility).
--
-- SAFETY RULE (load-bearing): in a high-risk country (location_is_high_risk) a
-- person is discoverable by location ONLY if they explicitly went live
-- (source='go_live') AND visibility='discovery'; passive presence is rejected at
-- write time, coordinates are fuzzed coarser (~2km vs ~750m), and an
-- unresolvable country is treated as high-risk (conservative).

-- ---------------------------------------------------------------------------
-- 1. Table (auth-uid keyed; one row per user, upserted).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_presence_location (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  geog         extensions.geography(Point, 4326) NOT NULL,  -- already fuzzed at write
  precision_m  int NOT NULL DEFAULT 750,
  city_id      uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  country_id   uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  visibility   text NOT NULL DEFAULT 'discovery'
                 CHECK (visibility IN ('off','discovery','friends_only')),
  is_high_risk boolean NOT NULL DEFAULT false,
  source       text NOT NULL DEFAULT 'go_live'
                 CHECK (source IN ('go_live','app_open')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);

-- Partial GiST: only live/shareable rows. (now() is not IMMUTABLE so the TTL
-- filter cannot live in the index predicate — queries filter expires_at.)
CREATE INDEX IF NOT EXISTS user_presence_geog_gist
  ON public.user_presence_location USING gist (geog) WHERE visibility <> 'off';
CREATE INDEX IF NOT EXISTS user_presence_expires_idx
  ON public.user_presence_location (expires_at);

ALTER TABLE public.user_presence_location ENABLE ROW LEVEL SECURITY;

-- Owner-only direct access. Cross-user reads go through people_discovery only.
DROP POLICY IF EXISTS presence_self_all ON public.user_presence_location;
CREATE POLICY presence_self_all ON public.user_presence_location
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

REVOKE ALL ON public.user_presence_location FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_presence_location TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. presence_upsert — server-authoritative snap + resolve + safety + upsert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.presence_upsert(
  p_lat double precision,
  p_lng double precision,
  p_source text DEFAULT 'go_live',
  p_visibility text DEFAULT 'discovery'
) RETURNS TABLE(city_id uuid, precision_m int, is_high_risk boolean, expires_at timestamptz, written boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_raw extensions.geography;
  v_city uuid; v_country uuid;
  v_hr boolean; v_cell double precision; v_prec int;
  v_slat double precision; v_slng double precision;
  v_geog extensions.geography; v_ttl interval;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'invalid coordinates';
  END IF;
  IF p_source NOT IN ('go_live','app_open') THEN p_source := 'go_live'; END IF;
  IF p_visibility NOT IN ('off','discovery','friends_only') THEN p_visibility := 'discovery'; END IF;

  v_raw := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  -- Nearest known city within a ~1° bbox (keeps the scan small without a
  -- spatial index on cities); country derived from it.
  SELECT c.id, c.country_id INTO v_city, v_country
  FROM public.cities c
  WHERE c.latitude BETWEEN p_lat - 1 AND p_lat + 1
    AND c.longitude BETWEEN p_lng - 1 AND p_lng + 1
  ORDER BY st_distance(st_setsrid(st_makepoint(c.longitude, c.latitude), 4326)::geography, v_raw) ASC
  LIMIT 1;

  -- Unknown country => conservative high-risk.
  v_hr := CASE WHEN v_country IS NULL THEN true
               ELSE public.location_is_high_risk(v_country, v_city) END;

  -- High-risk: no passive presence; require an explicit go-live.
  IF v_hr AND p_source <> 'go_live' THEN
    RETURN QUERY SELECT v_city, NULL::int, true, NULL::timestamptz, false;
    RETURN;
  END IF;

  v_cell := CASE WHEN v_hr THEN 0.02 ELSE 0.0075 END;       -- ~2km vs ~750m
  v_prec := CASE WHEN v_hr THEN 2000 ELSE 750 END;
  v_slat := floor(p_lat / v_cell) * v_cell + v_cell / 2;     -- snap to cell centre
  v_slng := floor(p_lng / v_cell) * v_cell + v_cell / 2;
  v_geog := st_setsrid(st_makepoint(v_slng, v_slat), 4326)::geography;
  v_ttl  := CASE WHEN p_source = 'go_live' THEN interval '60 minutes' ELSE interval '20 minutes' END;

  INSERT INTO public.user_presence_location AS up
    (user_id, geog, precision_m, city_id, country_id, visibility, is_high_risk, source, refreshed_at, expires_at)
  VALUES (v_uid, v_geog, v_prec, v_city, v_country, p_visibility, v_hr, p_source, now(), now() + v_ttl)
  ON CONFLICT (user_id) DO UPDATE SET
    geog = excluded.geog, precision_m = excluded.precision_m, city_id = excluded.city_id,
    country_id = excluded.country_id, visibility = excluded.visibility,
    is_high_risk = excluded.is_high_risk, source = excluded.source,
    refreshed_at = now(), expires_at = excluded.expires_at;

  RETURN QUERY SELECT v_city, v_prec, v_hr, now() + v_ttl, true;
END $$;

-- Panic / quick-exit: removes the user from every radius query immediately.
CREATE OR REPLACE FUNCTION public.presence_clear()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ DELETE FROM public.user_presence_location WHERE user_id = auth.uid(); $$;

REVOKE ALL ON FUNCTION public.presence_upsert(double precision, double precision, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.presence_upsert(double precision, double precision, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.presence_clear() FROM anon;
GRANT EXECUTE ON FUNCTION public.presence_clear() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. people_discovery — add p_radius_m + a real-geo 'nearby' branch.
--    (DROP first: adding a parameter changes the signature.)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.people_discovery(uuid, text, uuid, uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.people_discovery(
  p_viewer uuid, p_mode text, p_city_id uuid DEFAULT NULL, p_event_id uuid DEFAULT NULL,
  p_trip_id uuid DEFAULT NULL, p_limit integer DEFAULT 60, p_radius_m integer DEFAULT 5000
) RETURNS TABLE(user_id uuid, score integer, shared jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_is_place boolean := (p_city_id is not null or p_event_id is not null);
begin
  if p_viewer is null then return; end if;
  if auth.uid() is not null and p_viewer is distinct from auth.uid() then
    return;
  end if;

  if p_mode = 'dating' then
    if not public.is_intimate_eligible(p_viewer) then
      return;
    end if;
    return query
    with pool as (
      select dv.user_id as cand, dv.last_active_at
      from intimate_discovery_v dv
      where dv.user_id <> p_viewer
        and not public.intimate_is_blocked(p_viewer, dv.user_id)
        and not exists (
          select 1 from intimate_passes ip
          where ip.actor_id = p_viewer and ip.target_id = dv.user_id)
        and (p_city_id is null or dv.discovery_city_id = p_city_id)
      order by dv.last_active_at desc nulls last
      limit 300
    )
    select
      pool.cand,
      public.compute_compatibility(p_viewer, pool.cand) as score,
      jsonb_build_object(
        'shared_events', (select count(*) from event_attendees a
                            join event_attendees b on a.event_id = b.event_id
                            where a.user_id = p_viewer and b.user_id = pool.cand),
        'mutual_groups', (select count(*) from group_memberships g1
                            join group_memberships g2 on g1.group_id = g2.group_id
                            where g1.user_id = p_viewer and g2.user_id = pool.cand)
      )
    from pool
    order by score desc, pool.last_active_at desc nulls last, pool.cand
    limit greatest(p_limit, 1);
    return;
  end if;

  if p_mode = 'friends' then
    return query
    with pool as (
      select p.user_id as cand, p.last_active_at
      from profiles p
      where p.user_id <> p_viewer
        and not public.intimate_is_blocked(p_viewer, p.user_id)
        and coalesce(p.privacy_settings->>'profile_visibility','public') in ('public','community')
        and not exists (
          select 1 from user_relationships r
          where r.relationship_type = 'friend' and r.status = 'accepted'
            and ((r.user_id = p_viewer and r.target_user_id = p.user_id)
              or (r.user_id = p.user_id and r.target_user_id = p_viewer)))
      order by p.last_active_at desc nulls last
      limit 300
    )
    select
      pool.cand,
      public.compute_compatibility(p_viewer, pool.cand) as score,
      jsonb_build_object(
        'shared_events',  (select count(*) from event_attendees a
                             join event_attendees b on a.event_id = b.event_id
                             where a.user_id = p_viewer and b.user_id = pool.cand),
        'mutual_groups',  (select count(*) from group_memberships g1
                             join group_memberships g2 on g1.group_id = g2.group_id
                             where g1.user_id = p_viewer and g2.user_id = pool.cand),
        'mutual_friends', (select count(*) from (
                              select target_user_id fid from user_relationships
                                where user_id = p_viewer and relationship_type='friend' and status='accepted'
                              union select user_id from user_relationships
                                where target_user_id = p_viewer and relationship_type='friend' and status='accepted') vf
                            join (
                              select target_user_id fid from user_relationships
                                where user_id = pool.cand and relationship_type='friend' and status='accepted'
                              union select user_id from user_relationships
                                where target_user_id = pool.cand and relationship_type='friend' and status='accepted') cf
                            using (fid))
      )
    from pool
    order by score desc, pool.last_active_at desc nulls last, pool.cand
    limit greatest(p_limit, 1);
    return;
  end if;

  if p_mode = 'travel' then
    return query
    with ctx as (
      select coalesce((select primary_city_id from trips where id = p_trip_id), p_city_id) as city,
             (select start_date from trips where id = p_trip_id) as sd,
             (select end_date   from trips where id = p_trip_id) as ed
    ),
    pool as (
      select p.user_id as cand, p.last_active_at
      from profiles p, ctx
      where p.user_id <> p_viewer
        and not public.intimate_is_blocked(p_viewer, p.user_id)
        and (
          case when ctx.city is not null then
            coalesce(p.presence_visibility->>'in_discovery','false') = 'true'
            and (
              (p.travel_mode->>'city_id') = ctx.city::text
              or exists (
                select 1 from trips t
                where t.owner_id = p.user_id and t.primary_city_id = ctx.city
                  and (ctx.sd is null
                       or daterange(t.start_date, t.end_date, '[]') && daterange(ctx.sd, ctx.ed, '[]')))
            )
          else
            coalesce(p.presence_visibility->>'in_directory','false') = 'true'
            and nullif(p.travel_mode->>'city_id','') is not null
          end
        )
      order by p.last_active_at desc nulls last
      limit 300
    )
    select
      pool.cand,
      public.compute_compatibility(p_viewer, pool.cand) as score,
      jsonb_build_object(
        'shared_events', (select count(*) from event_attendees a
                            join event_attendees b on a.event_id = b.event_id
                            where a.user_id = p_viewer and b.user_id = pool.cand),
        'mutual_groups', (select count(*) from group_memberships g1
                            join group_memberships g2 on g1.group_id = g2.group_id
                            where g1.user_id = p_viewer and g2.user_id = pool.cand)
      )
    from pool
    order by score desc, pool.last_active_at desc nulls last, pool.cand
    limit greatest(p_limit, 1);
    return;
  end if;

  if p_mode = 'nearby' then
    -- Viewer must have a live (non-off, non-expired) presence row to get an origin.
    return query
    with me as (
      select geog as origin
      from user_presence_location
      where user_id = p_viewer and expires_at > now() and visibility <> 'off'
    ),
    pool as (
      select upl.user_id as cand, upl.refreshed_at, upl.precision_m,
             st_distance(upl.geog, me.origin) as dist_m
      from user_presence_location upl, me
      where upl.user_id <> p_viewer
        and upl.expires_at > now()
        and upl.visibility <> 'off'
        -- HIGH-RISK GATE: criminalizing-country presence surfaces only if the
        -- person explicitly went live to discovery; never passively, never anon.
        and (not upl.is_high_risk or upl.visibility = 'discovery')
        and (upl.visibility <> 'friends_only' or exists (
              select 1 from user_relationships r
              where r.relationship_type='friend' and r.status='accepted'
                and ((r.user_id=p_viewer and r.target_user_id=upl.user_id)
                  or (r.user_id=upl.user_id and r.target_user_id=p_viewer))))
        and not public.intimate_is_blocked(p_viewer, upl.user_id)
        and st_dwithin(upl.geog, me.origin, coalesce(p_radius_m, 5000) + upl.precision_m)
      order by dist_m asc
      limit 300
    )
    select
      pool.cand,
      public.compute_compatibility(p_viewer, pool.cand) as score,
      jsonb_build_object(
        'distance_m',  round(pool.dist_m)::int,   -- fuzzed distance only
        'precision_m', pool.precision_m,
        'last_seen',   pool.refreshed_at
      )
    from pool
    order by score desc, pool.dist_m asc, pool.cand
    limit greatest(p_limit, 1);
    return;
  end if;

  -- default: 'locals' / place-context discovery (city/event), unchanged.
  return query
  with pool as (
    select p.user_id as cand, p.last_active_at
    from profiles p
    where p.user_id <> p_viewer
      and not public.intimate_is_blocked(p_viewer, p.user_id)
      and (
        case
          when p_event_id is not null then exists (
            select 1 from event_attendees ea
            where ea.event_id = p_event_id and ea.user_id = p.user_id
              and ea.status in ('going','interested'))
          when p_city_id is not null then (
            exists (select 1 from user_travel_preferences u
                    where u.user_id = p.user_id and u.home_city_id = p_city_id)
            or (p.travel_mode->>'city_id') = p_city_id::text)
          else true
        end
      )
      and (
        case
          when v_is_place then coalesce(p.presence_visibility->>'in_discovery','false') = 'true'
          else coalesce(p.privacy_settings->>'profile_visibility','public') in ('public','community')
        end
      )
    order by p.last_active_at desc nulls last
    limit 300
  )
  select
    pool.cand,
    public.compute_compatibility(p_viewer, pool.cand) as score,
    jsonb_build_object(
      'shared_events',  (select count(*) from event_attendees a
                           join event_attendees b on a.event_id = b.event_id
                           where a.user_id = p_viewer and b.user_id = pool.cand),
      'mutual_groups',  (select count(*) from group_memberships g1
                           join group_memberships g2 on g1.group_id = g2.group_id
                           where g1.user_id = p_viewer and g2.user_id = pool.cand),
      'mutual_friends', (select count(*) from (
                            select target_user_id fid from user_relationships
                              where user_id = p_viewer and relationship_type='friend' and status='accepted'
                            union select user_id from user_relationships
                              where target_user_id = p_viewer and relationship_type='friend' and status='accepted') vf
                          join (
                            select target_user_id fid from user_relationships
                              where user_id = pool.cand and relationship_type='friend' and status='accepted'
                            union select user_id from user_relationships
                              where target_user_id = pool.cand and relationship_type='friend' and status='accepted') cf
                          using (fid))
    )
  from pool
  order by score desc, pool.last_active_at desc nulls last, pool.cand
  limit greatest(p_limit, 1);
end;
$function$;

REVOKE ALL ON FUNCTION public.people_discovery(uuid, text, uuid, uuid, uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.people_discovery(uuid, text, uuid, uuid, uuid, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cleanup cron — purge expired presence (hygiene; the partial index already
--    hides stale rows from queries).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_presence_purge()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_deleted int; v_automation_id uuid; v_started timestamptz := now();
BEGIN
  SELECT id INTO v_automation_id FROM public.admin_automations WHERE slug = 'presence_purge';
  DELETE FROM public.user_presence_location WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = row_count;
  IF v_automation_id IS NOT NULL THEN
    UPDATE public.admin_automations SET last_run_at = v_started, last_run_status = 'success' WHERE id = v_automation_id;
  END IF;
  RETURN jsonb_build_object('deleted', v_deleted);
END $$;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('presence_purge','Presence purge',
   'Deletes expired ephemeral user_presence_location rows every 15 minutes. Hygiene only — the partial GiST index already excludes stale rows from nearby discovery.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_presence_purge"}'::jsonb, '*/15 * * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='presence_purge') THEN
    PERFORM cron.unschedule('presence_purge');
  END IF;
  PERFORM cron.schedule('presence_purge', '*/15 * * * *', 'SELECT public.run_presence_purge();');
END $$;
