-- get_homepage_stats: add `events_upcoming` alongside the archive total.
--
-- The homepage masthead advertised "39,757 events" next to "23,484 places",
-- which reads as a claim about how much is ON. It is not: `events` counts every
-- row ever ingested and 99% of the corpus is in the past — as of 2026-08-05 only
-- 315 events are in the future, and 18 within the next 7 days. A visitor who
-- clicks that number lands on an archive.
--
-- The number is not made bigger here, it is made TRUE. `events` keeps its old
-- meaning (the archive total) for any caller that legitimately wants corpus
-- size; the homepage switches to `events_upcoming` and labels it as upcoming.
--
-- Deliberately no `duplicate_of_id` guard difference: it mirrors the existing
-- `events` arm so the two numbers stay comparable.

CREATE OR REPLACE FUNCTION public.get_homepage_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select jsonb_build_object(
    'venues',          (select count(*) from venues where duplicate_of_id is null),
    'profiles',        (select count(*) from profiles),
    'cities',          (select count(*) from cities where duplicate_of_id is null and country_id is not null),
    'countries',       (select count(*) from countries),
    'events',          (select count(*) from events where duplicate_of_id is null),
    'events_upcoming', (select count(*) from events
                         where duplicate_of_id is null
                           and start_date >= now()),
    'posts',           (select count(*) from community_posts),
    'personalities',   (select count(*) from personalities where duplicate_of_id is null),
    'groups',          (select count(*) from community_groups),
    'tags',            (select count(*) from unified_tags),
    'marketplace',     (select count(*) from marketplace_listings where status = 'active'),
    'news',            (select count(*) from news_articles where duplicate_of_id is null),
    'cms',             (select count(*) from cms_content where deleted_at is null),
    'generated_at',    now()
  );
$$;

COMMENT ON FUNCTION public.get_homepage_stats() IS
  'Homepage proof numbers. `events` is the full archive (99% past); use '
  '`events_upcoming` for anything presented to a reader as "what is on".';

-- CREATE OR REPLACE FUNCTION preserves the existing ACL, so these are a no-op
-- today. Stated explicitly anyway: new objects in this project do NOT get anon
-- access by default, and the homepage masthead is an anonymous surface — a
-- silently missing grant here would blank the proof numbers for logged-out
-- visitors, which is exactly the audience they exist for.
GRANT EXECUTE ON FUNCTION public.get_homepage_stats() TO anon, authenticated, service_role;
