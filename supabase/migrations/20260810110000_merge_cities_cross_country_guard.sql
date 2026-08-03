-- merge_cities: refuse a cross-country merge of two distinct same-name cities.
--
-- /admin/duplicates merges off find_duplicate_clusters, which groups candidates
-- by NAME with no country or distance test, and merge_cities accepted whatever
-- it was handed. On 2026-07-29 a batch approval merged 29 pairs of genuinely
-- different cities that happen to share a name. The damage was silent because
-- merge_cities rewrites events.city/venues.city to the surviving name and the
-- geo-derive trigger then rewrites country_id, so the merged rows look
-- self-consistent afterwards.
--
-- Repaired by hand on 2026-08-02 from the evidence that survived (venues kept
-- country_id; Dundee/Potsdam kept state + postal_code; personalities kept
-- birth_place). unmerge_cities only flips duplicate_of_id -- it does NOT
-- restore reparenting -- so there is no cheap undo. Hence a gate at the door.
--
-- Same-country merges are untouched. A cross-country pair whose coordinates
-- agree is a mislabelled duplicate of one real place (Strasbourg DE/FR 5 km,
-- Valparaiso US/CL 1 km, Canterbury US/GB 0 km) and still passes. Everything
-- else must be asserted with p_confirm_cross_country => true.
--
-- The old 2-arg signature is dropped, not left alongside: PostgreSQL prefers an
-- exact arity match, so keeping it would let every existing caller bypass the
-- guard.

drop function if exists public.merge_cities(uuid, uuid);

CREATE OR REPLACE FUNCTION public.merge_cities(p_keep_id uuid, p_drop_id uuid, p_confirm_cross_country boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_keep_name text; v_keep_dup uuid;
  v_drop_name text; v_drop_dup uuid;
  v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
  v_keep_cc text; v_drop_cc text; v_km double precision;
begin
  if v_actor is not null
     and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;

  select name, duplicate_of_id into v_keep_name, v_keep_dup from public.cities where id = p_keep_id;
  if not found then raise exception 'keep city % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep city is itself a duplicate'; end if;

  select name, duplicate_of_id into v_drop_name, v_drop_dup from public.cities where id = p_drop_id;
  if not found then raise exception 'drop city % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop city already merged'; end if;

  -- Cross-country guard.
  --
  -- /admin/duplicates merges off find_duplicate_clusters, which groups by NAME
  -- with no country or distance test. On 2026-07-29 a batch approval merged 29
  -- pairs of genuinely distinct same-name cities across countries -- San Jose CR
  -- into San Jose CA (4,849 km, carrying 28 venues and 6 events), Athens US into
  -- Athens GR, Berlin US into Berlin DE, Victoria BC into Victoria Seychelles.
  -- unmerge_cities does NOT restore reparenting, so each one had to be repaired
  -- by hand from surviving country/postal/birth_place evidence.
  --
  -- Same-country merges are unaffected. A cross-country pair whose coordinates
  -- agree is a mislabelled duplicate (Strasbourg DE/FR 5 km, Valparaiso US/CL
  -- 1 km) and still passes. Anything else has to be asserted explicitly.
  select co.code into v_keep_cc from public.countries co
    join public.cities c on c.country_id = co.id where c.id = p_keep_id;
  select co.code into v_drop_cc from public.countries co
    join public.cities c on c.country_id = co.id where c.id = p_drop_id;

  if not p_confirm_cross_country
     and v_keep_cc is distinct from v_drop_cc then
    select extensions.ST_Distance(
             extensions.ST_MakePoint(k.longitude::float8, k.latitude::float8)::extensions.geography,
             extensions.ST_MakePoint(d.longitude::float8, d.latitude::float8)::extensions.geography) / 1000.0
      into v_km
      from public.cities k, public.cities d
     where k.id = p_keep_id and d.id = p_drop_id;

    if v_km is null or v_km > 50 then
      raise exception
        'refusing cross-country city merge: % [%] into % [%] (% km apart). Distinct same-name cities in different countries are not duplicates. Pass p_confirm_cross_country => true only if these are genuinely one place.',
        v_drop_name, coalesce(v_drop_cc,'?'), v_keep_name, coalesce(v_keep_cc,'?'),
        coalesce(round(v_km)::text, 'unknown');
    end if;
  end if;

  -- denormalized city text on the high-value content tables → canonical name,
  -- scoped to the dropped city's rows (keeps the search trigger churn minimal).
  update public.venues set city = v_keep_name where city_id = p_drop_id and city is distinct from v_keep_name;
  update public.events set city = v_keep_name where city_id = p_drop_id and city is distinct from v_keep_name;

  -- content children with no city-scoped unique: straight reparent
  update public.venues            set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venues', n);
  update public.events            set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events', n);
  update public.festivals         set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('festivals', n);
  update public.hotels            set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('hotels', n);
  update public.queer_villages    set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('queer_villages', n);
  update public.trip_places       set city_id = p_keep_id where city_id = p_drop_id;
  update public.trips             set primary_city_id = p_keep_id where primary_city_id = p_drop_id;
  update public.guides            set city_id = p_keep_id where city_id = p_drop_id;
  update public.geo_sources       set city_id = p_keep_id where city_id = p_drop_id;
  update public.reservations      set city_id = p_keep_id where city_id = p_drop_id;
  update public.intimate_cruising_mode set city_id = p_keep_id where city_id = p_drop_id;
  update public.intimate_profiles set discovery_city_id = p_keep_id where discovery_city_id = p_drop_id;
  update public.user_travel_preferences set home_city_id = p_keep_id where home_city_id = p_drop_id;
  update public.ingestion_events  set city_id = p_keep_id where city_id = p_drop_id;
  update public.flyer_scans       set matched_city_id = p_keep_id where matched_city_id = p_drop_id;
  update public.trip_geo_review_queue set resolved_city_id = p_keep_id where resolved_city_id = p_drop_id;
  update public.venue_coord_fixes set city_id = p_keep_id where city_id = p_drop_id;
  update public.venue_event_staging set city_id = p_keep_id where city_id = p_drop_id;
  update public.user_place_marks  set city_id = p_keep_id where city_id = p_drop_id;
  update public.personalities     set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personalities', n);
  update public.personalities     set death_city_id = p_keep_id where death_city_id = p_drop_id;

  -- junction/user tables with a city-scoped unique: reparent only where it won't
  -- collide with an existing canonical row; leftover conflicts stay on the dup.
  update public.news_article_cities a set city_id = p_keep_id where a.city_id = p_drop_id
    and not exists (select 1 from public.news_article_cities k where k.city_id = p_keep_id and k.article_id = a.article_id);
  update public.city_favorites f set city_id = p_keep_id where f.city_id = p_drop_id
    and not exists (select 1 from public.city_favorites k where k.city_id = p_keep_id and k.user_id = f.user_id);
  update public.source_coverage_targets s set city_id = p_keep_id where s.city_id = p_drop_id
    and not exists (select 1 from public.source_coverage_targets k where k.city_id = p_keep_id
                    and k.source_slug = s.source_slug and k.entity_type = s.entity_type
                    and k.accommodation_type is not distinct from s.accommodation_type);
  update public.event_coverage_gaps g set city_id = p_keep_id where g.city_id = p_drop_id
    and not exists (select 1 from public.event_coverage_gaps k where k.city_id = p_keep_id);

  -- carry the dropped city's aliases over, then register its own name as an alias
  update public.city_aliases al set city_id = p_keep_id where al.city_id = p_drop_id
    and not exists (select 1 from public.city_aliases k where k.city_id = p_keep_id and k.alias_key = al.alias_key);
  if v_drop_name is not null and v_drop_name <> v_keep_name then
    insert into public.city_aliases (city_id, alias)
    values (p_keep_id, v_drop_name)
    on conflict (city_id, alias_key) do nothing;
  end if;

  update public.cities set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  update public.cities set duplicate_of_id = p_keep_id, updated_at = now()
    where duplicate_of_id = p_drop_id and id <> p_keep_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

  insert into public.city_merge_audit (keep_id, drop_id, actor, reparented)
    values (p_keep_id, p_drop_id, v_actor, v_counts) returning id into v_audit_id;

  return jsonb_build_object('audit_id', v_audit_id, 'keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- A fresh CREATE FUNCTION picks up this database's DEFAULT PRIVILEGES, which arm
-- anon. `revoke ... from public` does NOT clear a direct grant to the anon role,
-- so it has to be named explicitly -- the same hole that once left the merge
-- cores anon-callable.
revoke all on function public.merge_cities(uuid, uuid, boolean) from public;
revoke all on function public.merge_cities(uuid, uuid, boolean) from anon;
grant execute on function public.merge_cities(uuid, uuid, boolean) to authenticated, service_role;
