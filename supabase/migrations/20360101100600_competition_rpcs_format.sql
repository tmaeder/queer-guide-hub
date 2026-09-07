-- Expose `competitions.format` through the two read RPCs the UI filters on.
--
-- Without this the correction in 20360101100500 is invisible: the season table
-- and the roster both build their filter chips from `kind`, so the page would
-- go on rendering a chip labelled "Pageant" over International Mr. Leather no
-- matter what the column underneath says.
--
-- Only `competition_overview` and `competition_roster` are touched.
-- `competition_grid` and `competition_history_for_personality` do not surface a
-- competition-level label and are left exactly as they are, so this migration
-- cannot perturb the grid or the personality panel.

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
               'slug', c.slug, 'name', c.name, 'kind', c.kind, 'format', c.format,
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
    'format', c.format,
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

do $verify$
declare v jsonb; v_fmt int; v_iml text;
begin
  v := public.competition_overview();
  select count(*) into v_fmt from jsonb_array_elements(v->'competitions') c
   where coalesce(c->>'format', '') <> '';
  if v_fmt < 30 then
    raise exception 'overview exposes a format on only % competitions', v_fmt;
  end if;

  select c->>'format' into v_iml from jsonb_array_elements(v->'competitions') c
   where c->>'slug' = 'international-mr-leather';
  if v_iml is null or v_iml ilike '%pageant%' then
    raise exception 'overview still calls International Mr. Leather a pageant: %', v_iml;
  end if;

  -- The roster must carry it too, or its filter chips have nothing to group by.
  select count(*) into v_fmt from jsonb_array_elements(public.competition_roster()) r
   where coalesce(r->>'format', '') = '';
  if v_fmt <> 0 then raise exception '% roster rows without a format', v_fmt; end if;
end
$verify$;
