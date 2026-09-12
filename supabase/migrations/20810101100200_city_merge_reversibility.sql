-- City merges become reversible. This is the last of the twelve and the largest, because
-- `merge_cities` is the only merge core that DESTROYS rows and REWRITES an array rather
-- than only repointing foreign keys.
--
-- `city_merge_audit` had no `details` column at all -- not "an empty one", none -- so
-- there was nowhere to record a merge even if the core had wanted to. `unmerge_cities`
-- was correspondingly thin: clear `duplicate_of_id`, delete the alias the merge minted,
-- return `{'unmerged': ..., 'keep_id': ...}`. Every one of the ~25 relations it moved
-- stayed on the survivor, and the return value did not even have a field in which to say
-- so. 335 city merges are on record.
--
-- Cities are the type where this asymmetry was already KNOWN and acted on: the geo arm of
-- the dedup sweep is pinned `is_auto := false` with a hard literal, and
-- `dedupCityGeoArm.test.ts` exists to keep it that way, because 29 wrongly merged pairs
-- on 2026-07-29 had to be repaired by hand. That test's docblock names the reason as
-- "unmerge_cities only flips duplicate_of_id". This migration removes that reason. It
-- does NOT unpin the arm -- whether to auto-merge cities on geography is a separate
-- judgement about the arm's precision, and the 105 `geo_only_2km` pairs sitting in the
-- queue today include `Ulm` vs `Neu-Ulm`, 1.8 km apart and genuinely two towns.
--
-- FOUR THINGS HERE ARE NOT PLAIN FK MOVES, and each needs more than a row id:
--
-- 1. `venues.city` / `events.city` TEXT. The merge overwrites the denormalized city name
--    with the survivor's before moving the ids, so the old string is gone. Recording the
--    row ids is enough to put it back -- they all held the dropped city's name by
--    definition of the WHERE clause -- but the restore must write `v_drop_name`, not
--    re-derive it.
--
-- 2. `news_articles.city_ids` ARRAY. The merge does `array_agg(distinct ...)` replacing
--    drop with keep, which COLLAPSES the pair when an article already carried both. A
--    row-id list cannot reverse that collapse, so the ORIGINAL ARRAY is stored per
--    article. This is the one place where reversing needs the old value rather than the
--    old address.
--
-- 3. `news_article_cities` DELETE. The merge moves what it can, then
--    `delete from news_article_cities where city_id = p_drop_id` destroys the rest --
--    the rows that collided with an existing (article, keep) pair. Those are gone, so the
--    FULL ROWS are captured as jsonb and re-inserted on unmerge.
--
-- 4. `city_aliases`. The merge mints the dropped city's name as an alias on the survivor.
--    `unmerge_cities` already removed that one; it now also puts back the alias rows it
--    moved.
--
-- Everything else is a plain FK repoint and goes through a dynamic (table, column, key)
-- loop, the same shape `_country_merge_core` uses and for the same reason: two of the 23
-- have no `id` column. `intimate_cruising_mode` and `user_travel_preferences` are both
-- keyed by `user_id` -- the `venue_personal_visits` trap again, and the eighth and ninth
-- instances of it across this series.
--
-- The conflict-guarded four (`city_favorites`, `source_coverage_targets`,
-- `event_coverage_gaps`, `city_aliases`) stay explicit rather than joining the loop,
-- because their `and not exists` arms are what stop a unique violation and a generic
-- `update ... where col = $2` would drop that guard silently.

ALTER TABLE public.city_merge_audit ADD COLUMN IF NOT EXISTS details jsonb;

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
  v_moved jsonb := '{}'::jsonb; v_ids jsonb; v_key text; i int;
  v_alias_minted boolean := false;
  v_triples text[] := array[
    'venues','city_id','id', 'events','city_id','id', 'festivals','city_id','id',
    'hotels','city_id','id', 'queer_villages','city_id','id', 'organizations','city_id','id',
    'milestones','city_id','id', 'trip_places','city_id','id', 'trips','primary_city_id','id',
    'guides','city_id','id', 'geo_sources','city_id','id', 'reservations','city_id','id',
    'intimate_cruising_mode','city_id','user_id',
    'intimate_profiles','discovery_city_id','id',
    'user_travel_preferences','home_city_id','user_id',
    'ingestion_events','city_id','id', 'flyer_scans','matched_city_id','id',
    'trip_geo_review_queue','resolved_city_id','id', 'venue_coord_fixes','city_id','id',
    'venue_event_staging','city_id','id', 'user_place_marks','city_id','id',
    'personalities','city_id','id', 'personalities','death_city_id','id'
  ];
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

  select co.code into v_keep_cc from public.countries co
    join public.cities c on c.country_id = co.id where c.id = p_keep_id;
  select co.code into v_drop_cc from public.countries co
    join public.cities c on c.country_id = co.id where c.id = p_drop_id;

  if not p_confirm_cross_country and v_keep_cc is distinct from v_drop_cc then
    select extensions.ST_Distance(
             extensions.ST_MakePoint(k.longitude::float8, k.latitude::float8)::extensions.geography,
             extensions.ST_MakePoint(d.longitude::float8, d.latitude::float8)::extensions.geography) / 1000.0
      into v_km from public.cities k, public.cities d
     where k.id = p_keep_id and d.id = p_drop_id;
    if v_km is null or v_km > 50 then
      raise exception
        'refusing cross-country city merge: % [%] into % [%] (% km apart). Distinct same-name cities in different countries are not duplicates. Pass p_confirm_cross_country => true only if these are genuinely one place.',
        v_drop_name, coalesce(v_drop_cc,'?'), v_keep_name, coalesce(v_keep_cc,'?'),
        coalesce(round(v_km)::text, 'unknown');
    end if;
  end if;

  -- (1) TEXT denormalization, BEFORE the ids move -- the WHERE depends on city_id still
  -- pointing at the dropped city. The recorded ids all held v_drop_name.
  with moved as (
    update public.venues set city = v_keep_name
     where city_id = p_drop_id and city is distinct from v_keep_name returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('venues_city_text', v_ids);

  with moved as (
    update public.events set city = v_keep_name
     where city_id = p_drop_id and city is distinct from v_keep_name returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('events_city_text', v_ids);

  -- plain FK repoints
  i := 1;
  while i < array_length(v_triples, 1) loop
    v_key := v_triples[i] || '.' || v_triples[i+1];
    execute format(
      'with moved as (update public.%I set %I = $1 where %I = $2 returning %I)
       select count(*)::int, coalesce(jsonb_agg(%I), ''[]''::jsonb) from moved',
      v_triples[i], v_triples[i+1], v_triples[i+1], v_triples[i+2], v_triples[i+2])
      into n, v_ids using p_keep_id, p_drop_id;
    v_counts := v_counts || jsonb_build_object(v_key, n);
    v_moved  := v_moved  || jsonb_build_object(v_key, v_ids);
    i := i + 3;
  end loop;

  -- (2) the array rewrite: store the ORIGINAL array, because array_agg(distinct) collapses
  -- an article that already carried both cities and no id list can undo that.
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'city_ids', to_jsonb(a.city_ids))), '[]'::jsonb)
    into v_ids from public.news_articles a where a.city_ids @> array[p_drop_id];
  v_moved := v_moved || jsonb_build_object('news_articles_city_ids', v_ids);

  update public.news_articles a
     set city_ids = (select array_agg(distinct case when cid = p_drop_id then p_keep_id else cid end)
                       from unnest(a.city_ids) cid)
   where a.city_ids @> array[p_drop_id];
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_city_ids', n);

  with moved as (
    update public.news_article_cities a set city_id = p_keep_id where a.city_id = p_drop_id
      and not exists (select 1 from public.news_article_cities k where k.city_id = p_keep_id and k.article_id = a.article_id)
    returning a.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_article_cities', n);
  v_moved  := v_moved  || jsonb_build_object('news_article_cities', v_ids);

  -- (3) the destructive step: capture whole rows, not ids -- they are about to not exist.
  with gone as (delete from public.news_article_cities a where a.city_id = p_drop_id returning a.*)
  select count(*)::int, coalesce(jsonb_agg(to_jsonb(gone)), '[]'::jsonb) into n, v_ids from gone;
  v_counts := v_counts || jsonb_build_object('news_article_cities_dropped', n);
  v_moved  := v_moved  || jsonb_build_object('news_article_cities_deleted_rows', v_ids);

  -- conflict-guarded moves: losers stay on the dropped city, so ids are enough.
  with moved as (
    update public.city_favorites f set city_id = p_keep_id where f.city_id = p_drop_id
      and not exists (select 1 from public.city_favorites k where k.city_id = p_keep_id and k.user_id = f.user_id)
    returning f.id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('city_favorites', v_ids);

  with moved as (
    update public.source_coverage_targets s set city_id = p_keep_id where s.city_id = p_drop_id
      and not exists (select 1 from public.source_coverage_targets k where k.city_id = p_keep_id
                      and k.source_slug = s.source_slug and k.entity_type = s.entity_type
                      and k.accommodation_type is not distinct from s.accommodation_type)
    returning s.id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('source_coverage_targets', v_ids);

  with moved as (
    update public.event_coverage_gaps g set city_id = p_keep_id where g.city_id = p_drop_id
      and not exists (select 1 from public.event_coverage_gaps k where k.city_id = p_keep_id)
    returning g.id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('event_coverage_gaps', v_ids);

  with moved as (
    update public.city_aliases al set city_id = p_keep_id where al.city_id = p_drop_id
      and not exists (select 1 from public.city_aliases k where k.city_id = p_keep_id and k.alias_key = al.alias_key)
    returning al.id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('city_aliases', v_ids);

  -- (4) the minted alias. Record whether THIS merge created it, so unmerge does not
  -- delete an alias that already existed for another reason.
  if v_drop_name is not null and v_drop_name <> v_keep_name then
    insert into public.city_aliases (city_id, alias) values (p_keep_id, v_drop_name)
    on conflict (city_id, alias_key) do nothing;
    v_alias_minted := found;
  end if;

  update public.cities set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  with moved as (
    update public.cities set duplicate_of_id = p_keep_id, updated_at = now()
      where duplicate_of_id = p_drop_id and id <> p_keep_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('dup_children', n);
  v_moved  := v_moved  || jsonb_build_object('dup_children', v_ids);

  insert into public.city_merge_audit (keep_id, drop_id, actor, reparented, details)
    values (p_keep_id, p_drop_id, v_actor, v_counts,
            jsonb_build_object('schema', 1, 'moved', v_moved,
              'drop_name', v_drop_name, 'keep_name', v_keep_name, 'alias_minted', v_alias_minted))
    returning id into v_audit_id;

  return jsonb_build_object('audit_id', v_audit_id, 'keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

CREATE OR REPLACE FUNCTION public.unmerge_cities(p_audit_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  a public.city_merge_audit;
  v_moved jsonb; v_restored boolean := false; v_counts jsonb := '{}'::jsonb; n int;
  v_pre_schema boolean; v_key text; i int; v_rec jsonb;
  v_triples text[] := array[
    'venues','city_id','id', 'events','city_id','id', 'festivals','city_id','id',
    'hotels','city_id','id', 'queer_villages','city_id','id', 'organizations','city_id','id',
    'milestones','city_id','id', 'trip_places','city_id','id', 'trips','primary_city_id','id',
    'guides','city_id','id', 'geo_sources','city_id','id', 'reservations','city_id','id',
    'intimate_cruising_mode','city_id','user_id',
    'intimate_profiles','discovery_city_id','id',
    'user_travel_preferences','home_city_id','user_id',
    'ingestion_events','city_id','id', 'flyer_scans','matched_city_id','id',
    'trip_geo_review_queue','resolved_city_id','id', 'venue_coord_fixes','city_id','id',
    'venue_event_staging','city_id','id', 'user_place_marks','city_id','id',
    'personalities','city_id','id', 'personalities','death_city_id','id'
  ];
begin
  if auth.uid() is not null
     and not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  select * into a from public.city_merge_audit where id = p_audit_id;
  if not found then raise exception 'audit % not found', p_audit_id; end if;
  if a.undone_at is not null then raise exception 'merge already undone'; end if;

  v_pre_schema := coalesce((a.details->>'schema')::int, 0) < 1;
  if v_pre_schema and not p_force then
    raise exception 'city merge audit % predates moved-row recording; its reparenting cannot be restored. Re-run with p_force => true to clear duplicate_of_id only, leaving content on the keep row.', p_audit_id;
  end if;
  v_moved := a.details->'moved';

  if not v_pre_schema then
    -- plain FK repoints, scoped to the keep id so a row that was always on the survivor
    -- is never dragged across.
    i := 1;
    while i < array_length(v_triples, 1) loop
      v_key := v_triples[i] || '.' || v_triples[i+1];
      execute format(
        'update public.%I set %I = $1 where %I = $2 and %I in (select v::uuid from jsonb_array_elements_text($3) v)',
        v_triples[i], v_triples[i+1], v_triples[i+1], v_triples[i+2])
        using a.drop_id, a.keep_id, coalesce(v_moved->v_key, '[]'::jsonb);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object(v_key, n);
      i := i + 3;
    end loop;

    -- TEXT: these ids held the dropped city's name before the merge overwrote it.
    update public.venues set city = a.details->>'drop_name'
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'venues_city_text','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venues_city_text', n);

    update public.events set city = a.details->>'drop_name'
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'events_city_text','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events_city_text', n);

    -- the array: restore the stored original wholesale rather than replacing keep with
    -- drop, which would not recover a collapsed pair.
    n := 0;
    for v_rec in select * from jsonb_array_elements(coalesce(v_moved->'news_articles_city_ids','[]'::jsonb)) loop
      update public.news_articles
         set city_ids = (select array_agg(x::uuid) from jsonb_array_elements_text(v_rec->'city_ids') x)
       where id = (v_rec->>'id')::uuid;
      n := n + 1;
    end loop;
    v_counts := v_counts || jsonb_build_object('news_articles_city_ids', n);

    update public.news_article_cities set city_id = a.drop_id
      where city_id = a.keep_id
        and id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'news_article_cities','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_cities', n);

    -- the destroyed rows come back from their stored bodies.
    insert into public.news_article_cities
    select * from jsonb_populate_recordset(null::public.news_article_cities,
             coalesce(v_moved->'news_article_cities_deleted_rows','[]'::jsonb))
    on conflict do nothing;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_cities_restored', n);

    update public.city_favorites set city_id = a.drop_id
      where city_id = a.keep_id
        and id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'city_favorites','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('city_favorites', n);

    update public.source_coverage_targets set city_id = a.drop_id
      where city_id = a.keep_id
        and id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'source_coverage_targets','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('source_coverage_targets', n);

    update public.event_coverage_gaps set city_id = a.drop_id
      where city_id = a.keep_id
        and id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'event_coverage_gaps','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_coverage_gaps', n);

    update public.city_aliases set city_id = a.drop_id
      where city_id = a.keep_id
        and id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'city_aliases','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('city_aliases', n);

    update public.cities set duplicate_of_id = a.drop_id, updated_at = now()
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'dup_children','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

    v_restored := true;
  end if;

  update public.cities set duplicate_of_id = null, updated_at = now()
    where id = a.drop_id and duplicate_of_id = a.keep_id;

  -- Only remove the minted alias if THIS merge minted it. The pre-schema path keeps the
  -- old unconditional behaviour, which is the best it can do without a record.
  if v_pre_schema or coalesce((a.details->>'alias_minted')::boolean, false) then
    delete from public.city_aliases where city_id = a.keep_id
      and alias_key = lower(coalesce(a.details->>'drop_name',
                            (select name from public.cities where id = a.drop_id)));
  end if;

  update public.city_merge_audit set undone_at = now() where id = p_audit_id;

  return jsonb_build_object('unmerged', a.drop_id, 'keep_id', a.keep_id,
    'reparenting_restored', v_restored,
    'restored', case when v_restored then v_counts else null end);
end; $function$;

REVOKE ALL ON FUNCTION public.unmerge_cities(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unmerge_cities(uuid, boolean) TO authenticated, service_role;

-- PostgREST resolves overloads BY ARGUMENT NAME, so leaving the old 1-arg form installed
-- makes `unmerge_cities({p_audit_id})` ambiguous (42725) instead of picking the new one.
DROP FUNCTION IF EXISTS public.unmerge_cities(uuid);

do $verify$
declare v_src text; k text;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='city_merge_audit' and column_name='details') then
    raise exception 'city_merge_audit.details was not added';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='unmerge_cities'
               and pg_get_function_identity_arguments(p.oid) = 'p_audit_id uuid') then
    raise exception 'the 1-arg unmerge_cities overload is still installed; a named PostgREST call would be ambiguous';
  end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='merge_cities';
  if position('''schema'', 1' in v_src) = 0 then
    raise exception 'merge_cities does not stamp details.schema = 1';
  end if;
  -- the three things a row id cannot reverse
  foreach k in array array['venues_city_text','events_city_text',
                           'news_articles_city_ids','news_article_cities_deleted_rows'] loop
    if position('jsonb_build_object(''' || k || '''' in v_src) = 0 then
      raise exception 'merge_cities never records %', k;
    end if;
  end loop;
  if position('delete from public.news_article_cities a where a.city_id = p_drop_id returning a.*' in v_src) = 0 then
    raise exception 'merge_cities deletes news_article_cities without capturing the rows';
  end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='unmerge_cities';
  if position('jsonb_populate_recordset' in v_src) = 0 then
    raise exception 'unmerge_cities never re-inserts the deleted news_article_cities rows';
  end if;
  if position('''reparenting_restored'', v_restored' in v_src) = 0 then
    raise exception 'unmerge_cities does not report reparenting_restored';
  end if;
  if position('v_pre_schema and not p_force' in v_src) = 0 then
    raise exception 'unmerge_cities does not refuse pre-schema audits';
  end if;

  raise notice 'city merges record and replay all 27 relations, the two text columns, the array and the deleted rows';
end $verify$;
