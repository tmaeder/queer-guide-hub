-- Personality public-visibility gate
--
-- Problem: RLS on public.personalities is `USING (true)` — visibility is NOT
-- enforced at the DB layer; the public site filters `visibility='public'` in its
-- app queries. A row flagged `needs_attention`, marked as a duplicate, or archived
-- could still carry `visibility='public'` and therefore show on the public site.
-- 331 needs_attention + 1 duplicate rows were public at migration time.
--
-- Fix (two parts, reversible):
--   1. One-time demote of currently-public flagged rows to `draft`, snapshotted
--      into `person_gate_demoted_20260721` for rollback.
--   2. A BEFORE INSERT/UPDATE trigger that keeps the invariant going forward:
--      a flagged row can never be/stay `public` — it is auto-demoted to `draft`.
--
-- A trigger (not a CHECK constraint) is used deliberately: automated writers may
-- set `needs_attention=true` on a public row, and a hard CHECK would abort those
-- writes. The trigger enforces the same invariant without ever erroring. Deliberate
-- publishing still requires clearing the flag first (else the row silently stays draft).

-- 1a. Reversible snapshot of the exact demote set.
create table if not exists public.person_gate_demoted_20260721 as
select
  id,
  visibility as prev_visibility,
  needs_attention,
  duplicate_of_id,
  review_status,
  now() as demoted_at
from public.personalities
where visibility = 'public'
  and (needs_attention is true or duplicate_of_id is not null or review_status = 'archived');

-- 1b. Demote them.
update public.personalities
set visibility = 'draft'
where visibility = 'public'
  and (needs_attention is true or duplicate_of_id is not null or review_status = 'archived');

-- 2. Enforcement trigger.
create or replace function public.enforce_personality_public_gate()
returns trigger
language plpgsql
as $$
begin
  if new.visibility = 'public'
     and (new.needs_attention is true
          or new.duplicate_of_id is not null
          or new.review_status = 'archived')
  then
    new.visibility := 'draft';
  end if;
  return new;
end;
$$;

comment on function public.enforce_personality_public_gate() is
  'Public-visibility gate: a personality flagged needs_attention / duplicate / archived '
  'can never be public — auto-demoted to draft on insert/update. See migration 20260721184623.';

drop trigger if exists trg_personality_public_gate on public.personalities;
create trigger trg_personality_public_gate
  before insert or update on public.personalities
  for each row
  execute function public.enforce_personality_public_gate();
