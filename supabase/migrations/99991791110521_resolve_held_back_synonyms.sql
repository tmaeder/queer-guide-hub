-- Resolve the 36 synonyms held back by 99991791096878: archive 8, activate 28.
--
-- That migration activated 593 of 629 and left 36 in 'approved'. Left there they
-- are limbo — a queue that reads as pending work and never will be, which is the
-- shape this codebase keeps finding and closing. Every one is decided here.
--
-- MOST OF THEM WERE HELD BACK FOR A REASON THE WORKER FIX REMOVES. The expander
-- matched on a BARE SUBSTRING (`lcQuery.includes(t)`), so a short term fired
-- inside any longer word. Measured false fires, all live until the companion
-- change to workers/search-proxy/src/pgSynonyms.ts:
--
--     rack  <- "bracket racing"        doc   <- "doctor appointment"
--     arts  <- "parts for my bike"     scat  <- "scattered showers"
--     upper <- "supper club"           crack <- "cracker barrel"
--     slam  <- "islam and lgbtq rights"
--
-- `slam` inside "islam" is the one that settles it: a question about Islam and
-- LGBTQ rights had "safer injecting" appended to its embedding. With word
-- matching those terms are ordinary vocabulary again, so they activate here.
--
-- A STRICT WORD BOUNDARY WOULD HAVE BEEN THE WRONG FIX and the threshold in
-- `matchesTerm` is measured rather than chosen: German compounds are real in
-- this corpus ("lachgaskapseln" -> `lachgas`, "mischkonsumrisiken" ->
-- `mischkonsum`) and 3 of 4 compound cases regress under a strict boundary. A
-- term may also match as a word PREFIX at 6+ characters — above every hazard
-- stem above (longest is `crack`, 5) and below every compound stem (shortest is
-- `lachgas`, 7).
--
-- ── THE EIGHT THAT STAY OFF ─────────────────────────────────────────────────
-- Four are dead rows that can never do anything useful:
--   * `packer`      -> tag `Packers` is MERGED. Nothing is lost: `packers ->
--                      pack(er)` is already active against the live tag.
--   * `projectors`  -> tag `Projector` is DEPRECATED.
--   * `zz merge order probe b` (x2) -> test artifacts, no tag at all.
--
-- Four are decisions no matcher can rescue:
--   * `pep -> amphetamine`. THE SAFETY ONE. On this platform PEP is
--     post-exposure prophylaxis, the 72-hour HIV emergency course, and the
--     corpus carries live PEP / PEP (Post-Exposure Prophylaxis) /
--     Post-Exposure Prophylaxis tags. Locale scoping does not help either:
--     German PEP is Postexpositionsprophylaxe, the same clinical term. There is
--     no scope under which this row is safe, so it is archived rather than held.
--   * `blow -> cocaine`. "blow job" is a live competing query here.
--   * `doc -> DOM / DOI / DOB / DOC`. As a whole word "doc" reads as doctor or
--     document, and this platform has health content. The matcher fix removes
--     the "doctor" substring fire; it cannot remove the exact-word collision.
--   * `facial -> oral`. Contradicts its own live sibling `facials -> facial`
--     (tag `Facial`). One of the two is wrong, and a reader typing "facial"
--     should not be steered to oral. Archiving loses nothing: the `Facial` tag
--     matches that query by name on the keyword arm.
--
-- ARCHIVED, NOT DELETED. `archived` is a real state in the status CHECK and is
-- reversible from the admin UI, so this records a decision instead of destroying
-- a row — and it empties the queue, which 'approved' would not.
--
-- ORDERING: this ships with the matcher fix in one PR, but `db push` and the
-- worker deploy are separate workflows on the same push, so there is a window of
-- minutes where the 28 are active under the old substring matcher. The cost is
-- query-expansion noise on a handful of terms, bounded by the 40-term cap in
-- `expandWithPgSynonyms` — stated here rather than left for someone to discover.

DO $resolve$
DECLARE
  v_archived  integer;
  v_activated integer;
BEGIN
  -- 1. Dead rows: the tag is merged, deprecated, or was never real.
  UPDATE public.search_synonyms s
  SET status = 'archived',
      archived_at = now(),
      notes = coalesce(s.notes || ' | ', '') || 'archived 2026-10-04: target tag is not active'
  WHERE s.status = 'approved'
    AND (
      s.tag_id IS NULL
      OR EXISTS (SELECT 1 FROM public.unified_tags t
                 WHERE t.id = s.tag_id AND t.status <> 'active')
    );
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  -- 2. Decisions no matcher can rescue. Each reason is on the row, so the
  --    admin UI shows WHY rather than just that someone said no.
  UPDATE public.search_synonyms s
  SET status = 'archived',
      archived_at = now(),
      notes = coalesce(s.notes || ' | ', '') || 'archived 2026-10-04: ' || x.reason
  FROM (VALUES
    ('pep',    'PEP is post-exposure prophylaxis on this platform (and Postexpositionsprophylaxe in German); no scope makes amphetamine safe here'),
    ('blow',   'collides with "blow job", a live query on this platform'),
    ('doc',    'as a whole word reads as doctor or document; platform has health content'),
    ('facial', 'contradicts the live sibling facials -> Facial; the Facial tag already matches this query by name')
  ) AS x(term, reason)
  WHERE s.status = 'approved' AND lower(s.terms[1]) = x.term;
  GET DIAGNOSTICS v_activated = ROW_COUNT;
  v_archived := v_archived + v_activated;

  -- 3. Everything still approved is now safe under word matching.
  UPDATE public.search_synonyms SET status = 'active' WHERE status = 'approved';
  GET DIAGNOSTICS v_activated = ROW_COUNT;

  RAISE NOTICE 'held-back synonyms resolved: % archived, % activated', v_archived, v_activated;
END $resolve$;

-- ── Postcondition ───────────────────────────────────────────────────────────
-- Counts up, never "nothing is left undone": an absence assertion passes
-- trivially against an empty set, which is how 20261007160400 shipped a no-op.
DO $verify$
DECLARE
  v_approved integer;
  v_active   integer;
  v_leaked   text;
BEGIN
  SELECT count(*) INTO v_approved FROM public.search_synonyms WHERE status = 'approved';
  IF v_approved <> 0 THEN
    RAISE EXCEPTION 'the held-back queue is not empty: % rows still approved', v_approved;
  END IF;

  SELECT count(*) INTO v_active FROM public.search_synonyms WHERE status = 'active';
  IF v_active < 700 THEN
    RAISE EXCEPTION 'expected 700+ active synonyms, found %', v_active;
  END IF;

  -- The four judgement archives must NOT have slipped into active. `pep` is the
  -- one that matters: it is the HIV post-exposure-prophylaxis collision.
  SELECT string_agg(DISTINCT lower(terms[1]), ', ' ORDER BY lower(terms[1]))
    INTO v_leaked
  FROM public.search_synonyms
  WHERE status = 'active' AND lower(terms[1]) = ANY (ARRAY['pep','blow','doc','facial']);
  IF v_leaked IS NOT NULL THEN
    RAISE EXCEPTION 'a refused synonym reached active: %', v_leaked;
  END IF;

  -- And they must actually be archived, not merely absent from active — a
  -- deleted row would satisfy the check above while losing the decision.
  IF (SELECT count(*) FROM public.search_synonyms
      WHERE status = 'archived'
        AND lower(terms[1]) = ANY (ARRAY['pep','blow','doc','facial'])) < 4 THEN
    RAISE EXCEPTION 'the four judgement refusals are not all archived';
  END IF;

  RAISE NOTICE 'synonyms resolved: 0 approved, % active', v_active;
END $verify$;
