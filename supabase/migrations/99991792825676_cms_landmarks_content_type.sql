-- Landmarks as a CMS content type.
--
-- A landmark is two rows: its spine row in geo_places (name, slug, coords,
-- image, safety gate) and its geo_landmark_profiles row (kind, address,
-- website, opening hours, accessibility notes, tags). The CMS addresses one
-- record by one id, so this file gives it:
--
--   * cms_landmarks: a read-only view, one row per live landmark with every
--     column of both tables. The list, the full-list export and the
--     single-record export all read it, so an export carries the profile
--     columns as well as the spine ones.
--   * cms_landmark_save(): the only write path. It applies a whitelisted
--     field patch to both tables in one transaction, refuses a stale edit
--     (optimistic concurrency on geo_places.updated_at), and refuses to
--     create, because a landmark needs a parent city or village and that is
--     chosen in /admin/geography.
--
-- Both are SECURITY INVOKER: the existing RLS on the two base tables decides
-- who may read and write (admin/moderator/editor write; the safety gate still
-- hides gated landmarks from anon). Nothing here widens access.

create or replace view public.cms_landmarks
with (security_invoker = true) as
select
  p.id,
  p.name,
  p.slug,
  p.description,
  p.image_url,
  p.curated_image_url,
  p.image_metadata,
  p.image_flagged,
  p.latitude,
  p.longitude,
  p.parent_id,
  p.parent_type,
  p.country_id,
  p.city_id,
  p.name_en,
  p.name_de,
  p.name_i18n,
  p.description_i18n,
  p.code,
  p.safety_gated,
  p.seo_indexable,
  p.data_source,
  p.last_refreshed_at,
  p.created_at,
  p.updated_at,
  l.landmark_kind,
  l.address,
  l.website,
  l.opening_hours,
  l.accessibility_notes,
  l.images,
  l.boundaries,
  l.tags,
  l.featured,
  l.needs_review,
  l.closure_status,
  l.closed_on,
  l.closed_on_precision,
  l.opened_on,
  l.opened_on_precision,
  l.closure_source,
  l.created_by,
  l.updated_by
from public.geo_places p
join public.geo_landmark_profiles l on l.place_id = p.id
where p.place_type = 'landmark'
  and p.duplicate_of_id is null;

comment on view public.cms_landmarks is
  'CMS read model for landmarks: geo_places spine + geo_landmark_profiles, one row per live landmark. Read-only; writes go through cms_landmark_save().';

-- New relations in public pick up default grants for anon/authenticated.
-- The CMS is staff-only, and the view is read-only by construction.
revoke all on public.cms_landmarks from anon, authenticated;
grant select on public.cms_landmarks to authenticated;

create or replace function public.cms_landmark_save(
  p_id uuid,
  p_data jsonb,
  p_expected_updated_at timestamptz default null
)
returns setof public.cms_landmarks
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_spine_keys constant text[] := array[
    'name', 'description', 'image_url', 'latitude', 'longitude', 'seo_indexable'
  ];
  v_profile_keys constant text[] := array[
    'landmark_kind', 'address', 'website', 'accessibility_notes', 'tags',
    'featured', 'needs_review'
  ];
  -- The editor always sends updated_at; it is the concurrency token, not a field.
  v_ignored_keys constant text[] := array['updated_at'];
  v_unknown text[];
  v_current timestamptz;
  v_rows int;
begin
  if p_id is null then
    raise exception 'Landmarks are created under a city or village in /admin/geography'
      using errcode = '22023';
  end if;

  p_data := coalesce(p_data, '{}'::jsonb);

  select array_agg(k) into v_unknown
  from jsonb_object_keys(p_data) k
  where not (k = any (v_spine_keys || v_profile_keys || v_ignored_keys));
  if v_unknown is not null then
    raise exception 'Unknown landmark fields: %', array_to_string(v_unknown, ', ')
      using errcode = '22023';
  end if;

  select updated_at into v_current
  from public.geo_places
  where id = p_id and place_type = 'landmark'
  for update;
  if not found then
    raise exception 'No landmark with id %', p_id using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null and v_current is distinct from p_expected_updated_at then
    raise exception 'This landmark was changed by someone else. Reload before saving.'
      using errcode = '40001';
  end if;

  if p_data ?| v_profile_keys then
    update public.geo_landmark_profiles l set
      landmark_kind = case when p_data ? 'landmark_kind'
        then p_data->>'landmark_kind' else l.landmark_kind end,
      address = case when p_data ? 'address'
        then nullif(btrim(p_data->>'address'), '') else l.address end,
      website = case when p_data ? 'website'
        then nullif(btrim(p_data->>'website'), '') else l.website end,
      accessibility_notes = case when p_data ? 'accessibility_notes'
        then nullif(btrim(p_data->>'accessibility_notes'), '') else l.accessibility_notes end,
      tags = case when p_data ? 'tags'
        then coalesce(
          array(select jsonb_array_elements_text(
            case when jsonb_typeof(p_data->'tags') = 'array' then p_data->'tags' else '[]'::jsonb end)),
          '{}')
        else l.tags end,
      featured = case when p_data ? 'featured'
        then coalesce((p_data->>'featured')::boolean, false) else l.featured end,
      needs_review = case when p_data ? 'needs_review'
        then coalesce((p_data->>'needs_review')::boolean, false) else l.needs_review end,
      updated_by = auth.uid()
    where l.place_id = p_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'Landmark % has no profile row you can edit', p_id using errcode = '42501';
    end if;
  end if;

  -- Always touch the spine row: geo_places_derive() stamps updated_at, which
  -- is the concurrency token for both tables, and a profile-only edit must
  -- move it too.
  update public.geo_places g set
    name = case when p_data ? 'name'
      then coalesce(nullif(btrim(p_data->>'name'), ''), g.name) else g.name end,
    description = case when p_data ? 'description'
      then nullif(btrim(p_data->>'description'), '') else g.description end,
    image_url = case when p_data ? 'image_url'
      then nullif(btrim(p_data->>'image_url'), '') else g.image_url end,
    latitude = case when p_data ? 'latitude'
      then (p_data->>'latitude')::numeric else g.latitude end,
    longitude = case when p_data ? 'longitude'
      then (p_data->>'longitude')::numeric else g.longitude end,
    seo_indexable = case when p_data ? 'seo_indexable'
      then coalesce((p_data->>'seo_indexable')::boolean, g.seo_indexable) else g.seo_indexable end
  where g.id = p_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Landmark % could not be updated', p_id using errcode = '42501';
  end if;

  return query select * from public.cms_landmarks where id = p_id;
end;
$$;

comment on function public.cms_landmark_save(uuid, jsonb, timestamptz) is
  'CMS write path for landmarks: whitelisted patch across geo_places + geo_landmark_profiles in one transaction, with optimistic concurrency on geo_places.updated_at. Never creates.';

revoke all on function public.cms_landmark_save(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.cms_landmark_save(uuid, jsonb, timestamptz) to authenticated;

-- ── Writes through the view ─────────────────────────────────────────────
--
-- `content_revision_revert_fields` (the generic Undo) reads the live value
-- from the registered table and puts fields back with an UPDATE on it. For
-- landmarks the registered table is this view, so the view must accept an
-- UPDATE. This INSTEAD OF trigger routes each editable column to its base
-- table and refuses a change to anything else. Clients still have no UPDATE
-- grant on the view: cms_landmark_save() stays the only client write path,
-- and this exists for the SECURITY DEFINER revert.

create or replace function public.cms_landmarks_instead_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_editable constant text[] := array[
    'name', 'description', 'image_url', 'latitude', 'longitude', 'seo_indexable',
    'landmark_kind', 'address', 'website', 'accessibility_notes', 'tags',
    'featured', 'needs_review', 'updated_at'
  ];
begin
  if (to_jsonb(new) - v_editable) is distinct from (to_jsonb(old) - v_editable) then
    raise exception 'Only editable landmark fields can be changed through cms_landmarks'
      using errcode = '42501';
  end if;

  if (new.name, new.description, new.image_url, new.latitude, new.longitude, new.seo_indexable)
     is distinct from
     (old.name, old.description, old.image_url, old.latitude, old.longitude, old.seo_indexable)
  then
    update public.geo_places set
      name = new.name,
      description = new.description,
      image_url = new.image_url,
      latitude = new.latitude,
      longitude = new.longitude,
      seo_indexable = new.seo_indexable
    where id = old.id;
  end if;

  if (new.landmark_kind, new.address, new.website, new.accessibility_notes, new.tags,
      new.featured, new.needs_review)
     is distinct from
     (old.landmark_kind, old.address, old.website, old.accessibility_notes, old.tags,
      old.featured, old.needs_review)
  then
    update public.geo_landmark_profiles set
      landmark_kind = new.landmark_kind,
      address = new.address,
      website = new.website,
      accessibility_notes = new.accessibility_notes,
      tags = new.tags,
      featured = new.featured,
      needs_review = new.needs_review,
      updated_by = auth.uid()
    where place_id = old.id;
  end if;

  return new;
end;
$$;

drop trigger if exists cms_landmarks_instead_update on public.cms_landmarks;
create trigger cms_landmarks_instead_update
  instead of update on public.cms_landmarks
  for each row execute function public.cms_landmarks_instead_update();

-- ── Edit history ─────────────────────────────────────────────────────────
--
-- log_content_revision() records a row under its own table name and keys it
-- by `id`. Neither fits: geo_places also holds every country, city and
-- village (each already versioned through its own table), and
-- geo_landmark_profiles is keyed by `place_id`. This is the same trigger
-- body, scoped to landmark rows and recording under `cms_landmarks` with the
-- place id, so the history panel and Undo see one record per landmark.
-- Only columns the view exposes are recorded, and the cms_landmarks row in
-- content_versioned_tables is the on/off switch and the ignore list, exactly
-- as for every other content type.

create or replace function public.log_landmark_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled  boolean;
  v_ignore   text[];
  v_columns  text[];
  v_actor_id uuid := auth.uid();
  v_actor    text := nullif(current_setting('app.actor', true), '');
  v_kind     text;
  v_old      jsonb;
  v_new      jsonb;
  v_before   jsonb;
  v_after    jsonb;
  v_id       uuid;
begin
  if tg_op = 'UPDATE' and old is not distinct from new then
    return null;
  end if;

  select enabled, ignore_columns into v_enabled, v_ignore
    from public.content_versioned_tables
   where table_name = 'cms_landmarks';
  if not found or not v_enabled then
    return null;
  end if;

  select array_agg(attname::text) into v_columns
    from pg_attribute
   where attrelid = 'public.cms_landmarks'::regclass and attnum > 0 and not attisdropped;
  -- The id is the record key, never a field.
  v_ignore := v_ignore || array['id'];

  if v_actor_id is not null then
    v_kind := 'human';
  elsif v_actor is not null and v_actor not like 'system:%' then
    v_kind := 'declared';
  else
    v_kind := 'system';
  end if;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_after
      from jsonb_each(v_new) where key = any (v_columns) and not (key = any (v_ignore));
    v_before := '{}'::jsonb;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_before
      from jsonb_each(v_old) where key = any (v_columns) and not (key = any (v_ignore));
    v_after := '{}'::jsonb;
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_after
      from jsonb_each(v_new)
     where key = any (v_columns)
       and not (key = any (v_ignore))
       and value is distinct from (v_old -> key);
    if v_after = '{}'::jsonb then
      return null;
    end if;
    select coalesce(jsonb_object_agg(k, coalesce(v_old -> k, 'null'::jsonb)), '{}'::jsonb)
      into v_before
      from jsonb_object_keys(v_after) as k;
  end if;

  if v_before = '{}'::jsonb and v_after = '{}'::jsonb then
    return null;
  end if;

  v_id := case tg_table_name
    when 'geo_landmark_profiles' then
      (case when tg_op = 'DELETE' then v_old else v_new end ->> 'place_id')::uuid
    else
      (case when tg_op = 'DELETE' then v_old else v_new end ->> 'id')::uuid
  end;

  insert into public.content_revisions
    (source_table, source_id, op, before, after, changed_fields, actor_kind, actor_id, actor)
  values (
    'cms_landmarks',
    v_id,
    left(tg_op, 1),
    v_before,
    v_after,
    array(select jsonb_object_keys(case when tg_op = 'DELETE' then v_before else v_after end)),
    v_kind,
    v_actor_id,
    v_actor
  );
  return null;
end;
$$;

revoke all on function public.log_landmark_revision() from public, anon, authenticated;
revoke all on function public.cms_landmarks_instead_update() from public, anon, authenticated;

drop trigger if exists log_landmark_revision on public.geo_places;
create trigger log_landmark_revision
  after insert or update on public.geo_places
  for each row when (new.place_type = 'landmark')
  execute function public.log_landmark_revision();

drop trigger if exists log_landmark_revision_delete on public.geo_places;
create trigger log_landmark_revision_delete
  after delete on public.geo_places
  for each row when (old.place_type = 'landmark')
  execute function public.log_landmark_revision();

drop trigger if exists log_landmark_revision on public.geo_landmark_profiles;
create trigger log_landmark_revision
  after insert or update or delete on public.geo_landmark_profiles
  for each row execute function public.log_landmark_revision();

-- ── content_versioned_tables ─────────────────────────────────────────────
--
-- Restated in full, as 99991792192840 explains:
-- contentVersionedTablesDrift.test.ts parses only the newest migration
-- carrying this INSERT. The only new pair is ('landmarks', 'cms_landmarks').
-- It ships disabled like every seeded row; the next migration turns it on.

INSERT INTO public.content_versioned_tables (registry_key, table_name) VALUES
  ('accessibility_attributes', 'accessibility_attributes'),
  ('amenities', 'amenities'),
  ('cities', 'cities'),
  ('cms_pages', 'cms_pages'),
  ('community_groups', 'community_groups'),
  ('competitions', 'competitions'),
  ('countries', 'countries'),
  ('event_amenities', 'event_amenities'),
  ('event_categories', 'event_categories'),
  ('event_services', 'event_services'),
  ('event_types', 'event_types'),
  ('events', 'events'),
  ('feedback', 'community_submissions'),
  ('guides', 'guides'),
  ('hotels', 'hotels'),
  ('kink_categories', 'kink_categories'),
  ('kink_items', 'kink_items'),
  ('landmarks', 'cms_landmarks'),
  ('marketplace_brands', 'marketplace_brands'),
  ('marketplace_categories', 'marketplace_categories'),
  ('marketplace_listings', 'marketplace_listings'),
  ('milestones', 'milestones'),
  ('news_articles', 'news_articles'),
  ('news_categories', 'news_categories'),
  ('organizations', 'organizations'),
  ('personalities', 'personalities'),
  ('professions', 'professions'),
  ('queer_villages', 'queer_villages'),
  ('redirects', 'redirects'),
  ('tag_categories', 'tag_categories'),
  ('target_groups', 'target_groups'),
  ('taxonomy_terms', 'taxonomy_terms'),
  ('unified_tags', 'unified_tags'),
  ('venue_services', 'venue_services'),
  ('venues', 'venues')
ON CONFLICT (registry_key) DO NOTHING;

do $verify$
declare
  v_landmarks int;
  v_view int;
begin
  select count(*) into v_landmarks
  from public.geo_places p
  where p.place_type = 'landmark' and p.duplicate_of_id is null
    and exists (select 1 from public.geo_landmark_profiles l where l.place_id = p.id);
  select count(*) into v_view from public.cms_landmarks;
  if v_view <> v_landmarks then
    raise exception 'cms_landmarks has % rows, expected % live landmarks with a profile', v_view, v_landmarks;
  end if;

  if has_table_privilege('anon', 'public.cms_landmarks', 'select') then
    raise exception 'anon can read cms_landmarks';
  end if;
  if has_function_privilege('anon', 'public.cms_landmark_save(uuid, jsonb, timestamptz)', 'execute') then
    raise exception 'anon can execute cms_landmark_save';
  end if;
  if exists (
    select 1 from pg_proc
    where oid = 'public.cms_landmark_save(uuid, jsonb, timestamptz)'::regprocedure and prosecdef
  ) then
    raise exception 'cms_landmark_save must be SECURITY INVOKER so base-table RLS decides access';
  end if;

  if not exists (
    select 1 from public.content_versioned_tables
    where registry_key = 'landmarks' and table_name = 'cms_landmarks'
  ) then
    raise exception 'landmarks is not registered in content_versioned_tables';
  end if;
  if (select count(*) from pg_trigger
      where tgfoid = 'public.log_landmark_revision()'::regprocedure and not tgisinternal) <> 3 then
    raise exception 'log_landmark_revision must be attached to geo_places (insert/update, delete) and geo_landmark_profiles';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.cms_landmarks'::regclass
      and tgfoid = 'public.cms_landmarks_instead_update()'::regprocedure
  ) then
    raise exception 'cms_landmarks has no INSTEAD OF UPDATE trigger, so Undo cannot write it';
  end if;
end
$verify$;
