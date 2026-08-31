-- Point the enrichment selector at the two gaps that matter for identity, and
-- schedule the alias harvest.
--
-- WHY THE SELECTOR CANNOT REACH THEM TODAY. `cities_due_for_refresh` orders by
-- `last_refreshed_at ASC NULLS FIRST` -- a round robin, which is correct for
-- keeping facts fresh and useless for closing a gap: every visit stamps
-- last_refreshed_at, so an already-linked city keeps coming back and the
-- unlinked tail never arrives. At the registered batch of 40/night against
-- 2,695 cities with no wikidata_qid, coverage does not converge, it circulates.
-- Measured 2026-08-25: 2,857 of 5,552 live cities carry a QID (51%).
--
-- WHY THAT BLOCKS DUPLICATE PREVENTION SPECIFICALLY. `city_resolve_or_create`'s
-- alias arm is the only probe that can tell Kapstadt from a new city, and it is
-- inert until `city_aliases` is populated -- measured the same day, the alias
-- key for 'Kapstadt' resolves to NULL while Cape Town sits right there. The
-- table holds 386 rows over 211 of 5,552 cities, and essentially all of it was
-- minted by `merge_cities` from names somebody had already noticed and merged.
-- An alias table built only from past merges can never prevent the FIRST
-- duplicate of a name. Wikidata already knows every one of these as a label or
-- altLabel, and 20261001100000's harvest reads them out of a response the
-- backfill was already fetching.
--
-- TWO SCOPES, because the two gaps have different costs. `qid_gap` is the
-- expensive path -- an unlinked city pays wbsearchentities (up to 7 candidate
-- queries) plus wbgetentities plus Wikipedia -- and the registered 40-in-150s
-- of the existing job is the measured rate, so 60 is a modest step, not a leap.
-- `alias_gap` is the cheap one: the QID is cached, so it is exactly ONE
-- wbgetentities call per city, which is why it can run at the 300 ceiling.
--
-- The two are separate crons rather than one alternating job because a job that
-- changes what it does depending on the day cannot be read from the registry,
-- and the registry is the record.
--
-- ORDERING IS BY POPULATION, NOT BY last_refreshed_at, for both new scopes. A
-- gap-closing pass is not a round robin -- revisiting is the failure mode, not
-- the goal -- and population puts the cities a reader actually lands on first.
-- Terminal rows are excluded by the scope CTE's existing `data_unavailable`
-- guard, so an unresolvable city leaves the pool after MAX_LINK_ATTEMPTS
-- instead of pinning the queue head, which is the same trap 20260801133923
-- fixed for the content path.

CREATE OR REPLACE FUNCTION public.cities_due_for_refresh(
  p_limit integer DEFAULT 25,
  p_scope text DEFAULT 'content_first'
)
RETURNS TABLE(
  id uuid, name text, slug text, latitude numeric, longitude numeric,
  country_id uuid, description text, official_website text,
  completeness_score smallint, shell_status text,
  last_refreshed_at timestamp with time zone, refresh_reason text,
  has_content boolean, wikidata_qid text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH scope AS (
    SELECT c.id, c.name, c.slug, c.latitude, c.longitude, c.country_id,
           c.description, c.official_website, c.completeness_score, c.shell_status,
           c.last_refreshed_at, c.wikidata_qid, c.population,
           (EXISTS (SELECT 1 FROM public.venues v WHERE v.city_id = c.id)
             OR EXISTS (SELECT 1 FROM public.events e WHERE e.city_id = c.id)) AS has_content,
           EXISTS (SELECT 1 FROM public.city_aliases a WHERE a.city_id = c.id) AS has_alias
    FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
      AND c.shell_status <> 'merged'
      AND COALESCE(c.enrichment_status->'wikidata_link'->>'state', '') <> 'data_unavailable'
      AND COALESCE(c.enrichment_status->'disposition'->>'state', '')   <> 'not_a_city'
  )
  SELECT s.id, s.name, s.slug, s.latitude, s.longitude, s.country_id,
         s.description, s.official_website, s.completeness_score, s.shell_status,
         s.last_refreshed_at,
         CASE
           WHEN p_scope = 'qid_gap'          THEN 'unlinked'
           WHEN p_scope = 'alias_gap'        THEN 'no_aliases'
           WHEN s.last_refreshed_at IS NULL  THEN 'never_refreshed'
           WHEN s.wikidata_qid IS NULL       THEN 'unlinked'
           WHEN s.completeness_score < 40    THEN 'low_completeness'
           ELSE 'stale'
         END AS refresh_reason,
         s.has_content, s.wikidata_qid
  FROM scope s
  WHERE (p_scope <> 'content_only' OR s.has_content)
    AND (p_scope <> 'qid_gap'   OR s.wikidata_qid IS NULL)
    -- alias_gap needs a QID: without one the harvest has nothing to read, and
    -- the row belongs to qid_gap instead.
    AND (p_scope <> 'alias_gap' OR (s.wikidata_qid IS NOT NULL AND NOT s.has_alias))
  ORDER BY
    CASE WHEN p_scope IN ('all', 'qid_gap', 'alias_gap') THEN 0
         ELSE (NOT s.has_content)::int END,
    CASE WHEN p_scope IN ('qid_gap', 'alias_gap') THEN 0
         ELSE (s.slug LIKE 'tmp-%')::int END,
    CASE WHEN p_scope IN ('qid_gap', 'alias_gap')
         THEN -coalesce(s.population, 0) END ASC NULLS LAST,
    s.last_refreshed_at ASC NULLS FIRST,
    s.completeness_score ASC
  LIMIT greatest(1, least(p_limit, 1000));
$function$;

COMMENT ON FUNCTION public.cities_due_for_refresh(integer, text) IS
  'Work list for city-factual-backfill. Scopes: content_first (default, round '
  'robin by last_refreshed_at), content_only, all, and the two gap-closing '
  'scopes qid_gap (no wikidata_qid) and alias_gap (has a QID, has no '
  'city_aliases row) which order by population instead, because a gap pass must '
  'not revisit.';

-- ---------------------------------------------------------------------------
-- Crons. Both are family A (net.http_post in the command text), so the command
-- stored here stays the readable original and sync_automations_to_cron()
-- re-points it at automation_http_post for run tracking.
--
-- 02:10 and 02:40 sit before the existing city_factual_backfill (03:15) and
-- city_factual_sparql (03:40): a city that gains a QID at 02:10 is available to
-- the alias pass 30 minutes later and to the fact pass the same night.
-- ---------------------------------------------------------------------------

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
(
  'city_qid_gap_link',
  'Link cities to Wikidata (gap pass)',
  'Nightly 02:10: resolves a wikidata_qid for cities that have none, largest first (cities_due_for_refresh scope=qid_gap, 60/run -- the expensive path, wbsearchentities + wbgetentities + Wikipedia per row). Distinct from city_factual_backfill, which is a freshness round robin and structurally cannot close this gap. Fills city_aliases as a side effect. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object(
    'type','cron',
    'jobname','city_qid_gap_link',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/city-factual-backfill',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='city_quality_webhook_secret')
    ),
    body := '{"phase":"link","scope":"qid_gap","batch_limit":60}'::jsonb,
    timeout_milliseconds := 240000
  ) as request_id;
$cmd$
  ),
  '10 2 * * *'
),
(
  'city_alias_harvest',
  'Harvest city name aliases from Wikidata',
  'Nightly 02:40: for cities that have a wikidata_qid but no city_aliases row, reads labels/altLabels/P1448/P1705/P1813/sitelinks out of ONE cached-QID wbgetentities call (cities_due_for_refresh scope=alias_gap, 300/run -- the repo batch ceiling). This is what makes city_resolve_or_create able to tell Kapstadt from a new city; the alias arm is inert without it. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object(
    'type','cron',
    'jobname','city_alias_harvest',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/city-factual-backfill',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='city_quality_webhook_secret')
    ),
    body := '{"phase":"link","scope":"alias_gap","batch_limit":300}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
$cmd$
  ),
  '40 2 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      schedule = EXCLUDED.schedule, action = EXCLUDED.action, enabled = EXCLUDED.enabled;

DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['city_qid_gap_link','city_alias_harvest'] LOOP
    BEGIN PERFORM cron.unschedule(s); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

-- Schedule the WRAPPED command, not the raw one: both jobs post via net.http_post
-- (family A), so without admin_automation_run_begin + automation_http_post their
-- runs would never be recorded and consecutive_failures could never move -- the
-- exact blind spot 20260910163700 closed for the other 95 jobs. The registry
-- keeps the readable original; this derives the tracked form, and the nightly
-- reconciler re-derives it if a later migration re-schedules the raw command.
SELECT cron.schedule(
         a.action->>'jobname',
         a.schedule,
         public.admin_automation_effective_command(a.slug, a.action->>'command'))
FROM public.admin_automations a
WHERE a.slug IN ('city_qid_gap_link','city_alias_harvest');
