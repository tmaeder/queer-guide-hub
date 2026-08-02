-- Flag adult-cohort personalities that acquire an impossible birth date.
--
-- Context: four edge functions resolved Wikidata QIDs with a bare-name
-- `wbsearchentities&limit=1` and took search[0], with no P31=Q5 or occupation
-- check. Because much of this cohort are stage names, that bound performers to
-- famous namesakes and wrote the stranger's dates onto the record — a 2026-08
-- audit found 125 adult rows born before 1900, including a "Thomas Jefferson"
-- carrying 1743-04-13 and a "John Lock" carrying 1632-08-29.
--
-- The existing constraints only enforce death_date > birth_date
-- (20260523120001, 20260619210000) and pipeline-validate treats an implausible
-- year as a non-blocking warning, so nothing ever caught this.
--
-- Deliberately a TRIGGER that sets needs_attention, NOT a CHECK constraint:
-- these rows are written in large batches by the ingest pipeline and by the
-- repair sweep, and a raised exception would roll back the whole batch. A bad
-- enrichment should surface in triage, not abort a 200-row commit.
--
-- 1900 is the floor because commercial adult film does not predate it; the wider
-- corpus legitimately holds figures back to the 12th century, so a global floor
-- would be wrong.

create or replace function public.flag_implausible_adult_birthdate()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.is_adult
     and new.birth_date is not null
     and new.birth_date < date '1900-01-01'
  then
    new.needs_attention := true;
    new.field_provenance := coalesce(new.field_provenance, '{}'::jsonb)
      || jsonb_build_object(
           'birth_date',
           jsonb_build_object(
             'flagged', 'implausible_for_adult_cohort',
             'value', new.birth_date,
             'flagged_at', now(),
             'note', 'Pre-1900 birth date on an adult performer almost always means the '
                     'Wikidata QID resolved to a same-named historical figure.'
           ));
  end if;
  return new;
end;
$$;

comment on function public.flag_implausible_adult_birthdate() is
  'Marks needs_attention when an is_adult personality gets a pre-1900 birth_date — the '
  'signature of a namesake-chimera Wikidata match. Advisory only; never raises.';

drop trigger if exists trg_personalities_adult_birthdate_guard on public.personalities;

create trigger trg_personalities_adult_birthdate_guard
  before insert or update of birth_date, is_adult
  on public.personalities
  for each row
  execute function public.flag_implausible_adult_birthdate();

-- Flag the rows that already carry the fault, so triage shows them immediately
-- rather than only on next write. Bounded: 125 rows at time of writing, and the
-- search_documents sync trigger makes large personality UPDATEs expensive.
update public.personalities
   set needs_attention = true
 where is_adult
   and birth_date is not null
   and birth_date < date '1900-01-01'
   and needs_attention is distinct from true;
