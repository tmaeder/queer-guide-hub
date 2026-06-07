-- ============================================================================
-- Tag Content-Quality: Phase 2 — sensitivity SEO guardrail
-- ----------------------------------------------------------------------------
-- Outing/mislabel risk: sensitive + adult tags carry auto-generated, unreviewed
-- content yet are publicly indexable. This gate forces seo_indexable=false for
-- any sensitive/adult tag that has not been human_reviewed, so unreviewed
-- sensitive term pages are never surfaced to search engines. Once an admin sets
-- human_reviewed=true the gate releases (admin then opts the page back in).
--
-- BEFORE trigger only mutates NEW (no cross-row writes -> no re-entrancy).
-- seo_indexable is NOT in the search_documents tag trigger's column scope, so
-- the backfill does not fan out to re-indexing.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_tag_seo_sensitivity_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF (NEW.is_sensitive IS TRUE OR NEW.is_adult IS TRUE)
     AND NEW.human_reviewed IS NOT TRUE THEN
    NEW.seo_indexable := false;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_tag_seo_sensitivity_gate ON public.unified_tags;
CREATE TRIGGER trg_tag_seo_sensitivity_gate
  BEFORE INSERT OR UPDATE OF is_sensitive, is_adult, human_reviewed, seo_indexable
  ON public.unified_tags
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tag_seo_sensitivity_gate();

-- One-time backfill: de-index existing unreviewed sensitive/adult tags.
UPDATE public.unified_tags
SET seo_indexable = false
WHERE (is_sensitive IS TRUE OR is_adult IS TRUE)
  AND human_reviewed IS NOT TRUE
  AND seo_indexable IS DISTINCT FROM false;
