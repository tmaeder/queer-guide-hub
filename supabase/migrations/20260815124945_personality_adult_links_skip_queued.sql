-- ============================================================================
-- personality_adult_links — a pair that is WITH A HUMAN is not "due"
--
-- Bug this fixes, measured on prod after the first full sweep: all 4,173 live
-- adult rows still read as due, and 880 of them could make NO progress at all.
--
-- A platform awaiting review has no `social_links` key (nothing is written
-- until an admin approves) and its state is 'review_queued', which is not the
-- 'data_unavailable' terminal sentinel — so the selector kept handing those
-- rows out. The function correctly skips the probe (the open-review pre-filter
-- catches it before any HTTP), but that means NOTHING changes, so the single
-- UPDATE never runs and `last_attempt_at` is never advanced. Since ordering is
-- `last_attempt_at asc nulls first`, those rows cycle back to the front and
-- consume batch slots forever while real work starves behind them.
--
-- This is the SAME defect class as the xhamster one fixed in
-- 20260815114759 — the exclusion has to be expressed in the SELECTOR, because
-- the selector is what advances the cursor. Missing it for 'review_queued' was
-- the same mistake in a second place.
--
-- A (row, platform) pair now leaves the pool when it is:
--   * linked            — the social_links key exists
--   * data_unavailable  — 3 misses, terminal sentinel
--   * review_queued     — a human owns the decision; re-probing changes nothing
--
-- 'review_queued' is deliberately sticky after a REJECTION too: the repo's
-- review convention is that rejected pairs are never re-suggested.
--
-- Version note: applied live via MCP `apply_migration`, which stamps the
-- version from its own call timestamp; the filename matches that stamp so
-- `db push` matches by version and skips it.
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
                      not in ('data_unavailable','review_queued'))          as missing,
         (p.enrichment_status->'adult_links'->>'last_attempt_at')::timestamptz as last_attempt_at
    from public.personalities p
   where p.is_adult
     and p.duplicate_of_id is null
     and coalesce(p.review_status,'') <> 'archived'
     and exists (select 1
                   from plat
                  where not (coalesce(p.social_links,'{}'::jsonb) ? plat.k)
                    and coalesce(p.enrichment_status->'adult_links'->plat.k->>'state','')
                        not in ('data_unavailable','review_queued'))
   order by (p.enrichment_status->'adult_links'->>'last_attempt_at')::timestamptz asc nulls first,
            p.id
   limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.personalities_due_for_adult_links(int, text[]) from public;
grant execute on function public.personalities_due_for_adult_links(int, text[]) to service_role;

comment on function public.personalities_due_for_adult_links(int, text[]) is
  'Work list for personality-link-adult-profiles. Round-robin by last_attempt_at. A (row, platform) pair drops out of the pool when it is linked, when it reaches the data_unavailable sentinel after 3 misses, or when it is sitting in entity_review_queue - re-probing a pair that is with a human changes nothing and would starve the cursor. Defaults to pornhub+xvideos; xhamster is on-demand only (~3% hit rate).';
