-- Read RPCs for the competition spine.
--
-- SHAPE: one round trip per surface, returning jsonb, following
-- `substance_interaction_matrix()` (20260909172000). The page then pivots and
-- filters client-side. That is the proven house strategy for a data-dense
-- public page here — `/tags/interactions` ships 51 axis entries + 476 cells this
-- way and `cities_directory()` returns all 2,142 cities with their counts in a
-- single 98 ms statement.
--
-- THE PERSONALITY LINK IS FILTERED SERVER-SIDE, AND THAT IS A SAFETY DECISION
--
-- Only 483 of the 776 drag personalities are `visibility='public'`. A slug is
-- returned ONLY for a public, non-duplicate row; every other entrant comes back
-- with `personality_slug` null and renders as plain text. Doing this in the RPC
-- rather than in the client means no surface can leak a draft by forgetting the
-- filter — this repo has already served draft personalities to crawlers once.
--
-- SECURITY DEFINER + a hard search_path, because the join reads `personalities`,
-- which is RLS-protected; the filter above is what replaces that protection and
-- it is deliberately stricter than RLS would be.

-- ---------------------------------------------------------------------------
-- 1. Overview — every competition with its editions and the headline results.
--    Backs the season table and the charts.
-- ---------------------------------------------------------------------------
create or replace function public.competition_overview()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with ed as (
    select
      e.id, e.competition_id, e.edition_number, e.title, e.slug,
      e.episode_count, e.first_aired, e.last_aired, e.network, e.status,
      hc.name as host_city, hco.name as host_country,
      (select count(*) from public.competition_entrants x where x.edition_id = e.id) as entrants,
      (select count(*) from public.competition_episodes x where x.edition_id = e.id) as episodes,
      (select count(*) from public.competition_episode_results r
         join public.competition_entrants x on x.id = r.entrant_id
        where x.edition_id = e.id) as results,
      -- Winner / runners-up / Miss Congeniality are ARRAYS, never scalars: seven
      -- US seasons have two runners-up and season 16 has a Miss Congeniality
      -- tie, and one of those two is simultaneously a runner-up.
      (select coalesce(jsonb_agg(x.stage_name order by x.stage_name), '[]'::jsonb)
         from public.competition_entrants x where x.edition_id = e.id and x.is_winner) as winners,
      (select coalesce(jsonb_agg(x.stage_name order by x.stage_name), '[]'::jsonb)
         from public.competition_entrants x where x.edition_id = e.id and x.is_runner_up) as runners_up,
      (select coalesce(jsonb_agg(x.stage_name order by x.stage_name), '[]'::jsonb)
         from public.competition_entrants x where x.edition_id = e.id and x.is_miss_congeniality) as miss_congeniality
      from public.competition_editions e
      left join public.cities hc on hc.id = e.host_city_id
      left join public.countries hco on hco.id = e.host_country_id
     where e.duplicate_of_id is null
  )
  select jsonb_build_object(
    'competitions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', c.slug, 'name', c.name, 'kind', c.kind,
               'network', c.network, 'organizer', c.organizer,
               'country', co.name, 'country_code', co.code,
               'editions', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'slug', ed.slug, 'number', ed.edition_number, 'title', ed.title,
                          'episode_count', ed.episode_count, 'episodes', ed.episodes,
                          'first_aired', ed.first_aired, 'last_aired', ed.last_aired,
                          'network', ed.network, 'status', ed.status,
                          'host_city', ed.host_city, 'host_country', ed.host_country,
                          'entrants', ed.entrants, 'results', ed.results,
                          'winners', ed.winners, 'runners_up', ed.runners_up,
                          'miss_congeniality', ed.miss_congeniality)
                        order by ed.edition_number nulls last)
                   from ed where ed.competition_id = c.id), '[]'::jsonb))
             order by c.sort_order, c.name)
        from public.competitions c
        left join public.countries co on co.id = c.country_id), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Roster — every entrant, flattened, for the searchable contestant list.
-- ---------------------------------------------------------------------------
create or replace function public.competition_roster()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'name', ce.stage_name,
    'competition', c.name,
    'competition_slug', c.slug,
    'kind', c.kind,
    'edition', ed.title,
    'edition_slug', ed.slug,
    'edition_number', ed.edition_number,
    'year', extract(year from ed.first_aired)::int,
    'placement', ce.placement,
    'placement_label', ce.placement_label,
    'winner', ce.is_winner,
    'runner_up', ce.is_runner_up,
    'miss_congeniality', ce.is_miss_congeniality,
    'challenge_wins', nullif(ce.challenge_wins, 0),
    'lip_syncs', nullif(ce.lip_syncs, 0),
    'age', ce.age_at_filming,
    'hometown', ce.hometown_text,
    -- Only ever a PUBLIC personality. A draft one yields null and the UI renders
    -- plain text rather than a link.
    'personality_slug', p.slug,
    'image_url', p.image_url,
    'lat', ct.latitude,
    'lng', ct.longitude,
    'city', ct.name,
    'country', pco.name
  )) order by ed.first_aired desc nulls last, ce.placement nulls last, ce.stage_name), '[]'::jsonb)
    from public.competition_entrants ce
    join public.competition_editions ed on ed.id = ce.edition_id and ed.duplicate_of_id is null
    join public.competitions c on c.id = ed.competition_id
    left join public.personalities p
      on p.id = ce.personality_id
     and p.visibility = 'public'
     and p.duplicate_of_id is null
    left join public.cities ct on ct.id = coalesce(ce.city_id, p.city_id)
    left join public.countries pco on pco.id = p.country_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grid — one edition's full episode-by-episode placement matrix.
--    `{axis, entrants, cells}`; the client pivots.
-- ---------------------------------------------------------------------------
create or replace function public.competition_grid(p_edition_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with ed as (
    select e.id, e.slug, e.title, e.edition_number, c.name as competition, c.slug as competition_slug
      from public.competition_editions e
      join public.competitions c on c.id = e.competition_id
     where e.slug = p_edition_slug and e.duplicate_of_id is null
  )
  select case when (select count(*) from ed) = 0 then null else jsonb_build_object(
    'edition', (select jsonb_build_object('slug', slug, 'title', title, 'number', edition_number,
                                          'competition', competition, 'competition_slug', competition_slug)
                  from ed),
    'axis', coalesce((
      select jsonb_agg(jsonb_build_object('n', ep.episode_number, 'title', ep.title, 'date', ep.air_date)
                       order by ep.episode_number)
        from public.competition_episodes ep
        join ed on ed.id = ep.edition_id), '[]'::jsonb),
    -- Ordered by finishing position so the grid reads as a leaderboard: the
    -- winner's row first, the first queen out last.
    --
    -- `ed` is joined explicitly rather than comma-joined: with `from ce, ed
    -- left join p on p.id = ce.personality_id`, the LEFT JOIN binds to `ed` and
    -- `ce` is not in scope for its ON clause (42P01).
    'entrants', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'name', ce.stage_name, 'placement', ce.placement,
               'placement_label', ce.placement_label,
               'winner', ce.is_winner, 'runner_up', ce.is_runner_up,
               'miss_congeniality', ce.is_miss_congeniality,
               'personality_slug', p.slug))
             order by ce.placement nulls last, ce.stage_name)
        from public.competition_entrants ce
        join ed on ed.id = ce.edition_id
        left join public.personalities p
          on p.id = ce.personality_id and p.visibility = 'public' and p.duplicate_of_id is null
      ), '[]'::jsonb),
    'cells', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', ce.stage_name, 'n', ep.episode_number,
               'o', r.outcome, 'raw', r.outcome_raw))
        from public.competition_episode_results r
        join public.competition_entrants ce on ce.id = r.entrant_id
        join ed on ed.id = ce.edition_id
        join public.competition_episodes ep on ep.id = r.episode_id
      ), '[]'::jsonb)
  ) end;
$$;

-- ---------------------------------------------------------------------------
-- 4. One person's competition history — backs the panel on /personalities/:slug.
-- ---------------------------------------------------------------------------
create or replace function public.competition_history_for_personality(p_personality_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'name', ce.stage_name,
    'competition', c.name, 'competition_slug', c.slug, 'kind', c.kind,
    'edition', ed.title, 'edition_slug', ed.slug, 'edition_number', ed.edition_number,
    'year', extract(year from ed.first_aired)::int,
    'placement', ce.placement, 'placement_label', ce.placement_label,
    'winner', ce.is_winner, 'runner_up', ce.is_runner_up,
    'miss_congeniality', ce.is_miss_congeniality,
    'challenge_wins', nullif(ce.challenge_wins, 0),
    'lip_syncs', nullif(ce.lip_syncs, 0)
  )) order by ed.first_aired desc nulls last), '[]'::jsonb)
    from public.competition_entrants ce
    join public.competition_editions ed on ed.id = ce.edition_id and ed.duplicate_of_id is null
    join public.competitions c on c.id = ed.competition_id
   where ce.personality_id = p_personality_id;
$$;

revoke all on function public.competition_overview() from public;
revoke all on function public.competition_roster() from public;
revoke all on function public.competition_grid(text) from public;
revoke all on function public.competition_history_for_personality(uuid) from public;
grant execute on function public.competition_overview() to anon, authenticated, service_role;
grant execute on function public.competition_roster() to anon, authenticated, service_role;
grant execute on function public.competition_grid(text) to anon, authenticated, service_role;
grant execute on function public.competition_history_for_personality(uuid) to anon, authenticated, service_role;

do $verify$
declare v jsonb; v_n int;
begin
  -- The envelope must exist even on an empty corpus, or the page renders an
  -- error instead of an empty state.
  v := public.competition_overview();
  if v is null or v->'competitions' is null then
    raise exception 'competition_overview returned no envelope';
  end if;

  v := public.competition_roster();
  if jsonb_typeof(v) <> 'array' then raise exception 'competition_roster must return an array'; end if;

  -- A missing edition must return SQL NULL, not an all-null composite that a
  -- client would mistake for a real record (the active_quest_guide trap).
  if public.competition_grid('definitely-not-an-edition') is not null then
    raise exception 'competition_grid must return null for an unknown edition';
  end if;

  -- Positive control: the guard above must not be passing because the function
  -- always returns null.
  select count(*) into v_n from public.competition_editions;
  if v_n > 0 then
    if public.competition_grid((select slug from public.competition_editions limit 1)) is null then
      raise exception 'competition_grid returned null for an edition that exists';
    end if;
  end if;
end
$verify$;
