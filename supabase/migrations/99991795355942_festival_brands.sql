-- Festival brands: "Folsom Europe" owns its yearly editions.
--
-- Design: docs/plans/2026-11-22-festival-multi-event-structure-design.md (Phase 3).
-- Model: festivals (brand) -> events with festival_id (yearly edition, the
-- umbrella) -> events with parent_event_id (programme).
--
-- public.festivals and events.festival_id have existed since the baseline with
-- 0 rows. This fills them and keeps them filled:
--
-- * EDITION = a live top-level event that is a bounded multi-day event
--   (20h..62 days, not a standing schedule) typed pride / festival / fetish /
--   film, or that holds a programme. 521 rows on 2026-11-22.
-- * BRAND KEY = the edition title with years, "(…)" and a ": SEO suffix"
--   removed, despaced, plus the city. "Folsom Europe 2027" and a later
--   "Folsom Europe 2028" in Berlin share a brand; "Gay Pride" in two cities do
--   not. Measured: 462 brands, 3 already span two years — the corpus is almost
--   all 2026/27 dates, so "recurs across years" cannot be the seed rule; a
--   one-edition brand is still the correct home for next year's edition.
-- * Duplicate editions (the same festival imported twice under different
--   titles) can yield two brands. The directory lists only brands with a live
--   edition, so a brand emptied by a later edition merge drops out by itself.
--
-- Safety: a brand in a criminalizing country is visible to signed-in users
-- only, the same rule as its editions (RLS on events). Computed in the policy
-- via location_is_high_risk() rather than a denormalized column, so a change
-- in a country's law applies at once with nothing to re-sync.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
alter table public.festivals add column if not exists brand_key text;

create unique index if not exists festivals_brand_key_city_uniq
  on public.festivals (brand_key, city_id) where brand_key is not null;

alter table public.festivals drop constraint if exists festivals_festival_type_check;
alter table public.festivals add constraint festivals_festival_type_check
  check (festival_type = any (array['festival', 'pride', 'fetish', 'film', 'conference', 'series', 'other']));

comment on column public.festivals.brand_key is
  'dedup_despace(festival_brand_name(edition title)); unique per city. Written by run_festival_brand_link.';

drop policy if exists "Public read festivals" on public.festivals;
drop policy if exists "Public read festivals (safety-gated)" on public.festivals;
create policy "Public read festivals (safety-gated)" on public.festivals
  for select to anon, authenticated
  using (not public.location_is_high_risk(country_id, city_id) or (select auth.uid()) is not null);

-- ---------------------------------------------------------------------------
-- 2. Brand name from an edition title
-- ---------------------------------------------------------------------------
create or replace function public.festival_brand_name(p_title text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select nullif(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(p_title, ''), '\([^)]*\)', '', 'g'),  -- "(Date TBC)"
          ':\s.*$', ''),                                                -- ": dates, parade, events"
        '\m(19|20)\d{2}\M', '', 'g'),                                   -- years
      '\s+', ' ', 'g'),
    ' -–—:,·'), '');
$function$;

-- ---------------------------------------------------------------------------
-- 3. Linker: attach each unbranded edition to its brand, creating the brand
-- ---------------------------------------------------------------------------
create or replace function public.run_festival_brand_link(p_batch integer default 500)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_name text;
  v_key text;
  v_fid uuid;
  v_slug text;
  v_created integer := 0;
  v_attached integer := 0;
  v_skipped integer := 0;
begin
  for r in
    select e.id, e.title, e.city, e.city_id, e.country, e.country_id, e.event_type,
           e.start_date, e.end_date, e.website, ci.slug as city_slug
      from public.events e
      -- Inner join (edited after prod apply, 2026-11-22): CI's Critical paths replays onto a
      -- snapshot holding events whose city row it lacks; festivals.city_id is FK'd, so those
      -- must be skipped. On prod events.city_id is FK'd too, so this matches the left join.
      join public.cities ci on ci.id = e.city_id
     where e.festival_id is null
       and e.duplicate_of_id is null
       and e.status = 'active'
       and e.parent_event_id is null
       and e.city_id is not null
       and coalesce(e.schedule->>'kind', '') not in ('recurrence', 'opening_hours')
       and coalesce(e.end_date, e.start_date) - e.start_date
           between interval '20 hours' and interval '62 days'
       and (e.event_type in ('pride', 'festival', 'fetish', 'film')
            or coalesce(e.programme_size, 0) > 0)
     order by e.start_date
     limit greatest(0, least(p_batch, 2000))
  loop
    v_name := public.festival_brand_name(r.title);
    v_key := public.dedup_despace(v_name);
    if v_name is null or length(v_key) < 3 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select f.id into v_fid
      from public.festivals f
     where f.brand_key = v_key and f.city_id = r.city_id;

    if v_fid is null then
      v_slug := public.generate_slug(v_name);
      if exists (select 1 from public.festivals where slug = v_slug) then
        v_slug := v_slug || '-' || coalesce(r.city_slug, public.generate_slug(r.city));
      end if;
      if v_slug is null or exists (select 1 from public.festivals where slug = v_slug) then
        v_slug := public.generate_slug(v_name) || '-' || left(md5(r.id::text), 6);
      end if;

      insert into public.festivals
        (name, slug, brand_key, festival_type, city, city_id, country, country_id,
         start_date, end_date, website, is_recurring, recurrence_pattern)
      values
        (v_name, v_slug, v_key,
         case when r.event_type in ('pride', 'festival', 'fetish', 'film') then r.event_type else 'other' end,
         r.city, r.city_id, r.country, r.country_id,
         r.start_date::date, coalesce(r.end_date, r.start_date)::date, r.website, true, 'annual')
      returning id into v_fid;
      v_created := v_created + 1;
    end if;

    update public.events set festival_id = v_fid where id = r.id;
    v_attached := v_attached + 1;
  end loop;

  -- A brand's dates mirror its latest edition (the submit form's picker and the
  -- directory order by them).
  update public.festivals f
     set start_date = x.s, end_date = x.e, updated_at = now()
    from (select distinct on (festival_id) festival_id, start_date::date s,
                 coalesce(end_date, start_date)::date e
            from public.events
           where festival_id is not null and duplicate_of_id is null
           order by festival_id, start_date desc) x
   where f.id = x.festival_id
     and (f.start_date is distinct from x.s or f.end_date is distinct from x.e);

  return jsonb_build_object('created', v_created, 'attached', v_attached, 'skipped', v_skipped);
end;
$function$;

revoke all on function public.run_festival_brand_link(integer) from public, anon, authenticated;
grant execute on function public.run_festival_brand_link(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3b. Crawler/sitemap read path (service role only)
--     functions/_lib/detail.ts and sitemap-festivals.xml.ts read with the service
--     role, which bypasses RLS, so the safety gate is applied in the view itself,
--     live. Revoked from anon/authenticated: default privileges in `public` grant
--     a new view to both, and this view runs as its owner.
-- ---------------------------------------------------------------------------
create or replace view public.festivals_crawlable as
  select f.id, f.name, f.slug, f.description, f.city, f.country, f.festival_type, f.updated_at
    from public.festivals f
   where f.brand_key is not null
     and not public.location_is_high_risk(f.country_id, f.city_id);

revoke all on public.festivals_crawlable from public, anon, authenticated;
grant select on public.festivals_crawlable to service_role;

-- ---------------------------------------------------------------------------
-- 4. Schedule: nightly, after the programme linker (03:45)
-- ---------------------------------------------------------------------------
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('festival_brand_link', 'Festival brand linker',
        'Nightly: attaches each festival edition (umbrella event) to its brand in public.festivals, '
        'creating the brand when none exists. Design: docs/plans/2026-11-22-festival-multi-event-structure-design.md.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"run_festival_brand_link"}'::jsonb, '55 3 * * *')
on conflict (slug) do update set schedule = excluded.schedule, enabled = excluded.enabled,
  description = excluded.description, name = excluded.name, action = excluded.action,
  trigger = excluded.trigger;

select cron.schedule('festival_brand_link', '55 3 * * *',
  $cron$ select public.run_festival_brand_link(500); $cron$);

-- ---------------------------------------------------------------------------
-- 5. Backfill
-- ---------------------------------------------------------------------------
select public.run_festival_brand_link(2000);

-- ---------------------------------------------------------------------------
-- 6. Postconditions
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad integer;
  v_brands integer;
begin
  select count(*) into v_brands from public.festivals where brand_key is not null;
  if v_brands < 100 then
    raise exception 'P1 failed: only % festival brands after backfill', v_brands;
  end if;

  -- Every edition with a usable name is branded.
  select count(*) into v_bad
    from public.events e
   where e.festival_id is null and e.duplicate_of_id is null and e.status = 'active'
     and e.parent_event_id is null and e.city_id is not null
     and coalesce(e.schedule->>'kind', '') not in ('recurrence', 'opening_hours')
     and coalesce(e.end_date, e.start_date) - e.start_date between interval '20 hours' and interval '62 days'
     and (e.event_type in ('pride', 'festival', 'fetish', 'film') or coalesce(e.programme_size, 0) > 0)
     and length(coalesce(public.dedup_despace(public.festival_brand_name(e.title)), '')) >= 3
     and exists (select 1 from public.cities c where c.id = e.city_id);
  if v_bad <> 0 then
    raise exception 'P2 failed: % editions left unbranded', v_bad;
  end if;

  -- A brand and its editions are in the same city.
  select count(*) into v_bad
    from public.events e join public.festivals f on f.id = e.festival_id
   where f.brand_key is not null and e.city_id is distinct from f.city_id;
  if v_bad <> 0 then
    raise exception 'P3 failed: % editions sit under a brand in another city', v_bad;
  end if;

  -- Positive control: Folsom Europe 2027 has a brand named Folsom Europe.
  select count(*) into v_bad
    from public.events e left join public.festivals f on f.id = e.festival_id
   where e.slug = 'folsom-europe-2027' and e.duplicate_of_id is null
     and exists (select 1 from public.cities c where c.id = e.city_id)
     and coalesce(f.name, '') <> 'Folsom Europe';
  if v_bad <> 0 then
    raise exception 'P4 failed: Folsom Europe 2027 is not under the Folsom Europe brand';
  end if;

  if has_table_privilege('anon', 'public.festivals_crawlable', 'select')
     or has_table_privilege('authenticated', 'public.festivals_crawlable', 'select') then
    raise exception 'P6 failed: festivals_crawlable is readable by anon/authenticated';
  end if;

  if not exists (select 1 from pg_policy where polrelid = 'public.festivals'::regclass
                 and polname = 'Public read festivals (safety-gated)')
     or exists (select 1 from pg_policy where polrelid = 'public.festivals'::regclass
                and polname = 'Public read festivals') then
    raise exception 'P5 failed: festivals read policy is not the safety-gated one';
  end if;
end
$verify$;
