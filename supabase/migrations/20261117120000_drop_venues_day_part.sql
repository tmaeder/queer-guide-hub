-- venues.day_part is a category stamp that its own input outgrew. Drop it.
--
-- WHAT IT ACTUALLY CONTAINED (measured on prod, 2026-09-01):
--   37,927 venues, 0 null, 3,779 empty, 34,148 with a value -- and only FIVE distinct
--   values among all 34,148. 'morning,afternoon' alone accounts for 27,817 of them.
--   That is not per-venue knowledge, it is a stamp, and 20260526000000 is where it was
--   applied: six category-keyed UPDATEs followed by a catch-all
--     UPDATE venues SET day_part = '{morning,afternoon}' WHERE day_part IS NULL OR day_part = '{}';
--   which swept every remaining row into the majority value. Its own comment promised
--   "pipeline-enrich-venue will refine" -- that refinement never ran, which is why five
--   values is the whole vocabulary a year later.
--
-- WHY IT IS NOW WRONG: 26,455 of the 34,148 rows (77.5%) disagree with what
--   venue_category_day_part(category) says today. The disagreements are not noise, they
--   are impossible: 3,420 bars, 660 clubs and 1,291 saunas are stamped 'morning,afternoon'.
--   The cause is measured, not assumed -- 84.5% of those bars and 77.9% of those clubs
--   carry an enrichment_status 'category_backfill' marker (saunas 48.8%, weaker). The stamp
--   was derived from a category that run_venue_category_reclassify later moved underneath it.
--   This is the house failure mode stated plainly in CLAUDE.md: a derived field written once
--   and never revalidated against the input it was derived from will silently outlive it.
--
-- WHY DROP RATHER THAN REPAIR. The plan filed this as "repair it: batched runner +
--   admin_automations row, recomputing from category". That filing was wrong and this
--   migration supersedes it. Repairing means storing venue_category_day_part(category) in a
--   column, i.e. a cached copy of a function that already answers on demand -- correct on the
--   night the cron runs and drifting again at the next reclassification, forever, for no
--   reader. The function is the single source of truth; a column can only ever disagree with it.
--
-- NOTHING READS IT. Verified rather than assumed, on prod and across the repo:
--   - pg_proc: exactly one function mentions day_part, itinerary_candidate_pool, and it
--     DERIVES the value via venue_category_day_part(). It never selects the column.
--   - no view or matview definition references it; no index; no constraint.
--   - repo-wide, the only mentions are useItineraryPool.ts (reading the RPC's derived output)
--     and a comment in generateItinerary.ts saying the column is not read.
--   - 20260810075202 already dropped idx_venues_day_part_gin as "a column nothing filters by".
--     This finishes that judgment instead of leaving the column behind as a trap for the
--     next reader, who has no way to see that its values are a year-stale stamp.
--
-- SAFETY: get_venues_by_tag and organization_venues expose day_part in their return types,
--   but both are RETURNS SETOF venues over `select *` bodies -- the composite type follows
--   the table, so neither needs editing.
--
-- vibe_tags is deliberately KEPT. It is empty (0 of 25,178), not wrong, and the vibes it was
--   created for are live product intent. An empty column is honest; a stamped one lies.

create table if not exists public.venue_day_part_drop_audit (
  venue_id    uuid primary key,
  category    text,
  day_part    text[],
  archived_at timestamptz not null default now()
);

comment on table public.venue_day_part_drop_audit is
  'Pre-drop snapshot of venues.day_part (migration 20261117120000). The column carried a '
  'category stamp from 20260526000000 that reclassification had made 77.5% wrong. This table '
  'is the only way back.';

alter table public.venue_day_part_drop_audit enable row level security;

insert into public.venue_day_part_drop_audit (venue_id, category, day_part)
select v.id, v.category, v.day_part
from public.venues v
where v.day_part is not null and v.day_part <> '{}'
on conflict (venue_id) do nothing;

alter table public.venues drop column if exists day_part;
