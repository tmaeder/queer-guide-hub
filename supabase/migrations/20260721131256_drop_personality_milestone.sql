-- Drop the legacy free-text personalities.milestone column (0 rows populated).
-- Milestones are a first-class content type now (public.milestones +
-- milestone_links); ships in the same release as the frontend/CMS removal so
-- no deployed code references the dropped column.
drop index if exists public.idx_personalities_milestone;
alter table public.personalities drop column if exists milestone;
