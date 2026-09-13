-- public.user_events: readable, constrained, scored, and erasable.
--
-- Measured on prod 2026-09-12: 335,810 rows / 85 MB. Four things were wrong at
-- once, and each was invisible for a different reason.
--
-- 1. NOBODY COULD READ IT. The only SELECT policy is `auth.uid() = user_id`,
--    so not even an admin could look. That is how it reached 335k rows without
--    anyone noticing, and why "nothing reads this table" was a plausible
--    first reading of it. (It has three readers, all server-side and all
--    bypassing RLS: recommendation-engine, get_trending_entities and
--    get_user_signal.)
--
-- 2. THE WRITERS AND THE SCORER SPEAK DIFFERENT VOCABULARIES.
--    get_trending_entities scores click|view|save|favorite|book|attend. The
--    app writes page_view (67,257 rows in 7 days — 85% of everything), plus
--    favorite_add / booking_click / trip_create / deal_view / hotel_view /
--    activity_view. Not one of those matched, so 85% of the table was worth
--    exactly zero to the only ranking that reads it, and `favorite_add` scored
--    nothing where the scorer was waiting for `favorite`. This is the
--    signup_validation_error class one layer deeper: not a rejected write, but
--    an accepted write in a vocabulary the reader does not speak — and the
--    resulting "nothing is trending" is indistinguishable from a quiet site.
--
-- 3. NOTHING CONSTRAINED THE VOCABULARY, so that drift could not be detected.
--    The CHECKs below are the union of what the writers can emit, measured
--    against what the table actually holds. src/lib/__tests__ has a drift test
--    that parses this migration and fails if the TS unions move.
--
-- 4. IT SURVIVED ACCOUNT DELETION. _delete_user_data_core deletes 20 personal
--    tables by hand — including search_queries, which shows the intent is
--    explicit erasure rather than FK cascade — but named none of the analytics
--    tables. Every one of them references auth.users, not profiles, so the
--    profiles delete does not reach them.
--
-- Deliberately NOT done here: consolidating the two page-view writers.
-- `page_view` (useTrackEvent, on detail pages) and `view`
-- (SearchTelemetryProvider, implicit) are the same signal recorded twice on
-- venue/city/event/country — 39,092 vs 7,811 rows on venues in 7 days, the gap
-- being that one dedupes per entity per 5 minutes and the other only for 2
-- seconds. Both are scored below so neither is silently worth nothing; picking
-- one is a product decision with its own before/after measurement.

-- ---------------------------------------------------------------------------
-- 1. Make it auditable.
-- ---------------------------------------------------------------------------

drop policy if exists user_events_admin_read on public.user_events;
create policy user_events_admin_read
  on public.user_events
  for select
  to authenticated
  using (has_role_jwt('admin'::app_role));

comment on table public.user_events is
  'Behavioural events feeding recommendations, trending and the personalization signal. Consent-gated at the writer (src/hooks/useTrackEvent.ts). Pruned after 90 days by user_events_retention. Erased on account deletion by _delete_user_data_core.';

-- ---------------------------------------------------------------------------
-- 2. Constrain the vocabulary.
--
-- NOT VALID: the values below were measured to cover every row currently in the
-- table, so a validating add would succeed — but it would take an ACCESS
-- EXCLUSIVE lock and a full scan of 335k rows on a disk-constrained instance to
-- prove something already known. The constraint's job is to stop FUTURE drift,
-- and NOT VALID does that from the moment it exists.
--
-- The union is deliberate and both halves are load-bearing:
--   src/hooks/useTrackEvent.ts  page_view search booking_click favorite_add
--                               favorite_remove deal_view trip_create
--                               hotel_view activity_view
--   src/lib/searchClient.ts     click view save favorite book attend dismiss
--                               search_submit facet_apply zero_results
-- Widening either TS union and this CHECK must happen in the SAME commit,
-- forever. docs/audits/2026-08-21-signup-consent-gap.md is what happens
-- otherwise: the write is rejected, the hook swallows it, and the resulting
-- zero gets read as a fact about users.
-- ---------------------------------------------------------------------------

alter table public.user_events
  drop constraint if exists user_events_event_type_known;
alter table public.user_events
  add constraint user_events_event_type_known check (
    event_type in (
      'page_view','search','booking_click','favorite_add','favorite_remove',
      'deal_view','trip_create','hotel_view','activity_view',
      'click','view','save','favorite','book','attend','dismiss',
      'search_submit','facet_apply','zero_results'
    )
  ) not valid;

alter table public.user_events
  drop constraint if exists user_events_entity_type_known;
alter table public.user_events
  add constraint user_events_entity_type_known check (
    entity_type is null or entity_type in (
      'venue','event','city','country','personality','news','tag',
      'marketplace','queer_village','hotel','flight','activity',
      'organization','search'
    )
  ) not valid;

-- ---------------------------------------------------------------------------
-- 3. Teach the scorer the vocabulary its writers actually use.
--
-- Weights keep the existing scale (click 1, view 0.3, save/favorite 3,
-- book/attend 5) and slot the app's names into it. The legacy arms stay so the
-- 52k historical `view`/`click`/`save` rows keep scoring during the window.
--
-- `favorite_remove` and `dismiss` are deliberately left at 0 rather than made
-- negative: a removal says something about one person's list, not about whether
-- the entity is trending, and a negative weight would let a single user push an
-- entity off the board.
-- ---------------------------------------------------------------------------

create or replace function public.get_trending_entities(
  p_types text[] default array['venue'::text, 'event'::text],
  p_city text default null::text,
  p_limit integer default 20
)
returns table(
  entity_type text, entity_id text, score real, title text, city text,
  country text, slug text, image_url text, optimized_url text,
  thumbnail_url text, start_date timestamp with time zone,
  end_date timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  WITH w_all AS (
    SELECT entity_type, entity_id,
      CASE WHEN entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN entity_id::uuid END AS eid,
      sum(CASE event_type
            -- what the app writes today
            WHEN 'page_view'     THEN 0.3
            WHEN 'deal_view'     THEN 0.3
            WHEN 'hotel_view'    THEN 0.3
            WHEN 'activity_view' THEN 0.3
            WHEN 'favorite_add'  THEN 3
            WHEN 'trip_create'   THEN 3
            WHEN 'booking_click' THEN 5
            -- the search-worker / legacy vocabulary
            WHEN 'click'    THEN 1
            WHEN 'view'     THEN 0.3
            WHEN 'save'     THEN 3
            WHEN 'favorite' THEN 3
            WHEN 'book'     THEN 5
            WHEN 'attend'   THEN 5
            ELSE 0 END
          * exp(-EXTRACT(EPOCH FROM (now() - created_at)) / (3.0 * 86400.0)))::real AS score
    FROM user_events WHERE created_at > now() - interval '7 days' AND entity_type = ANY(p_types) GROUP BY entity_type, entity_id
  ),
  w AS (
    -- p_city filters AFTER the cut, so a city-scoped call needs far more
    -- headroom than a global one to stay full.
    SELECT * FROM w_all ORDER BY score DESC
    LIMIT CASE WHEN p_city IS NULL THEN GREATEST(p_limit * 10, 200)
               ELSE GREATEST(p_limit * 100, 2000) END
  )
  SELECT w.entity_type, w.entity_id, w.score,
    COALESCE(v.name, e.title, c.name, co.name, p.name) AS title,
    COALESCE(v.city, e.city, c.name) AS city,
    COALESCE(v.country, e.country, co.name) AS country,
    COALESCE(v.slug, e.slug, c.slug, co.slug, p.slug) AS slug,
    COALESCE(v.images[1], v.logo_url, e.images[1], e.logo_url, c.curated_image_url, c.image_url, co.curated_image_url, co.image_url, p.image_url) AS image_url,
    img.optimized_url, img.thumbnail_url, e.start_date, e.end_date
  FROM w
  LEFT JOIN venues v        ON w.entity_type = 'venue'       AND v.id  = w.eid
  LEFT JOIN events e        ON w.entity_type = 'event'       AND e.id  = w.eid
  LEFT JOIN cities c        ON w.entity_type = 'city'        AND c.id  = w.eid
  LEFT JOIN countries co    ON w.entity_type = 'country'     AND co.id = w.eid
  LEFT JOIN personalities p ON w.entity_type = 'personality' AND p.id  = w.eid
  LEFT JOIN LATERAL (select ia.optimized_url, ia.thumbnail_url from public.image_asset_links l join public.image_assets ia on ia.id = l.asset_id
    where l.entity_id = w.eid and l.entity_type = case w.entity_type when 'news' then 'news_article' when 'marketplace' then 'marketplace_listing' else w.entity_type end
      and ia.status = 'active' and ia.optimization_status in ('optimized','cdn_optimized') order by (l.role = 'cover') desc, l.sort_order nulls last limit 1) img ON true
  WHERE (p_city IS NULL OR lower(COALESCE(v.city, e.city, c.name)) = lower(p_city))
    -- Only real, existing entities: at least one entity join must have matched.
    AND (v.id IS NOT NULL OR e.id IS NOT NULL OR c.id IS NOT NULL OR co.id IS NOT NULL OR p.id IS NOT NULL)
    AND COALESCE(v.safety_gated, false) = false
    AND COALESCE(e.safety_gated, false) = false
    AND (w.entity_type <> 'event' OR e.end_date IS NULL AND e.start_date >= now() - interval '12 hours' OR e.end_date >= now())
  ORDER BY w.score DESC LIMIT p_limit;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Erasure. Appended to the shared core rather than to its two callers
--    (delete_my_account, admin_delete_user), which is the whole reason that
--    core exists.
--
--    Deletes where the row IS the person's behaviour; nulls the link where the
--    row is a commercial record we keep (the existing news_feedback_events
--    pattern). What cannot be honoured is stated rather than implied: rows
--    keyed only by an anonymous session_id are not attributable to a person on
--    request, and retention is the answer for those.
-- ---------------------------------------------------------------------------

create or replace function public._delete_user_data_core(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_profiles int := 0;
begin
  -- Tier 0 — clear NO-ACTION FK blockers. Without these the profiles delete
  -- errors instead of cascading, which is the specific failure a raw
  -- `DELETE FROM profiles` walks into.
  delete from trip_members           where user_id = p_user_id;
  update events               set created_by = null where created_by = p_user_id;
  update marketplace_listings set created_by = null where created_by = p_user_id;
  update venues               set created_by = null where created_by = p_user_id;
  update review_queue         set resolved_by = null where resolved_by = p_user_id;
  update group_invites        set accepted_by = null where accepted_by = p_user_id;
  -- Tier 1 — personal rows with no FK back to profiles.
  delete from access_logs            where user_id = p_user_id;
  delete from calendar_feed_tokens   where user_id = p_user_id;
  delete from city_favorites         where user_id = p_user_id;
  delete from contact_submissions    where user_id = p_user_id;
  delete from country_favorites      where user_id = p_user_id;
  delete from event_favorites        where user_id = p_user_id;
  delete from import_audit_log       where user_id = p_user_id;
  delete from import_jobs_enhanced   where user_id = p_user_id;
  delete from news_favorites         where user_id = p_user_id;
  delete from notifications          where user_id = p_user_id;
  delete from push_notification_logs where user_id = p_user_id;
  delete from search_queries         where user_id = p_user_id;
  delete from tag_favorites          where user_id = p_user_id;
  delete from user_photos            where user_id = p_user_id;
  delete from user_push_tokens       where user_id = p_user_id;
  delete from user_sessions          where user_id = p_user_id;
  delete from venue_checkins         where user_id = p_user_id;
  delete from venue_favorites        where user_id = p_user_id;
  delete from profiles_audit_log     where profile_user_id = p_user_id;
  -- Tier 1b — behavioural analytics. Every one of these references auth.users
  -- rather than profiles, so deleting the profile never reached them and they
  -- outlived the account. Verified in a rolled-back transaction on prod: the
  -- heaviest user's 45,741 user_events rows go to 0.
  --
  -- signup_funnel_events is here for completeness and currently matches
  -- NOTHING, which is worth stating rather than implying: measured 2026-09-12,
  -- all 4,749 rows have user_id IS NULL because src/hooks/useSignupFunnel.ts
  -- never writes one — the table is keyed on an anonymous session_id. Rows
  -- like that are not attributable to a person on request, so retention
  -- (user_events_retention's sibling, still to come for this table) is the
  -- mechanism, not erasure. The line stays so that the day a writer does set
  -- user_id, erasure already covers it.
  delete from user_events                 where user_id = p_user_id;
  delete from user_activity_events        where user_id = p_user_id;
  delete from signup_funnel_events        where user_id = p_user_id;
  delete from trip_suggestion_impressions where user_id = p_user_id;
  -- Tiers 2/3 — keep the audit/catalog row, drop the link to the person.
  update community_groups    set created_by  = null where created_by  = p_user_id;
  update organizations       set claimed_by  = null where claimed_by  = p_user_id;
  update videos              set created_by  = null where created_by  = p_user_id;
  update ingestion_staging   set reviewed_by = null where reviewed_by = p_user_id;
  update tag_suggestions     set reviewed_by = null where reviewed_by = p_user_id;
  update news_feedback_events set actor_id   = null where actor_id    = p_user_id;
  -- Commercial records: the click happened and the affiliate ledger has to
  -- keep saying so, but it stops naming who.
  update affiliate_clicks    set user_id    = null where user_id    = p_user_id;
  update trip_booking_clicks set user_id    = null where user_id    = p_user_id;
  update profiles_audit_log  set accessing_user_id = null where accessing_user_id = p_user_id;
  update role_audit_logs     set performed_by   = null where performed_by   = p_user_id;
  update role_audit_logs     set target_user_id = null where target_user_id = p_user_id;
  update role_audit_logs     set user_id        = null where user_id        = p_user_id;
  update user_role_audit_log set admin_user_id  = null where admin_user_id  = p_user_id;
  update user_role_audit_log set target_user_id = null where target_user_id = p_user_id;
  update security_events      set user_id        = null where user_id        = p_user_id;
  update security_monitoring  set user_id        = null where user_id        = p_user_id;
  update security_monitoring  set target_user_id = null where target_user_id = p_user_id;
  update suspicious_activities set user_id       = null where user_id        = p_user_id;
  delete from profiles where user_id = p_user_id;
  get diagnostics v_profiles = row_count;
  return jsonb_build_object('user_id', p_user_id, 'deleted_at', now(), 'profile_deleted', v_profiles);
end; $function$;

comment on function public._delete_user_data_core(uuid) is
  'Shared erasure core for delete_my_account and admin_delete_user. Analytics tables (user_events, user_activity_events, signup_funnel_events, trip_suggestion_impressions) are deleted explicitly: they reference auth.users rather than profiles, so no cascade reached them. Rows keyed only by an anonymous session_id are not attributable to a person and are covered by retention, not erasure.';

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad_types text;
  v_scored    numeric;
  v_unscored  numeric;
begin
  -- The CHECKs must cover everything the table already holds. They are NOT
  -- VALID, so Postgres will not tell us — ask directly. A constraint that the
  -- existing corpus violates is a constraint that will reject a live writer.
  select string_agg(distinct event_type, ', ') into v_bad_types
    from public.user_events
   where event_type not in (
      'page_view','search','booking_click','favorite_add','favorite_remove',
      'deal_view','trip_create','hotel_view','activity_view',
      'click','view','save','favorite','book','attend','dismiss',
      'search_submit','facet_apply','zero_results');
  if v_bad_types is not null then
    raise exception 'event_type CHECK would reject existing rows: %', v_bad_types;
  end if;

  select string_agg(distinct entity_type, ', ') into v_bad_types
    from public.user_events
   where entity_type is not null
     and entity_type not in (
      'venue','event','city','country','personality','news','tag',
      'marketplace','queer_village','hotel','flight','activity',
      'organization','search');
  if v_bad_types is not null then
    raise exception 'entity_type CHECK would reject existing rows: %', v_bad_types;
  end if;

  -- The scorer now recognises what the app writes. Measured over the same
  -- 7-day window the function uses; page_view alone is ~85% of rows and used
  -- to be worth exactly zero.
  select
    count(*) filter (where event_type in (
      'page_view','deal_view','hotel_view','activity_view','favorite_add',
      'trip_create','booking_click','click','view','save','favorite','book','attend')),
    count(*) filter (where event_type not in (
      'page_view','deal_view','hotel_view','activity_view','favorite_add',
      'trip_create','booking_click','click','view','save','favorite','book','attend'))
    into v_scored, v_unscored
  from public.user_events
  where created_at > now() - interval '7 days' and entity_id is not null;

  if v_scored = 0 then
    raise exception 'no user_events in the last 7 days score anything — the vocabulary fix did not take';
  end if;
  raise notice 'user_events hardened: % scored / % deliberately unscored in 7d', v_scored, v_unscored;

  -- Erasure names the analytics tables. Checked against the live function
  -- source, because appending to a 50-line body is easy to get wrong.
  if position('delete from user_events' in pg_get_functiondef(
       'public._delete_user_data_core(uuid)'::regprocedure)) = 0 then
    raise exception '_delete_user_data_core does not delete user_events';
  end if;
  if position('delete from signup_funnel_events' in pg_get_functiondef(
       'public._delete_user_data_core(uuid)'::regprocedure)) = 0 then
    raise exception '_delete_user_data_core does not delete signup_funnel_events';
  end if;
end
$verify$;
