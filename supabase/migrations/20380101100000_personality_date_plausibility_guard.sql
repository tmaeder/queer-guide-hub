-- Personality birth dates: retire the "living person born before photography"
-- contradiction, and flag the Wikidata coarse-precision artifacts that cause it.
--
-- TWO DEFECTS, ONE COLUMN. Both were rendering on public pages as fact.
--
-- (1) IMPORT SENTINELS THAT ARE NOT SENTINELS. 13 personalities carried
--     birth_date = 1901-01-01, 10 carried 1970-01-01, 2 carried 1900-01-01 —
--     all living contemporary artists and activists (Zebra Katz, Cakes da Killa,
--     Tiq Milan, Jada Alberts, Bonnie Hart, Grace Hyland, Claudia Castrosín
--     Verdú …), and /personalities/zebra-katz published "Born 1 January 1901".
--
--     These are not epoch defaults and not a placeholder convention. They are
--     Wikidata COARSE-PRECISION SNAKS read by a precision-blind parser. A
--     Wikidata time value is always zero-padded to a full date and carries a
--     separate `precision` field: 11=day, 10=month, 9=year, 8=decade, 7=century.
--     Measured live on 2026-08-23:
--
--       Zebra Katz  Q16205945  P569 = "+1901-00-00T00:00:00Z"  precision 7
--
--     Precision 7 is "20th century". The month and day are literal "00"s
--     meaning "not stated". supabase/functions/pipeline-enrich-personality
--     read the claim with readClaim() (rank-aware, precision-BLIND) and passed
--     it through a local formatDate() that rewrote each "00" to "01" — turning
--     "born sometime in the 20th century" into "born 1 January 1901". The same
--     mechanism explains the other two values exactly: decade precision (8)
--     serialises the 1970s as "+1970-00-00T00:00:00Z" and the 1900s as
--     "+1900-00-00T00:00:00Z".
--
--     PR #2508 (2026-08-02) introduced readTimeClaim(), which refuses anything
--     coarser than year precision, and converted four of the five P569 readers.
--     It missed pipeline-enrich-personality, which had last been touched
--     2026-06-10. That function is fixed in this change; without it any repair
--     is undone on the next enrichment pass.
--
-- (2) PRE-MODERN FIGURES FLAGGED AS LIVING. Eleno de Céspedes (b. 1545),
--     Thomas(ine) Hall (b. 1603), Fernanda Fernández (b. 1755) and Thomas
--     Roberts (b. 1779) all had is_living = true with death_date IS NULL.
--     Every writer in the codebase derives is_living the same way — "no death
--     date recorded" (pipeline-normalize, bulk-create-personalities,
--     fetch-personality-data, import-personalities-csv) — and none of them has
--     a plausibility floor. For a corpus of historical queer figures, an
--     unknown death date is the NORM, not evidence of life.
--
-- WHY THE DB CANNOT SIMPLY DELETE THE SENTINELS. 1901-01-01 is also a real
-- birthday. Nothing in the row distinguishes the artifact from a person
-- genuinely born on 1 January 1901 — only re-reading the source snak does.
-- So the retraction is NOT here: it lives in
-- scripts/data-quality/repair-personality-sentinel-dates.mjs, which re-resolves
-- each row's wikidata_qid and either restores a real date (Cakes da Killa's
-- P569 is precision 11, "+1990-10-12T00:00:00Z" — recoverable) or nulls the
-- column. This migration ships only what is deterministic and network-free:
-- the is_living correction, and an advisory flag so the remainder surfaces in
-- triage instead of sitting invisible.

-- RE-MEASURED 2026-09-10, before landing. The counts above are from
-- 2026-08-23. Against prod today the one-shot flips **16** rows to
-- is_living = false, the flag pass marks **31**, and **15** coarse-precision
-- boundary dates are deliberately spared by the carve-out and left to the
-- repair script. The trigger-order premise was re-checked live: both
-- trg_personalities_aa_profession_gate and trg_personalities_adult_dates_guard
-- still exist, so this sorts between them as intended.
--
-- Renumbered TWICE. First from 20260919100000, a version already taken on prod by
-- tag_category_consolidation; then from 20370901100100, because the applied
-- ceiling moved from 20370801100000 to 20371001100000 within the hour while a
-- concurrent session was landing migrations. A month of headroom was not
-- enough — this now sits a year clear. The ceiling is a treadmill, not an
-- event: re-read it from remote history immediately before pushing, never
-- from the local maximum — `db push` matches by VERSION, so this file
-- could never have applied and would have been skipped in silence.
--
-- fetch-personality-data was part of the original draft and is NOT in this
-- change: it has since been converted to readTimeClaim on main. The one
-- remaining precision-blind reader is pipeline-enrich-personality, fixed here.
--
-- ---------------------------------------------------------------------------
-- Advisory guard. Never mutates a fact, never raises — same contract as its
-- sibling flag_implausible_adult_dates() (20260809130000), so a bad enrichment
-- lands in triage rather than aborting a batch commit.
-- ---------------------------------------------------------------------------

create or replace function public.flag_implausible_personality_dates()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_year int;
begin
  -- Cheap early-out FIRST: the check only has anything to say about a living
  -- person with a birth date. Everything else — visibility flips, city links,
  -- the hourly enrichment loop stamping updated_at — returns immediately.
  if new.birth_date is null or new.is_living is not true then
    return new;
  end if;

  -- 122 years is the oldest verified human lifespan (Jeanne Calment, 1875-1997).
  -- Past it, `is_living = true` and this birth_date cannot both be true.
  if new.birth_date >= current_date - interval '122 years' then
    return new;
  end if;

  v_year := extract(year from new.birth_date)::int;

  new.needs_attention := true;
  new.field_provenance := coalesce(new.field_provenance, '{}'::jsonb)
    || jsonb_build_object(
         'date_plausibility',
         jsonb_build_object(
           'flagged', 'living_person_older_than_122',
           'birth_date', new.birth_date,
           'coarse_precision_shape',
           -- A 1 January date on a decade or century boundary is exactly what a
           -- Wikidata precision-8/7 snak degrades into. Recorded so triage knows
           -- whether to doubt the DATE (this true) or the LIVING FLAG (this false).
           extract(month from new.birth_date) = 1
             and extract(day from new.birth_date) = 1
             and (v_year % 10 = 0 or v_year % 100 = 1),
           'flagged_at', now(),
           'note', 'A living personality born more than 122 years ago is a '
                   'contradiction. Either birth_date is a Wikidata coarse-precision '
                   'artifact (see pipeline-enrich-personality / readTimeClaim) or '
                   'is_living was defaulted true because no death date is known.'
         ));

  return new;
end;
$$;

comment on function public.flag_implausible_personality_dates() is
  'Marks needs_attention when is_living is true and birth_date is more than 122 years old — '
  'the signature of either a Wikidata coarse-precision birth date or an is_living defaulted '
  'true for lack of a death date. Advisory; never raises, never rewrites a date.';

-- NOT column-scoped, deliberately: a trigger declared `UPDATE OF birth_date`
-- fires on the columns named in the UPDATE STATEMENT, not on what actually
-- changed (the defect documented in 20260807100200 for trg_venues_safety_gated),
-- so a writer that flips is_living without naming birth_date would escape it.
--
-- TRIGGER NAME IS LOAD-BEARING. BEFORE triggers fire in NAME order and must
-- stay ordered against the two existing gates:
--   trg_personalities_aa_profession_gate      (asserts is_adult on INSERT)
--   trg_personalities_ab_date_plausibility    (this one)
--   trg_personalities_adult_dates_guard       (chimera check, reads is_adult)
drop trigger if exists trg_personalities_ab_date_plausibility on public.personalities;
create trigger trg_personalities_ab_date_plausibility
  before insert or update on public.personalities
  for each row
  execute function public.flag_implausible_personality_dates();

-- ---------------------------------------------------------------------------
-- One-shot: correct is_living for people who are certainly not living.
--
-- A death date is NOT invented — it stays NULL. "Born more than 122 years ago"
-- is sufficient on its own to know someone is dead; a missing death_date for a
-- 16th-century figure is a gap in the record, not a claim about their pulse.
--
-- THE BOUNDARY CARVE-OUT IS LOAD-BEARING. It excludes any 1 January date whose
-- year is a decade or century boundary, because those are indistinguishable
-- from the coarse-precision artifacts of defect (1) — and flipping one of those
-- would publish a LIVING contemporary activist as dead. That is the strictly
-- worse error of the two, and on this platform it is not a rounding mistake.
-- Those rows are left to the Wikidata re-resolve in the repair script; the
-- trigger above has already flagged them.
--
-- Bounded to single digits at time of writing. personality UPDATEs enqueue a
-- search_documents reindex per row.
-- ---------------------------------------------------------------------------

update public.personalities
   set is_living = false
 where is_living is true
   and death_date is null
   and birth_date is not null
   and birth_date < current_date - interval '122 years'
   and not (
         extract(month from birth_date) = 1
     and extract(day   from birth_date) = 1
     and (extract(year from birth_date)::int % 10 = 0
       or extract(year from birth_date)::int % 100 = 1)
   );

-- Flag anything already carrying either fault, so the backlog is visible in
-- triage without waiting for each row's next write to fire the trigger.
update public.personalities
   set needs_attention = true
 where is_living is true
   and birth_date is not null
   and birth_date < current_date - interval '122 years'
   and needs_attention is distinct from true;
