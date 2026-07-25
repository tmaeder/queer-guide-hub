-- ============================================================================
-- Unified Guides (freeze): revoke client writes on the 13 legacy tables during
-- the soak window and drop their write-side triggers, so nothing drifts while
-- the unified `guides` family serves production. Reads stay open (rollback
-- safety). The drop-legacy migration lands after soak.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketplace_guides','marketplace_guide_picks','marketplace_guide_sections','marketplace_guide_reads',
    'venue_guides','venue_guide_picks','venue_guide_sections','venue_guide_reads',
    'event_guides','event_guide_picks',
    'quests','quest_participations','quest_contributions',
    'editorial_rails','editorial_rail_items'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- Legacy pick-count / publish-default triggers keep firing harmlessly under
-- service_role writes; drop them so even service-role writers can't drift the
-- frozen tables through side effects.
DROP TRIGGER IF EXISTS marketplace_guide_picks_count_trigger ON public.marketplace_guide_picks;
DROP TRIGGER IF EXISTS marketplace_guides_publish_defaults ON public.marketplace_guides;
DROP TRIGGER IF EXISTS venue_guide_picks_count_trigger ON public.venue_guide_picks;
DROP TRIGGER IF EXISTS venue_guides_publish_defaults ON public.venue_guides;
DROP TRIGGER IF EXISTS event_guide_picks_count_trigger ON public.event_guide_picks;
DROP TRIGGER IF EXISTS event_guides_publish_defaults ON public.event_guides;
