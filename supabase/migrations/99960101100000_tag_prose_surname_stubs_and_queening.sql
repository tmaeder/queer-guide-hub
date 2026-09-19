-- Glossary prose repair: the 2026-08-30 flip residue, and the surname-stub class
-- it led to.
--
-- SCOPE, and why it is wider than the cohort that produced it.
--
-- 99940101100000 cleared 68 build notes and flipped 176 rows through the
-- thin-page gate; 23 of those 176 stayed indexable because they carry a real
-- description, and an indexable row with a real description is not prima facie
-- wrong. All 23 were read by hand. TWENTY-ONE are genuinely good authored
-- house-register prose and are correctly indexable -- sober, social-drinking,
-- fucking-machine, spreader-bar, after-scene-drop, cuttlefish-method,
-- dick-on-a-stick, docking, e-stim-machine, face-fucking, fucklicking,
-- meeting-for-the-first-time, mixed-wrestling, quacking, safe-call,
-- sexual-positions, throat-fucking, tit-fucking, trauma-awareness, vetting,
-- white-knight. Nothing here touches them, and the verify block asserts four of
-- them survive intact -- a sweep that took everything would satisfy "the defect
-- is gone" just as well as a repair does.
--
-- TWO were real defects. One of them had six siblings OUTSIDE the cohort, found
-- by asking the corpus for the shape rather than trusting the row. Repairing one
-- of seven identical rows would have left six surname lists published, so the
-- selection was widened before the disposition was decided.
--
--
-- (1) `queening` -- the SUMMARY alone is a different subject.
--
-- description:       "Sitting on a partner's face for oral sex, with the seated
--                     partner controlling position."
-- long_description:  "Queening is facesitting: ..."  (correct, careful, complete)
-- short_description: "Drag culture performance art"   <-- the defect
--
-- Both prose fields are right; the one-line summary names a different thing.
-- That is round eight's half-repaired class seen from the summary side, and it
-- matters more than a page blemish because of the SEARCH INDEXER's precedence:
-- `search_documents_index_tags` emits `coalesce(t.short_description,
-- t.description)`, so the wrong-subject line is what site search returns even
-- though the page lead is correct. Verified live before writing this file --
-- search_documents.description for this row reads, in full, "Drag culture
-- performance art".
--
-- The drag sense is not missing from the glossary and this row is not a second
-- reading of it: `drag` (3,931 uses), `drag-queen` (101) and `drag-show` (72)
-- are all live, while this row's own description, body, category
-- (Practices & Play) and is_adult flag are unanimously facesitting. So the text
-- is misfiled, not a rival sense.
--
-- The summary is NULLED rather than rewritten, which is the strictest available
-- licence: the indexer's existing coalesce then falls through to the row's own
-- correct description, so the false claim is removed and NOTHING is authored.
-- NULL is the ordinary state here, not an anomaly -- 328 of 2,534 active
-- indexable rows carry no short_description. `description` and
-- `long_description` are not touched (the casting/watersports rule: repair only
-- the wrong FIELDS), and the verify block asserts both survive.
--
--
-- (2) The SURNAME-STUB class -- 8 active indexable rows, one cause.
--
-- `kerle` was the cohort's second defect: its entire prose is an English
-- Wikipedia surname disambiguation list ("Kerle is a surname. Notable people
-- with the surname include: Brian Kerle, Australian basketball player..."),
-- with short_description NULL and long_description empty, so the surname list
-- IS the whole page. Asking the corpus for that shape returned SEVEN more:
--
--   farber, kuenstler, lehrer, maler, sprecher, tanzer, zeichner
--
-- All eight are active, seo_indexable, human_reviewed=false, carry NO
-- wikidata_id and NO wikipedia_url, have short_description NULL and
-- long_description empty. One cause explains every one of them: they are GERMAN
-- OCCUPATION AND COMMON NOUNS that are also German surnames -- Kuenstler
-- (artist), Maler (painter), Taenzer (dancer), Zeichner (illustrator), Sprecher
-- (speaker), Lehrer (teacher), Faerber (dyer), Kerle (guys) -- resolved by a
-- NAME-ONLY lookup against English Wikipedia, which answers with a surname page.
-- This is the namesake chimera `_shared/tag-wiki-guard.ts` was later built to
-- seal at the producer, which does nothing for prose already written.
--
-- THE CATEGORIES CORROBORATE THE INTENDED SENSE AND THE PROSE CONTRADICTS IT:
-- kuenstler is filed Arts & Literature, tanzer Events & Parties, zeichner
-- Expression & Style. Three rows even state the German meaning in their own
-- first sentence -- "Kuenstler is a German word meaning 'artist'", "Maler is a
-- surname of German origin meaning 'painter'", "Tanzer or Taenzer is a surname;
-- Taenzer meaning 'dancer' in German" -- before pivoting to list unrelated
-- people. And kerle's three live assignments are all one recurring Berlin event,
-- "Kerle und Baeren-Stammtisch" at Sonntags-Club, i.e. the word arrived from an
-- event title, not from anyone defining a term.
--
-- TWO OF THESE WERE ALREADY KNOWN TO BE WRONG AND THE PROSE IS STILL LIVE.
-- CLAUDE.md records, of the retired tag prose judge's first live batch: "only
-- `maler` and `tanzer` (literal surname disambiguation lists) were genuinely
-- wrong-subject". All 18 rows of that batch were then restored byte-exact from
-- tag_change_log.before_data -- correctly, because the judge got 13 of 16
-- retractions wrong -- and the restore put these two back with everything else.
-- The corpus has known about them since; nothing removed them.
--
-- DISPOSITION: REMOVE THE FALSE CLAIM, MINT NO VOCABULARY. The description is
-- NULLED. Nothing is written in its place, because writing one means authoring
-- a glossary definition of "painter" or "teacher" -- German occupation nouns are
-- not queer vocabulary, and minting vocabulary to fill a hole left by a bad
-- lookup is the guess this whole class came from (the `queen` rule of
-- 51500101144000). Whether these should exist as tags AT ALL is a taxonomy
-- decision, NAMED here as deferred rather than taken quietly in a prose file.
--
-- seo_indexable is DELIBERATELY ABSENT from both SET clauses. The gate owns the
-- flag: `trg_tag_thin_page_gate` fires BEFORE UPDATE OF description, so nulling
-- the description makes tag_has_prose() false and the gate deindexes the row as
-- 'thin' by itself -- which is also the only reason value that
-- run_tag_thin_page_reindex will ever reverse, so the deindexing stays a door
-- rather than becoming one-way. Writing the column here would set a reason of
-- our own choosing and take that reversibility away. All eight carry a NULL
-- seo_deindex_reason today, so the gate is the one deciding and will stamp.
--
-- WHAT THIS DOES *NOT* CHANGE, checked rather than assumed: `deprecate_unused_tags`
-- selects exactly (status='active', human_reviewed=false, usage_count=0 from the
-- MATERIALIZED VIEW tag_usage_summary) and reads NO prose column, so nulling a
-- description neither arms nor disarms it. Seven of the eight already match that
-- tuple TODAY, before this file; that function has no cron and no registry row.
-- Nothing here stamps human_reviewed -- that flag is the documented escape hatch
-- for rows being deliberately revived, and asserting a human reviewed these
-- would be a false claim.
--
--
-- (3) The sentinel that exists for this was structurally blind to it.
--
-- `tag_prose_standard_signals().unresolved_disambiguation` reads 2 (bicon,
-- flamer) and counted NONE of these eight. Its regex is head-anchored on
-- "<name> may refer to:" -- correctly so, per its own comment, because a bare
-- "may refer to" matches pansexuality's perfectly good prose -- and a surname
-- stub names itself a different way. So the largest disambiguation-list class in
-- the corpus slipped past the check built to catch disambiguation lists.
--
-- A NEW KEY `surname_stub` is added rather than widening the existing one: the
-- two are different shapes with different regexes, and unresolved_disambiguation
-- stands at a deliberate, unrepairable 2 (a description cannot be evidence for
-- itself) while this class IS repairable and is driven to zero right here. So it
-- gates as a ZERO-INVARIANT and cannot be red on arrival. Both arms were
-- measured corpus-wide before being written: the union matches exactly these 8
-- rows and NOTHING else, so there are no false positives to trade away.
--
--
-- Actor: this tranche is MIXED, and each file in this series states which case
-- it is in so the next pass does not copy the wrong precedent. Probed live with
-- a REAL value change (a self-assignment changes no column, so a trigger gating
-- on a change never fires -- that probe was vacuous once before):
--   queening (human_reviewed=true)  -> REFUSED: "human_reviewed tag ... cannot
--                                      be modified by system:trigger"
--   kerle    (human_reviewed=false) -> ALLOWED
-- So the declaration is LOAD-BEARING for queening and attribution-only for the
-- eight stubs.
--
-- Prior values survive in tag_change_log.before_data, which is the only reason
-- any of this is reversible and is why content writes go through a declared actor.

select set_config('app.actor', 'migration:99960101100000_tag_prose_surname_stubs', true);

-- (1) queening: drop the misfiled summary. Content-guarded, so a human who fixes
--     it first keeps their work.
update public.unified_tags
   set short_description = null
 where slug = 'queening'
   and status = 'active'
   and btrim(short_description) = 'Drag culture performance art';

-- (2) the surname stubs. Guarded on the SHAPE rather than a frozen slug list, so
--     the file repairs what it can prove and reports anything else.
--
--     `short_description IS NULL AND long_description empty` is load-bearing, not
--     tidiness: it is what makes nulling safe. On a row that carried a real body,
--     nulling the lead would leave the body standing while tag_has_prose() went
--     false, deindexing a page that still has genuine content. Measured, all
--     eight have neither -- the stub is the entire page.
update public.unified_tags
   set description = null
 where status = 'active'
   and merged_into_id is null
   and short_description is null
   and coalesce(btrim(long_description, E' \t\n\r'), '') = ''
   and (
         description ~* 'Notable people with the (surname|given name|name)'
      or description ~* '^[^.!?]{0,80}\mis a surname\M'
       );

-- (3) close the sentinel's blind spot.
create or replace function public.tag_prose_standard_signals()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  with a as (
    select description as d
    from unified_tags
    where status = 'active'
      and description is not null
      and btrim(description, E' \t\n\r') <> ''
  )
  select jsonb_build_object(
    'probe_ok', true,
    'rows_scanned', count(*),
    -- a cap-length row that stops without a terminal mark has lost text
    'truncated_description', count(*) filter (
      where length(d) in (500, 1000, 2000)
        and d !~ '[.!?]["'')\]]?\s*$'),
    'stamp_as_definition', count(*) filter (
      where d ~* '^(updated )?[a-z]+ +[0-9]{1,2}, *[0-9]{4}'),
    -- ANCHORED, and the anchor is load-bearing: a bare "(may|could) refer to"
    -- also matches pansexuality's perfectly correct "Pansexual people may refer
    -- to themselves as gender-blind". A disambiguation list names itself at the
    -- start and opens a colon; ordinary prose does neither.
    'unresolved_disambiguation', count(*) filter (
      where d ~* '^[^.!?]{0,60}(may|could) refer to\s*:'),
    -- A SECOND disambiguation shape the anchor above structurally cannot see: an
    -- English Wikipedia surname stub, which names itself as a surname rather than
    -- opening "may refer to:". Eight of these were live and uncounted when this
    -- arm was added (99960101100000). Kept a separate key because it is
    -- REPAIRABLE -- null the description and let the thin-page gate deindex --
    -- where unresolved_disambiguation sits at a deliberate, unrepairable
    -- baseline. Zero-invariant. Both arms were measured corpus-wide: together
    -- they matched exactly the eight defective rows and nothing else.
    'surname_stub', count(*) filter (
      where d ~* 'Notable people with the (surname|given name|name)'
         or d ~* '^[^.!?]{0,80}\mis a surname\M'),
    'whitespace_dirty', count(*) filter (
      where d <> btrim(d, E' \t\n\r') or d ~ '[ \t]{2,}')
  )
  into v
  from a;

  return v;
exception when others then
  -- a probe that cannot run must SAY so rather than fall through to zeros
  return jsonb_build_object('probe_ok', false, 'error', sqlerrm);
end
$function$;

do $verify$
declare
  v_bad     int;
  v_sig     jsonb;
  v_short   text;
  v_desc    text;
  v_long    text;
begin
  -- P1. No active tag publishes a surname stub. Corpus-wide, keyed on the DEFECT
  --     rather than on this file's own slug list, so a better repair written by
  --     someone else satisfies it too and a NINTH row cannot slip in behind us.
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and description is not null
     and (description ~* 'Notable people with the (surname|given name|name)'
       or description ~* '^[^.!?]{0,80}\mis a surname\M');
  if v_bad <> 0 then
    raise exception 'P1 FAILED: % active tag(s) still publish a surname disambiguation stub', v_bad;
  end if;

  -- P2. The GATE settled the eight, not this file. Asserts the mechanism: each is
  --     now deindexed with reason 'thin' -- the one value run_tag_thin_page_reindex
  --     will reverse -- which is only true if the trigger made the decision.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('farber','kerle','kuenstler','lehrer','maler','sprecher','tanzer','zeichner')
     and not (seo_indexable is false and seo_deindex_reason = 'thin');
  if v_bad <> 0 then
    raise exception 'P2 FAILED: % of the 8 surname-stub rows were not deindexed as thin by the gate', v_bad;
  end if;

  -- P3. queening: the misfiled summary is gone AND both correct prose fields
  --     survive. Asserted in BOTH directions -- destroying the good body would
  --     satisfy "the drag text is gone" just as well as the repair does.
  select t.short_description, t.description, t.long_description
    into v_short, v_desc, v_long
    from public.unified_tags t
   where t.slug = 'queening';
  if v_short is not null then
    raise exception 'P3 FAILED: queening still carries a short_description: %', v_short;
  end if;
  if v_desc is null or v_desc !~ 'Sitting on a partner''s face for oral sex' then
    raise exception 'P3 FAILED: queening lost or altered its correct description';
  end if;
  if v_long is null or v_long !~ '^Queening is facesitting' then
    raise exception 'P3 FAILED: queening lost or altered its correct long_description';
  end if;

  -- P4. The standing corpus invariant. Calls tag_has_prose rather than restating
  --     its OR -- a hand-rolled "both present" version would fail on the 328
  --     legitimate rows that carry only a description.
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and seo_indexable
     and not public.tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'P4 FAILED: % active indexable tag(s) publish no prose at all', v_bad;
  end if;

  -- P5. MIRROR. Four rows from the same 23-row cohort that this file must NOT
  --     have touched. Nulling a good row is the exact mirror of leaving a bad
  --     one, and a defect-only postcondition cannot tell the two apart.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('sober','white-knight','safe-call','docking')
     and not (status = 'active'
              and seo_indexable
              and coalesce(btrim(description), '') <> '');
  if v_bad <> 0 then
    raise exception 'P5 FAILED: % control row(s) from the cohort lost their description or their index flag', v_bad;
  end if;

  -- P6. The sentinel reports the new key and reads zero. An absent key and a
  --     clean corpus are not the same thing, so the key's PRESENCE is checked
  --     separately from its value.
  select public.tag_prose_standard_signals() into v_sig;
  if coalesce(v_sig->>'probe_ok','') <> 'true' then
    raise exception 'P6 FAILED: tag_prose_standard_signals does not report probe_ok: %', v_sig;
  end if;
  if not (v_sig ? 'surname_stub') then
    raise exception 'P6 FAILED: tag_prose_standard_signals has no surname_stub key -- the new check measures NOTHING';
  end if;
  if (v_sig->>'surname_stub')::int <> 0 then
    raise exception 'P6 FAILED: surname_stub reads % after the repair', v_sig->>'surname_stub';
  end if;
  if (v_sig->>'rows_scanned')::int < 1000 then
    raise exception 'P6 FAILED: the probe scanned only % descriptions -- it is measuring nothing, not passing', v_sig->>'rows_scanned';
  end if;
end
$verify$;
