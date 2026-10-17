-- Codify the 29 `validate_managed_*` triggers that run in production but that
-- `check-schema-object-drift.mjs` cannot see.
--
-- WHY THE SCANNER MISSES THEM, precisely — the obvious reading is wrong.
--
-- That gate's own docblock says a trigger created inside a
-- `do $$ ... execute 'create trigger ...' $$` block STILL matches, "because the
-- statement text is present either way". So dynamic creation is not by itself
-- the problem. What it cannot see is a name COMPOSED at run time: the taxonomy
-- migrations (99991792192817 and siblings) build each statement with
-- `format(...)` over a list of (table, column, vocabulary), so the literal
-- string `create trigger validate_managed_profile_bdsm_role` never appears in
-- any file. A hand-attached or run-time-composed trigger disappears on any
-- rebuild from migrations, and the invariant it enforces goes with it.
--
-- WHY NOT THE TWO CHEAPER OPTIONS
--
-- The baseline (scripts/schema-object-drift-baseline.json) is SHRINK-ONLY and
-- its header says "Never add" — and the gate hard-fails on a baseline entry
-- that later becomes covered, so adding these would create work for whoever
-- codified them properly. Teaching the scanner to parse `format()` trades a
-- loud false positive for a quiet false negative on the one object class it
-- watches, and that file states "Under-reaching is the correct error".
--
-- DEFINITIONS ARE READ FROM PROD, NOT COPIED FROM THE LOOP
--
-- Every statement below is `pg_get_triggerdef()` output captured from
-- production, which is the authoritative record of what is actually attached —
-- the same discipline 99991791049075 used for the cultural `updated_at`
-- triggers. Transcribing the loop's intent instead would codify what it was
-- meant to do rather than what it did.
--
-- NOTE ON SCOPE: 33 triggers match `validate_managed%` live; 4 of them
-- (validate_managed_competition_category, _event_type, _organisation_roles,
-- _profile_flags) already appear literally in the corpus and are deliberately
-- NOT restated here. The gate reports 29 table/name pairs over 24 distinct
-- names, because its coverage set is keyed on NAME, not table. One statement
-- per live trigger is emitted anyway, so a rebuild reproduces all 29 rather
-- than only one per name.
--
-- IDEMPOTENT IN BOTH DIRECTIONS. On production each trigger is dropped and
-- recreated identically inside this transaction, so no writer ever sees a
-- table without it. On a rebuild from zero the taxonomy loop creates them
-- first, and `drop trigger if exists` keeps the recreate from raising 42710.

drop trigger if exists validate_managed_category on public.accessibility_attributes;
CREATE TRIGGER validate_managed_category BEFORE INSERT OR UPDATE ON public.accessibility_attributes FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('category', 'accessibility_category');

drop trigger if exists validate_managed_category on public.event_amenities;
CREATE TRIGGER validate_managed_category BEFORE INSERT OR UPDATE ON public.event_amenities FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('category', 'service_category');

drop trigger if exists validate_managed_category on public.event_services;
CREATE TRIGGER validate_managed_category BEFORE INSERT OR UPDATE ON public.event_services FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('category', 'service_category');

drop trigger if exists validate_managed_hotel_type on public.hotels;
CREATE TRIGGER validate_managed_hotel_type BEFORE INSERT OR UPDATE ON public.hotels FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('hotel_type', 'hotel_type');

drop trigger if exists validate_managed_category on public.milestones;
CREATE TRIGGER validate_managed_category BEFORE INSERT OR UPDATE ON public.milestones FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('category', 'milestone_category');

drop trigger if exists validate_managed_cause_of_death on public.personalities;
CREATE TRIGGER validate_managed_cause_of_death BEFORE INSERT OR UPDATE ON public.personalities FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('cause_of_death', 'personality_cause_of_death');

drop trigger if exists validate_managed_chosen_family_status on public.profiles;
CREATE TRIGGER validate_managed_chosen_family_status BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('chosen_family_status', 'chosen_family');

drop trigger if exists validate_managed_current_relationship_status on public.profiles;
CREATE TRIGGER validate_managed_current_relationship_status BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('current_relationship_status', 'relationship_status');

drop trigger if exists validate_managed_profile_bdsm_role on public.profiles;
CREATE TRIGGER validate_managed_profile_bdsm_role BEFORE INSERT OR UPDATE OF bdsm_role ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('bdsm_role', 'profile_bdsm_role');

drop trigger if exists validate_managed_profile_communication_about_sex on public.profiles;
CREATE TRIGGER validate_managed_profile_communication_about_sex BEFORE INSERT OR UPDATE OF communication_about_sex ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('communication_about_sex', 'profile_communication_about_sex');

drop trigger if exists validate_managed_profile_disability_status on public.profiles;
CREATE TRIGGER validate_managed_profile_disability_status BEFORE INSERT OR UPDATE OF disability_status ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('disability_status', 'profile_disability_status');

drop trigger if exists validate_managed_profile_family_acceptance_level on public.profiles;
CREATE TRIGGER validate_managed_profile_family_acceptance_level BEFORE INSERT OR UPDATE OF family_acceptance_level ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('family_acceptance_level', 'profile_family_acceptance_level');

drop trigger if exists validate_managed_profile_financial_situation on public.profiles;
CREATE TRIGGER validate_managed_profile_financial_situation BEFORE INSERT OR UPDATE OF financial_situation ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('financial_situation', 'profile_financial_situation');

drop trigger if exists validate_managed_profile_housing_situation on public.profiles;
CREATE TRIGGER validate_managed_profile_housing_situation BEFORE INSERT OR UPDATE OF housing_situation ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('housing_situation', 'profile_housing_situation');

drop trigger if exists validate_managed_profile_immigration_status on public.profiles;
CREATE TRIGGER validate_managed_profile_immigration_status BEFORE INSERT OR UPDATE OF immigration_status ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('immigration_status', 'profile_immigration_status');

drop trigger if exists validate_managed_profile_jealousy_comfort_level on public.profiles;
CREATE TRIGGER validate_managed_profile_jealousy_comfort_level BEFORE INSERT OR UPDATE OF jealousy_comfort_level ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('jealousy_comfort_level', 'profile_jealousy_comfort_level');

drop trigger if exists validate_managed_profile_kink_experience_level on public.profiles;
CREATE TRIGGER validate_managed_profile_kink_experience_level BEFORE INSERT OR UPDATE OF kink_experience_level ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('kink_experience_level', 'profile_kink_experience_level');

drop trigger if exists validate_managed_profile_mental_health_openness on public.profiles;
CREATE TRIGGER validate_managed_profile_mental_health_openness BEFORE INSERT OR UPDATE OF mental_health_openness ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('mental_health_openness', 'profile_mental_health_openness');

drop trigger if exists validate_managed_profile_neurodivergent_status on public.profiles;
CREATE TRIGGER validate_managed_profile_neurodivergent_status BEFORE INSERT OR UPDATE OF neurodivergent_status ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('neurodivergent_status', 'profile_neurodivergent_status');

drop trigger if exists validate_managed_profile_physical_affection_preference on public.profiles;
CREATE TRIGGER validate_managed_profile_physical_affection_preference BEFORE INSERT OR UPDATE OF physical_affection_preference ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('physical_affection_preference', 'profile_physical_affection_preference');

drop trigger if exists validate_managed_profile_romance_style on public.profiles;
CREATE TRIGGER validate_managed_profile_romance_style BEFORE INSERT OR UPDATE OF romance_style ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('romance_style', 'profile_romance_style');

drop trigger if exists validate_managed_profile_sexual_exploration_openness on public.profiles;
CREATE TRIGGER validate_managed_profile_sexual_exploration_openness BEFORE INSERT OR UPDATE OF sexual_exploration_openness ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('sexual_exploration_openness', 'profile_sexual_exploration_openness');

drop trigger if exists validate_managed_profile_sexual_frequency_preference on public.profiles;
CREATE TRIGGER validate_managed_profile_sexual_frequency_preference BEFORE INSERT OR UPDATE OF sexual_frequency_preference ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('sexual_frequency_preference', 'profile_sexual_frequency_preference');

drop trigger if exists validate_managed_profile_sexual_health_status on public.profiles;
CREATE TRIGGER validate_managed_profile_sexual_health_status BEFORE INSERT OR UPDATE OF sexual_health_status ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('sexual_health_status', 'profile_sexual_health_status');

drop trigger if exists validate_managed_profile_workplace_safety on public.profiles;
CREATE TRIGGER validate_managed_profile_workplace_safety BEFORE INSERT OR UPDATE OF workplace_safety ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('workplace_safety', 'profile_workplace_safety');

drop trigger if exists validate_managed_relationship_style on public.profiles;
CREATE TRIGGER validate_managed_relationship_style BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('relationship_style', 'relationship_style');

drop trigger if exists validate_managed_category on public.venue_services;
CREATE TRIGGER validate_managed_category BEFORE INSERT OR UPDATE ON public.venue_services FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('category', 'service_category');

drop trigger if exists validate_managed_accommodation_type on public.venues;
CREATE TRIGGER validate_managed_accommodation_type BEFORE INSERT OR UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('accommodation_type', 'hotel_type');

drop trigger if exists validate_managed_category on public.venues;
CREATE TRIGGER validate_managed_category BEFORE INSERT OR UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('category', 'venue_category');

do $verify$
declare
  v_missing text;
  v_total   int;
begin
  -- Assert the REACHED STATE: every pair this file undertakes to codify is
  -- attached. Counting statements would pass on a file that emitted none.
  select string_agg(x.tbl || '.' || x.tgname, ', ' order by x.tbl, x.tgname)
    into v_missing
  from (values
    ('accessibility_attributes','validate_managed_category'),
    ('event_amenities','validate_managed_category'),
    ('event_services','validate_managed_category'),
    ('hotels','validate_managed_hotel_type'),
    ('milestones','validate_managed_category'),
    ('personalities','validate_managed_cause_of_death'),
    ('profiles','validate_managed_chosen_family_status'),
    ('profiles','validate_managed_current_relationship_status'),
    ('profiles','validate_managed_profile_bdsm_role'),
    ('profiles','validate_managed_profile_communication_about_sex'),
    ('profiles','validate_managed_profile_disability_status'),
    ('profiles','validate_managed_profile_family_acceptance_level'),
    ('profiles','validate_managed_profile_financial_situation'),
    ('profiles','validate_managed_profile_housing_situation'),
    ('profiles','validate_managed_profile_immigration_status'),
    ('profiles','validate_managed_profile_jealousy_comfort_level'),
    ('profiles','validate_managed_profile_kink_experience_level'),
    ('profiles','validate_managed_profile_mental_health_openness'),
    ('profiles','validate_managed_profile_neurodivergent_status'),
    ('profiles','validate_managed_profile_physical_affection_preference'),
    ('profiles','validate_managed_profile_romance_style'),
    ('profiles','validate_managed_profile_sexual_exploration_openness'),
    ('profiles','validate_managed_profile_sexual_frequency_preference'),
    ('profiles','validate_managed_profile_sexual_health_status'),
    ('profiles','validate_managed_profile_workplace_safety'),
    ('profiles','validate_managed_relationship_style'),
    ('venue_services','validate_managed_category'),
    ('venues','validate_managed_accommodation_type'),
    ('venues','validate_managed_category')
  ) as x(tbl, tgname)
  where not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where not t.tgisinternal
      and ns.nspname = 'public'
      and c.relname = x.tbl
      and t.tgname  = x.tgname
  );

  if v_missing is not null then
    raise exception 'P1 failed: not attached after codification: %', v_missing;
  end if;

  -- The four already-literal triggers must SURVIVE. A sweep that detached them
  -- would otherwise satisfy P1 just as well.
  select count(*) into v_total
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where not t.tgisinternal and ns.nspname = 'public'
    and t.tgname in ('validate_managed_competition_category',
                     'validate_managed_event_type',
                     'validate_managed_organisation_roles',
                     'validate_managed_profile_flags');
  if v_total <> 4 then
    raise exception 'P2 failed: expected the 4 pre-existing literal triggers, found %', v_total;
  end if;

  -- And the whole family must still be 33, so this neither lost nor duplicated one.
  select count(*) into v_total
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where not t.tgisinternal and ns.nspname = 'public' and t.tgname like 'validate_managed%';
  if v_total <> 33 then
    raise exception 'P3 failed: expected 33 validate_managed%% triggers, found %', v_total;
  end if;

  raise notice 'codified 29 validate_managed_* triggers; family intact at 33';
end $verify$;
