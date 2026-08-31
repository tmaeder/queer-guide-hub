-- Re-score the event pairs the new cross-source arm cannot reach.
--
-- 20260825110528 added `cross_source_venue_substring_2h` (confidence 0.90) so a
-- human could select the real cross-source duplicates as one batch in the inbox.
-- On the first live run it labelled exactly 1 row, not 15.
--
-- The reason is `on conflict do nothing` in the sweep's queue branch: a pair
-- already sitting open keeps the confidence and reason it was first written
-- with. A NEW ARM THEREFORE ONLY EVER AFFECTS NEW PAIRS -- the backlog the arm
-- exists to sort keeps whatever label it got the first time it was seen. 14 of
-- the 15 had been queued at 0.80 / title_day_no_venue since 2026-08-09.
--
-- Re-scoring is deliberately a one-shot rather than an upsert in the sweep: the
-- sweep must never overwrite a confidence a human has since acted on, and the
-- `on conflict do nothing` is what guarantees that. This statement is narrow
-- for the same reason -- it only touches rows still carrying the arm's own
-- default label, never a hand-written reason (the four Folsom Europe rows carry
-- a prose reason and must keep it).
WITH src AS (
  SELECT DISTINCT ON (event_id) event_id, source_slug
  FROM public.event_sources
  ORDER BY event_id, is_primary DESC NULLS LAST, first_seen_at
), rescored AS (
  SELECT q.id
  FROM public.dedup_review_queue q
  JOIN public.events a ON a.id = q.keep_id
  JOIN public.events b ON b.id = q.drop_id
  LEFT JOIN src sa ON sa.event_id = a.id
  LEFT JOIN src sb ON sb.event_id = b.id
  WHERE q.entity_type = 'event'
    AND q.status = 'open'
    AND q.reason = 'title_day_no_venue'
    AND public.dedup_despace(a.venue_name) IS NOT NULL
    AND public.dedup_despace(b.venue_name) IS NOT NULL
    AND length(public.dedup_despace(a.venue_name)) >= 4
    AND length(public.dedup_despace(b.venue_name)) >= 4
    AND (position(public.dedup_despace(a.venue_name) in public.dedup_despace(b.venue_name)) > 0
      OR position(public.dedup_despace(b.venue_name) in public.dedup_despace(a.venue_name)) > 0)
    AND sa.source_slug IS DISTINCT FROM sb.source_slug
    AND abs(extract(epoch from (a.start_date - b.start_date))) <= 2*3600
)
UPDATE public.dedup_review_queue q
   SET confidence = 0.90,
       reason = 'cross_source_venue_substring_2h',
       cluster = jsonb_set(coalesce(q.cluster, '{}'::jsonb), '{match_type}', '"cross_source_venue_substring_2h"')
  FROM rescored r
 WHERE q.id = r.id;