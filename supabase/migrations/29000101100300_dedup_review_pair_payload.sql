-- Make a queued duplicate pair decidable: resolve BOTH sides live, per entity type.
--
-- 1,455 pairs are open in `dedup_review_queue` (venue 1,159, event 128, city 108,
-- personality 46, milestone 12, organization 2) and the venue queue has been pinned at
-- its 200/night cap on 5 of the last 6 nights. Human decisions since 2026-08-17: zero.
-- The reason is not that reviewers are lazy -- it is that the pair as presented cannot
-- be decided.
--
-- What `cluster` actually holds today, measured:
--
--     venue (1,157)  id,title,slug,city,address,website,phone,category,quality_score,source
--     event   (124)  id,title,slug,city,start_date,venue_name,source
--     city    (105)  id,title                        <- and nothing else
--     personality (46) id,title                      <- and nothing else
--
-- Only venue and event ever had a cluster-side builder (`_dedup_venue_cluster_side`,
-- `_dedup_event_cluster_side`). The rest got a bare `{id,title}` inline shape. So
-- `Ulm ⇄ Neu-Ulm` is presented as two names and a distance -- they are two real towns
-- 1.8 km apart -- and `Søren Dahl ⇄ Soren Dahl` as two names, which is the NAMESAKE
-- class where a wrong merge is an outing risk and where `personality` is pinned
-- queue-only precisely because a human is supposed to look.
--
-- THE PAYLOAD IS RESOLVED IN THE VIEW, NOT WRITTEN INTO THE ROW. Enriching
-- `run_dedup_truth_sweep`'s insert would only help pairs queued from tomorrow; the 1,455
-- already sitting there would keep their `{id,title}` forever, and they are the backlog.
-- Resolving live also means an edit to either record shows up on the next page load
-- instead of the reviewer judging a stale snapshot taken when the sweep ran.
--
-- `dedup_pair_side(entity_type, id)` is SECURITY INVOKER. Its two predecessors are the
-- reason that matters: `_dedup_event_cluster_side` shipped SECURITY DEFINER and
-- anon-callable and leaked safety-gated events in the UAE and Malaysia (20290601120731).
-- The queue is admin/moderator-gated at the RLS layer on `dedup_review_queue`; this
-- helper must not be the thing that widens it.
--
-- Fields are chosen to be the ones that DECIDE the pair, not a dump:
--   * city        country, region, population, and the venue/event counts -- "is this a
--                 real second town or an empty shell of the first" is the whole question
--   * personality wikidata_qid, birth_date, death_date, profession, nationality -- the
--                 namesake class is undecidable without them, and the QID is the only
--                 hard identity signal the corpus has for people
--   * milestone   year and title, since the arm keys on exactly that
--   * organization website domain and city, matching its `despace_domain` arm
--
-- `entity_table` stops lying as well. It emitted the SINGULAR `entity_type` ('venue')
-- while `useTriageDetail.ts` allowlists PLURAL table names ('venues'), so
-- `validTables.includes('venue')` was false for every dedup row and the entity preview
-- never rendered once. Fixing the view rather than the allowlist keeps the column
-- meaning what its name says for every other queue that reads it.

CREATE OR REPLACE FUNCTION public.dedup_pair_side(p_type text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v jsonb;
begin
  if p_id is null then return null; end if;

  if p_type = 'venue' then
    select jsonb_build_object('id', v.id, 'title', v.name, 'slug', v.slug, 'city', v.city,
             'address', nullif(btrim(coalesce(v.address,'')), ''), 'website', v.website,
             'phone', v.phone, 'category', v.category, 'quality_score', v.quality_score,
             'has_coords', (v.latitude is not null and v.longitude is not null),
             'created_at', v.created_at)
      into v from public.venues v where v.id = p_id;

  elsif p_type = 'event' then
    select jsonb_build_object('id', e.id, 'title', e.title, 'slug', e.slug, 'city', e.city,
             'start_date', e.start_date, 'end_date', e.end_date, 'venue_name', e.venue_name,
             'created_at', e.created_at)
      into v from public.events e where e.id = p_id;

  elsif p_type = 'city' then
    -- "two towns or one town twice" is answered by country + region + how much content
    -- each side actually carries, none of which the old {id,title} payload showed.
    select jsonb_build_object('id', c.id, 'title', c.name, 'slug', c.slug,
             'country', co.name, 'region', c.region_name, 'population', c.population,
             'wikidata_qid', c.wikidata_qid, 'shell_status', c.shell_status,
             'venues', (select count(*) from public.venues x where x.city_id = c.id and x.duplicate_of_id is null),
             'events', (select count(*) from public.events x where x.city_id = c.id and x.duplicate_of_id is null))
      into v from public.cities c left join public.countries co on co.id = c.country_id
     where c.id = p_id;

  elsif p_type = 'personality' then
    -- The namesake class. Without the QID and the dates this is two strings.
    select jsonb_build_object('id', p.id, 'title', p.name, 'slug', p.slug,
             'wikidata_qid', p.wikidata_qid, 'birth_date', p.birth_date, 'death_date', p.death_date,
             'profession', p.profession, 'nationality', p.nationality,
             'visibility', p.visibility)
      into v from public.personalities p where p.id = p_id;

  elsif p_type = 'milestone' then
    -- `milestones` has `date`/`date_end`, not `year`/`event_date`; the title_year arm
    -- keys on the year extracted from `date`, so that is what the reviewer needs.
    select jsonb_build_object('id', m.id, 'title', m.title, 'slug', m.slug,
             'date', m.date, 'date_end', m.date_end, 'category', m.category)
      into v from public.milestones m where m.id = p_id;

  elsif p_type = 'organization' then
    -- organizations carries city_id, not a city text column.
    select jsonb_build_object('id', o.id, 'title', o.name, 'slug', o.slug,
             'website_domain', o.website_domain, 'city', ci.name, 'roles', to_jsonb(o.roles))
      into v from public.organizations o left join public.cities ci on ci.id = o.city_id
     where o.id = p_id;

  elsif p_type = 'hotel' then
    select jsonb_build_object('id', h.id, 'title', h.name, 'slug', h.slug, 'city', h.city,
             'address', h.address, 'website', h.website)
      into v from public.hotels h where h.id = p_id;

  elsif p_type = 'marketplace' then
    select jsonb_build_object('id', l.id, 'title', l.title, 'slug', l.slug,
             'brand', l.brand, 'merchant_domain', l.merchant_domain, 'price', l.price,
             'currency', l.currency, 'external_url', l.external_url)
      into v from public.marketplace_listings l where l.id = p_id;

  elsif p_type = 'queer_village' then
    select jsonb_build_object('id', g.id, 'title', g.name, 'slug', g.slug, 'city', ci.name)
      into v from public.queer_villages g left join public.cities ci on ci.id = g.city_id
     where g.id = p_id;

  elsif p_type = 'country' then
    select jsonb_build_object('id', c.id, 'title', c.name, 'slug', c.slug, 'code', c.code)
      into v from public.countries c where c.id = p_id;

  elsif p_type = 'group' then
    select jsonb_build_object('id', g.id, 'title', g.name, 'slug', g.slug, 'city', g.city)
      into v from public.community_groups g where g.id = p_id;
  end if;

  -- A row the caller may not read, or one deleted since the sweep, returns null rather
  -- than an empty object -- the UI must be able to tell "gone" from "blank".
  return v;
end; $function$;

REVOKE ALL ON FUNCTION public.dedup_pair_side(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dedup_pair_side(text, uuid) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.triage_src_dedup_review AS
SELECT q.id,
  'dedup-review'::text AS queue_type,
  q.entity_type AS content_type,
  coalesce(q.cluster -> 'keep' ->> 'title', '?') || ' ⇄ ' || coalesce(q.cluster -> 'drop' ->> 'title', '?') AS title,
  q.reason AS subtitle,
  q.status,
  q.confidence AS confidence_score,
  q.created_at,
  q.source,
  q.keep_id AS entity_id,
  -- PLURAL, so `useTriageDetail`'s table allowlist matches. Emitting the singular
  -- entity_type here meant the entity preview never rendered for a single dedup row.
  case q.entity_type
    when 'venue' then 'venues' when 'event' then 'events' when 'city' then 'cities'
    when 'personality' then 'personalities' when 'news' then 'news_articles'
    when 'marketplace' then 'marketplace_listings' when 'country' then 'countries'
    when 'hotel' then 'hotels' when 'organization' then 'organizations'
    when 'milestone' then 'milestones' when 'queer_village' then 'queer_villages'
    when 'group' then 'community_groups' else q.entity_type
  end AS entity_table,
  false AS has_diff,
  NULL::uuid AS reporter_id,
  -- Resolved live, with the sweep's own cluster kept underneath so the match_type,
  -- distance and auto_eligible it recorded at decision time are not lost.
  q.cluster
    || jsonb_build_object(
         'keep', coalesce(public.dedup_pair_side(q.entity_type, q.keep_id), q.cluster -> 'keep'),
         'drop', coalesce(public.dedup_pair_side(q.entity_type, q.drop_id), q.cluster -> 'drop'),
         'keep_id', q.keep_id, 'drop_id', q.drop_id, 'reason', q.reason) AS meta,
  NULL::text AS flag_type,
  CASE WHEN q.entity_type = 'personality' THEN '{"namesake": true}'::jsonb ELSE '{}'::jsonb END AS risk_flags
FROM public.dedup_review_queue q
WHERE q.status = 'open' AND q.entity_type <> 'news';

do $verify$
declare v_keep jsonb; v_city jsonb; v_pers jsonb; v_tbl text; n int;
begin
  -- The point of the change: the two thin types must now carry deciding fields.
  select public.dedup_pair_side('city', q.keep_id) into v_city
    from public.dedup_review_queue q where q.entity_type = 'city' and q.status='open' limit 1;
  if v_city is not null and not (v_city ? 'country' and v_city ? 'venues' and v_city ? 'population') then
    raise exception 'city pair side is still thin: %', v_city;
  end if;

  select public.dedup_pair_side('personality', q.keep_id) into v_pers
    from public.dedup_review_queue q where q.entity_type = 'personality' and q.status='open' limit 1;
  if v_pers is not null and not (v_pers ? 'wikidata_qid' and v_pers ? 'birth_date') then
    raise exception 'personality pair side is still thin: %', v_pers;
  end if;

  -- entity_table must be plural or the preview silently never renders. Assert against
  -- the allowlist in src/hooks/useTriageDetail.ts.
  select entity_table into v_tbl from public.triage_src_dedup_review where content_type = 'venue' limit 1;
  if v_tbl is distinct from 'venues' then
    raise exception 'entity_table for venue is %, expected venues', coalesce(v_tbl,'<none>');
  end if;

  -- Positive control: a view that returns no rows would satisfy every check above.
  select count(*) into n from public.triage_src_dedup_review;
  if n = 0 then raise exception 'triage_src_dedup_review is empty -- the checks proved nothing'; end if;

  -- And both sides must actually resolve, not just be present as keys.
  select meta -> 'keep' into v_keep from public.triage_src_dedup_review
   where content_type = 'venue' limit 1;
  if v_keep is null or not (v_keep ? 'address') then
    raise exception 'venue keep side did not resolve: %', v_keep;
  end if;

  raise notice 'dedup review pairs resolve both sides; % open rows', n;
end $verify$;

-- The queue's deep link still pointed at a view deleted in 20260801050000.
-- `/admin/duplicates?view=suggested` was the old suggested-pairs console; that page
-- now treats `?view=suggested` as legacy and falls through to its default type, so a
-- reviewer following the link landed on an unrelated exact-match list with no pair
-- selected. dedup-review is decided in the inbox — it has a working `triage_action`
-- branch and keeps its action bar — so the right value is no external console at all.
UPDATE public.triage_sources
   SET capabilities = capabilities - 'external_console'
 WHERE queue_key = 'dedup-review';

do $verify$
declare v jsonb;
begin
  select capabilities into v from public.triage_sources where queue_key = 'dedup-review';
  if v is null then raise exception 'triage_sources row dedup-review is missing'; end if;
  if v ? 'external_console' then
    raise exception 'dedup-review still carries an external_console: %', v;
  end if;
  raise notice 'dedup-review is decided in the inbox; stale console link removed';
end $verify$;
