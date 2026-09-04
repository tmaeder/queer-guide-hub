-- Phase 2 §B — the corroborator, now that its extractor is proven.
--
-- All 18 RIGHT_TOPICS columns have rested on ONE source (ILGA) with no second opinion.
-- That is the platform's highest-stakes data: it drives location_is_high_risk(),
-- venues/events/organizations RLS, and compose_safety_note().
--
-- SOURCE DECISION (recorded 2026-08-30, built 2026-09-04): **US State Department Country
-- Reports on Human Rights Practices.** Public domain as a US Government work — so unlike
-- Equaldex there is NO licence constraint on storage, redistribution or commercial
-- display, which is what killed the Equaldex arm (non-commercial only + no storage past
-- 30 days; see 20260830132743). Independent embassy reporting, so it is not a derivative
-- of ILGA. Wikipedia/Wikidata was rejected for the opposite reason: its rights tables
-- heavily cite ILGA, and a corroborator derived from the primary source manufactures
-- false confidence.
--
-- SCOPE IS THE TWO GATE FIELDS ONLY: `lgbti_criminalization.legal` and `death_penalty`.
-- Not all 18. Those two are what drive the safety gate, so they are where being wrong
-- hurts; a full second opinion on 250x18 is a large build for marginal safety value.
--
-- IT WRITES ITS OWN TABLE AND NEVER `countries`. That is the structural guarantee behind
-- "flag, never overwrite" — not a convention someone can forget, but a table that has no
-- write path into the rights columns at all. A disagreement raises a row here; it can
-- never move the gate on its own.
--
-- EXTRACTOR ANCHOR, and why it is trustworthy: the 2023 reports carry a structured
-- `Criminalization:` sub-label inside "Acts of Violence, Criminalization, and Other Abuses
-- Based on Sexual Orientation...". The heading occurs three times per page (contents,
-- body, footer nav) and only the BODY one is followed by that sub-label, which is what
-- makes the anchor precise instead of a prose guess. Validated before any of this was
-- built, on eight countries chosen to disagree with each other: Uganda (criminalized +
-- death), Iran (criminalized + death), Morocco and Jamaica (criminalized, no death),
-- Norway and Germany (legal), India (decriminalized 2018), Singapore (377A repealed
-- 2023). 8/8 correct.
--
-- FIRST FULL PASS (250 countries): 48 criminalized, 113 legal, 88 unknown, 1 ambiguous,
-- 0 errors, and 10 field-level disagreements with ILGA. Every one is explicable: three
-- are death-penalty gaps worth a human look (Afghanistan, Somalia, Sudan — ILGA records
-- death_penalty=false, the reports say otherwise), and the other seven are a SOURCE-YEAR
-- LAG rather than an error, because the reports are annual and ILGA is nightly (Barbados,
-- Dominica, Saint Lucia, Namibia, CAR decriminalised after the 2023 report; Burkina Faso
-- and Indonesia criminalised after it).
--
-- `unknown` IS A FIRST-CLASS VERDICT, not a failure. A country with no report, no section,
-- or contradictory wording records `unknown` and corroborates nothing. Absence of evidence
-- must never read as agreement — that inversion is the through-line of every defect this
-- phase found, and the script keeps it honest by recording a throttled fetch as `error`
-- (retried next run) rather than as `unknown`.

CREATE TABLE IF NOT EXISTS public.country_rights_corroboration (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id      uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  source          text NOT NULL,
  source_url      text,
  source_year     text,
  -- What the corroborating source says. NULL = it did not say.
  criminalized    boolean,
  death_penalty   boolean,
  verdict         text NOT NULL CHECK (verdict IN ('criminalized','legal','unknown','ambiguous')),
  -- The sentence(s) the verdict was read from, so a human can check the machine.
  evidence        text,
  -- Comparison against `countries` AT OBSERVATION TIME.
  ilga_criminalized  boolean,
  ilga_death_penalty boolean,
  agrees          boolean,
  observed_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_id, source, source_year)
);

COMMENT ON TABLE public.country_rights_corroboration IS
  'Second opinion on the two safety-gate rights fields. Writes here only — never into countries. Disagreement flags for review; it can never move the gate.';

CREATE INDEX IF NOT EXISTS idx_crc_disagrees
  ON public.country_rights_corroboration (agrees, observed_at DESC) WHERE agrees IS FALSE;

ALTER TABLE public.country_rights_corroboration ENABLE ROW LEVEL SECURITY;

-- Read-only to the API roles; only service_role writes. Deliberately NOT granting
-- TRUNCATE/TRIGGER/REFERENCES/MAINTAIN — 20260830202340 revoked those across public
-- because RLS does not gate TRUNCATE, and a new table must not reintroduce them.
GRANT SELECT ON public.country_rights_corroboration TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON public.country_rights_corroboration FROM anon, authenticated;

DROP POLICY IF EXISTS country_rights_corroboration_read ON public.country_rights_corroboration;
CREATE POLICY country_rights_corroboration_read
  ON public.country_rights_corroboration FOR SELECT USING (true);

-- The review surface: where the second source contradicts ILGA on a gate field.
CREATE OR REPLACE FUNCTION public.country_rights_disagreements()
 RETURNS TABLE(country_code text, country_name text, field text,
               ilga_says text, source_says text, source text, source_url text,
               evidence text, observed_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT co.code, co.name, 'criminalized',
         coalesce(c.ilga_criminalized::text,'(null)'),
         coalesce(c.criminalized::text,'(null)'),
         c.source, c.source_url, c.evidence, c.observed_at
    FROM public.country_rights_corroboration c
    JOIN public.countries co ON co.id = c.country_id
   WHERE c.verdict IN ('criminalized','legal')
     AND c.criminalized IS DISTINCT FROM c.ilga_criminalized
  UNION ALL
  SELECT co.code, co.name, 'death_penalty',
         coalesce(c.ilga_death_penalty::text,'(null)'),
         coalesce(c.death_penalty::text,'(null)'),
         c.source, c.source_url, c.evidence, c.observed_at
    FROM public.country_rights_corroboration c
    JOIN public.countries co ON co.id = c.country_id
   WHERE c.verdict IN ('criminalized','legal')
     AND c.death_penalty IS TRUE
     AND coalesce(c.ilga_death_penalty,false) IS FALSE;
$function$;

-- Not part of the anon surface. `FROM anon` alone is a no-op while PUBLIC holds the
-- built-in EXECUTE grant — the trap that left 50 of 97 functions reachable in the first
-- draft of 20260822100000.
REVOKE EXECUTE ON FUNCTION public.country_rights_disagreements() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.country_rights_disagreements() TO service_role;
