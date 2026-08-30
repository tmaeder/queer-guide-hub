-- Let a tag cite the clinical guidance it is derived from.
--
-- Fourth and last of the UCSF pass. The three preceding migrations rewrote,
-- revived or created roughly fifty trans-health tags from a named source, and
-- there was no way to say so to the reader.
--
-- `tag_sources` already stores the citation — that is what 20260906100000 built for
-- legal instruments. What it would not do is PUBLISH one:
--
--   CHECK tag_sources_public_requires_citation
--     (NOT is_public) OR (official_title IS NOT NULL AND source_url IS NOT NULL
--                         AND jurisdiction IS NOT NULL
--                         AND source_type IN ('statute','treaty','case_law',
--                                             'constitution','resolution'))
--
-- so a clinical citation could only ever be stored as `editorial`, `is_public`
-- false — provenance in the database, invisible on the page. That constraint is
-- correct in spirit: it exists so a wikipedia backfill row can never be flipped
-- public and rendered as though it were law. The fix is to add a second, equally
-- strict branch rather than to loosen the first one.
--
-- WHY `jurisdiction` IS NOT REQUIRED OF THE NEW BRANCH. It is required of a legal
-- citation because a statute without a jurisdiction is not a claim about anything —
-- and `tag_sources_jurisdiction_shape` constrains it to ISO-3166-2 or 'INT'.
-- A clinical guideline has a publisher and a publication year, not a jurisdiction:
-- UCSF's guidelines are used well outside California and stamping them 'US' would
-- assert a scope the document does not claim. The new branch therefore demands
-- `adopted_year` instead — which for guidance is the edition year, and is the fact
-- a reader most needs, because clinical guidance goes stale.
--
-- THE LEGAL ARRAY STAYS FIRST IN THE CHECK BODY on purpose:
-- `src/hooks/__tests__/tagSourceVocabulary.test.ts` reads the FIRST `ARRAY[...]`
-- after the constraint name and asserts it equals LEGAL_SOURCE_TYPES exactly. That
-- assertion is still the one worth making — only a legal type may be published as
-- law — so the clinical branch is added after it rather than merged into it. That
-- test is also repointed at THIS file in the same commit: it pins a migration by
-- filename, so extending a CHECK elsewhere would leave it asserting against a
-- superseded definition and passing for the wrong reason.
--
-- EVERY URL IN THIS FILE WAS FETCHED AND CHECKED, not copied from a table of
-- contents: all 17 chapters returned HTTP 200, and `official_title` is the H1 the
-- page actually carries, so "Masculinizing hormone therapy" is stored under its
-- real title "Overview of masculinizing hormone therapy" and the path is
-- /guidelines/masculinizing-therapy, which is not the slug the TOC label suggests.
--
-- NOTE FOR scripts/check-legal-citation-links.mjs: transcare.ucsf.edu sits behind a
-- Cloudflare interstitial and answers a non-browser client with 403. Under that
-- script's existing rule a 403 is UNVERIFIABLE, not dead, which is the correct
-- outcome here — these were verified with a real browser. Do not "fix" a 403 from
-- this host by deleting the citation.
--
-- `wpath-standards-of-care` cites WPATH itself rather than UCSF, because the tag is
-- about that document. Citing UCSF for it would be citing a source that merely
-- mentions the thing.

-- ── Vocabulary ─────────────────────────────────────────────────────────────
-- `clinical_guideline` is the one addition: a named, dated, published clinical
-- document a tag's definition is derived from. Not a research paper (that stays
-- `editorial`), and not law.
--
-- NO COMMENT MAY GO INSIDE THE ARRAY[...] BELOW. tagSourceVocabulary.test.ts pulls
-- the allowed values out with /'([^']+)'/g, so an apostrophe in a comment between
-- the brackets — "a tag's definition" — pairs with the next quote and parses as a
-- vocabulary value. That is exactly how the first draft of this file failed.
ALTER TABLE public.tag_sources DROP CONSTRAINT IF EXISTS tag_sources_source_type_check;
ALTER TABLE public.tag_sources ADD CONSTRAINT tag_sources_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'wikipedia', 'wikidata', 'editorial', 'llm', 'manual',
    'statute', 'treaty', 'case_law', 'constitution', 'resolution',
    'clinical_guideline'
  ]));

ALTER TABLE public.tag_sources DROP CONSTRAINT IF EXISTS tag_sources_public_requires_citation;
ALTER TABLE public.tag_sources ADD CONSTRAINT tag_sources_public_requires_citation
  CHECK (
    (NOT is_public)
    OR (
      official_title IS NOT NULL AND source_url IS NOT NULL AND jurisdiction IS NOT NULL
      AND source_type = ANY (ARRAY['statute','treaty','case_law','constitution','resolution'])
    )
    OR (
      official_title IS NOT NULL AND source_url IS NOT NULL AND adopted_year IS NOT NULL
      AND source_type = ANY (ARRAY['clinical_guideline'])
    )
  );

COMMENT ON CONSTRAINT tag_sources_public_requires_citation ON public.tag_sources IS
  'A published citation must be complete for its kind: legal instruments need a jurisdiction, clinical guidance needs an edition year. Provenance rows (wikipedia/wikidata/editorial/llm/manual) can never be published.';

-- ── Citations ──────────────────────────────────────────────────────────────
select set_config('app.actor', 'admin:ucsf-transcare-20260829', true);

do $mig$
declare
  r         record;
  v_tag_id  uuid;
  v_n       int := 0;
  v_missing text[] := '{}';
begin
  for r in
    select * from (values
      -- tag slug, chapter path, official title (the page's own H1)
      ('tucking',                        'binding-packing-and-tucking',  'Binding, packing, and tucking'),
      ('packing',                        'binding-packing-and-tucking',  'Binding, packing, and tucking'),
      ('binding',                        'binding-packing-and-tucking',  'Binding, packing, and tucking'),
      ('gaff',                           'binding-packing-and-tucking',  'Binding, packing, and tucking'),
      ('hair-removal',                   'hair-removal',                 'Hair removal'),
      ('electrolysis-laser-hair-removal','hair-removal',                 'Hair removal'),
      ('vaginoplasty',                   'vaginoplasty',                 'Vaginoplasty procedures, complications and aftercare'),
      ('phalloplasty',                   'phalloplasty',                 'Phalloplasty and metoidioplasty - overview and postoperative considerations'),
      ('metoidioplasty',                 'phalloplasty',                 'Phalloplasty and metoidioplasty - overview and postoperative considerations'),
      ('orchiectomy',                    'overview',                     'Overview of gender-affirming treatments and procedures'),
      ('bottom-surgery',                 'overview',                     'Overview of gender-affirming treatments and procedures'),
      ('medical-transition',             'overview',                     'Overview of gender-affirming treatments and procedures'),
      ('hysterectomy',                   'hysterectomy',                 'Hysterectomy'),
      -- No `chest-reconstruction-surgery` row: it stays deprecated as a duplicate
      -- of `top-surgery` (see 20261013110100), and a published citation on a
      -- deprecated tag renders nowhere.
      ('top-surgery',                    'chest-surgery-masculinizing',  'Postoperative care and common issues after masculinizing chest surgery'),
      ('silicone-injection',             'silicone-filler',              'Free silicone and other filler use'),
      ('bone-health',                    'bone-health-and-osteoporosis', 'Bone health and osteoporosis'),
      ('voice-therapy',                  'vocal-health',                 'Transgender voice and communication - vocal health and considerations'),
      ('feminizing-hormone-therapy',     'feminizing-hormone-therapy',   'Overview of feminizing hormone therapy'),
      ('estrogen-therapy',               'feminizing-hormone-therapy',   'Overview of feminizing hormone therapy'),
      ('anti-androgen-therapy',          'feminizing-hormone-therapy',   'Overview of feminizing hormone therapy'),
      ('spironolactone',                 'feminizing-hormone-therapy',   'Overview of feminizing hormone therapy'),
      ('masculinizing-hormone-therapy',  'masculinizing-therapy',        'Overview of masculinizing hormone therapy'),
      ('transdermal-testosterone',       'masculinizing-therapy',        'Overview of masculinizing hormone therapy'),
      ('testosterone-therapy',           'masculinizing-therapy',        'Overview of masculinizing hormone therapy'),
      ('testosterone-enanthate',         'masculinizing-therapy',        'Overview of masculinizing hormone therapy'),
      ('gatekeeping',                    'initiating-hormone-therapy',   'Initiating hormone therapy'),
      ('informed-consent-model',         'initiating-hormone-therapy',   'Initiating hormone therapy'),
      ('cervical-cancer-screening',      'cervical-cancer',              'Screening for cervical cancer in transgender men'),
      ('gender-affirming-care-coverage', 'insurance',                    'Health insurance coverage issues for transgender people in the United States'),
      ('legal-name-change',              'legal',                        'Legal and identity documents'),
      ('legal-transition',               'legal',                        'Legal and identity documents'),
      ('gender-marker',                  'legal',                        'Legal and identity documents'),
      ('gender-marker-change',           'legal',                        'Legal and identity documents'),
      ('trans-competent-provider',       'clinic-environment',           'Creating a safe and welcoming clinic environment'),
      ('transgender-healthcare-access',  'clinic-environment',           'Creating a safe and welcoming clinic environment')
    ) as t(slug, chapter, title)
  loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    if v_tag_id is null then
      v_missing := v_missing || r.slug;
      continue;
    end if;

    -- Delete-then-insert, because `tag_sources` carries NO unique index on
    -- (tag_id, source_url) — an ON CONFLICT clause here would match nothing and
    -- silently stack a second identical citation onto the rail card every time
    -- this migration is applied.
    delete from public.tag_sources
     where tag_id = v_tag_id
       and source_type = 'clinical_guideline'
       and source_url = 'https://transcare.ucsf.edu/guidelines/' || r.chapter;

    insert into public.tag_sources (
      tag_id, source_type, source_url, official_title, adopted_year,
      claim_summary, fetched_at, verified_at, is_public
    ) values (
      v_tag_id, 'clinical_guideline',
      'https://transcare.ucsf.edu/guidelines/' || r.chapter,
      'UCSF Gender Affirming Health Program — ' || r.title,
      2016,
      'Guidelines for the Primary and Gender-Affirming Care of Transgender and Gender Nonbinary People, 2nd edition (2016). Chapter: ' || r.title || '.',
      now(), now(), true
    );

    v_n := v_n + 1;
  end loop;

  -- WPATH cites itself.
  select id into v_tag_id from public.unified_tags where slug = 'wpath-standards-of-care';
  if v_tag_id is not null then
    delete from public.tag_sources
     where tag_id = v_tag_id and source_type = 'clinical_guideline';
    insert into public.tag_sources (
      tag_id, source_type, source_url, official_title, adopted_year,
      claim_summary, fetched_at, verified_at, is_public
    ) values (
      v_tag_id, 'clinical_guideline', 'https://www.wpath.org/soc8',
      'WPATH Standards of Care for the Health of Transgender and Gender Diverse People, Version 8',
      2022,
      'The 8th edition of the WPATH Standards of Care, published 2022, superseding SOC 7 (2011).',
      now(), now(), true
    );
    v_n := v_n + 1;
  end if;

  if array_length(v_missing, 1) > 0 then
    raise notice 'ucsf citations: % slug(s) not found, skipped: %',
      array_length(v_missing, 1), array_to_string(v_missing, ', ');
  end if;
  raise notice 'ucsf citations: % attached', v_n;
end
$mig$;

do $verify$
declare v_n int; v_bad text;
begin
  -- The new type is publishable, which is the entire point of the CHECK change.
  select count(*) into v_n from public.tag_sources
   where source_type = 'clinical_guideline' and is_public;
  if v_n < 30 then
    raise exception 'clinical citations: expected 30+ published rows, found %', v_n;
  end if;

  -- Every published clinical row is complete for its kind.
  select count(*) into v_n from public.tag_sources
   where source_type = 'clinical_guideline' and is_public
     and (official_title is null or source_url is null or adopted_year is null);
  if v_n <> 0 then
    raise exception 'clinical citations: % incomplete published row(s)', v_n;
  end if;

  -- Exactly one citation per (tag, chapter): the re-run guard above must hold, or
  -- a second application of this migration doubles every rail card.
  select string_agg(slug, ', ') into v_bad from (
    select t.slug from public.tag_sources s
      join public.unified_tags t on t.id = s.tag_id
     where s.source_type = 'clinical_guideline'
     group by t.slug, s.source_url having count(*) > 1
  ) d;
  if v_bad is not null then
    raise exception 'clinical citations: duplicate rows for: %', v_bad;
  end if;

  -- The legal branch must be unchanged: a provenance row still cannot be published.
  begin
    insert into public.tag_sources (tag_id, source_type, source_url, official_title, is_public)
    select id, 'wikipedia', 'https://example.org', 'nope', true
      from public.unified_tags where slug = 'transgender' limit 1;
    raise exception 'clinical citations: a wikipedia row was publishable — the CHECK was loosened';
  exception
    when check_violation then null;  -- expected
  end;

  -- And a clinical row without a year must still be refused.
  begin
    insert into public.tag_sources (tag_id, source_type, source_url, official_title, is_public)
    select id, 'clinical_guideline', 'https://example.org', 'no year', true
      from public.unified_tags where slug = 'transgender' limit 1;
    raise exception 'clinical citations: a yearless clinical row was publishable';
  exception
    when check_violation then null;  -- expected
  end;

  -- The headline repairs each carry their source.
  select string_agg(slug, ', ') into v_bad from public.unified_tags t
   where t.slug in ('tucking','packing','binding','gaff','silicone-injection','vaginoplasty')
     and not exists (select 1 from public.tag_sources s
                      where s.tag_id = t.id and s.source_type = 'clinical_guideline' and s.is_public);
  if v_bad is not null then
    raise exception 'clinical citations: missing on: %', v_bad;
  end if;
end
$verify$;
