-- `scrape_sources.equaldex-api` reads is_enabled = true on prod, but
-- `20260330600000_fix_scrape_sources.sql` set it false with the reason
-- "no public API exists (returns 403/404)". Reconcile toward the migration.
--
-- ── The reason is still true, re-measured 2026-08-30 ────────────────────────
--
--   https://www.equaldex.com/api          → HTTP 200, but text/html (a docs page)
--   https://www.equaldex.com/api/regions  → HTTP 404, html
--   https://equaldex.com/api/regions      → HTTP 301 → the same 404
--
-- The row's configured endpoint is `/regions`. Prod agrees with the probe:
-- total_runs = 1, total_items_fetched = 0, last_success_at NULL, last_error
-- 'No items extracted', and it has not run since 2026-04-16.
--
-- ── What actually happened, because it is NOT what it looks like ────────────
--
-- `20260330600000` IS recorded in `supabase_migrations.schema_migrations`, and
-- its `statements` array is EMPTY (md5 = d41d8cd9…, the md5 of the empty
-- string). That looks like proof it never executed — and it is not. 115 of
-- 1420 applied migrations have empty statements, a bookkeeping artefact of the
-- older push/repair paths, so emptiness proves nothing on its own.
--
-- The migration's own contents are the control group, and they split cleanly:
--
--   its scrape_config UPDATEs   ARE in effect — equaldex-timeline carries
--                               '.timeline_item' (underscore; the seed had the
--                               hyphen), wnbr-events 'wiki_list',
--                               wikipedia-gay-villages 'wiki_country_tables',
--                               the last stamped updated_at 2026-03-30 16:32
--   its six is_enabled=false    are NOT in effect — every one reads true
--
-- So the migration ran, and its six disables were subsequently undone together,
-- between 2026-03-30 16:32 and 2026-04-16 05:02. No applied migration anywhere
-- in `schema_migrations` contains the string 'equaldex-api' other than the seed
-- and 20260330600000 themselves, so the revert did not come from a migration.
-- The only mechanism in the repo that can do this is the admin bulk toggle at
-- `src/components/admin/pipeline-builder/tabs/SourcesTab.tsx:114`
-- (`update({is_enabled}).in('id', ids)`) — a human "Enable" over a multi-select.
--
-- ── Only ONE of the six is disabled here, and that restraint is the point ────
--
-- Re-applying a 2026-03-30 decision wholesale in 2026-08 would destroy working
-- ingest. Measured before deciding:
--
--   eventfrog-lgbtiq   72 runs,  72 items, last success 2026-08-29  ← WORKING
--   gaycities-events   13 runs,   8 items, last success 2026-08-23  ← WORKING
--   mister-bnb          1 run,    9 items, last success 2026-05-10  ← dormant
--   gaycities-places    0 runs,   0 items, never ran                ← inert
--   travelgay-pride     0 runs,   0 items, last_error 'HTTP 403'    ← inert
--   equaldex-api        1 run,    0 items, never succeeded          ← disabled here
--
-- eventfrog was repointed at a real JSON feed by `20260822101923` and its
-- original "JS-rendered SPA" reason is obsolete; gaycities-events is marginal
-- but alive. Disabling either because a five-month-old migration said so is the
-- same error as the re-enable, pointed the other way. The other five are left
-- exactly as they are and recorded here so the finding is not lost.
--
-- `equaldex-timeline` → news_articles is untouched: different arm, different
-- purpose (5,569 items, ran today 03:45). Its green status is not evidence that
-- the API row works, and the two must not be conflated.

update public.scrape_sources
set is_enabled = false,
    consecutive_failures = 0,
    last_error = 'Disabled 2026-08-30: no public Equaldex API. /api/regions returns HTTP 404'
                 || ' (re-probed 2026-08-30); /api serves an HTML docs page, not JSON.'
                 || ' Originally disabled by 20260330600000; re-enabled outside the migration'
                 || ' path some time before 2026-04-16. Legal data comes from ILGA.',
    updated_at = now()
where slug = 'equaldex-api'
  and is_enabled;

do $$
declare
  v_api_enabled      boolean;
  v_timeline_enabled boolean;
begin
  select is_enabled into v_api_enabled
    from public.scrape_sources where slug = 'equaldex-api';
  select is_enabled into v_timeline_enabled
    from public.scrape_sources where slug = 'equaldex-timeline';

  if v_api_enabled is null then
    raise exception 'scrape_sources row equaldex-api is missing — expected a disabled row';
  end if;
  if v_api_enabled then
    raise exception 'equaldex-api is still enabled after the update';
  end if;
  -- The healthy sibling must survive this migration untouched.
  if v_timeline_enabled is distinct from true then
    raise exception 'equaldex-timeline was disabled as collateral — it must stay enabled';
  end if;
end $$;
