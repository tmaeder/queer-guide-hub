-- Clear the German that is still on PUBLIC personality pages after the v2 backfill.
--
-- The backfill left 45 rows in the `fallback` tier — values the vocabulary could
-- not resolve, kept verbatim rather than guessed at. Most are drafts and belong in
-- profession_review_queue, which exists to be drained by a human. Eight were
-- PUBLIC and German, which is the visible half of the original complaint, so they
-- get translated here.
--
-- HOW THESE GOT GERMAN IS NOT WHAT IT LOOKS LIKE. Their preserved v1 snapshots say
-- `politician`, `nurse`, `writer`, `interior designer` — English. The column was
-- overwritten with German LATER (updated_at 2026-08-03…08-21, months after the
-- June v1 pass), so a German-labelled importer is still writing over English
-- values. The v2 backfill did not translate these into German; it faithfully kept
-- what it found, and the snapshot is what makes the regression legible at all.
--
-- WHY NOT JUST RESTORE THE SNAPSHOT. It was measured on all four candidates and is
-- wrong for half of them: Stephen Whittle is a Professor of Equalities Law, so
-- `Rechtswissenschaftler` is MORE accurate than his snapshot's `writer`, and Gery
-- Keszler's `Visagist` is a real make-up-artist career the vocabulary already
-- covers, where the snapshot only says `LGBTQ rights activist`. Restoring a raw
-- value is not a repair when the current value is better information in the wrong
-- language — the task is to translate it, not to roll it back.
--
-- Monarch/aristocratic titles ("König von England", "Römischer Kaiser",
-- "Erzherzog von Österreich" — 9 rows, all drafts) are deliberately NOT handled.
-- Tier 1 matches whole strings and tier 2 splits only on ; , / & und and, so a
-- "<title> von <place>" phrase cannot resolve without space-token matching, and
-- that would also collapse "Ice Dancer" to Dancer and "Freelance Journalist" to
-- Journalist across ~160 English rows — a much larger behaviour change than this
-- ticket, made silently. They stay in the review queue where they are visible.

-- New canonical terms. Nurse is a genuine gap (3 public rows, and `Krankenpfleger`
-- is the single most common unresolved value); the rest already exist.
INSERT INTO public.professions (slug, name, category, icon_name, aliases, sort_order, is_active)
VALUES
  ('nurse', 'Nurse', 'Health', 'stethoscope',
   ARRAY['nurse','krankenpfleger','krankenpflegerin','krankenschwester','pfleger',
         'pflegerin','krankenpflegender','altenpfleger','altenpflegerin'],
   45, true)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, category = EXCLUDED.category,
      icon_name = EXCLUDED.icon_name, aliases = EXCLUDED.aliases,
      is_active = EXCLUDED.is_active;

-- German spellings for terms that already have a canonical row. Appended, never
-- replaced: 20260917100100 put 21 alias lists here and a bare assignment would
-- drop them.
WITH add(slug, extra) AS (VALUES
  ('make-up-artist', ARRAY['visagist','visagistin','maskenbildner','maskenbildnerin']),
  ('lawyer',         ARRAY['rechtswissenschaftler','rechtswissenschaftlerin',
                           'jurist','juristin','rechtsgelehrter']),
  ('researcher',     ARRAY['sexualforscher','sexualforscherin','forscher','forscherin',
                           'neurobiologe','neurobiologin','wissenschaftler','wissenschaftlerin']),
  ('artist',         ARRAY['manga-künstler','manga-kuenstler','manga-kunstler','mangaka']),
  ('architect',      ARRAY['innenarchitekt','innenarchitektin',
                           'innenarchitekt-persönlichkeit','innenarchitekt-persoenlichkeit']),
  ('politician',     ARRAY['bürgermeister','buergermeister','bürgermeisterin',
                           'bürgermeister von houston'])
)
UPDATE public.professions p
   SET aliases = ARRAY(SELECT DISTINCT a FROM unnest(p.aliases || add.extra) a ORDER BY a)
  FROM add
 WHERE p.slug = add.slug;

-- Re-open just the fallback rows so the new aliases are applied. Scoped by match
-- tier, not blanket: a row that already resolved to the vocabulary must not be
-- re-derived, and re-opening everything would repeat the whole 12k-row pass.
UPDATE public.personalities
   SET enrichment_status = jsonb_set(enrichment_status, '{profession,version}', '"v1"'::jsonb)
 WHERE enrichment_status->'profession'->>'match' = 'fallback'
   AND enrichment_status->'profession'->>'version' = 'v2';

DO $$
DECLARE r record; v_guard int := 0;
BEGIN
  LOOP
    SELECT * INTO r FROM public.run_profession_normalize_backfill(300);
    EXIT WHEN r.processed = 0;
    v_guard := v_guard + 1;
    IF v_guard > 20 THEN
      RAISE EXCEPTION 'fallback re-normalize did not converge after % batches', v_guard;
    END IF;
  END LOOP;

  -- The point of the migration: nothing German left on a public page.
  SELECT count(*) INTO v_guard
    FROM public.personalities
   WHERE visibility = 'public'
     AND profession ~ '[äöüßÄÖÜ]';
  IF v_guard > 0 THEN
    RAISE WARNING 'still % public personalities with an umlaut profession', v_guard;
  END IF;
END $$;
