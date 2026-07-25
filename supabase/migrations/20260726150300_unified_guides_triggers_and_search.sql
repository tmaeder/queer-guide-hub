-- ============================================================================
-- Unified Guides (4/4): submission triggers cutover + search integration.
--
-- 1. community_submissions quest triggers now target guides/guide_contributions
--    (the legacy quest_* write path is retired here; tables are frozen in the
--    follow-up freeze migration and dropped after soak).
-- 2. Guides become searchable: search_documents_index_guides + sync trigger.
--    The trigger's UPDATE OF column list deliberately EXCLUDES pick_count and
--    updated_at — the statement-level pick_count refresh UPDATEs guides, and
--    including those columns would loop every pick edit into a reindex.
-- 3. Safety-layer wiring: set_search_document_safety_gated,
--    recompute_safety_gated_for_country, gated_entity_exists gain 'guide'
--    branches; search_documents_rebuild is refreshed to the full current
--    indexer set (it had drifted — orgs/milestones/groups were missing).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. community_submissions triggers → guides
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_submission_autotag_guide()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_quest public.guides%ROWTYPE;
  v_joined boolean;
BEGIN
  IF NEW.guide_id IS NOT NULL OR NEW.submitted_by IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_quest FROM public.guides
   WHERE format = 'quest' AND status = 'published'
     AND starts_at IS NOT NULL AND ends_at IS NOT NULL
     AND now() BETWEEN starts_at AND ends_at
   ORDER BY starts_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_quest.criteria ? 'entity_type'
     AND NEW.content_type IS DISTINCT FROM (v_quest.criteria->>'entity_type') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.guide_participations
     WHERE guide_id = v_quest.id AND user_id = NEW.submitted_by
  ) INTO v_joined;
  IF NOT v_joined THEN RETURN NEW; END IF;

  NEW.guide_id := v_quest.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS submission_autotag_quest ON public.community_submissions;
DROP TRIGGER IF EXISTS submission_autotag_guide ON public.community_submissions;
CREATE TRIGGER submission_autotag_guide
  BEFORE INSERT ON public.community_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_submission_autotag_guide();

CREATE OR REPLACE FUNCTION public.tg_submission_guide_contribution()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.guide_id IS NULL THEN RETURN NEW; END IF;

  IF (TG_OP = 'INSERT') OR (OLD.guide_id IS DISTINCT FROM NEW.guide_id) THEN
    INSERT INTO public.guide_contributions (guide_id, user_id, submission_id, status)
    VALUES (NEW.guide_id, NEW.submitted_by, NEW.id,
      CASE WHEN NEW.status = 'approved' THEN 'accepted'
           WHEN NEW.status = 'rejected' THEN 'rejected'
           ELSE 'pending' END)
    ON CONFLICT DO NOTHING;
  ELSIF (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.guide_contributions
      SET status = CASE WHEN NEW.status = 'approved' THEN 'accepted'
                        WHEN NEW.status = 'rejected' THEN 'rejected'
                        ELSE 'pending' END,
          entity_type = CASE NEW.promoted_to_table
                          WHEN 'venues' THEN 'venue'
                          WHEN 'events' THEN 'event'
                          WHEN 'personalities' THEN 'personality'
                          WHEN 'news_articles' THEN 'news'
                          WHEN 'cities' THEN 'city'
                          WHEN 'marketplace_listings' THEN 'marketplace'
                          ELSE NEW.promoted_to_table
                        END,
          entity_id = NEW.promoted_to_id
      WHERE submission_id = NEW.id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS submission_quest_contribution ON public.community_submissions;
DROP TRIGGER IF EXISTS submission_guide_contribution ON public.community_submissions;
CREATE TRIGGER submission_guide_contribution
  AFTER INSERT OR UPDATE OF guide_id, status, promoted_to_id ON public.community_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_submission_guide_contribution();

-- ---------------------------------------------------------------------------
-- 2. search_documents indexer for guides
-- ---------------------------------------------------------------------------

create or replace function public.search_documents_index_guides(p_id uuid default null::uuid)
returns void language sql security definer
set search_path to 'public','extensions','pg_temp' as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max,
     slug, image_url, city, country, content_language, updated_at)
  select 'guide:'||g.id, 'guide', g.id, g.title, coalesce(g.dek, left(g.intro_md, 240)),
       setweight(to_tsvector('simple', unaccent(coalesce(g.title,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(g.category,''))),'B')
    || setweight(to_tsvector('simple', unaccent(g.format)),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(ci.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(co.name,''))),'C')
    || setweight(to_tsvector('simple', unaccent(array_to_string(g.audience_tags,' '))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(g.dek,''))),'D')
    || setweight(to_tsvector('simple', unaccent(coalesce(g.intro_md,''))),'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'entity_kind', 'guide',
      'format', g.format,
      'category', g.category,
      'primary_entity_type', g.primary_entity_type,
      'pick_count', g.pick_count,
      'tags', to_jsonb(g.audience_tags))),
    case when ci.latitude is not null and ci.longitude is not null
         then st_setsrid(st_makepoint(ci.longitude::float8, ci.latitude::float8),4326)::geography end,
    null::smallint, 'live', coalesce(g.is_featured,false), null::smallint, null::timestamptz,
    g.starts_at, g.ends_at, null::boolean, null::numeric, null::numeric,
    g.slug, g.hero_image_path, ci.name, co.name,
    null::text, now()
  from public.guides g
  left join public.cities ci on ci.id = g.city_id
  left join public.countries co on co.id = ci.country_id
  where g.status = 'published'
    and (p_id is null or g.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog,
    is_featured=excluded.is_featured,
    start_date=excluded.start_date, end_date=excluded.end_date,
    slug=excluded.slug, image_url=excluded.image_url, city=excluded.city,
    country=excluded.country, updated_at=now();
$$;

-- Extend the sync dispatcher (body = 20260721130737 milestones version + guide).
create or replace function public.search_documents_sync()
returns trigger language plpgsql security definer
set search_path to 'public','extensions','pg_temp' as $$
begin
  begin
    if (tg_op = 'DELETE') then
      delete from public.search_documents where entity_type = tg_argv[0] and entity_id = old.id;
    else
      delete from public.search_documents where entity_type = tg_argv[0] and entity_id = new.id;
      case tg_argv[0]
        when 'venue'         then perform public.search_documents_index_venues(new.id);
        when 'event'         then perform public.search_documents_index_events(new.id);
        when 'city'          then perform public.search_documents_index_cities(new.id);
        when 'country'       then perform public.search_documents_index_countries(new.id);
        when 'news'          then perform public.search_documents_index_news(new.id);
        when 'marketplace'   then perform public.search_documents_index_marketplace(new.id);
        when 'personality'   then perform public.search_documents_index_personalities(new.id);
        when 'tag'           then perform public.search_documents_index_tags(new.id);
        when 'queer_village' then perform public.search_documents_index_villages(new.id);
        when 'group'         then perform public.search_documents_index_groups(new.id);
        when 'organization'  then perform public.search_documents_index_organizations(new.id);
        when 'milestone'     then perform public.search_documents_index_milestones(new.id);
        when 'guide'         then perform public.search_documents_index_guides(new.id);
        else null;
      end case;
    end if;
  exception when others then null;
  end;
  return coalesce(new, old);
end $$;

-- Column-listed UPDATE trigger: pick_count and updated_at are intentionally
-- absent so the pick-count refresh (an UPDATE on guides) cannot re-fire the
-- indexer on every pick edit.
drop trigger if exists trg_search_documents_guide on public.guides;
create trigger trg_search_documents_guide
  after insert or delete
     or update of status, format, slug, title, dek, intro_md, category,
                  primary_entity_type, city_id, audience_tags, hero_image_path,
                  is_featured, safety_gated, starts_at, ends_at
  on public.guides
  for each row execute function public.search_documents_sync('guide');

-- Mirror safety_gated onto search_documents rows (extends 20260721130737).
create or replace function public.set_search_document_safety_gated()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.safety_gated := case new.entity_type
    when 'venue'        then coalesce((select safety_gated from public.venues        where id = new.entity_id), false)
    when 'event'        then coalesce((select safety_gated from public.events        where id = new.entity_id), false)
    when 'organization' then coalesce((select safety_gated from public.organizations where id = new.entity_id), false)
    when 'milestone'    then coalesce((select safety_gated from public.milestones    where id = new.entity_id), false)
    when 'guide'        then coalesce((select safety_gated from public.guides        where id = new.entity_id), false)
    else false
  end;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Safety-layer recompute + gated-existence (extend 20260721130632 bodies)
-- ---------------------------------------------------------------------------

create or replace function public.recompute_safety_gated_for_country(p_country_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  update public.venues v
     set safety_gated = public.location_is_high_risk(v.country_id, v.city_id)
   where (v.country_id = p_country_id
          or v.city_id in (select id from public.cities where country_id = p_country_id))
     and v.safety_gated is distinct from public.location_is_high_risk(v.country_id, v.city_id);

  update public.events e
     set safety_gated = public.location_is_high_risk(e.country_id, e.city_id)
   where (e.country_id = p_country_id
          or e.city_id in (select id from public.cities where country_id = p_country_id))
     and e.safety_gated is distinct from public.location_is_high_risk(e.country_id, e.city_id);

  update public.organizations o
     set safety_gated = public.location_is_high_risk(o.country_id, o.city_id)
   where (o.country_id = p_country_id
          or o.city_id in (select id from public.cities where country_id = p_country_id))
     and o.safety_gated is distinct from public.location_is_high_risk(o.country_id, o.city_id);

  update public.milestones m
     set safety_gated = public.location_is_high_risk(m.country_id, m.city_id)
   where (m.country_id = p_country_id
          or m.city_id in (select id from public.cities where country_id = p_country_id))
     and m.safety_gated is distinct from public.location_is_high_risk(m.country_id, m.city_id);

  -- guides carry city only; country resolves through the city.
  update public.guides g
     set safety_gated = public.location_is_high_risk(null, g.city_id)
   where g.city_id in (select id from public.cities where country_id = p_country_id)
     and g.safety_gated is distinct from public.location_is_high_risk(null, g.city_id);
end;
$$;

create or replace function public.gated_entity_exists(p_entity_type text, p_slug text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_entity_type
    when 'venue' then exists (
      select 1 from public.venues
      where slug = p_slug and safety_gated and duplicate_of_id is null and closed_at is null)
    when 'event' then exists (
      select 1 from public.events where slug = p_slug and safety_gated)
    when 'organization' then exists (
      select 1 from public.organizations where slug = p_slug and safety_gated and status = 'active')
    when 'milestone' then exists (
      select 1 from public.milestones
      where slug = p_slug and safety_gated and status = 'published' and duplicate_of_id is null)
    when 'guide' then exists (
      select 1 from public.guides
      where slug = p_slug and safety_gated and status = 'published')
    else false
  end;
$$;

grant execute on function public.gated_entity_exists(text, text) to anon, authenticated, service_role;

-- Refresh the full-rebuild helper to the complete current indexer set (was
-- stale: organizations / groups / milestones were never added) + guides.
create or replace function public.search_documents_rebuild()
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  delete from public.search_documents;
  perform public.search_documents_index_venues(null);
  perform public.search_documents_index_events(null);
  perform public.search_documents_index_cities(null);
  perform public.search_documents_index_countries(null);
  perform public.search_documents_index_news(null);
  perform public.search_documents_index_marketplace(null);
  perform public.search_documents_index_personalities(null);
  perform public.search_documents_index_tags(null);
  perform public.search_documents_index_villages(null);
  perform public.search_documents_index_groups(null);
  perform public.search_documents_index_organizations(null);
  perform public.search_documents_index_milestones(null);
  perform public.search_documents_index_guides(null);
end $$;

-- One-shot index of the backfilled guides (tens of rows — no storm).
select public.search_documents_index_guides(null);
