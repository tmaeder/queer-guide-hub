-- Let a tag cite the actual law it is about.
--
-- The glossary at /tags/:slug carries ~130 law-related terms — `marriage-equality`,
-- `decriminalization`, `uganda-anti-homosexuality-act`, `legal-gender-recognition` —
-- that make legal claims and cite nothing. The rail's only outbound links are
-- Wikipedia and Wikidata. On a platform readers use to judge whether a destination
-- is safe, that is a real gap.
--
-- THE AUTOMATED FIX DOES NOT EXIST, AND THIS WAS MEASURED BEFORE BUILDING.
-- Across the 44 law-related tags that carry a `wikidata_id`:
--
--   P1031 (legal citation)  ..  0 of 44
--   P953  (full-text URL)   ..  3 of 44   — only CRC, CEDAW, CRPD
--
-- Exactly one resolves to a statute (Uganda Anti-Homosexuality Act, P31 = act of
-- parliament) and it carries no text URL. There is nothing to derive, so anything
-- that "filled in" citations would be inventing them. Wikidata P31 is useful here
-- only as a manual triage signal while a human builds the list — never as a writer.
--
-- Two tracks, and only one of them lands in this table:
--
--   A. The tag IS a named instrument (Uganda AHA, CRC, CEDAW, CRPD, DADT). One
--      hand-researched, URL-verified citation. Seeded below.
--   B. The tag is a CLASS of law (`marriage-equality` is 38 national statutes;
--      `decriminalization` is a different instrument per jurisdiction). There is
--      no single citation, so the honest answer is the per-country ILGA ledger.
--      That mapping lives in TypeScript (src/lib/rights/tagRightTopics.ts) against
--      RIGHT_TOPICS, which Postgres cannot FK-constrain — a typo'd slug there is a
--      dead link found in production, whereas in TS it is unit-testable.
--
-- EXTENDING `tag_sources` RATHER THAN ADDING A TABLE. It already models "a citation
-- for a tag": tag_id FK with ON DELETE CASCADE, source_type, source_url, source_id,
-- claim_summary, RLS enabled, and a live consumer (the +0.05 confidence term in
-- 20260607146000_tag_trust_confidence.sql). A new law_instruments table would
-- duplicate all of that and orphan the confidence term. The delta is six nullable
-- columns and four CHECK values.

-- ── Vocabulary ─────────────────────────────────────────────────────────────
ALTER TABLE public.tag_sources DROP CONSTRAINT IF EXISTS tag_sources_source_type_check;
-- `resolution` earns its place: the office of the UN High Commissioner for Human
-- Rights was created by GA resolution 48/141, which is not a treaty. Without the
-- value the only options are to mislabel it or to drop the citation.
ALTER TABLE public.tag_sources ADD CONSTRAINT tag_sources_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'wikipedia', 'wikidata', 'editorial', 'llm', 'manual',
    'statute', 'treaty', 'case_law', 'constitution', 'resolution'
  ]));

-- ── Citation columns ───────────────────────────────────────────────────────
ALTER TABLE public.tag_sources
  ADD COLUMN IF NOT EXISTS official_title    text,
  ADD COLUMN IF NOT EXISTS jurisdiction      text,
  ADD COLUMN IF NOT EXISTS adopted_year      smallint,
  ADD COLUMN IF NOT EXISTS instrument_status text,
  ADD COLUMN IF NOT EXISTS verified_at       timestamptz,
  ADD COLUMN IF NOT EXISTS is_public         boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tag_sources.official_title IS
  'The instrument as it names itself, e.g. "Local Government Act 1988, section 28". Never a paraphrase.';
COMMENT ON COLUMN public.tag_sources.jurisdiction IS
  'ISO-3166-1 alpha-2, or INT for an international instrument.';
COMMENT ON COLUMN public.tag_sources.instrument_status IS
  'in_force | repealed | superseded. Load-bearing: the curated set is full of repealed law (Section 28, DADT, Paragraph 175), and "adopted 1988" with no repeal marker is a WRONG claim, not a thin one.';
COMMENT ON COLUMN public.tag_sources.is_public IS
  'Gates the anon read policy. Separates the 8,710 rows of the 2026-04-27 wikipedia/wikidata backfill from the curated citations, and defaults false so an unverified row is invisible by construction.';

-- ── Shape constraints ──────────────────────────────────────────────────────
ALTER TABLE public.tag_sources
  ADD CONSTRAINT tag_sources_jurisdiction_shape
    CHECK (jurisdiction IS NULL OR jurisdiction ~ '^([A-Z]{2}|INT)$'),
  ADD CONSTRAINT tag_sources_adopted_year_range
    CHECK (adopted_year IS NULL OR adopted_year BETWEEN 1700 AND 2100),
  ADD CONSTRAINT tag_sources_instrument_status_check
    CHECK (instrument_status IS NULL
           OR instrument_status = ANY (ARRAY[
             'in_force', 'repealed', 'superseded', 'partially_invalidated'
           ]));

-- The "nothing invented" rule, enforced structurally rather than by convention:
-- a row cannot become publicly citable while it is missing any part of the
-- citation. Ticking is_public on an incomplete row in the admin editor raises
-- here and surfaces as a toast — that is the intended UX, not a bug.
ALTER TABLE public.tag_sources
  ADD CONSTRAINT tag_sources_public_requires_citation
    CHECK (NOT is_public OR (
      official_title IS NOT NULL
      AND source_url IS NOT NULL
      AND jurisdiction IS NOT NULL
      AND source_type = ANY (ARRAY[
        'statute', 'treaty', 'case_law', 'constitution', 'resolution'
      ])
    ));

-- Makes the seed below re-runnable. Partial, so it never touches the backfill.
CREATE UNIQUE INDEX IF NOT EXISTS tag_sources_public_citation_uniq
  ON public.tag_sources (tag_id, source_url) WHERE is_public;

-- ── Grants: the existing set is exactly inverted ───────────────────────────
-- Measured on prod before this migration:
--
--   anon  ->  DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE   (no SELECT)
--
-- i.e. anon could write every column and read none. It is not exploitable today
-- only because no write policy exists — and this migration adds write policies for
-- the admin editor, which is precisely the moment that stops being true. Same class
-- as 20260902100000: in this project a GRANT without a policy is inert, but a policy
-- without a GRANT is unreachable, so both halves have to be right.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.tag_sources FROM anon;
GRANT SELECT ON public.tag_sources TO anon, authenticated;

-- ── Read policy ────────────────────────────────────────────────────────────
-- SELECT policies OR together, so "admin select tag_sources" is deliberately left
-- in place and staff keep full visibility of the backfill rows.
DROP POLICY IF EXISTS tag_sources_public_read ON public.tag_sources;
CREATE POLICY tag_sources_public_read ON public.tag_sources
  FOR SELECT TO PUBLIC
  USING (
    is_public
    AND EXISTS (
      SELECT 1 FROM public.unified_tags t
      WHERE t.id = tag_sources.tag_id AND t.status = 'active'
    )
  );

-- ── Write policies ─────────────────────────────────────────────────────────
-- Staff, not admin-only, for the reason spelled out in 20260904100000: the tags
-- console sits in the `content` nav section whose minRole is 'editor', so an
-- admin-only write policy gives an editor a page that loads and then silently
-- refuses every save.
DROP POLICY IF EXISTS tag_sources_staff_insert ON public.tag_sources;
CREATE POLICY tag_sources_staff_insert ON public.tag_sources
  FOR INSERT TO PUBLIC
  WITH CHECK (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]));

DROP POLICY IF EXISTS tag_sources_staff_update ON public.tag_sources;
CREATE POLICY tag_sources_staff_update ON public.tag_sources
  FOR UPDATE TO PUBLIC
  USING (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]))
  WITH CHECK (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]));

DROP POLICY IF EXISTS tag_sources_staff_delete ON public.tag_sources;
CREATE POLICY tag_sources_staff_delete ON public.tag_sources
  FOR DELETE TO PUBLIC
  USING (has_any_role_jwt(ARRAY['admin', 'moderator', 'editor']::app_role[]));

COMMENT ON POLICY tag_sources_public_read ON public.tag_sources IS
  'Anon/authenticated read of curated legal citations only (is_public). The 8,710 wikipedia/wikidata backfill rows stay staff-only.';
