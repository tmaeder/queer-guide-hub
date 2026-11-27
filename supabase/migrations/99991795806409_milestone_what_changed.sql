-- Milestones: separate "what changed" from the legislative chronology in
-- `description`. Nullable, no default, no backfill: an empty field renders
-- nothing on /history/:slug.
--
-- Exposure: anon reads milestones only through get_milestone(), which returns
-- to_jsonb(m) — every column, including this one — so no grant or RPC change
-- is needed. There are no column-level grants on public.milestones.
alter table public.milestones add column if not exists what_changed text;

comment on column public.milestones.what_changed is
  'One or two sentences on what this milestone changed for people. NULL = unknown; never generated.';
