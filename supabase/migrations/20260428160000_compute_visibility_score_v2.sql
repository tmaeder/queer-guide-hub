-- Production compute_visibility_score: replaces the Phase 0 stub with real
-- per-axis logic across all main entity types. Returns the same JSONB shape
-- the contract documents in docs/search-intelligence/02-unified-model.md.
--
-- Axes (and weights, must sum to 1.0):
--   tags     0.20 — number of active tag assignments
--   geo      0.15 — coordinates present + valid + timezone (where applicable)
--   images   0.15 — image present + dedup hash + alt text (where applicable)
--   dates    0.10 — required date fields present + freshness for events/news
--   text     0.20 — title + description length
--   synonyms 0.10 — active synonyms whose terms match the title
--   queries  0.10 — placeholder until query log is wired (always 0.5)

create or replace function public.compute_visibility_score(
  p_entity_type text,
  p_entity_id   uuid
) returns jsonb
language plpgsql
stable
as $$
declare
  -- per-axis scores (0..1)
  v_tags    numeric := 0;
  v_geo     numeric := 0;
  v_image_score numeric := 0;
  v_dates   numeric := 0;
  v_text    numeric := 0;
  v_syn     numeric := 0;
  v_query   numeric := 0.5;

  -- per-axis notes (human-readable)
  n_tags    text[] := array[]::text[];
  n_geo     text[] := array[]::text[];
  n_images  text[] := array[]::text[];
  n_dates   text[] := array[]::text[];
  n_text    text[] := array[]::text[];
  n_syn     text[] := array[]::text[];
  n_query   text[] := array['query log not yet wired into scoring']::text[];

  v_suggestions text[] := array[]::text[];

  -- weights (must sum to 1.0)
  w_tag   constant numeric := 0.20;
  w_geo   constant numeric := 0.15;
  w_image constant numeric := 0.15;
  w_date  constant numeric := 0.10;
  w_text  constant numeric := 0.20;
  w_syn   constant numeric := 0.10;
  w_query constant numeric := 0.10;

  -- entity fields (one variable per concern; not every entity uses all)
  v_title       text;
  v_description text;
  v_lat         numeric;
  v_lng         numeric;
  v_timezone    text;
  v_image_url   text;
  v_images      text[];
  v_image_hash  text;
  v_published_at timestamptz;
  v_start_date  timestamptz;
  v_end_date    timestamptz;
  v_recurrence  jsonb;
  v_status      text;

  v_assign_type text;
  v_tag_count   int;
  v_syn_hits    int;
  v_title_len   int;
  v_desc_len    int;
  v_score       numeric;
  v_breakdown   jsonb;
  v_found       boolean := false;
begin
  -- Map entity_type to unified_tag_assignments.entity_type values.
  v_assign_type := case p_entity_type
    when 'venue' then 'venue'
    when 'event' then 'event'
    when 'news_article' then 'article'
    when 'article' then 'article'
    when 'marketplace_listing' then 'listing'
    when 'listing' then 'listing'
    when 'personality' then 'profile'
    when 'profile' then 'profile'
    when 'group' then 'group'
    else null
  end;

  -- Per-entity row fetch. We keep the column names the migration analysis
  -- confirmed (e.g. venues.name, events.title, events.start_date).
  if p_entity_type = 'venue' then
    select v.name, v.description, v.latitude, v.longitude, v.images
      into v_title, v_description, v_lat, v_lng, v_images
      from public.venues v where v.id = p_entity_id;
    v_found := found;
  elsif p_entity_type = 'event' then
    select e.title, e.description, e.latitude, e.longitude, e.images,
           e.start_date, e.end_date, e.recurrence_rule, e.status
      into v_title, v_description, v_lat, v_lng, v_images,
           v_start_date, v_end_date, v_recurrence, v_status
      from public.events e where e.id = p_entity_id;
    v_found := found;
  elsif p_entity_type in ('news_article','article') then
    select n.title, n.content, n.image_url, n.image_hash, n.published_at
      into v_title, v_description, v_image_url, v_image_hash, v_published_at
      from public.news_articles n where n.id = p_entity_id;
    v_found := found;
  elsif p_entity_type in ('marketplace_listing','listing') then
    select m.title, m.description, m.latitude, m.longitude, m.images, m.status
      into v_title, v_description, v_lat, v_lng, v_images, v_status
      from public.marketplace_listings m where m.id = p_entity_id;
    v_found := found;
  elsif p_entity_type in ('personality','profile') then
    select p.name, p.description, p.image_url
      into v_title, v_description, v_image_url
      from public.personalities p where p.id = p_entity_id;
    v_found := found;
  elsif p_entity_type = 'city' then
    select c.name, c.latitude, c.longitude, c.timezone
      into v_title, v_lat, v_lng, v_timezone
      from public.cities c where c.id = p_entity_id;
    v_found := found;
  elsif p_entity_type = 'country' then
    select co.name, co.latitude, co.longitude, co.timezone
      into v_title, v_lat, v_lng, v_timezone
      from public.countries co where co.id = p_entity_id;
    v_found := found;
  else
    return jsonb_build_object(
      'entity_type', p_entity_type,
      'entity_id',   p_entity_id,
      'score',       0,
      'breakdown',   '{}'::jsonb,
      'suggestions', to_jsonb(array['Unknown entity type: ' || p_entity_type]),
      'computed_at', now()
    );
  end if;

  if not v_found then
    return jsonb_build_object(
      'entity_type', p_entity_type,
      'entity_id',   p_entity_id,
      'score',       0,
      'breakdown',   '{}'::jsonb,
      'suggestions', to_jsonb(array['Entity not found']),
      'computed_at', now()
    );
  end if;

  -- ── Tags axis ─────────────────────────────────────────────────────────────
  if v_assign_type is null then
    v_tags := 1.0;
    n_tags := array_append(n_tags, 'tags not used for this entity type');
  else
    select count(*)::int into v_tag_count
      from public.unified_tag_assignments uta
      join public.unified_tags ut on ut.id = uta.tag_id
     where uta.entity_id = p_entity_id
       and uta.entity_type = v_assign_type
       and ut.status = 'active'
       and ut.merged_into_id is null;

    v_tags := least(v_tag_count::numeric / 3.0, 1.0);
    n_tags := array_append(n_tags, format('%s active tag(s)', v_tag_count));
    if v_tag_count = 0 then
      v_suggestions := array_append(v_suggestions, 'Add at least one tag');
    elsif v_tag_count < 3 then
      v_suggestions := array_append(v_suggestions, 'Add more tags (target: 3+) for richer faceting');
    end if;
  end if;

  -- ── Geo axis ──────────────────────────────────────────────────────────────
  if p_entity_type in ('news_article','article','personality','profile') then
    v_geo := 1.0;
    n_geo := array_append(n_geo, 'geo not applicable for this entity type');
  else
    if v_lat is null or v_lng is null then
      v_geo := 0.0;
      n_geo := array_append(n_geo, 'no coordinates');
      v_suggestions := array_append(v_suggestions, 'Set latitude/longitude');
    elsif v_lat = 0 and v_lng = 0 then
      v_geo := 0.0;
      n_geo := array_append(n_geo, 'coordinates are (0,0) — likely missing');
      v_suggestions := array_append(v_suggestions, 'Coordinates (0,0) are suspect; verify');
    elsif v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then
      v_geo := 0.2;
      n_geo := array_append(n_geo, 'coordinates out of range');
      v_suggestions := array_append(v_suggestions, 'Coordinates out of valid range');
    else
      v_geo := 0.8;
      n_geo := array_append(n_geo, format('lat=%s, lng=%s', v_lat, v_lng));
      if v_timezone is not null and v_timezone <> '' then
        v_geo := 1.0;
        n_geo := array_append(n_geo, format('timezone=%s', v_timezone));
      elsif p_entity_type in ('city','country') then
        v_suggestions := array_append(v_suggestions, 'Set timezone for accurate "open now" filtering');
      end if;
    end if;
  end if;

  -- ── Images axis ───────────────────────────────────────────────────────────
  -- Determine "has at least one image". Different entities use either
  -- `images TEXT[]` or `image_url TEXT`.
  declare has_image boolean := (
    (v_image_url is not null and v_image_url <> '')
    or (v_images is not null and array_length(v_images, 1) is not null)
  );
  begin
    if p_entity_type in ('country','city') then
      v_image_score := 0.5;
      n_images := array_append(n_images, 'image not strictly required for this entity type');
    elsif not has_image then
      v_image_score := 0.0;
      n_images := array_append(n_images, 'no image');
      v_suggestions := array_append(v_suggestions, 'Add an image');
    else
      v_image_score := 0.7;
      n_images := array_append(n_images, 'image present');
      if v_image_hash is not null and v_image_hash <> '' then
        v_image_score := v_image_score + 0.3;
        n_images := array_append(n_images, 'hash present (dedup-ready)');
      else
        v_suggestions := array_append(v_suggestions, 'Compute image hash for cross-content dedup');
      end if;
      if v_image_score > 1.0 then v_image_score := 1.0; end if;
    end if;
  end;

  -- ── Dates axis ────────────────────────────────────────────────────────────
  if p_entity_type = 'event' then
    if v_start_date is null then
      v_dates := 0.0;
      n_dates := array_append(n_dates, 'no start_date');
      v_suggestions := array_append(v_suggestions, 'Set start_date');
    else
      v_dates := 0.7;
      n_dates := array_append(n_dates, format('start_date=%s', v_start_date));
      if v_end_date is not null then
        v_dates := v_dates + 0.15;
      end if;
      if v_recurrence is not null then
        v_dates := v_dates + 0.15;
        n_dates := array_append(n_dates, 'recurrence_rule set');
      end if;
      if v_start_date < (now() - interval '7 days') and v_recurrence is null then
        v_dates := greatest(v_dates - 0.4, 0);
        n_dates := array_append(n_dates, 'event is in the past');
        v_suggestions := array_append(v_suggestions, 'Past one-off event: archive or update');
      end if;
      if v_dates > 1.0 then v_dates := 1.0; end if;
    end if;
  elsif p_entity_type in ('news_article','article') then
    if v_published_at is null then
      v_dates := 0.0;
      n_dates := array_append(n_dates, 'no published_at');
      v_suggestions := array_append(v_suggestions, 'Set published_at');
    else
      v_dates := 1.0;
      n_dates := array_append(n_dates, format('published_at=%s', v_published_at));
    end if;
  else
    v_dates := 1.0;
    n_dates := array_append(n_dates, 'dates not central for this entity type');
  end if;

  -- ── Text axis ─────────────────────────────────────────────────────────────
  v_title_len := coalesce(length(v_title), 0);
  v_desc_len  := coalesce(length(v_description), 0);
  declare title_score numeric;
          desc_score  numeric;
  begin
    if v_title_len = 0 then
      title_score := 0;
      v_suggestions := array_append(v_suggestions, 'Title is missing');
    elsif v_title_len < 10 then
      title_score := 0.4;
      v_suggestions := array_append(v_suggestions, format('Title is short (%s chars); aim for 20+', v_title_len));
    elsif v_title_len < 20 then
      title_score := 0.7;
    else
      title_score := 1.0;
    end if;

    -- Cities/countries don't have a description column — score on title only.
    if p_entity_type in ('city','country') then
      v_text := title_score;
      n_text := array_append(n_text, format('title=%s chars (no description column for this entity)', v_title_len));
    else
      if v_desc_len = 0 then
        desc_score := 0;
        v_suggestions := array_append(v_suggestions, 'Description is missing');
      elsif v_desc_len < 80 then
        desc_score := 0.4;
        v_suggestions := array_append(v_suggestions, format('Description is short (%s chars); aim for 200+', v_desc_len));
      elsif v_desc_len < 200 then
        desc_score := 0.7;
      else
        desc_score := 1.0;
      end if;
      v_text := title_score * 0.4 + desc_score * 0.6;
      n_text := array_append(n_text, format('title=%s chars, description=%s chars', v_title_len, v_desc_len));
    end if;
  end;

  -- ── Synonyms axis ─────────────────────────────────────────────────────────
  -- Count active synonyms whose terms or replacements appear in the title
  -- (case-insensitive substring). A coarse but useful "is the entity covered
  -- by our synonym layer" signal.
  if v_title is null or v_title = '' then
    v_syn := 0.5;
    n_syn := array_append(n_syn, 'no title to match');
  else
    select count(*)::int into v_syn_hits
      from public.search_synonyms ss
     where ss.status = 'active'
       and (
         exists (select 1 from unnest(ss.terms) t where position(lower(t) in lower(v_title)) > 0)
         or exists (select 1 from unnest(ss.replacements) r where position(lower(r) in lower(v_title)) > 0)
       );

    if v_syn_hits = 0 then
      v_syn := 0.5;
      n_syn := array_append(n_syn, 'no matching active synonyms');
    else
      v_syn := least(0.5 + (v_syn_hits::numeric * 0.25), 1.0);
      n_syn := array_append(n_syn, format('%s matching active synonym(s)', v_syn_hits));
    end if;
  end if;

  -- ── Combine ───────────────────────────────────────────────────────────────
  v_score :=
      v_tags   * w_tag   +
      v_geo    * w_geo   +
      v_image_score * w_image +
      v_dates  * w_date  +
      v_text   * w_text  +
      v_syn    * w_syn   +
      v_query  * w_query;

  v_breakdown := jsonb_build_object(
    'tags',     jsonb_build_object('score', round(v_tags,   3), 'weight', w_tag,   'notes', to_jsonb(n_tags)),
    'geo',      jsonb_build_object('score', round(v_geo,    3), 'weight', w_geo,   'notes', to_jsonb(n_geo)),
    'images',   jsonb_build_object('score', round(v_image_score, 3), 'weight', w_image, 'notes', to_jsonb(n_images)),
    'dates',    jsonb_build_object('score', round(v_dates,  3), 'weight', w_date,  'notes', to_jsonb(n_dates)),
    'text',     jsonb_build_object('score', round(v_text,   3), 'weight', w_text,  'notes', to_jsonb(n_text)),
    'synonyms', jsonb_build_object('score', round(v_syn,    3), 'weight', w_syn,   'notes', to_jsonb(n_syn)),
    'queries',  jsonb_build_object('score', round(v_query,  3), 'weight', w_query, 'notes', to_jsonb(n_query))
  );

  return jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id',   p_entity_id,
    'score',       round(v_score, 3),
    'breakdown',   v_breakdown,
    'suggestions', to_jsonb(v_suggestions),
    'computed_at', now()
  );
end $$;

revoke all on function public.compute_visibility_score(text, uuid) from public;
grant execute on function public.compute_visibility_score(text, uuid)
  to authenticated, service_role;

comment on function public.compute_visibility_score(text, uuid) is
  'Production per-axis Search Visibility Score. Replaces the Phase 0 stub. Axes: tags, geo, images, dates, text, synonyms, queries (placeholder).';
