-- Queer Guide Scraper: Reconciliation sweeper
-- Finds orphans where scraper_entity_map.canonical_entity_id points at a row
-- that no longer exists in the target scraper_* table. Runs as an on-demand
-- SQL function so it can be invoked from the admin UI or a weekly cron.

CREATE OR REPLACE FUNCTION scraper_reconcile_orphans()
RETURNS TABLE (entity_type TEXT, orphan_count BIGINT) AS $$
BEGIN
  RETURN QUERY
    SELECT 'venue'::text,
           COUNT(*)::bigint
    FROM scraper_entity_map m
    WHERE m.entity_type = 'venue'
      AND NOT EXISTS (SELECT 1 FROM scraper_venues v WHERE v.id = m.canonical_entity_id);

  RETURN QUERY
    SELECT 'event'::text,
           COUNT(*)::bigint
    FROM scraper_entity_map m
    WHERE m.entity_type = 'event'
      AND NOT EXISTS (SELECT 1 FROM scraper_events e WHERE e.id = m.canonical_entity_id);

  RETURN QUERY
    SELECT 'place'::text,
           COUNT(*)::bigint
    FROM scraper_entity_map m
    WHERE m.entity_type = 'place'
      AND NOT EXISTS (SELECT 1 FROM scraper_places p WHERE p.id = m.canonical_entity_id);

  RETURN QUERY
    SELECT 'stay'::text,
           COUNT(*)::bigint
    FROM scraper_entity_map m
    WHERE m.entity_type = 'stay'
      AND NOT EXISTS (SELECT 1 FROM scraper_stays s WHERE s.id = m.canonical_entity_id);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION scraper_reconcile_orphans IS
  'Surface entity_map rows whose canonical row has been deleted. Call and inspect; deletion is manual to keep admin in the loop.';

-- Sibling cleanup helper: delete orphan mappings for a specified entity_type.
-- Returns the number of rows removed. Admin-gated call path.
CREATE OR REPLACE FUNCTION scraper_prune_orphan_mappings(p_entity_type TEXT)
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  IF p_entity_type NOT IN ('venue', 'event', 'place', 'stay') THEN
    RAISE EXCEPTION 'invalid entity_type: %', p_entity_type;
  END IF;

  CASE p_entity_type
    WHEN 'venue' THEN
      DELETE FROM scraper_entity_map m
      WHERE m.entity_type = 'venue'
        AND NOT EXISTS (SELECT 1 FROM scraper_venues v WHERE v.id = m.canonical_entity_id);
    WHEN 'event' THEN
      DELETE FROM scraper_entity_map m
      WHERE m.entity_type = 'event'
        AND NOT EXISTS (SELECT 1 FROM scraper_events e WHERE e.id = m.canonical_entity_id);
    WHEN 'place' THEN
      DELETE FROM scraper_entity_map m
      WHERE m.entity_type = 'place'
        AND NOT EXISTS (SELECT 1 FROM scraper_places p WHERE p.id = m.canonical_entity_id);
    WHEN 'stay' THEN
      DELETE FROM scraper_entity_map m
      WHERE m.entity_type = 'stay'
        AND NOT EXISTS (SELECT 1 FROM scraper_stays s WHERE s.id = m.canonical_entity_id);
  END CASE;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- Wrapper exposed to the admin UI. Mirrors the TS resolvePendingDedupeDecisions
-- helper so the admin tab can self-service the auto-demote with explicit
-- confidence floor + age threshold.
CREATE OR REPLACE FUNCTION scraper_resolve_pending(
  p_older_than_days INT DEFAULT 30,
  p_confidence_floor DOUBLE PRECISION DEFAULT 0.75
) RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE scraper_dedupe_decisions
  SET decision = 'skip'
  WHERE decision = 'pending'
    AND created_at < now() - (p_older_than_days || ' days')::interval
    AND confidence < p_confidence_floor;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;
