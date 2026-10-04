-- 629 tag synonyms were approved and inert. Activate the 593 that are safe.
--
-- THE WORKER READS `status='active'` ONLY (workers/search-proxy/src/pgSynonyms.ts
-- fetches `search_synonyms?...&status=eq.active`). Measured on prod: 629 rows at
-- 'approved' against 105 at 'active'. None of the 629 had ever reached a query.
--
-- 'approved' IS NOT A HUMAN DECISION HERE, which is the thing that makes this
-- safe to do in bulk. `approved_by` and `approved_at` are NULL on all 629: the
-- rows are written in that state by the alias bridge trigger
-- (20260429100000 / 20260910151200), whose own comment says
--
--     "Approved synonyms must be explicitly activated by an admin before they
--      reach Meilisearch."
--
-- Meilisearch was decommissioned in 2026-06. The gate itself is still sound and
-- the admin UI still implements it (`SynonymsTab.tsx` posts {status}), so this
-- migration does NOT remove the gate or change the trigger — it works the
-- backlog the gate accumulated, which nobody was ever going to clear 629 rows
-- at a time through a per-row UI.
--
-- WHAT A SYNONYM ROW GRANTS, AND WHAT IT DOES NOT. Query expansion, and nothing
-- else: `run_tag_assignment_reconcile` builds auto-tagging from
-- `unified_tags.name/slug` and `tag_aliases.alias_name` filtered on
-- review_status, and does not read this table (established by 20260829124635
-- against the live function body). So activating a row cannot tag anything.
-- 594 of the 629 are additionally bridged from an alias that is ALREADY
-- `review_status='approved'`, i.e. already a live auto-tagging rule — a
-- strictly stronger commitment than the search expansion added here.
--
-- ── THE REFUSALS ────────────────────────────────────────────────────────────
-- The hazard is the ORDINARY-WORD one 20260829124635 names: "query expansion
-- has the identical ordinary-word hazard as auto-tagging, aimed at the reader
-- rather than the row". It is sharper here than that migration had to deal
-- with, because `expandWithPgSynonyms` matches on a BARE SUBSTRING
-- (`lcQuery.includes(t)`), so a short term fires inside longer words.
--
-- `pep` IS A SAFETY REFUSAL, NOT A TASTE ONE, and it is why this could not be a
-- blanket UPDATE. The row is `pep -> amphetamine` (German slang). On THIS
-- platform PEP is post-exposure prophylaxis — the 72-hour HIV emergency course
-- — and the corpus carries live `PEP` (usage 6), `PEP (Post-Exposure
-- Prophylaxis)` and `Post-Exposure Prophylaxis` tags. Activating it would
-- expand a search for HIV emergency care with "amphetamine".
--
-- `speed`, `acid`, `grass` (and `ice`, `gras`, `koks`, `pilze`, `schnee`, which
-- have no row here) are the set 20260829124635 explicitly refused; they are
-- listed so a future row cannot quietly acquire what that migration denied.
-- THOSE FIVE CURRENTLY MATCH NOTHING — they are forward guards, not coverage,
-- and the postcondition below counts matched refusals separately so the two
-- can never be confused.
--
-- The rest are ordinary English words (`blow`, `coke`, `hash`, `crack`,
-- `smack`, `spice`, `crystal`, `bias`, `doc`, `rock`, `jazz`, `tech`, `arts`,
-- `mixed`, `upper(s)`, `downer(s)`, `scat`, `slam`, `period`, `nexus`, `k2`),
-- personal names (`molly`, `sally`, `tina`), and `rack`, which the substring
-- matcher fires inside "track" and "crack". `facial` is refused for a different
-- reason: it maps to `Oral` while a sibling row maps `facials` to `Facial`, so
-- one of the two is wrong and activating a wrong mapping is worse than leaving
-- it inert.
--
-- Refusing is cheap — the row stays exactly as it is today and remains
-- activatable from the admin UI — so under-reaching is the correct error.
--
-- RESIDUE, STATED RATHER THAN IMPLIED AWAY: the substring matcher means every
-- short term is somewhat promiscuous, including ones activated here and the 105
-- already active. This migration does not fix that; it declines to make it
-- materially worse. The 40-term expansion cap in `expandWithPgSynonyms` is what
-- bounds the blast radius.

DO $activate$
DECLARE
  v_refused  CONSTANT text[] := ARRAY[
    -- safety collision on this platform
    'pep',
    -- refused by 20260829124635. speed/acid/grass match real rows here; the
    -- other FIVE match nothing today and are forward guards only.
    'speed','acid','grass',
    'ice','gras','koks','pilze','schnee',
    -- ordinary English words
    'blow','coke','hash','crack','smack','spice','crystal','bias','doc','rock',
    'jazz','tech','arts','mixed','upper','uppers','downer','downers','scat',
    'slam','k2','nexus','period','rack',
    -- personal names
    'molly','sally','tina',
    -- contradicts a sibling row (`facials` -> Facial); one of the two is wrong
    'facial'
  ];
  v_activated integer;
BEGIN
  UPDATE public.search_synonyms s
  SET status = 'active'
  FROM public.unified_tags t
  WHERE s.tag_id = t.id
    AND s.status = 'approved'
    AND t.status = 'active'                      -- never activate a synonym for a dead tag
    AND lower(s.terms[1]) <> ALL (v_refused);
  GET DIAGNOSTICS v_activated = ROW_COUNT;

  RAISE NOTICE 'activated % tag synonyms', v_activated;
END $activate$;

-- ── Postcondition ───────────────────────────────────────────────────────────
-- AN ABSOLUTE FLOOR, NOT "NOTHING IS LEFT UNDONE". 20261007160400 asserted that
-- no row from its list was still 'approved' and passed while doing nothing,
-- because with zero matching rows that is trivially true. An assertion phrased
-- as an absence cannot tell success from an empty set, so this one counts up.
DO $verify$
DECLARE
  v_active        integer;
  v_refused_rows  integer;
  v_leaked        text;
BEGIN
  SELECT count(*) INTO v_active FROM public.search_synonyms WHERE status = 'active';
  IF v_active < 600 THEN
    RAISE EXCEPTION 'expected 600+ active synonyms after activation, found %', v_active;
  END IF;

  -- The refusals must still be inert. This is the half that protects a reader
  -- searching "PEP" from being handed amphetamine content.
  SELECT string_agg(DISTINCT lower(terms[1]), ', ' ORDER BY lower(terms[1]))
    INTO v_leaked
  FROM public.search_synonyms
  WHERE status = 'active'
    AND lower(terms[1]) = ANY (ARRAY[
      'pep','speed','acid','grass','ice','gras','koks','pilze','schnee',
      'blow','coke','hash','crack','smack','spice','crystal','bias','doc','rock',
      'jazz','tech','arts','mixed','upper','uppers','downer','downers','scat',
      'slam','k2','nexus','period','rack','molly','sally','tina','facial']);
  IF v_leaked IS NOT NULL THEN
    RAISE EXCEPTION 'refused ordinary-word synonyms reached active: %', v_leaked;
  END IF;

  -- And the refusal list must still be MATCHING something, or it has quietly
  -- become decoration: if the vocabulary is renamed out from under it, the
  -- check above keeps passing while protecting nothing.
  SELECT count(*) INTO v_refused_rows
  FROM public.search_synonyms
  WHERE status = 'approved'
    AND lower(terms[1]) = ANY (ARRAY[
      'pep','speed','acid','grass','blow','coke','hash','crack','smack','spice',
      'crystal','bias','doc','rock','jazz','tech','arts','mixed','upper','uppers',
      'downer','downers','scat','slam','k2','nexus','period','rack','molly',
      'sally','tina','facial']);
  IF v_refused_rows < 25 THEN
    RAISE EXCEPTION 'only % refused rows remain approved — the refusal list has stopped matching', v_refused_rows;
  END IF;

  RAISE NOTICE 'search synonyms: % active, % refused rows held back', v_active, v_refused_rows;
END $verify$;
