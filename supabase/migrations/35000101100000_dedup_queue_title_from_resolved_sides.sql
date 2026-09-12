-- The queue list row says "? ⇄ ?" for the pairs a human cared most about.
--
-- `triage_src_dedup_review.title` is built from the STORED cluster:
--
--     coalesce(q.cluster->'keep'->>'title','?') || ' ⇄ ' || coalesce(q.cluster->'drop'->>'title','?')
--
-- and the sweep is not the only writer of that column. Pairs queued by hand — the
-- repairs that carry a written explanation in `reason`, like the San Juan/AR relink and
-- the Folsom Europe pocket-guide import — store their own shapes
-- (`{bare_name, base, km_apart, qualifier, ...}`, `{drop_name, into, evidence, ...}`)
-- with no `keep`/`drop` objects at all. Both coalesces fall through and the row renders
-- as `? ⇄ ?`.
--
-- Measured on prod after 29000101100300: 9 rows — event 4, city 3, venue 2. Small, and
-- precisely the wrong 9: the list row is how a reviewer chooses what to open, and these
-- are the pairs someone already investigated far enough to write a paragraph about. An
-- unreadable title is the one that gets scrolled past.
--
-- 29000101100300 already resolves both sides live through `dedup_pair_side`, so the
-- names are available; the title simply was not using them. It now prefers the resolved
-- side and falls back to the stored cluster, then to '?' — so a row whose entity has
-- since been deleted still renders something rather than breaking the list.

CREATE OR REPLACE VIEW public.triage_src_dedup_review AS
WITH resolved AS (
  SELECT q.*,
         public.dedup_pair_side(q.entity_type, q.keep_id) AS keep_side,
         public.dedup_pair_side(q.entity_type, q.drop_id) AS drop_side
    FROM public.dedup_review_queue q
   WHERE q.status = 'open' AND q.entity_type <> 'news'
)
SELECT r.id,
  'dedup-review'::text AS queue_type,
  r.entity_type AS content_type,
  -- Resolved name first, stored cluster second, '?' only if the row is genuinely gone.
  coalesce(r.keep_side ->> 'title', r.cluster -> 'keep' ->> 'title', '?')
    || ' ⇄ ' ||
  coalesce(r.drop_side ->> 'title', r.cluster -> 'drop' ->> 'title', '?') AS title,
  r.reason AS subtitle,
  r.status,
  r.confidence AS confidence_score,
  r.created_at,
  r.source,
  r.keep_id AS entity_id,
  case r.entity_type
    when 'venue' then 'venues' when 'event' then 'events' when 'city' then 'cities'
    when 'personality' then 'personalities' when 'news' then 'news_articles'
    when 'marketplace' then 'marketplace_listings' when 'country' then 'countries'
    when 'hotel' then 'hotels' when 'organization' then 'organizations'
    when 'milestone' then 'milestones' when 'queer_village' then 'queer_villages'
    when 'group' then 'community_groups' else r.entity_type
  end AS entity_table,
  false AS has_diff,
  NULL::uuid AS reporter_id,
  r.cluster
    || jsonb_build_object(
         'keep', coalesce(r.keep_side, r.cluster -> 'keep'),
         'drop', coalesce(r.drop_side, r.cluster -> 'drop'),
         'keep_id', r.keep_id, 'drop_id', r.drop_id, 'reason', r.reason) AS meta,
  NULL::text AS flag_type,
  CASE WHEN r.entity_type = 'personality' THEN '{"namesake": true}'::jsonb ELSE '{}'::jsonb END AS risk_flags
FROM resolved r;

do $verify$
declare n_total int; n_broken int; n_hand int;
begin
  select count(*), count(*) filter (where title = '? ⇄ ?')
    into n_total, n_broken from public.triage_src_dedup_review;

  -- Positive control: an empty view satisfies "no broken titles" trivially.
  if n_total = 0 then
    raise exception 'triage_src_dedup_review is empty -- the title check proved nothing';
  end if;
  if n_broken > 0 then
    raise exception '% of % queue rows still render "? ⇄ ?"', n_broken, n_total;
  end if;

  -- And specifically the hand-queued rows, whose cluster has no keep/drop objects at
  -- all. If this is zero the fix is untested by the corpus: the sweep-written rows
  -- would have rendered fine either way.
  select count(*) into n_hand
    from public.dedup_review_queue q
   where q.status = 'open' and q.entity_type <> 'news'
     and not (q.cluster ? 'keep');
  if n_hand = 0 then
    raise notice 'no hand-queued rows present; the fallback path is unexercised here';
  else
    raise notice 'titles resolve for all % rows, including % with no stored keep/drop', n_total, n_hand;
  end if;
end $verify$;
