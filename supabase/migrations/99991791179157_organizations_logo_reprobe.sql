-- Closing the gap `99991791179135` named: organizations are unreachable by the
-- image layer, and most of their logos are logo.dev's MONOGRAM.
--
-- WHAT THE 783 ROWS ACTUALLY ARE. Every organization logo was written in ONE
-- batch on 2026-04-07, to Supabase storage at `logos/venues/<uuid>.png` — one
-- file per entity rather than content-addressed. Fetched and looked at, the
-- biggest shared groups are a single dark letter on white: "T" on 28 unrelated
-- organizations, "B" on 21, "C" on 18, "M" on 16. That is logo.dev's generic
-- first-letter fallback, which `_shared/logo-enrichment.ts` already refuses for
-- venues and events — `probeRealLogo` passes `fallback=404` precisely so a
-- monogram cannot be mistaken for a brand mark, because under the logo-first
-- display rule it MASKS the entity's own photographs.
--
-- The producer is not in this repository. Nothing writes `organizations.logo_url`
-- today — `enrich-logos` handles venues, events and marketplace_brands — so the
-- batch is orphaned output from a path that has since been deleted. There is no
-- producer to seal; what is needed is a decision about the rows.
--
-- THE SIZE AND SHARE HEURISTICS BOTH FAIL HERE, measured rather than assumed.
-- 23 marks are shared by 3+ organizations and 547 are singletons, so a
-- "shared image" rule reaches at most 202 of 783 and misses every monogram for a
-- rare first letter. Byte size separates nothing either: the shared marks span
-- 834 B to 103 kB, and one of the 23 is a real 103 kB chain logo, not a
-- monogram. Any threshold drawn here would be a guess.
--
-- SO ASK THE SOURCE. logo.dev with `fallback=404` answers exactly the question
-- that matters — does a REAL logo exist for this domain — and it is the same
-- probe the venue path already trusts. All 783 rows carry a website, none of
-- them a platform domain, so every row is decidable and this leaves no residue.
--   404 not_indexed  -> the stored image is the monogram; clear it
--   200 found        -> a real logo; MIRROR IT TO R2 and replace the url
--   401/403/429      -> the probe failed and told us nothing ABOUT THE ROW;
--                       abort the batch and change nothing
--
-- The `found` branch is what actually closes the gap rather than papering over
-- it: moving these onto the content-addressed R2 path is what gives the image
-- layer (`logo_denied_marks`) an identity to key on, so a junk mark reaching
-- organizations in future is caught by the same rule as everywhere else.
--
-- Nothing is cleared by THIS migration. A migration cannot call logo.dev, and
-- deleting 783 logos on the assumption that they are all monograms would destroy
-- the real ones — the heuristics above are exactly what is not trustworthy here.
-- This adds the bookkeeping column and schedules the worker; the evidence is
-- gathered one row at a time, by the thing that can gather it.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The column the work list needs.
--
-- `organizations` is the only one of the three logo tables without it, which is
-- why it could never participate in the batch protocol: a run had no way to say
-- "this row was examined and the answer was no", and so would re-probe it
-- forever.

alter table public.organizations
  add column if not exists logo_fetched_at timestamptz;

comment on column public.organizations.logo_fetched_at is
  'When a logo was last ATTEMPTED for this organization, successful or not. Stamped '
  'even when no logo was found, so the row leaves the work list instead of being '
  're-probed nightly. NULL means never examined.';

-- The worker scans for `logo_fetched_at is null`, so this index is the work list.
create index if not exists idx_organizations_logo_unfetched
  on public.organizations (created_at)
  where logo_fetched_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The schedule.
--
-- Registered in `admin_automations` FIRST and scheduled from it, per the house
-- rule: the registry is the record, a cron created behind its back is reported
-- as unregistered and never auto-killed, and a retirement means disabling the
-- registry row rather than unscheduling the job.
--
-- `25 4 * * *` sits clear of enrich-logos-venues (`6 * * * *`) and
-- enrich-logos-events (`35 3 * * *`): the three share one logo.dev rate budget,
-- and overlapping them is how a run spends its quota discovering it has none.

-- `trigger` is NOT NULL with no default and is a separate column from `action`
-- — read off the live `enrich_logos_venues` row rather than guessed. The first
-- draft omitted it and the prod dry run failed with 23502, which is the whole
-- reason a data migration is dry-run against the real schema.
insert into public.admin_automations (slug, name, description, "trigger", action, enabled, conditions)
select
  'enrich_logos_organizations',
  'Enrich organization logos',
  'Re-probes organization logos against logo.dev. The 2026-04-07 batch stored '
    || 'logo.dev monograms as if they were brand marks; a 404 under fallback=404 '
    || 'clears one, a real logo is mirrored to R2 so the denied-mark layer can see it.',
  '{"type": "schedule"}'::jsonb,
  jsonb_build_object(
    'type', 'cron',
    'schedule', '25 4 * * *',
    -- Copied from the LIVE `enrich-logos-venues` command rather than written
    -- from memory. `enrich-logos` is gated by `requireInternalOrAdmin`, which
    -- wants the vault's `internal_invoke_secret` in `x-internal-secret` — a
    -- bearer token does not satisfy it, and the first draft of this file
    -- invented one, which would have produced a job that fires, 401s, and
    -- records a successful dispatch.
    'command', $cmd$
  SELECT public.automation_http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/enrich-logos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"table": "organizations", "batch_size": 100}'::jsonb,
    timeout_milliseconds := 250000
  ) AS request_id;
$cmd$),
  true,
  '[]'::jsonb
where not exists (select 1 from public.admin_automations where slug = 'enrich_logos_organizations');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Postconditions.

do $verify$
declare
  v_n int;
begin
  -- The column must exist, or the worker's selector silently matches nothing and
  -- the run reports success having examined zero rows.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'logo_fetched_at'
  ) then
    raise exception 'organizations.logo_fetched_at was not created';
  end if;

  if not exists (select 1 from public.admin_automations where slug = 'enrich_logos_organizations') then
    raise exception 'the enrich_logos_organizations automation was not registered';
  end if;

  -- THE WORK LIST MUST BE NON-EMPTY. A new column defaults to NULL on every row,
  -- so this is nearly tautological today — which is the point: if it is ever
  -- zero, the worker has nothing to do and a green run means nothing. Reporting
  -- the denominator is what separates "clean" from "measured nothing".
  select count(*) into v_n
  from public.organizations
  where logo_url like '%/storage/v1/object/public/logos/%' and logo_fetched_at is null;
  if v_n = 0 then
    raise exception 'no legacy organization logos to re-probe — the work list is empty, so the schedule would be a no-op';
  end if;
  raise notice 'organization logos queued for re-probe: %', v_n;

  -- The mirror assertion: this migration must not have CHANGED any logo. The
  -- decision belongs to the probe, and a migration that quietly cleared rows
  -- would be exactly the "all 783 are monograms" guess this file refuses.
  select count(*) into v_n from public.organizations where logo_url is not null;
  if v_n < 780 then
    raise exception 'organization logos were modified by this migration (% left) — it must only add bookkeeping', v_n;
  end if;
end
$verify$;
