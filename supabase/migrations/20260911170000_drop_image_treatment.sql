-- Drop `image_treatment` from venues / events / news_articles.
--
-- The column was added by `20260825100000_entity_image_treatment.sql` to let an
-- editor put a PASTE-UP print treatment on a hero photo. Brand Guidelines §08
-- retired that whole layer — "Photos run full color and unretouched. No
-- duotones, no color washes, no gradient overlays." — so the render branches in
-- `Image.tsx`, `src/lib/imageTreatment.ts` and the `.duotone-riso` /
-- `.halftone-*` CSS are gone, and so is the admin select that offered them.
--
-- Measured on production before writing this, because a column that HOLDS
-- something is a column that stays: `count(*) filter (where image_treatment is
-- not null)` is 0 on all three tables (events 40,227 rows, news_articles
-- 39,852, venues 34,213). Nothing anywhere reads it either — the only other
-- reference in the repo is the generated Supabase types file. So no editorial
-- intent is discarded here; there was never any to discard.
--
-- The CHECK constraints go with their columns automatically, but they are named
-- explicitly first so that a partial application (column already dropped by
-- hand, constraint left behind) still converges.

alter table public.venues        drop constraint if exists venues_image_treatment_known;
alter table public.events        drop constraint if exists events_image_treatment_known;
alter table public.news_articles drop constraint if exists news_articles_image_treatment_known;

alter table public.venues        drop column if exists image_treatment;
alter table public.events        drop column if exists image_treatment;
alter table public.news_articles drop column if exists image_treatment;
