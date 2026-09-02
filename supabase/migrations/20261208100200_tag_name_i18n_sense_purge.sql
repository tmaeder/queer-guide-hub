-- Delete the machine-translated NAME translations on sense-category tags.
--
-- unified_tags.name_i18n has NO reader. Measured 2026-09-02 across src/,
-- functions/ and workers/: zero hits outside the generated
-- src/integrations/supabase/types.ts. translate-i18n-batch writes it and
-- nothing renders it. The positive control for that grep is description_i18n,
-- which DOES have readers (KinkGridEditor, KinkWizard, useKinkTaxonomy) — so an
-- empty result is evidence of absence here, not a broken search.
--
-- On the sense categories its content is not merely unused, it is wrong.
-- Machine translation took queer slang literally and produced, on prod:
--
--     Stud          -> es "Estudio"                 (a studio)
--     Ussy          -> es "Vagina"
--     Trade         -> es "Trueque"                 (barter)
--     Cruising      -> fr "Croisière"               (a boat cruise)
--     Missing Stair -> es "Escalera que falta"      (an absent staircase)
--     Backshot      -> es "Disparo por detrás"      (a gunshot from behind)
--     Teddybear     -> es "Osito de peluche"        (the plush toy)
--     Double Glazing-> es "Doble acristalamiento"   (literal window glazing)
--
-- Every one destroys the term. `Cruising` is the sharpest: a French reader
-- would be told this glossary entry is about a cruise holiday.
--
-- Harm today is ZERO because nothing renders it. This removes the loaded gun
-- before someone wires up a reader and the glossary starts publishing Estudio
-- for Stud. It is deliberately a DELETE and not a rewrite: nothing here
-- generates replacement text. The companion change to translate-i18n-batch
-- stops the column being refilled for these categories.
--
-- SCOPE. Active rows only (1,735 of 2,599 that carry name_i18n in these
-- categories). The other 864 are deprecated or merged and are never rendered,
-- so they are not part of the risk this addresses; leaving them costs nothing
-- and keeps the diff to the surface that could actually publish.
--
-- description_i18n is NOT touched — those translations are of prose, which
-- survives translation, and unlike name_i18n they have real readers.
--
-- The category list mirrors isSenseCategory() in
-- supabase/functions/_shared/tag-style.ts. It is restated here only because SQL
-- cannot import TypeScript; the display-name half of SENSE_CATEGORY_KEYS is
-- copied verbatim. Venue Types, Destinations and Substances & Recovery are
-- deliberately ABSENT — for those the generic sense is the correct one.
--
-- No search churn: trg_search_documents_tag is column-scoped over
-- (name, short_description, description, category, slug, image_url,
-- entity_kind, merged_into_id, deprecated_at, status) and does not list
-- name_i18n, so this does not enqueue a single reindex.

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
    raise exception 'name_i18n purge: % sense-category rows still carry name translations', v_after;
  end if;

  -- description_i18n must be untouched. This is the assertion that makes the
  -- scoping claim above checkable rather than merely stated.
  if (select count(*) from public.unified_tags
       where description_i18n is not null and description_i18n <> '{}'::jsonb) <> v_desc then
    raise exception 'name_i18n purge: description_i18n moved (% -> %), which this must never touch',
      v_desc,
      (select count(*) from public.unified_tags
        where description_i18n is not null and description_i18n <> '{}'::jsonb);
  end if;

  raise notice 'name_i18n purge: cleared % sense-category rows, description_i18n unchanged at %',
    v_before, v_desc;
end $$;
