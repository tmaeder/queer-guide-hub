-- ============================================================================
-- Trans safety dimension — TGEU Trans Murder Monitoring + Trans Rights Index
-- ----------------------------------------------------------------------------
-- Every safety signal on this platform is derived from LAW: location_is_high_risk()
-- reads lgbti_criminalization.legal and death_penalty and nothing else. For trans
-- people that model has a hole the rights engine already names out loud —
-- NOT_COVERED.trans in _shared/rights/verdict.ts lists "How identity documents are
-- treated at borders", facility access, gender-affirming healthcare, youth
-- healthcare and sport participation as facts ILGA does not record.
--
-- These two columns hold TGEU's answers to part of that, as SEPARATE records
-- rendered beside the verdict. Neither is ever folded into a verdict, a score, a
-- tier, a sort order or a filter.
--
-- WHY THAT SEPARATION IS LOAD-BEARING, and not merely tidy:
-- TMM counts rank countries almost INVERSELY to the legal model. Brazil 2,031,
-- Mexico 812, United States 478 — all legally progressive. Europe recorded 5 cases
-- in the TDoR 2025 period, its lowest ever, in the same year TGEU's own Trans
-- Rights Index regressed for the first time in 13 years. What these counts
-- overwhelmingly measure is REPORTING COVERAGE, which is why TGEU writes: "it is
-- not possible to claim that the information and results presented here represent
-- all homicides". A count fed into a risk score would tell a trans traveller that
-- Brazil is the most dangerous country on earth and that Iran is safe. It is the
-- exact inversion of the truth, so the ban is structural, not stylistic.
--
-- Consequently: absence renders as absence. A country with no recorded case is
-- 'none_recorded', never a zero and never a green. Same discipline as
-- Polarity='absent' in the rights engine and `measured` vs `total` in
-- rightsWorldSummary.ts.
-- ============================================================================

ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS trans_violence_documented jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trans_rights_index        jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.countries.trans_violence_documented IS
  'TGEU Trans Murder Monitoring aggregate counts for this country. '
  '{source, source_url, total, by_period:{"TDoR 2025":n,...}, first_period, last_period, fetched_at}. '
  'AGGREGATES ONLY — no case-level records are stored, and TMM publishes none (no names, '
  'no photos, no source URLs, no cause of death; de-identified by design). '
  'DISPLAY ONLY: must never feed a verdict, score, tier, sort or filter. An empty object '
  'means no recorded cases, which is NOT evidence of safety — see the migration header.';

COMMENT ON COLUMN public.countries.trans_rights_index IS
  'TGEU Trans Rights Index, Europe + Central Asia only (54 countries). '
  '{source, source_year, total, max, categories:{...}, source_url}. '
  'Hand-curated annual seed — TGEU publishes no machine-readable endpoint and updates '
  'once a year on IDAHOBIT. Empty on the other ~196 countries because they are OUT OF '
  'SCOPE for this index, not because they scored zero.';

-- Deliberately NOT mirrored to geo_country_profiles: the spine drift check compares
-- only name/slug/parent_id, and no consumer reads these through the spine.

-- ----------------------------------------------------------------------------
-- Circuit breaker. checkCircuit() ALLOWS BY DEFAULT when no row exists, so an
-- unseeded breaker can never trip — the same defect that left wikipedia.api /
-- wikidata.api / osm.nominatim unprotected until they were seeded.
-- ----------------------------------------------------------------------------
INSERT INTO public.api_circuit_breakers (api_name, state, threshold, reset_timeout_seconds)
VALUES ('tgeu.tmm', 'closed', 5, 900)
ON CONFLICT (api_name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Cron. Weekly is already generous: TMM is refreshed once a year, each November
-- before TDoR. Weekly simply means a release is picked up within days and a
-- transient failure self-heals without anyone watching.
--
-- The registry is canonical: action.command below is the plain readable form.
-- sync_automations_to_cron() derives the run-tracking wrapper
-- (admin_automation_run_begin + automation_http_post) from it, so this file must
-- NOT pre-wrap it — see 20260910163700.
-- ----------------------------------------------------------------------------
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'tgeu_tmm_import',
  'Import TGEU Trans Murder Monitoring',
  'Weekly Mon 03:20: import-tgeu-tmm reads the public Uwazi aggregation API at '
  'transmurdermonitoring.tgeu.org and stores per-country, per-TDoR-period counts on '
  'countries.trans_violence_documented. Aggregates only; no case records. Source data '
  'updates annually each November. Kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','tgeu-tmm-import','command',
$$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/import-tgeu-tmm',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
$$),
  '20 3 * * 1'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('tgeu-tmm-import');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'tgeu_tmm_import';
