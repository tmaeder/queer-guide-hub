-- Festival brands: follow-up to 99991795767027 (festival_brand_types_and_listing).
--
-- 1. A DUPLICATE brand now points at the brand it duplicates (merged_into_id).
--    99991795767027 only unlisted the duplicates. Measured afterwards: for two of
--    them the KEPT brand had no dated edition at all, so the only upcoming
--    edition sat on the hidden row and the brand vanished from /festivals:
--      ptown-carnival               -> provincetown-carnival  (0 editions)
--      my-pleasure-anniversary-week -> my-pleasure-madrid     (0 editions)
--    And run_festival_brand_link matches on (brand_key, city_id), so next year's
--    "Ptown Carnival 2028" would attach to the hidden brand again. The linker
--    now follows merged_into_id.
--
-- 2. Editions on a merged brand move to its keeper, EXCEPT where the keeper
--    already holds an overlapping edition. That exception is two rows
--    (Whistler, Sölden): each is a second event row for the same week, i.e.
--    an event duplicate for the dedup engine, and moving it would print the
--    same 2027 edition twice on the brand page.
--
-- 3. Old duplicate slugs 301 to the keeper (festival_slug_redirects, the
--    <type>_slug_redirects shape the edge resolver already reads).
--
-- 4. Two editions were filed under the wrong city, both with coordinates that
--    are byte-identical to that city's centroid (derived, not measured):
--      Whistler Pride & Ski Festival 2027 -> Vancouver (49.2827,-123.1207)
--      Winter Pride Solden (gaycities vienna listing) -> Vienna (48.2082,16.3738)
--    Both move to the town they are held in; the centroid coordinates are
--    retracted (NULL, refilled by run_event_geo_fill from the right city),
--    never replaced with a guess. The Whistler brand row moves with its edition.
--
-- 5. The ten brands still typed 'other', read one by one:
--      aspen-gay-ski-week, winter-rendezvous          -> pride  (every other
--        gay ski week here is typed pride: european/italy/hakuba ski weeks)
--      first-light-provincetown, gay-easter-parade-new-orleans,
--      new-orleans-gay-mardi-gras, provincetown-carnival -> festival
--        (carnivals and Mardi Gras are festival, as sydney/sitges)
--      gluehweinplausch-im-heaven  -> unlisted: one evening at one club
--      jubilaeumsfest-20-jahre-checkpoint-zuerich -> unlisted: an anniversary party
--      st-louis-mardi-gras         -> unlisted: mainstream parade; its own
--        description names no LGBTQ+ programme (same rule as Venice/Nice)
--      olivia-xoxo-caribbean-cruise stays 'other': a cruise, none of the types fit.
--
-- Soft on preconditions, hard on postconditions: every write is guarded on the
-- state it changes, and the verify block asserts the end state only.

begin;

-- ---------------------------------------------------------------------------
-- 1. merged_into_id
-- ---------------------------------------------------------------------------
alter table public.festivals
  add column if not exists merged_into_id uuid references public.festivals(id) on delete set null;

alter table public.festivals drop constraint if exists festivals_merged_is_unlisted;
alter table public.festivals add constraint festivals_merged_is_unlisted
  check (merged_into_id is null or (not listed and merged_into_id <> id));

comment on column public.festivals.merged_into_id is
  'The brand this row duplicates. Set only on unlisted rows; run_festival_brand_link attaches new editions to the target, and festival_slug_redirects 301s the slug.';

with pairs(dup, keeper) as (values
  ('maspalomas-bear-carnival', 'bear-carnival'),
  ('my-pleasure-anniversary-week', 'my-pleasure-madrid'),
  ('ptown-carnival', 'provincetown-carnival'),
  ('sydney-mardi-gras', 'sydney-gay-and-lesbian-mardi-gras'),
  ('sydney-gay-and-lesbian-mardi-gras-sydney', 'sydney-gay-and-lesbian-mardi-gras'),
  ('whistler-pride-and-ski-week', 'whistler-pride-and-ski-festival'),
  ('winter-pride-solden', 'winter-pride-soelden'))
update public.festivals d
   set merged_into_id = k.id, updated_at = now()
  from pairs p
  join public.festivals k on k.slug = p.keeper and k.listed
 where d.slug = p.dup
   and not d.listed
   and d.merged_into_id is distinct from k.id;

-- ---------------------------------------------------------------------------
-- 3. Slug redirects (populated by trigger from merged_into_id)
-- ---------------------------------------------------------------------------
create table if not exists public.festival_slug_redirects (
  old_slug text primary key,
  festival_id uuid not null references public.festivals(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.festival_slug_redirects enable row level security;
drop policy if exists festival_slug_redirects_public_read on public.festival_slug_redirects;
create policy festival_slug_redirects_public_read
  on public.festival_slug_redirects for select using (true);
revoke all on public.festival_slug_redirects from anon, authenticated;
grant select on public.festival_slug_redirects to anon, authenticated;
grant all on public.festival_slug_redirects to service_role;

create or replace function public.festival_merge_slug_redirect()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.merged_into_id is not null and new.slug is not null then
    insert into public.festival_slug_redirects (old_slug, festival_id)
    values (new.slug, new.merged_into_id)
    on conflict (old_slug) do update set festival_id = excluded.festival_id;
  elsif new.merged_into_id is null and new.slug is not null then
    delete from public.festival_slug_redirects where old_slug = new.slug;
  end if;
  return new;
end;
$function$;
revoke all on function public.festival_merge_slug_redirect() from public, anon, authenticated;

drop trigger if exists festival_merge_slug_redirect on public.festivals;
create trigger festival_merge_slug_redirect
  after insert or update of merged_into_id, slug on public.festivals
  for each row execute function public.festival_merge_slug_redirect();

insert into public.festival_slug_redirects (old_slug, festival_id)
select f.slug, f.merged_into_id from public.festivals f
 where f.merged_into_id is not null and f.slug is not null
on conflict (old_slug) do update set festival_id = excluded.festival_id;

-- ---------------------------------------------------------------------------
-- 1b. The linker follows merged_into_id (patched in place, exactly-once anchor)
-- ---------------------------------------------------------------------------
do $patch$
declare
  v_src text := pg_get_functiondef('public.run_festival_brand_link(integer)'::regprocedure);
  v_from text := 'select f.id into v_fid';
  v_to text := 'select coalesce(f.merged_into_id, f.id) into v_fid';
  v_n int;
begin
  if position(v_to in v_src) > 0 then
    return;
  end if;
  v_n := (length(v_src) - length(replace(v_src, v_from, ''))) / length(v_from);
  if v_n <> 1 then
    raise exception 'run_festival_brand_link: expected one "%" anchor, found %', v_from, v_n;
  end if;
  execute replace(v_src, v_from, v_to);
end
$patch$;

-- ---------------------------------------------------------------------------
-- 4. Wrong-city editions (before the move, so the overlap test below sees the
--    corrected rows; neither move changes festival_id)
-- ---------------------------------------------------------------------------
update public.events e
   set city_id = w.id,
       city = 'Whistler',
       latitude = null,
       longitude = null,
       field_provenance = coalesce(e.field_provenance, '{}'::jsonb)
         || jsonb_build_object('latitude', jsonb_build_object(
              'retracted', jsonb_build_object('lat', e.latitude, 'lng', e.longitude,
                'reason', 'Vancouver city centroid on a Whistler event'),
              'by', 'migration:99991795778516'))
  from public.cities w
 where e.slug = 'whistler-pride-and-ski-festival-2027'
   and w.id = '905b4add-f3a1-447b-abd4-fea29b110fa9'
   and e.city_id = 'e5d823da-60c6-49c8-8465-a55804783cb0';

update public.festivals f
   set city_id = '905b4add-f3a1-447b-abd4-fea29b110fa9', city = 'Whistler', updated_at = now()
 where f.slug = 'whistler-pride-and-ski-festival'
   and f.city_id = 'e5d823da-60c6-49c8-8465-a55804783cb0';

update public.events e
   set city_id = s.id,
       city = 'Sölden',
       latitude = null,
       longitude = null,
       field_provenance = coalesce(e.field_provenance, '{}'::jsonb)
         || jsonb_build_object('latitude', jsonb_build_object(
              'retracted', jsonb_build_object('lat', e.latitude, 'lng', e.longitude,
                'reason', 'Vienna city centroid on a Sölden event (gaycities vienna listing)'),
              'by', 'migration:99991795778516'))
  from public.cities s
 where e.id = 'e5c4f23b-e277-4fc0-873b-e0ed71f0abd2'
   and s.id = 'ee6df9ad-0d16-4254-99c7-a6c9f9415d33'
   and e.city_id = '18463095-3eef-4e81-b367-1ce244a39c19';

-- ---------------------------------------------------------------------------
-- 2. Editions on merged brands move to the keeper unless it already has one
--    that week
-- ---------------------------------------------------------------------------
update public.events e
   set festival_id = d.merged_into_id
  from public.festivals d
 where e.festival_id = d.id
   and d.merged_into_id is not null
   and e.duplicate_of_id is null
   and not exists (
     select 1 from public.events k
      where k.festival_id = d.merged_into_id
        and k.duplicate_of_id is null
        and k.start_date < coalesce(e.end_date, e.start_date) + interval '1 day'
        and coalesce(k.end_date, k.start_date) > e.start_date - interval '1 day');

-- A brand's dates mirror its latest edition (as the linker does).
update public.festivals f
   set start_date = x.s, end_date = x.e, updated_at = now()
  from (select distinct on (festival_id) festival_id, start_date::date s,
               coalesce(end_date, start_date)::date e
          from public.events
         where festival_id is not null and duplicate_of_id is null
         order by festival_id, start_date desc) x
 where f.id = x.festival_id
   and (f.start_date is distinct from x.s or f.end_date is distinct from x.e);

-- ---------------------------------------------------------------------------
-- 5. The 'other' brands
-- ---------------------------------------------------------------------------
update public.festivals set festival_type = 'pride', updated_at = now()
 where slug in ('aspen-gay-ski-week', 'winter-rendezvous') and festival_type = 'other';

update public.festivals set festival_type = 'festival', updated_at = now()
 where slug in ('first-light-provincetown', 'gay-easter-parade-new-orleans',
                'new-orleans-gay-mardi-gras', 'provincetown-carnival')
   and festival_type = 'other';

update public.festivals f
   set listed = false, unlisted_reason = u.reason, updated_at = now()
  from (values
    ('gluehweinplausch-im-heaven', 'not a festival: one evening at one club'),
    ('jubilaeumsfest-20-jahre-checkpoint-zuerich', 'not a festival: an organisation''s anniversary party'),
    ('st-louis-mardi-gras', 'not an LGBTQ+ event: mainstream parade, its description names no LGBTQ+ programme')
  ) u(slug, reason)
 where f.slug = u.slug and f.listed;

-- ---------------------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------------------
do $verify$
declare v_bad int;
begin
  -- P1: all seven duplicates point at a listed keeper.
  select count(*) into v_bad from public.festivals d
   where d.slug in ('maspalomas-bear-carnival','my-pleasure-anniversary-week','ptown-carnival',
                    'sydney-mardi-gras','sydney-gay-and-lesbian-mardi-gras-sydney',
                    'whistler-pride-and-ski-week','winter-pride-solden')
     and not exists (select 1 from public.festivals k where k.id = d.merged_into_id and k.listed);
  if v_bad <> 0 then raise exception 'P1 failed: % duplicate brand(s) without a listed keeper', v_bad; end if;

  -- P2: every merged slug has a redirect to its keeper.
  select count(*) into v_bad from public.festivals d
   where d.merged_into_id is not null
     and not exists (select 1 from public.festival_slug_redirects r
                      where r.old_slug = d.slug and r.festival_id = d.merged_into_id);
  if v_bad <> 0 then raise exception 'P2 failed: % merged slug(s) without a redirect', v_bad; end if;

  -- P3: Provincetown Carnival and My Pleasure Madrid have an edition again.
  select count(*) into v_bad from public.festivals k
   where k.slug in ('provincetown-carnival', 'my-pleasure-madrid')
     and not exists (select 1 from public.events e where e.festival_id = k.id and e.duplicate_of_id is null);
  if v_bad <> 0 then raise exception 'P3 failed: % keeper(s) still without an edition', v_bad; end if;

  -- P4: the linker follows merged_into_id.
  if position('coalesce(f.merged_into_id, f.id) into v_fid'
              in pg_get_functiondef('public.run_festival_brand_link(integer)'::regprocedure)) = 0 then
    raise exception 'P4 failed: run_festival_brand_link does not follow merged_into_id';
  end if;

  -- P5: no edition on a merged brand overlaps nothing on its keeper (everything
  -- left behind is a same-week duplicate, by construction).
  select count(*) into v_bad from public.events e
    join public.festivals d on d.id = e.festival_id and d.merged_into_id is not null
   where e.duplicate_of_id is null
     and not exists (select 1 from public.events k
                      where k.festival_id = d.merged_into_id and k.duplicate_of_id is null
                        and k.start_date < coalesce(e.end_date, e.start_date) + interval '1 day'
                        and coalesce(k.end_date, k.start_date) > e.start_date - interval '1 day');
  if v_bad <> 0 then raise exception 'P5 failed: % edition(s) stranded on a merged brand', v_bad; end if;

  -- P6: the Whistler brand and edition are in Whistler; neither wrong-city
  -- edition still carries a centroid of the city it was misfiled under.
  select count(*) into v_bad from public.festivals f
   where f.slug = 'whistler-pride-and-ski-festival' and f.city_id <> '905b4add-f3a1-447b-abd4-fea29b110fa9';
  if v_bad <> 0 then raise exception 'P6 failed: Whistler brand still filed elsewhere'; end if;
  select count(*) into v_bad from public.events e
   where (e.slug = 'whistler-pride-and-ski-festival-2027' and e.city_id = 'e5d823da-60c6-49c8-8465-a55804783cb0')
      or (e.id = 'e5c4f23b-e277-4fc0-873b-e0ed71f0abd2' and e.city_id = '18463095-3eef-4e81-b367-1ce244a39c19');
  if v_bad <> 0 then raise exception 'P6 failed: % edition(s) still in the wrong city', v_bad; end if;

  -- P7: the re-typed brands left 'other'; the cruise stayed; the three are unlisted.
  select count(*) into v_bad from public.festivals
   where slug in ('aspen-gay-ski-week','winter-rendezvous','first-light-provincetown',
                  'gay-easter-parade-new-orleans','new-orleans-gay-mardi-gras','provincetown-carnival')
     and festival_type = 'other';
  if v_bad <> 0 then raise exception 'P7 failed: % brand(s) still typed other', v_bad; end if;
  select count(*) into v_bad from public.festivals
   where slug in ('gluehweinplausch-im-heaven','jubilaeumsfest-20-jahre-checkpoint-zuerich','st-louis-mardi-gras')
     and listed;
  if v_bad <> 0 then raise exception 'P7 failed: % brand(s) still listed', v_bad; end if;

  -- P8: anon can read the redirect table and cannot write it.
  if not has_table_privilege('anon', 'public.festival_slug_redirects', 'select')
     or has_table_privilege('anon', 'public.festival_slug_redirects', 'insert') then
    raise exception 'P8 failed: festival_slug_redirects grants are wrong';
  end if;
end
$verify$;

commit;
