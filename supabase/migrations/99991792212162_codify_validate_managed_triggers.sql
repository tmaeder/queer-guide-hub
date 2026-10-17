-- Codify the 33 `validate_managed_*` triggers that no migration FILE creates.
--
-- WHY THE GATE CANNOT SEE THEM. 99991792192817 and 99991792192829 create most
-- of these inside a `do $$ ... foreach ... execute format(...)` loop, composing
-- each name at run time from the spec array. `check-schema-object-drift.mjs`
-- scans migration files for a literal `create trigger <name>`, so it reports
-- all of them as "run in production that NO migration creates" — 29 of the 33,
-- the other 4 being the ones those migrations happen to spell out.
--
-- This is the SAME mechanism as 20261003134417 / 99991791049075: provenance was
-- never missing, the EVIDENCE was. The gate's own header says the
-- drop+create idiom is the only one in this repo and its absence is
-- unambiguous — a dynamic loop is what breaks that assumption.
--
-- Two cheaper routes are wrong, for the reasons that entry already records:
-- the baseline is shrink-only and says "Never add" (and hard-fails on an entry
-- that later becomes covered), and teaching the scanner to parse `format()`
-- trades a loud false positive for a quiet false negative on the one object
-- class it watches.
--
-- Definitions are read from `pg_get_triggerdef` on PRODUCTION, not copied from
-- the loop, and this file is checked back against prod rather than trusted:
-- every statement below is compared to the live definition before merge.
--
-- Idempotent BOTH ways. On prod each trigger is dropped and recreated
-- identically inside this migration's transaction, so no writer ever sees a
-- table without it. On a rebuild from zero the loop creates them first and
-- `drop trigger if exists` keeps the recreate from raising 42710.

drop trigger if exists validate_managed_category on public.accessibility_attributes;
CREATE TRIGGER validate_managed_category BEFORE INSERT OR UPDATE ON public.accessibility_attributes FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('category', 'accessibility_category');

drop trigger if exists validate_managed_competition_category on public.competitions;
CREATE TRIGGER validate_managed_competition_category BEFORE INSERT OR UPDATE ON public.competitions FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('category', 'competition_category');

drop trigger if exists validate_managed_category on public.event_amenities;
CREATE TRIGGER validate_managed_category BEFORE INSERT OR UPDATE ON public.event_amenities FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('category', 'service_category');

drop trigger if exists validate_managed_category on public.event_services;
CREATE TRIGGER validate_managed_category BEFORE INSERT OR UPDATE ON public.event_services FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('category', 'service_category');

drop trigger if exists validate_managed_event_type on public.events;
CREATE TRIGGER validate_managed_event_type BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('event_type', 'event_type');

drop trigger if exists validate_managed_hotel_type on public.hotels;
CREATE TRIGGER validate_managed_hotel_type BEFORE INSERT OR UPDATE ON public.hotels FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('hotel_type', 'hotel_type');

drop trigger if exists validate_managed_category on public.milestones;
CREATE TRIGGER validate_managed_category BEFORE INSERT OR UPDATE ON public.milestones FOR EACH ROW EXECUTE FUNCTION validate_managed_classification('category', 'milestone_category');

drop trigger if exists validate_managed_organisation_roles on public.organizations;
CREATE TRIGGER validate_managed_organisation_roles BEFORE INSERT OR UPDATE OF roles ON public.organizations FOR EACH ROW EXECUTE FUNCTION validate_managed_organisation_roles();

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

drop trigger if exists validate_managed_profile_flags on public.profiles;
CREATE TRIGGER validate_managed_profile_flags BEFORE INSERT OR UPDATE OF identity_flags ON public.profiles FOR EACH ROW EXECUTE FUNCTION validate_managed_profile_flags();

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

DO $verify$
DECLARE
  v_missing text;
BEGIN
  -- Every trigger this file names is attached. A count would pass if one were
  -- missing and an unrelated validate_managed_* trigger had appeared.
  SELECT string_agg(x.tbl || '.' || x.nm, ', ' ORDER BY x.tbl, x.nm) INTO v_missing
  FROM (VALUES
    ('accessibility_attributes','validate_managed_category'),
    ('competitions','validate_managed_competition_category'),
    ('event_amenities','validate_managed_category'),
    ('event_services','validate_managed_category'),
    ('events','validate_managed_event_type'),
    ('hotels','validate_managed_hotel_type'),
    ('milestones','validate_managed_category'),
    ('organizations','validate_managed_organisation_roles'),
    ('personalities','validate_managed_cause_of_death'),
    ('profiles','validate_managed_chosen_family_status'),
    ('profiles','validate_managed_current_relationship_status'),
    ('profiles','validate_managed_profile_bdsm_role'),
    ('profiles','validate_managed_profile_communication_about_sex'),
    ('profiles','validate_managed_profile_disability_status'),
    ('profiles','validate_managed_profile_family_acceptance_level'),
    ('profiles','validate_managed_profile_financial_situation'),
    ('profiles','validate_managed_profile_flags'),
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
  ) AS x(tbl, nm)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND NOT tg.tgisinternal
      AND c.relname = x.tbl AND tg.tgname = x.nm
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'codify failed: trigger(s) not attached after this migration: %', v_missing;
  END IF;
END
$verify$;
