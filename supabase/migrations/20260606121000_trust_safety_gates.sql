-- Trust-&-safety audit 2026-06-05 — continuous monitoring gates.
-- One RPC returns the harm-anchored gate counts. CRITICAL gates must be 0 to
-- release (enforced by scripts/check-trust-safety-gates.mjs in CI); HIGH gates
-- are alerts. Also callable from the admin UI for an at-a-glance health panel.
-- See docs/audits/2026-06-05-trust-safety-audit.md §4.

CREATE OR REPLACE FUNCTION public.trust_safety_gate_status()
RETURNS TABLE(gate text, severity text, failing bigint, detail text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- ── CRITICAL: must be 0 to release ──────────────────────────────────────
  SELECT 'hotline_unverified'::text, 'critical'::text, count(*)::bigint,
         'crisis hotlines missing verified_at or older than 90 days'::text
  FROM cms_pages cp
  CROSS JOIN LATERAL jsonb_array_elements(cp.body_json->'hotlines') hl
  WHERE cp.slug = 'help'
    AND ( NOT (hl ? 'verified_at')
          OR hl->>'verified_at' = ''
          OR (hl->>'verified_at')::date < (now() - interval '90 days')::date )

  UNION ALL
  SELECT 'person_outing_guard', 'critical', count(*)::bigint,
         'public, living people asserting a positive LGBTI identity label without provenance'
  FROM personalities
  WHERE duplicate_of_id IS NULL
    AND visibility = 'public'
    AND is_living
    AND lgbti_connection IN ('community_member', 'activist', 'representation')
    AND wikidata_qid IS NULL

  UNION ALL
  SELECT 'crim_consistency', 'critical', count(*)::bigint,
         'criminalizing destinations shown with a non-low safety score (>=50)'
  FROM countries
  WHERE duplicate_of_id IS NULL
    AND (lgbti_criminalization->>'legal') = 'false'
    AND equality_score >= 50

  UNION ALL
  SELECT 'dup_integrity', 'critical', (
      (SELECT count(*) FROM venues v WHERE v.duplicate_of_id IS NOT NULL
         AND (NOT EXISTS (SELECT 1 FROM venues p WHERE p.id = v.duplicate_of_id)
              OR EXISTS (SELECT 1 FROM venues p WHERE p.id = v.duplicate_of_id AND p.duplicate_of_id IS NOT NULL)))
    + (SELECT count(*) FROM events e WHERE e.duplicate_of_id IS NOT NULL
         AND (NOT EXISTS (SELECT 1 FROM events p WHERE p.id = e.duplicate_of_id)
              OR EXISTS (SELECT 1 FROM events p WHERE p.id = e.duplicate_of_id AND p.duplicate_of_id IS NOT NULL)))
    + (SELECT count(*) FROM personalities x WHERE x.duplicate_of_id IS NOT NULL
         AND (NOT EXISTS (SELECT 1 FROM personalities p WHERE p.id = x.duplicate_of_id)
              OR EXISTS (SELECT 1 FROM personalities p WHERE p.id = x.duplicate_of_id AND p.duplicate_of_id IS NOT NULL)))
    + (SELECT count(*) FROM news_articles n WHERE n.duplicate_of_id IS NOT NULL
         AND (NOT EXISTS (SELECT 1 FROM news_articles p WHERE p.id = n.duplicate_of_id)
              OR EXISTS (SELECT 1 FROM news_articles p WHERE p.id = n.duplicate_of_id AND p.duplicate_of_id IS NOT NULL)))
    )::bigint,
    'dangling or chained duplicate_of_id pointers (venues/events/people/news)'

  -- ── HIGH: alert, not a release block ────────────────────────────────────
  UNION ALL
  SELECT 'hotline_unreachable', 'high', count(*)::bigint,
         'crisis-page entries with no phone and no contact channel'
  FROM cms_pages cp
  CROSS JOIN LATERAL jsonb_array_elements(cp.body_json->'hotlines') hl
  WHERE cp.slug = 'help'
    AND (NOT (hl ? 'phone') OR hl->>'phone' IS NULL OR hl->>'phone' = '')
    AND jsonb_array_length(COALESCE(hl->'channels', '[]'::jsonb)) = 0

  UNION ALL
  SELECT 'hotline_link_broken', 'high', count(*)::bigint,
         'crisis hotlines flagged link_status = broken'
  FROM cms_pages cp
  CROSS JOIN LATERAL jsonb_array_elements(cp.body_json->'hotlines') hl
  WHERE cp.slug = 'help' AND hl->>'link_status' = 'broken';
$$;

GRANT EXECUTE ON FUNCTION public.trust_safety_gate_status() TO authenticated, service_role;

COMMENT ON FUNCTION public.trust_safety_gate_status() IS
  'Harm-anchored trust-&-safety gates (audit 2026-06-05). CRITICAL rows must be 0 to release.';
