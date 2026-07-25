-- Duplicate-merge cores — Phase 2: news_articles, queer_villages, countries (2026-07-25)
--
-- Extends the reversible merge dispatcher to the three remaining "heavy" types.
-- Same _event_merge_core pattern: conflict-safe child reparent, set duplicate_of_id
-- (the hidden flag), slug redirect, audit to entity_merge_audit (reversible).
--
-- Hide: the news + country indexers already guard duplicate_of_id (auto-hide).
-- queer_villages did NOT — this migration adds the guard to its indexer.

-- ---------------------------------------------------------------------------
-- 0. Columns (news + countries already have duplicate_of_id) + slug redirects.
-- ---------------------------------------------------------------------------
ALTER TABLE public.queer_villages
  ADD COLUMN IF NOT EXISTS duplicate_of_id uuid REFERENCES public.queer_villages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS queer_villages_duplicate_of_idx
  ON public.queer_villages(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.news_slug_redirects (
  old_slug text PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.village_slug_redirects (
  old_slug text PRIMARY KEY,
  village_id uuid NOT NULL REFERENCES public.queer_villages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.country_slug_redirects (
  old_slug text PRIMARY KEY,
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 1. _news_merge_core — reparent content junctions conflict-safely + hero/recap.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._news_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.news_articles where id = p_keep_id;
  if not found then raise exception 'keep article % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep article is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.news_articles where id = p_drop_id;
  if not found then raise exception 'drop article % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop article already merged'; end if;

  update public.news_article_cities c set article_id = p_keep_id where c.article_id = p_drop_id
    and not exists (select 1 from public.news_article_cities k where k.article_id = p_keep_id and k.city_id = c.city_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_cities', n);
  update public.news_article_countries c set article_id = p_keep_id where c.article_id = p_drop_id
    and not exists (select 1 from public.news_article_countries k where k.article_id = p_keep_id and k.country_id = c.country_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_countries', n);
  update public.news_article_entities e set article_id = p_keep_id where e.article_id = p_drop_id
    and not exists (select 1 from public.news_article_entities k where k.article_id = p_keep_id and k.entity_type = e.entity_type and k.entity_id = e.entity_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_entities', n);
  update public.news_story_articles s set article_id = p_keep_id where s.article_id = p_drop_id
    and not exists (select 1 from public.news_story_articles k where k.story_id = s.story_id and k.article_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_story_articles', n);
  update public.user_news_reads u set article_id = p_keep_id where u.article_id = p_drop_id
    and not exists (select 1 from public.user_news_reads k where k.user_id = u.user_id and k.article_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('user_news_reads', n);

  -- pointer repoints (a story's hero / a quest's recap now point at the survivor)
  update public.news_stories set hero_article_id = p_keep_id where hero_article_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_stories_hero', n);
  update public.quests set recap_article_id = p_keep_id where recap_article_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('quests_recap', n);

  if v_drop_slug is not null then
    insert into public.news_slug_redirects (old_slug, article_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set article_id = excluded.article_id;
  end if;

  update public.news_articles set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;
  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('news', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','news','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 2. _queer_village_merge_core — reparent content children (signal tables stay).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._queer_village_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.queer_villages where id = p_keep_id;
  if not found then raise exception 'keep village % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep village is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.queer_villages where id = p_drop_id;
  if not found then raise exception 'drop village % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop village already merged'; end if;

  update public.venues set queer_village_id = p_keep_id where queer_village_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venues', n);
  update public.events set queer_village_id = p_keep_id where queer_village_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events', n);
  update public.hotels set queer_village_id = p_keep_id where queer_village_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('hotels', n);
  update public.trip_destinations set village_id = p_keep_id where village_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_destinations', n);

  if v_drop_slug is not null then
    insert into public.village_slug_redirects (old_slug, village_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set village_id = excluded.village_id;
  end if;

  update public.queer_villages set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;
  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('queer_village', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','queer_village','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 3. _country_merge_core — repoint every country_id child (loop) + news junction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._country_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
  -- (table, fk column) — plain repoints (no colliding unique on the FK)
  v_pairs text[] := array[
    'cities','country_id', 'venues','country_id', 'events','country_id', 'festivals','country_id',
    'hotels','country_id', 'organizations','country_id', 'queer_villages','country_id',
    'milestones','country_id', 'personalities','country_id', 'personalities','death_country_id',
    'geo_sources','country_id', 'reservations','country_id', 'trip_destinations','country_id',
    'trip_documents','country_id', 'trip_places','country_id', 'trips','primary_country_id',
    'user_travel_preferences','home_country_id', 'user_presence_location','country_id',
    'flyer_scans','matched_country_id', 'trip_geo_review_queue','resolved_country_id',
    'ingestion_events','country_id'
  ];
  i int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.countries where id = p_keep_id;
  if not found then raise exception 'keep country % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep country is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.countries where id = p_drop_id;
  if not found then raise exception 'drop country % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop country already merged'; end if;

  i := 1;
  while i < array_length(v_pairs, 1) loop
    execute format('update public.%I set %I = $1 where %I = $2', v_pairs[i], v_pairs[i+1], v_pairs[i+1])
      using p_keep_id, p_drop_id;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object(v_pairs[i] || '.' || v_pairs[i+1], n);
    i := i + 2;
  end loop;

  -- news_article_countries: conflict-safe on UNIQUE(article_id, country_id)
  update public.news_article_countries c set country_id = p_keep_id where c.country_id = p_drop_id
    and not exists (select 1 from public.news_article_countries k where k.article_id = c.article_id and k.country_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_countries', n);

  if v_drop_slug is not null then
    insert into public.country_slug_redirects (old_slug, country_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set country_id = excluded.country_id;
  end if;

  update public.countries set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;
  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('country', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','country','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 4. Extend dispatcher / unmerge / chain-collapse with the three new branches.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_entities(p_type text, p_keep_id uuid, p_drop_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_actor uuid := auth.uid();
begin
  if v_actor is not null and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  if    p_type = 'event'         then return public._event_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'marketplace'   then return public._marketplace_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'personality'   then return public._personality_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'organization'  then return public._organization_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'milestone'     then return public._milestone_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'hotel'         then return public._hotel_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'news'          then return public._news_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'queer_village' then return public._queer_village_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'country'       then return public._country_merge_core(p_keep_id, p_drop_id, v_actor);
  else raise exception 'unsupported merge type % (use merge_venues / merge_cities for those)', p_type;
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.unmerge_entities(p_audit_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_actor uuid := auth.uid(); r record;
begin
  if v_actor is not null and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  select * into r from public.entity_merge_audit where id = p_audit_id and undone_at is null;
  if not found then raise exception 'merge audit % not found or already undone', p_audit_id; end if;

  if r.entity_type = 'event' then
    update public.events set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.event_slug_redirects where event_id = r.keep_id
      and old_slug = (select slug from public.events where id = r.drop_id);
  elsif r.entity_type = 'marketplace' then
    update public.marketplace_listings
      set duplicate_of_id = null, status = 'active', deprecated_at = null,
          sensitivity_flags = coalesce(sensitivity_flags,'[]'::jsonb) - 'inactive_reason'
      where id = r.drop_id;
    delete from public.marketplace_slug_redirects where listing_id = r.keep_id
      and old_slug = (select slug from public.marketplace_listings where id = r.drop_id);
  elsif r.entity_type = 'personality' then
    update public.personalities set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.personality_slug_redirects where personality_id = r.keep_id
      and old_slug = (select slug from public.personalities where id = r.drop_id);
  elsif r.entity_type = 'organization' then
    update public.organizations set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.org_slug_redirects where organization_id = r.keep_id
      and old_slug = (select slug from public.organizations where id = r.drop_id);
  elsif r.entity_type = 'milestone' then
    update public.milestones set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.milestone_slug_redirects where milestone_id = r.keep_id
      and old_slug = (select slug from public.milestones where id = r.drop_id);
  elsif r.entity_type = 'hotel' then
    update public.hotels set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.hotel_slug_redirects where hotel_id = r.keep_id
      and old_slug = (select slug from public.hotels where id = r.drop_id);
  elsif r.entity_type = 'news' then
    update public.news_articles set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.news_slug_redirects where article_id = r.keep_id
      and old_slug = (select slug from public.news_articles where id = r.drop_id);
  elsif r.entity_type = 'queer_village' then
    update public.queer_villages set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.village_slug_redirects where village_id = r.keep_id
      and old_slug = (select slug from public.queer_villages where id = r.drop_id);
  elsif r.entity_type = 'country' then
    update public.countries set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.country_slug_redirects where country_id = r.keep_id
      and old_slug = (select slug from public.countries where id = r.drop_id);
  else raise exception 'unsupported entity_type %', r.entity_type;
  end if;

  update public.entity_merge_audit set undone_at = now() where id = p_audit_id;
  return jsonb_build_object('undone', true, 'entity_type', r.entity_type, 'drop_id', r.drop_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.collapse_entity_dup_chains(p_type text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_tbl text; n int;
begin
  perform public.assert_admin_or_internal();
  v_tbl := case p_type when 'event' then 'events' when 'marketplace' then 'marketplace_listings'
                       when 'personality' then 'personalities' when 'venue' then 'venues'
                       when 'news' then 'news_articles' when 'organization' then 'organizations'
                       when 'milestone' then 'milestones' when 'hotel' then 'hotels'
                       when 'queer_village' then 'queer_villages' when 'country' then 'countries'
                       when 'city' then 'cities' else null end;
  if v_tbl is null then raise exception 'unsupported type %', p_type; end if;
  execute format($f$
    with recursive walk as (
      select v.id as node, v.duplicate_of_id as target, 1 as depth from public.%1$I v where v.duplicate_of_id is not null
      union all
      select w.node, r.duplicate_of_id, w.depth + 1 from walk w join public.%1$I r on r.id = w.target
        where r.duplicate_of_id is not null and w.depth < 25
    ), ultimate as (select distinct on (node) node, target as ult from walk order by node, depth desc)
    update public.%1$I v set duplicate_of_id = u.ult from ultimate u
      where v.id = u.node and u.ult is not null and u.ult <> v.id
        and v.duplicate_of_id is distinct from u.ult
  $f$, v_tbl);
  get diagnostics n = row_count; return n;
end; $function$;

-- ---------------------------------------------------------------------------
-- 5. Hide merged villages from search (add the duplicate_of_id guard).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_documents_index_villages(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'queer_village:'||v.id, 'queer_village', v.id, v.name, v.description,
       setweight(to_tsvector('simple', unaccent(coalesce(v.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(ci.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(co.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(v.description,''))),'D')
    || public.i18n_to_tsv(v.name_i18n,'A') || public.i18n_to_tsv(v.description_i18n,'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'city', ci.name, 'country', co.name, 'is_featured', v.featured,
      'tags', to_jsonb(v.tags))),
    case when v.latitude is not null and v.longitude is not null then st_setsrid(st_makepoint(v.longitude::float8, v.latitude::float8),4326)::geography end,
    null::smallint, 'live', coalesce(v.featured,false), null::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    v.slug, coalesce(v.image_url, (v.images)[1]), ci.name, co.name, null::text, now()
  from public.queer_villages v
  left join public.cities ci on ci.id = v.city_id
  left join public.countries co on co.id = v.country_id
  left join public.content_embeddings ce on ce.content_type='queer_village' and ce.content_id=v.id
  where v.duplicate_of_id is null and (p_id is null or v.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog,
    is_featured=excluded.is_featured, slug=excluded.slug, image_url=excluded.image_url,
    city=excluded.city, country=excluded.country, updated_at=now();
$function$;
