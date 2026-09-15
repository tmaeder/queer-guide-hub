-- Part 2 of berlin_district_villages: move the events off the tags and onto the villages.
-- Applied as its own version (20260915175902) because the work is a separate top-level
-- statement — see the statement_timeout note in 20260915175850.
--
-- ---------------------------------------------------------------------------
-- 2. Move the events off the tags and onto the villages.
--    Only ever FILLS a null — an event already linked to a village keeps it.
--
--    ONLY EVENTS THAT NAME EXACTLY ONE DISTRICT ARE LINKED. Measured: of 2,066 tagged events,
--    1,933 name a single district and 133 name two (kreuzberg+neukolln, mitte+neukolln,
--    friedrichshain+mitte, kreuzberg+schoneberg, prenzlauer+schoneberg, ...). An event has exactly
--    one `queer_village_id`, so the 133 need a tie-break, and THIS CORPUS HAS NO HONEST ONE.
--
--    TWO TIE-BREAKS WERE BUILT, MEASURED, AND REJECTED. Both are recorded because each looks
--    obviously correct until it is measured.
--
--    (1) Statement order. A first draft ran one UPDATE per district; whichever ran first won.
--    That is not evidence, and it hid itself as an unexplained shortfall — neukolln read
--    "185 tagged, 77 linked" with nothing saying why.
--
--    (2) Nearest district centroid to the event's own coordinates. This is the one that matters,
--    because it reads like real evidence and is not. **1,877 of the 1,877 events that "have
--    coordinates" sit on just 4 DISTINCT POINTS**, and one of those points is
--    52.5200,13.4050 — Berlin's own `cities` centroid, i.e. the fallback a missing geocode
--    writes. Worse, that value is also the natural centroid for MITTE, so every placeholder
--    event sits at distance 0 from Mitte and the rule quietly relabels the whole cohort.
--    Reading the rows is what exposed it: the losing neukolln events are `Silverfuture`,
--    `Ficken 3000`, `B-Lage`, `Comedy Café Berlin` and one literally titled
--    "Das Wunder von Neukölln" — all genuinely in Neukölln, all about to be filed under
--    Kreuzberg or Mitte on the strength of a placeholder. This is CLAUDE.md's venue-dedup
--    lesson one entity over: **a distance of 0 is the placeholder signature, not proximity.**
--    Venue coordinates are no better: only 44 of the 133 have a venue with coordinates at all,
--    spread over 10 points.
--
--    So the 133 are left UNLINKED. They keep both tags, so nothing is destroyed and a later pass
--    with real geocoding can resolve them; a null queer_village_id is recoverable and a wrong one
--    is not. That is the rule this repo already paid for on events.city_id (Portland ME ->
--    Portland OR, 20260802090844), and the reason no coordinate appears in the statement below.
-- ---------------------------------------------------------------------------
update public.events e
   set queer_village_id = pick.village_id
  from (
    -- `(array_agg(...))[1]`, NOT `min()`: there is no `min(uuid)` in PostgreSQL (42883). Same
    -- fix as 20260724260500. Under the HAVING below exactly one distinct value reaches this, so
    -- the subscript is deterministic and is not a tie-break.
    select c.event_id, (array_agg(c.village_id))[1] as village_id
      from (
        select a.entity_id as event_id, q.id as village_id
          from public.unified_tag_assignments a
          join public.unified_tags t on t.id = a.tag_id and a.entity_type = 'event'
          -- tag slug -> village slug. They differ: the tags are hashtags (`schoneberg`,
          -- `neukolln`, and the truncated `prenzlauer`), the villages are named for the places.
          join (values ('kreuzberg','kreuzberg'), ('schoneberg','schoeneberg'),
                       ('neukolln','neukoelln'), ('friedrichshain','friedrichshain'),
                       ('prenzlauer','prenzlauer-berg'), ('mitte','mitte')
               ) as m(tag_slug, village_slug) on m.tag_slug = t.slug
          join public.queer_villages q on q.slug = m.village_slug
      ) c
     group by c.event_id
    -- Exactly one district named. This HAVING is what makes the pick unambiguous; the aggregate
    -- above only satisfies the grouping.
    having count(distinct c.village_id) = 1
  ) pick
 where e.id = pick.event_id
   and e.queer_village_id is null;

-- ---------------------------------------------------------------------------
-- 3. Postconditions. Assert the REACHED state positively — counting rows in a bad state
--    returns a reassuring zero for a district that failed to be created at all.
-- ---------------------------------------------------------------------------
do $$
declare
  v_slugs text[] := array['kreuzberg','neukoelln','friedrichshain','prenzlauer-berg','mitte','schoeneberg'];
  v_villages int; v_spine int; v_profiles int; v_linked int; v_empty text;
begin
  select count(*) into v_villages from public.queer_villages where slug = any(v_slugs);
  if v_villages <> 6 then
    raise exception 'expected 6 Berlin district villages (5 new + Schöneberg), found %', v_villages;
  end if;

  -- The spine is what the FK actually points at, so assert it rather than trusting the trigger.
  select count(*) into v_spine from public.geo_places p
    join public.queer_villages q on q.id = p.id
   where q.slug = any(v_slugs) and p.place_type = 'village';
  select count(*) into v_profiles from public.geo_village_profiles gp
    join public.queer_villages q on q.id = gp.place_id
   where q.slug = any(v_slugs);
  if v_spine <> 6 or v_profiles <> 6 then
    raise exception 'geo spine incomplete: geo_places=% geo_village_profiles=% (expected 6 each)',
      v_spine, v_profiles;
  end if;

  select count(*) into v_linked from public.events e
    join public.queer_villages q on q.id = e.queer_village_id
   where q.slug = any(v_slugs);
  raise notice 'events now linked to a Berlin district: %', v_linked;

  -- Every district created here must have received events, or it will be classified `ghost` and
  -- deindexed on the next nightly recompute — which would make this migration a no-op with extra
  -- steps. Named, not counted, so the failure says WHICH district.
  select string_agg(q.slug, ', ' order by q.slug) into v_empty
    from public.queer_villages q
   where q.slug = any(v_slugs)
     and not exists (select 1 from public.events e where e.queer_village_id = q.id);
  if v_empty is not null then
    raise exception 'districts created with zero linked events (would ghost on the nightly recompute): %', v_empty;
  end if;
end $$;
