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
end
$verify$;
