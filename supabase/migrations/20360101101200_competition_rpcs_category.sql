-- Expose `competitions.category` through the two read RPCs.
--
-- `/competitions` splits into one page per comparable type, so the category has
-- to reach the client: without it the pages cannot filter and the hub cannot
-- count. `competition_grid` and `competition_history_for_personality` are
-- untouched — neither surfaces a competition-level grouping, so neither can be
-- perturbed by this.

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
               'slug', c.slug, 'name', c.name, 'kind', c.kind, 'format', c.format, 'category', c.category,
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
    'category', c.category,
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
declare v jsonb; v_missing int; v_cats int;
begin
  v := public.competition_overview();
  select count(*) into v_missing from jsonb_array_elements(v->'competitions') c
   where coalesce(c->>'category', '') = '';
  if v_missing <> 0 then
    raise exception '% competition(s) reach the client with no category', v_missing;
  end if;

  -- All six must survive the round trip, or a page ships empty.
  select count(distinct c->>'category') into v_cats
    from jsonb_array_elements(v->'competitions') c;
  if v_cats <> 6 then raise exception 'overview exposes % categories, expected 6', v_cats; end if;

  select count(*) into v_missing from jsonb_array_elements(public.competition_roster()) r
   where coalesce(r->>'category', '') = '';
  if v_missing <> 0 then raise exception '% roster rows without a category', v_missing; end if;
end
$verify$;
