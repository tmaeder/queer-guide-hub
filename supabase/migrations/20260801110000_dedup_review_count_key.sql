-- Dedup Truth Engine — restore the Quality-hub Duplicates count (2026-08-01)
--
-- The P4 registry fold (20260801050000) rewrote get_admin_counts to emit
-- `count_prefix || count_key` per triage_sources row, and re-keyed the quality
-- gates to the convention `count_prefix='' , count_key='quality_<x>'` so the
-- hub cards keep reading bare `quality_city` / `quality_venue` / ….
--
-- The dedup-review row predates that column, so it kept the classic-queue
-- default `count_prefix='review_'` and emitted `review_dedup_review`. Nothing
-- reads that key — QualityHub's Duplicates card reads `quality_duplicates`,
-- which no longer exists — so the card has been showing 0 while the queue held
-- ~1k open suggestions.
--
-- Align the row with the quality-gate convention. Data-only; the sla_hours map
-- key becomes 'quality_duplicates', which collides with nothing.

UPDATE public.triage_sources
   SET count_prefix = '',
       count_key    = 'quality_duplicates'
 WHERE queue_key = 'dedup-review';
