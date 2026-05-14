-- personalities.is_adult — first-class boolean filter for adult-content
-- visibility, replacing the four substring not.ilike clauses the SPA was
-- composing client-side (which broke the moment a row had a typo or used a
-- different word for the same role).
--
-- - Default false so legacy rows stay visible.
-- - Backfill marks rows whose `profession` matches any of the same patterns
--   the client previously hardcoded (see ADULT_PATTERNS in
--   src/hooks/usePersonalities.tsx).
-- - The scrape pipeline writes is_adult directly going forward (handled in a
--   follow-up; until then the GIN-backed ilike backfill is conservative).

alter table public.personalities
  add column if not exists is_adult boolean not null default false;

-- Idempotent backfill — safe to re-run.
update public.personalities
set is_adult = true
where is_adult = false
  and profession is not null
  and (
    profession ilike '%adult performer%'
    or profession ilike '%adult model%'
    or profession ilike '%adult film%'
    or profession ilike '%porn%'
  );

-- Most queries filter on is_adult=false and additional predicates; a partial
-- index keeps the hot path tight without bloating writes for adult rows.
create index if not exists personalities_visible_idx
  on public.personalities (visibility)
  where visibility = 'public' and is_adult = false;

comment on column public.personalities.is_adult is
  'True when the personality is primarily known for adult/sexual work. '
  'Default-hidden in public surfaces; opt-in via ?include_adult=1 on /personalities.';
