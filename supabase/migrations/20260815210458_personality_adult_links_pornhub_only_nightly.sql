-- ============================================================================
-- personality_adult_links — nightly set is PORNHUB ONLY
--
-- Measured across a full sweep of the live cohort (3,600 rows examined):
--
--   pornhub    420 auto-links,  547 reviews
--   xvideos      0 auto-links, 1,511 reviews   <- 72% of the whole queue
--   xhamster    18 auto-links,    38 reviews   (~3% hit rate, dropped earlier)
--
-- xvideos cannot auto-link BY CONSTRUCTION: its `/profiles/` space is
-- self-registered accounts, so `curated` is false and decideTier always routes
-- to review. It was generating three quarters of the human workload for zero
-- automatic value. Both it and xhamster stay fully probeable on demand via the
-- `platforms` body field, which is forwarded to p_platforms.
--
-- The exclusion lives in the SELECTOR, not just the cron body — the selector
-- is what advances the `last_attempt_at` round-robin cursor, so a pair the
-- worker skips but the selector still returns pins itself to the head of the
-- queue forever. Same reason as 20260815114759 and 20260815124945.
--
-- Version note: applied live via MCP `apply_migration`, which stamps the
-- version from its own call timestamp; the filename matches that stamp.
-- ============================================================================

create or replace function public.personalities_due_for_adult_links(
  p_limit     int    default 40,
  p_platforms text[] default array['pornhub']
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
        select x from unnest(coalesce(nullif(p_platforms, '{}'), array['pornhub'])) x
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
revoke all on function public.personalities_due_for_adult_links(int, text[]) from anon;
revoke all on function public.personalities_due_for_adult_links(int, text[]) from authenticated;
grant execute on function public.personalities_due_for_adult_links(int, text[]) to service_role;

comment on function public.personalities_due_for_adult_links(int, text[]) is
  'Work list for personality-link-adult-profiles. Round-robin by last_attempt_at. A (row, platform) pair drops out when linked, terminal (data_unavailable), or sitting in entity_review_queue. Nightly set is pornhub ONLY - xhamster (~3% hit rate) and xvideos (0 auto-links across a full sweep, 72% of the review queue) are on-demand via p_platforms.';
