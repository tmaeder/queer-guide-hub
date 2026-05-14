-- Backfill search_synonyms from scripts/configure-meili.sh.
--
-- Source: scripts/configure-meili.sh:73 set this synonym map on the venues
-- index. Until now, those synonyms only existed inline in a shell script that
-- has to be run by hand. This migration imports them into the search_synonyms
-- table so they show up in the admin Synonyms tab and become editable +
-- auditable.
--
-- Idempotent: a per-row NOT EXISTS guard keys on (terms, replacements, locale,
-- is_one_way) so re-running this migration is safe.
--
-- Behaviour matches the shell script exactly: each entry is one-way (Meili's
-- default) and scoped to the venues index.
--
-- Once applied, run "Synonyms" tab -> "Sync" (or POST /synonyms/sync) so the
-- imported rows are projected back into Meilisearch.

do $$
declare
  v_imported_at constant text := '2026-04-28';
  v_note constant text := 'imported from scripts/configure-meili.sh on ' || v_imported_at;
  v_terms        text[];
  v_replacements text[];
begin
  -- gay -> queer / lgbt / lgbtq / schwul
  v_terms := array['gay'];
  v_replacements := array['queer','lgbt','lgbtq','schwul'];
  if not exists (
    select 1 from public.search_synonyms
    where terms = v_terms and replacements = v_replacements
      and locale = 'en' and is_one_way = true
  ) then
    insert into public.search_synonyms
      (terms, replacements, locale, indexes, is_one_way, status, source, notes)
    values
      (v_terms, v_replacements, 'en', array['venues'], true, 'active', 'imported', v_note);
  end if;

  -- queer -> lgbt / lgbtq / gay / schwul / lesbian / lesbisch
  v_terms := array['queer'];
  v_replacements := array['lgbt','lgbtq','gay','schwul','lesbian','lesbisch'];
  if not exists (
    select 1 from public.search_synonyms
    where terms = v_terms and replacements = v_replacements
      and locale = 'en' and is_one_way = true
  ) then
    insert into public.search_synonyms
      (terms, replacements, locale, indexes, is_one_way, status, source, notes)
    values
      (v_terms, v_replacements, 'en', array['venues'], true, 'active', 'imported', v_note);
  end if;

  -- lesbian -> lesbisch / sapphic
  v_terms := array['lesbian'];
  v_replacements := array['lesbisch','sapphic'];
  if not exists (
    select 1 from public.search_synonyms
    where terms = v_terms and replacements = v_replacements
      and locale = 'en' and is_one_way = true
  ) then
    insert into public.search_synonyms
      (terms, replacements, locale, indexes, is_one_way, status, source, notes)
    values
      (v_terms, v_replacements, 'en', array['venues'], true, 'active', 'imported', v_note);
  end if;

  -- bar -> kneipe / pub
  v_terms := array['bar'];
  v_replacements := array['kneipe','pub'];
  if not exists (
    select 1 from public.search_synonyms
    where terms = v_terms and replacements = v_replacements
      and locale = 'en' and is_one_way = true
  ) then
    insert into public.search_synonyms
      (terms, replacements, locale, indexes, is_one_way, status, source, notes)
    values
      (v_terms, v_replacements, 'en', array['venues'], true, 'active', 'imported', v_note);
  end if;

  -- club -> diskothek / disco
  v_terms := array['club'];
  v_replacements := array['diskothek','disco'];
  if not exists (
    select 1 from public.search_synonyms
    where terms = v_terms and replacements = v_replacements
      and locale = 'en' and is_one_way = true
  ) then
    insert into public.search_synonyms
      (terms, replacements, locale, indexes, is_one_way, status, source, notes)
    values
      (v_terms, v_replacements, 'en', array['venues'], true, 'active', 'imported', v_note);
  end if;

  -- sauna -> sauna / steam
  -- Note: shell script has "sauna" -> ["sauna","steam"]. The "sauna" -> "sauna"
  -- self-mapping is preserved verbatim for behavioural fidelity, even though
  -- it's a no-op at runtime.
  v_terms := array['sauna'];
  v_replacements := array['sauna','steam'];
  if not exists (
    select 1 from public.search_synonyms
    where terms = v_terms and replacements = v_replacements
      and locale = 'en' and is_one_way = true
  ) then
    insert into public.search_synonyms
      (terms, replacements, locale, indexes, is_one_way, status, source, notes)
    values
      (v_terms, v_replacements, 'en', array['venues'], true, 'active', 'imported', v_note);
  end if;
end $$;
