-- Second pass of the sense-category name_i18n purge.
--
-- 20261211120200 cleared 1,735 rows and asserted zero remained, and that
-- assertion was true when it ran. One row — `footjob` (Practices & Play,
-- fr/it/pl/ru) — carries sense-category name translations again.
--
-- WHY A SECOND PASS IS NEEDED AT ALL. The gate that stops the translator
-- refilling this column lives in the `translate-i18n-batch` EDGE FUNCTION, and
-- the deploy workflow runs `supabase db push` BEFORE `supabase functions
-- deploy`. So there is a window, on the order of a minute, in which the purge
-- has applied and the still-ungated function is live. `translate-i18n-batch` is
-- cron-driven; a firing inside that window rewrites rows the migration just
-- cleared, using the old code. That is the most likely account of this row.
--
-- The window is a property of the workflow's ordering, not of these migrations,
-- and it cannot be closed from inside a migration. What CAN be done is make the
-- purge idempotent and run it again once the gate is live — which it now is,
-- verified against the deployed function: both `senseGated` and
-- `isSenseCategory` are present in the running bundle, so the refill path is
-- closed and this pass is the last one needed.
--
-- WRITTEN AS THE PREDICATE, NOT AS `slug = 'footjob'`. The one-row form would
-- be shorter and would have been wrong if the window had caught more than one
-- row between measurement and apply — the same window is still open every
-- deploy until this lands. Re-running the original predicate fixes whatever is
-- actually there and re-asserts the invariant rather than a row count.
--
-- Do NOT read the `updated_at` column as evidence about this row. It reads
-- 2026-06-19 while `last_quality_at` on the same row reads today, so writers on
-- unified_tags do not consistently bump it; "untouched since June" is not a
-- conclusion it can support. That misreading cost one round of diagnosis.
--
-- Category list mirrors isSenseCategory() in _shared/tag-style.ts, restated
-- because SQL cannot import TypeScript. Venue Types, Destinations and
-- Substances & Recovery stay absent — there the generic sense is the right one.
--
-- No search churn: trg_search_documents_tag is column-scoped and does not list
-- name_i18n, so this enqueues no reindex.

do $$
declare
  v_before int;
  v_after  int;
  v_desc   int;
begin
  perform set_config('app.actor', 'admin:tag-language-normalisation', false);

  select count(*) into v_before
    from public.unified_tags
   where status = 'active'
     and name_i18n is not null and name_i18n <> '{}'::jsonb
     and lower(category) in (
       'dynamics & roles','fetishes','practices & play','gear',
       'kink community & scenes','positions','slang & language',
       'subcultures & scenes','relationship structures','expression & style',
       'consent & negotiation','vibe & crowd');

  -- Measured at 1 immediately before writing this. A large number here would
  -- mean the gate is NOT actually live and the translator has been refilling
  -- freely — in which case clearing the rows treats the symptom and the run
  -- should stop for a human instead.
  if v_before > 50 then
    raise exception 'residual purge: % sense-category rows carry name_i18n — the translator gate is not holding; investigate before clearing', v_before;
  end if;

  select count(*) into v_desc
    from public.unified_tags
   where description_i18n is not null and description_i18n <> '{}'::jsonb;

  update public.unified_tags
     set name_i18n = '{}'::jsonb
   where status = 'active'
     and name_i18n is not null and name_i18n <> '{}'::jsonb
     and lower(category) in (
       'dynamics & roles','fetishes','practices & play','gear',
       'kink community & scenes','positions','slang & language',
       'subcultures & scenes','relationship structures','expression & style',
       'consent & negotiation','vibe & crowd');

  select count(*) into v_after
    from public.unified_tags
   where status = 'active'
     and name_i18n is not null and name_i18n <> '{}'::jsonb
     and lower(category) in (
       'dynamics & roles','fetishes','practices & play','gear',
       'kink community & scenes','positions','slang & language',
       'subcultures & scenes','relationship structures','expression & style',
       'consent & negotiation','vibe & crowd');

  if v_after <> 0 then
    raise exception 'residual purge: % sense-category rows still carry name_i18n', v_after;
  end if;

  -- description_i18n is prose, survives translation, and unlike name_i18n has
  -- real readers (KinkGridEditor, KinkWizard, useKinkTaxonomy). This asserts the
  -- scoping claim rather than merely stating it.
  if (select count(*) from public.unified_tags
       where description_i18n is not null and description_i18n <> '{}'::jsonb) <> v_desc then
    raise exception 'residual purge: description_i18n moved (% -> %), which this must never touch',
      v_desc,
      (select count(*) from public.unified_tags
        where description_i18n is not null and description_i18n <> '{}'::jsonb);
  end if;

  raise notice 'residual purge: cleared % row(s), description_i18n unchanged at %', v_before, v_desc;
end $$;
