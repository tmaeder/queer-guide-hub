-- ============================================================================
-- personality_adult_links — drop xhamster from the NIGHTLY selector
--
-- Measured over the first ~1,000 rows of the real sweep, xhamster resolved
-- ~3% of names while costing a third of all probe traffic: its pornstar
-- directory is heavily straight-skewed and this corpus is gay-male. It stays
-- fully supported on demand — pass p_platforms explicitly (the edge function
-- forwards its `platforms` body field) and xhamster rows become selectable
-- again.
--
-- WHY THE SELECTOR AND NOT JUST THE CRON BODY: if the selector kept reporting
-- xhamster as a missing platform, a row whose ONLY gap is xhamster would be
-- handed to the function every night, skipped without a write (nothing in the
-- active platform set matches), and therefore never have `last_attempt_at`
-- stamped. `last_attempt_at asc nulls first` is the round-robin cursor, so
-- those rows would pin themselves to the head of the queue permanently and
-- starve the pornhub/xvideos work behind them. Same shape as the city-engine
-- selector stall.
-- ============================================================================

create or replace function public.personalities_due_for_adult_links(
  p_limit     int    default 40,
  p_platforms text[] default array['pornhub','xvideos']
)
returns table (
  id              uuid,
  name            text,
  slug            text,
  is_living       boolean,
  encyclopedic    boolean,
  single_token    boolean,
  missing         text[],
  last_attempt_at timestamptz
)
language sql stable
security definer set search_path to 'public', 'pg_temp'
as $$
  with plat(k) as (
    -- Intersect with the known set so a caller cannot smuggle in a platform
    -- the prober has no rules for.
    select unnest(
      array(
        select x from unnest(coalesce(nullif(p_platforms, '{}'), array['pornhub','xvideos'])) x
         where x = any (array['pornhub','xhamster','xvideos'])
      )
    )
  )
  select p.id,
         p.name,
         p.slug,
         p.is_living,
         exists (select 1
                   from public.personality_sources s
                  where s.personality_id = p.id
                    and s.source_slug in ('wikidata','wikipedia'))          as encyclopedic,
         (p.name !~ '\s')                                                   as single_token,
         array(select plat.k
                 from plat
                where not (coalesce(p.social_links,'{}'::jsonb) ? plat.k)
                  and coalesce(p.enrichment_status->'adult_links'->plat.k->>'state','')
                      <> 'data_unavailable')                                as missing,
         (p.enrichment_status->'adult_links'->>'last_attempt_at')::timestamptz as last_attempt_at
    from public.personalities p
   where p.is_adult
     and p.duplicate_of_id is null
     and coalesce(p.review_status,'') <> 'archived'
     and exists (select 1
                   from plat
                  where not (coalesce(p.social_links,'{}'::jsonb) ? plat.k)
                    and coalesce(p.enrichment_status->'adult_links'->plat.k->>'state','')
                        <> 'data_unavailable')
   order by (p.enrichment_status->'adult_links'->>'last_attempt_at')::timestamptz asc nulls first,
            p.id
   limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.personalities_due_for_adult_links(int, text[]) from public;
grant execute on function public.personalities_due_for_adult_links(int, text[]) to service_role;

comment on function public.personalities_due_for_adult_links(int, text[]) is
  'Work list for personality-link-adult-profiles. Round-robin by last_attempt_at; '
  'excludes rows whose per-platform state reached the data_unavailable sentinel. '
  'Defaults to pornhub+xvideos — xhamster is on-demand only (~3% hit rate).';

-- The 1-arg signature would still satisfy the old rpc('...', {p_limit}) call
-- and silently keep probing xhamster, so it has to go. Dropped AFTER the new
-- one exists so there is no window with no selector at all.
drop function if exists public.personalities_due_for_adult_links(int);
