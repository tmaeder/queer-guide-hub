-- =============================================================================
-- Geo P4 — queer_villages table -> view. REHEARSED, not yet executed.
--
-- Every statement below was run end-to-end on 2026-08-01 in an isolated
-- `geo_p4_rehearsal` schema holding copies of geo_places + geo_village_profiles
-- (190 villages), and verified for: column-shape parity (36/36, exact type and
-- ordinal match), INSERT/UPDATE/DELETE through the view, ancestor derivation,
-- and ON DELETE CASCADE to the profile. The sandbox was then dropped; nothing
-- in production was modified. See docs/deploy/geo-p4-view-swap-runbook.md.
--
-- THREE THINGS THE REHEARSAL PROVED — do not "simplify" them away:
--
--  1. latitude/longitude MUST be cast to double precision. The spine stores
--     numeric; the old table exposed double precision. Without the cast the
--     view's column types drift and ~137 client call sites silently change
--     shape. The parity query at the bottom is how you catch that.
--
--  2. The INSTEAD OF INSERT depends on `trg_geo_places_derive` still being on
--     geo_places. It is what fills parent_type (a CHECK requires it to travel
--     with parent_id) plus the derived country_id/city_id. The swap must NOT
--     drop it. Rehearsal caught this: without the trigger every insert failed
--     `geo_places_parent_pair_chk`.
--
--  3. The DELETE cascade depends on the composite FK
--     (place_id, place_type) -> geo_places(id, place_type) ON DELETE CASCADE.
--     It already exists in production. Rehearsal caught its absence because
--     CREATE TABLE ... LIKE INCLUDING ALL does not copy foreign keys — the
--     profile row survived the delete until the FK was added.
--
-- Run inside ONE transaction. Verify before COMMIT.
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- Capture the pre-swap shape so the parity check at the end has something to
-- compare against (the table is about to stop existing).
create temp table _pre_shape as
select column_name, data_type, ordinal_position
  from information_schema.columns
 where table_schema = 'public' and table_name = 'queer_villages';

create temp table _pre_count as select count(*) as n from public.queer_villages;

-- ---------------------------------------------------------------------------
-- 1. Dependent views (re-created at step 6). Re-run geo_p4_preflight() first —
--    this list is a snapshot and concurrent sessions add views continuously.
-- ---------------------------------------------------------------------------
drop view if exists public.geo_integrity_violations;
drop view if exists public.triage_src_quality_village;

-- ---------------------------------------------------------------------------
-- 2. The mirror becomes the source of truth.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_sync_geo_spine on public.queer_villages;

-- ---------------------------------------------------------------------------
-- 3. Drop the table.
-- ---------------------------------------------------------------------------
drop table public.queer_villages cascade;

-- ---------------------------------------------------------------------------
-- 4. The view. security_invoker = true is LOAD-BEARING: without it the view
--    runs with owner rights and silently bypasses RLS, including the safety
--    gate that hides venues in criminalizing countries from anonymous users.
--    Column order matches the old table exactly.
-- ---------------------------------------------------------------------------
create view public.queer_villages with (security_invoker = true) as
select
  g.id, g.name, g.slug, g.city_id, g.country_id, g.description,
  p.history, g.image_url, p.images,
  g.latitude::double precision  as latitude,
  g.longitude::double precision as longitude,
  p.boundaries, p.notable_landmarks, p.tags, p.website, p.featured,
  p.created_by, p.updated_by, g.created_at, g.updated_at, g.image_metadata,
  p.geometry, g.name_i18n, g.description_i18n, g.seo_indexable, p.editorial_hook,
  p.completeness_score, p.trust_score, p.shell_status, p.needs_attention,
  p.field_provenance, p.enrichment_status, p.last_verified_at, g.last_refreshed_at,
  p.social_links, g.duplicate_of_id
from public.geo_places g
join public.geo_village_profiles p on p.place_id = g.id
where g.place_type = 'village';

grant select on public.queer_villages to anon, authenticated;
grant insert, update, delete on public.queer_villages to authenticated;
grant all on public.queer_villages to service_role;

-- ---------------------------------------------------------------------------
-- 5. INSTEAD OF triggers routing writes to spine + profile.
-- ---------------------------------------------------------------------------
create or replace function public.queer_villages_view_ins()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  v_id := coalesce(new.id, gen_random_uuid());
  -- parent_id = the city; trg_geo_places_derive fills parent_type/country_id/city_id.
  insert into public.geo_places
    (id, place_type, parent_id, name, slug, description, image_url, latitude, longitude,
     image_metadata, name_i18n, description_i18n, seo_indexable, last_refreshed_at,
     duplicate_of_id, created_at, updated_at)
  values (v_id, 'village', new.city_id, new.name, new.slug, new.description, new.image_url,
     new.latitude, new.longitude, new.image_metadata,
     coalesce(new.name_i18n,'{}'::jsonb), coalesce(new.description_i18n,'{}'::jsonb),
     coalesce(new.seo_indexable,true), new.last_refreshed_at, new.duplicate_of_id,
     coalesce(new.created_at,now()), coalesce(new.updated_at,now()));

  insert into public.geo_village_profiles
    (place_id, history, images, boundaries, notable_landmarks, tags, website, featured,
     created_by, updated_by, geometry, editorial_hook, completeness_score, trust_score,
     shell_status, needs_attention, field_provenance, enrichment_status, last_verified_at, social_links)
  values (v_id, new.history, coalesce(new.images,'{}'), new.boundaries,
     coalesce(new.notable_landmarks,'{}'), coalesce(new.tags,'{}'), new.website,
     coalesce(new.featured,false), new.created_by, new.updated_by, new.geometry,
     new.editorial_hook, coalesce(new.completeness_score,0), coalesce(new.trust_score,0),
     coalesce(new.shell_status,'real'), coalesce(new.needs_attention,false),
     coalesce(new.field_provenance,'{}'::jsonb), coalesce(new.enrichment_status,'{}'::jsonb),
     new.last_verified_at, coalesce(new.social_links,'{}'::jsonb));
  new.id := v_id;
  return new;
end $$;

create or replace function public.queer_villages_view_upd()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update public.geo_places set
    name=new.name, slug=new.slug, description=new.description, image_url=new.image_url,
    latitude=new.latitude, longitude=new.longitude, image_metadata=new.image_metadata,
    name_i18n=new.name_i18n, description_i18n=new.description_i18n,
    seo_indexable=new.seo_indexable, last_refreshed_at=new.last_refreshed_at,
    duplicate_of_id=new.duplicate_of_id,
    parent_id = case when new.city_id is distinct from old.city_id then new.city_id else parent_id end
  where id = old.id;

  update public.geo_village_profiles set
    history=new.history, images=new.images, boundaries=new.boundaries,
    notable_landmarks=new.notable_landmarks, tags=new.tags, website=new.website,
    featured=new.featured, created_by=new.created_by, updated_by=new.updated_by,
    geometry=new.geometry, editorial_hook=new.editorial_hook,
    completeness_score=new.completeness_score, trust_score=new.trust_score,
    shell_status=new.shell_status, needs_attention=new.needs_attention,
    field_provenance=new.field_provenance, enrichment_status=new.enrichment_status,
    last_verified_at=new.last_verified_at, social_links=new.social_links
  where place_id = old.id;
  return new;
end $$;

create or replace function public.queer_villages_view_del()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.geo_places where id = old.id;  -- profile cascades via composite FK
  return old;
end $$;

create trigger trg_queer_villages_view_ins instead of insert on public.queer_villages
  for each row execute function public.queer_villages_view_ins();
create trigger trg_queer_villages_view_upd instead of update on public.queer_villages
  for each row execute function public.queer_villages_view_upd();
create trigger trg_queer_villages_view_del instead of delete on public.queer_villages
  for each row execute function public.queer_villages_view_del();

-- ---------------------------------------------------------------------------
-- 6. Re-create the dependent views dropped at step 1 (paste their current
--    definitions, captured with pg_get_viewdef BEFORE this transaction).
--    Re-create the BEFORE triggers on the profile: sanitize_website_before_upsert
--    and, if still present, trg_erq_cascade.
-- ---------------------------------------------------------------------------
-- <<< paste here >>>

-- ---------------------------------------------------------------------------
-- 7. VERIFY BEFORE COMMIT. Any surprise -> ROLLBACK.
-- ---------------------------------------------------------------------------
-- 7a. Row count preserved
do $$
declare a int; b int;
begin
  select n into a from _pre_count;
  select count(*) into b from public.queer_villages;
  if a is distinct from b then
    raise exception 'ROW COUNT CHANGED: was % now % — ROLLBACK', a, b;
  end if;
end $$;

-- 7b. Column shape identical (name, type, position)
do $$
declare bad int;
begin
  select count(*) into bad
    from _pre_shape s
    full join (select column_name, data_type, ordinal_position
                 from information_schema.columns
                where table_schema='public' and table_name='queer_villages') v
      on v.column_name = s.column_name
   where v.column_name is null or s.column_name is null
      or v.data_type is distinct from s.data_type
      or v.ordinal_position is distinct from s.ordinal_position;
  if bad > 0 then
    raise exception 'COLUMN SHAPE DRIFTED in % columns — ROLLBACK', bad;
  end if;
end $$;

-- 7c. security_invoker actually set (silent RLS bypass if not)
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname='queer_villages'
       and c.reloptions @> array['security_invoker=true']
  ) then
    raise exception 'security_invoker NOT SET — the view would bypass RLS. ROLLBACK';
  end if;
end $$;

-- 7d. Write paths work (mutates, then rolls the savepoint back)
savepoint write_probe;
do $$
declare v_city uuid; v_id uuid; s int; p int;
begin
  select city_id into v_city from public.queer_villages limit 1;
  insert into public.queer_villages (name, slug, city_id, history, trust_score)
  values ('P4 Probe','p4-probe-tmp', v_city, 'probe', 42) returning id into v_id;
  select count(*) into s from public.geo_places where id=v_id;
  select count(*) into p from public.geo_village_profiles where place_id=v_id;
  if s <> 1 or p <> 1 then raise exception 'INSERT did not reach both tables (spine=% profile=%)', s, p; end if;

  update public.queer_villages set name='P4 Probe 2', history='probe2' where id=v_id;
  delete from public.queer_villages where id=v_id;
  select count(*) into p from public.geo_village_profiles where place_id=v_id;
  if p <> 0 then raise exception 'DELETE did not cascade to profile'; end if;
end $$;
rollback to savepoint write_probe;

-- 7e. Gates still clean
do $$
declare g jsonb;
begin
  g := public.geo_p4_preflight();
  if (g->'gates'->>'safety_parity_mismatches')::int <> 0
     or (g->'gates'->>'spine_drift')::int <> 0 then
    raise exception 'GATES DIRTY POST-SWAP: % — ROLLBACK', g->'gates';
  end if;
end $$;

commit;

-- =============================================================================
-- POST-COMMIT (outside the transaction)
--   - queer_villages embeds:  ?select=id,name,cities(name),countries(name)
--   - reverse counts:         ?select=id,venues(count),events(count)
--   - anon sees zero safety_gated venues
--   - https://queer.guide/villages/colonia-roma  -> 200
--   - https://queer.guide/admin/geography        -> 200
--   - village search returns hits
--
-- ROLLBACK AFTER COMMIT (if something surfaces later): the spine holds complete
-- data, so this is a rebuild, not a backup restore --
--   create table public.queer_villages as select * from public.queer_villages_view_backup;
-- ...then restore PK/constraints/indexes/RLS and the dual-write trigger. Minutes.
-- =============================================================================
