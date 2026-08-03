-- Extend the adult-cohort plausibility guard to death dates.
--
-- 20260807170000 flags an is_adult row whose birth_date is before 1900. That
-- misses every chimera whose birth date happens to land after 1900 but whose
-- DEATH date is impossible — and those are just as wrong. After the 2026-08
-- namesake repair had cleared all 125 pre-1900 births, these were still live
-- and PUBLIC:
--
--   Christoph Scharff   died 1640
--   Jessie Cooper       died 1917
--   Henry Evans         died 1945
--   Leo Wyatt           born 1924, died 1942
--
-- Commercial gay adult film begins around 1970, so a death before then is the
-- same prima facie evidence of a wrong Wikidata match that a pre-1900 birth is.
--
-- Advisory only, like its sibling: sets needs_attention rather than raising, so
-- a bad enrichment surfaces in triage instead of aborting a batch commit. The
-- existing enforce_personality_public_gate trigger then demotes the row out of
-- public view on the same write.

create or replace function public.flag_implausible_adult_dates()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reason text;
begin
  if not new.is_adult then
    return new;
  end if;

  if new.birth_date is not null and new.birth_date < date '1900-01-01' then
    v_reason := 'implausible_birth_for_adult_cohort';
  elsif new.death_date is not null and new.death_date < date '1970-01-01' then
    v_reason := 'implausible_death_for_adult_cohort';
  end if;

  if v_reason is not null then
    new.needs_attention := true;
    new.field_provenance := coalesce(new.field_provenance, '{}'::jsonb)
      || jsonb_build_object(
           'adult_date_guard',
           jsonb_build_object(
             'flagged', v_reason,
             'birth_date', new.birth_date,
             'death_date', new.death_date,
             'flagged_at', now(),
             'note', 'An adult performer born before 1900 or dead before 1970 almost '
                     'always means the Wikidata QID resolved to a same-named '
                     'historical figure.'
           ));
  end if;

  return new;
end;
$$;

comment on function public.flag_implausible_adult_dates() is
  'Marks needs_attention when an is_adult personality gets a pre-1900 birth_date or a '
  'pre-1970 death_date — the signature of a namesake-chimera Wikidata match. Advisory; never raises.';

-- Replaces the birth-only guard from 20260807170000.
drop trigger if exists trg_personalities_adult_birthdate_guard on public.personalities;
drop trigger if exists trg_personalities_adult_dates_guard on public.personalities;

create trigger trg_personalities_adult_dates_guard
  before insert or update of birth_date, death_date, is_adult
  on public.personalities
  for each row
  execute function public.flag_implausible_adult_dates();

drop function if exists public.flag_implausible_adult_birthdate();

-- Flag anything already carrying the fault. Bounded (single digits at time of
-- writing) — personality UPDATEs fire the search_documents sync trigger.
update public.personalities
   set needs_attention = true
 where is_adult
   and (birth_date < date '1900-01-01' or death_date < date '1970-01-01')
   and needs_attention is distinct from true;
