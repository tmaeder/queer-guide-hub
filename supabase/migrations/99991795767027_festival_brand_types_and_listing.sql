-- Festival brands: three more types, re-typed rows, and a way to take a brand
-- off /festivals without deleting it.
--
-- Measured 2026-11-27 over the 460 brands run_festival_brand_link created:
--
-- * TYPES. festival_type is copied from the first edition's event_type, so a
--   bowling championship, a tennis tournament and a New Year's circuit party
--   were all "pride", 17 film festivals were "festival"/"pride" while the Film
--   filter showed 2, and bear weeks were spread over pride / fetish / festival
--   / other. Added: bear, circuit, sports. The linker only INSERTS brands and
--   never rewrites festival_type, so the values set here are not undone by the
--   nightly run.
--
-- * LISTING. Some brands are mainstream events the source lists as
--   "gay-friendly" (the Strasbourg Christmas market, Amsterdam Light Festival,
--   the Venice / Nice / Zurich / Cologne carnivals; Cologne Carnival's own
--   description says "not a gay event in itself"), plus a planetarium
--   projection festival with no queer content. Others are the same festival
--   imported twice from two sources (Bear Carnival / Maspalomas Bear Carnival,
--   Provincetown / Ptown Carnival, two My Pleasure Madrid rows, two Whistler and
--   two Sölden ski weeks, three Sydney Mardi Gras rows) — duplicate EVENTS, often
--   on duplicate city rows, which is event dedup's job and is not attempted here.
--   `listed = false` takes the brand off /festivals, its page, the sitemap and
--   the crawler head. The brand row and its editions are untouched, and a later
--   edition the linker attaches to it stays unlisted with it. Reversible:
--   `update festivals set listed = true, unlisted_reason = null where slug = …`.
--
-- Enforcement is in RLS and the crawler view, so no client query has to know
-- the column exists: anon and members read listed brands only, staff read all.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
alter table public.festivals add column if not exists listed boolean not null default true;
alter table public.festivals add column if not exists unlisted_reason text;

comment on column public.festivals.listed is
  'false = kept but not shown on /festivals, its page, the sitemap or crawler heads. Set by hand; unlisted_reason says why.';

alter table public.festivals drop constraint if exists festivals_festival_type_check;
alter table public.festivals add constraint festivals_festival_type_check
  check (festival_type = any (array['festival', 'pride', 'fetish', 'bear', 'circuit', 'film',
                                    'sports', 'conference', 'series', 'other']));

alter table public.festivals drop constraint if exists festivals_unlisted_reason_check;
alter table public.festivals add constraint festivals_unlisted_reason_check
  check (listed or unlisted_reason is not null);

-- ---------------------------------------------------------------------------
-- 2. Read paths
-- ---------------------------------------------------------------------------
drop policy if exists "Public read festivals (safety-gated)" on public.festivals;
create policy "Public read festivals (safety-gated)" on public.festivals
  for select to anon, authenticated
  using (listed
         and (not public.location_is_high_risk(country_id, city_id)
              or (select auth.uid()) is not null));

-- Staff keep reading unlisted brands, or the admin update/delete policies would
-- have nothing to act on.
drop policy if exists "Staff read festivals" on public.festivals;
create policy "Staff read festivals" on public.festivals
  for select to authenticated
  using (api_private.has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]));

create or replace view public.festivals_crawlable as
  select f.id, f.name, f.slug, f.description, f.city, f.country, f.festival_type, f.updated_at
    from public.festivals f
   where f.brand_key is not null
     and f.listed
     and not public.location_is_high_risk(f.country_id, f.city_id);

revoke all on public.festivals_crawlable from public, anon, authenticated;
grant select on public.festivals_crawlable to service_role;

-- ---------------------------------------------------------------------------
-- 3. Re-type. Keyed by slug; a slug that has since gone is skipped, not fatal.
-- ---------------------------------------------------------------------------
create temporary table _fest_type (slug text primary key, t text not null) on commit drop;
insert into _fest_type (slug, t) values
  -- bear weeks and bear prides
  ('amsterdam-bear-pride', 'bear'), ('atlanta-bear-pride', 'bear'),
  ('baerenpaadiie-xxl-hamburg', 'bear'), ('bear-carnival', 'bear'),
  ('bear-festival-milan', 'bear'), ('bear-new-zealand-week', 'bear'),
  ('bearadise-puerto-vallarta-international-bear-fetish-festival-ibff', 'bear'),
  ('bearadise-vallarta-bear-week-pool-parties', 'bear'),
  ('bears-week-sitges-may-edition', 'bear'), ('beefdip-bear-week', 'bear'),
  ('dublin-bear-pride', 'bear'), ('lazy-bear-week', 'bear'),
  ('lisbon-bear-pride', 'bear'), ('luxembourg-bear-pride', 'bear'),
  ('mad-bear-beach-festival-torremolinos', 'bear'), ('maspalomas-bear-carnival', 'bear'),
  ('stockholm-bear-pride', 'bear'),
  -- circuit party weekends
  ('industry-puerto-vallarta-easter-circuit-festival', 'circuit'),
  ('la-demence-anniversary-weekend', 'circuit'), ('matinee-gay-easter-weekend', 'circuit'),
  ('matrix-torremolinos-easter-festival', 'circuit'),
  ('semana-santa-easter-festival-puerto-vallarta', 'circuit'),
  ('sexy-carnival-festival-cologne', 'circuit'), ('the-week-new-year-s-party', 'circuit'),
  ('we-party-festival', 'circuit'), ('we-party-new-year-festival', 'circuit'),
  ('white-party-bangkok', 'circuit'), ('winter-party-festival', 'circuit'),
  ('winter-party-miami', 'circuit'),
  -- sports
  ('eurogames-cardiff', 'sports'), ('igbo-annual-tournament', 'sports'),
  ('igla-championships', 'sports'), ('pinkster-tennis-tournament-amsterdam', 'sports'),
  ('sin-city-classic', 'sports'),
  -- film festivals filed as pride / festival
  ('bfi-flare', 'film'), ('cheries-cheris-international-lgbtqia-film-festival-paris', 'film'),
  ('ecrans-mixtes-lgbtq-film-festival', 'film'), ('endimaris-sitges-lgbtq-film-festival', 'film'),
  ('festival-de-cine-de-alicante', 'film'), ('go-film-goiania-film-festival', 'film'),
  ('indianapolis-lgbt-film-festival', 'film'),
  ('kashish-mumbai-international-queer-film-festival', 'film'),
  ('leeds-queer-film-festival', 'film'), ('lgbt-film-festival', 'film'),
  ('lightreel-film-festival', 'film'), ('ljubljana-gay-and-lesbian-film-festival', 'film'),
  ('outshine-lgbtq-film-festival-spring-edition', 'film'), ('queer-shorts-vienna', 'film'),
  ('roze-filmdagen', 'film'), ('sicilia-queer-filmfest', 'film'), ('teddy-award', 'film'),
  ('wicked-queer', 'film'),
  -- leather / fetish filed as festival / other
  ('folsom-europe', 'fetish'), ('mid-atlantic-leather-weekend', 'fetish'),
  ('new-england-leather-weekend', 'fetish'), ('pig-week', 'fetish'),
  -- prides filed as festival / other
  ('brighton-pride-campsite', 'pride'), ('chicago-black-pride-weekend', 'pride'),
  ('columbus-pride-weekend', 'pride'), ('denver-pride-weekend', 'pride'),
  ('newcastle-pride-arena', 'pride'), ('nyc-pride-weekend', 'pride'),
  ('pattaya-international-pride-festival', 'pride'), ('philadelphia-pride-weekend', 'pride'),
  ('seoul-queer-culture-festival', 'pride'),
  ('stonewall-columbus-pride-festival-and-march', 'pride'),
  ('twin-cities-pride-weekend', 'pride'), ('vancouver-pride-festival', 'pride'),
  ('wellington-pride-festival', 'pride');

update public.festivals f
   set festival_type = x.t, updated_at = now()
  from _fest_type x
 where f.slug = x.slug
   and f.festival_type is distinct from x.t;

-- ---------------------------------------------------------------------------
-- 4. Unlist. Again keyed by slug and soft on a missing row.
-- ---------------------------------------------------------------------------
create temporary table _fest_unlist (slug text primary key, reason text not null) on commit drop;
insert into _fest_unlist (slug, reason) values
  ('amsterdam-light-festival', 'not an LGBTQ+ event: city light-art festival'),
  ('strasbourg-christmas-market-lgbtq-friendly-visit', 'not an LGBTQ+ event: Christmas market (its own description says so)'),
  ('venice-carnival', 'not an LGBTQ+ event: mainstream carnival listed as gay-friendly'),
  ('nice-carnival', 'not an LGBTQ+ event: mainstream carnival listed as gay-friendly'),
  ('zurich-carnival', 'not an LGBTQ+ event: mainstream carnival listed as gay-friendly'),
  ('cologne-carnival', 'not an LGBTQ+ event: its own description says "not a gay event in itself"'),
  ('fulldome-festival-brno', 'not an LGBTQ+ event: planetarium projection festival'),
  ('maspalomas-bear-carnival', 'duplicate of bear-carnival (same dates, same city)'),
  ('ptown-carnival', 'duplicate of provincetown-carnival (same week)'),
  ('my-pleasure-anniversary-week', 'duplicate of my-pleasure-madrid (same dates, same city)'),
  ('whistler-pride-and-ski-week', 'duplicate of whistler-pride-and-ski-festival'),
  ('winter-pride-solden', 'duplicate of winter-pride-soelden'),
  ('sydney-mardi-gras', 'duplicate of sydney-gay-and-lesbian-mardi-gras'),
  ('sydney-gay-and-lesbian-mardi-gras-sydney', 'duplicate of sydney-gay-and-lesbian-mardi-gras (parade day only)');

update public.festivals f
   set listed = false, unlisted_reason = x.reason, updated_at = now()
  from _fest_unlist x
 where f.slug = x.slug
   and f.listed;

-- ---------------------------------------------------------------------------
-- 5. Postconditions: assert the end state, not how many rows this run moved.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad integer;
  v_listed integer;
begin
  select count(*) into v_bad
    from public.festivals f join _fest_type x on x.slug = f.slug
   where f.festival_type is distinct from x.t;
  if v_bad <> 0 then
    raise exception 'P1 failed: % re-typed brands do not carry their new type', v_bad;
  end if;

  select count(*) into v_bad
    from public.festivals f join _fest_unlist x on x.slug = f.slug
   where f.listed or f.unlisted_reason is null;
  if v_bad <> 0 then
    raise exception 'P2 failed: % brands meant to be unlisted are still listed', v_bad;
  end if;

  select count(*) into v_bad
    from public.festivals_crawlable c join public.festivals f on f.id = c.id
   where not f.listed;
  if v_bad <> 0 then
    raise exception 'P3 failed: % unlisted brands are still in festivals_crawlable', v_bad;
  end if;

  -- The duplicate's keeper must survive: unlisting both halves of a pair would
  -- take the festival off the site entirely.
  select count(*) into v_bad
    from public.festivals f
   where f.slug in ('bear-carnival', 'provincetown-carnival', 'my-pleasure-madrid',
                    'whistler-pride-and-ski-festival', 'winter-pride-soelden',
                    'sydney-gay-and-lesbian-mardi-gras')
     and not f.listed;
  if v_bad <> 0 then
    raise exception 'P4 failed: % duplicate keepers were unlisted', v_bad;
  end if;

  -- Not vacuous: the directory still has most of its brands.
  select count(*) into v_listed from public.festivals where brand_key is not null and listed;
  if v_listed < 300 then
    raise exception 'P5 failed: only % listed brands remain', v_listed;
  end if;

  if has_table_privilege('anon', 'public.festivals_crawlable', 'select')
     or has_table_privilege('authenticated', 'public.festivals_crawlable', 'select') then
    raise exception 'P6 failed: festivals_crawlable is readable by anon/authenticated';
  end if;
end
$verify$;
