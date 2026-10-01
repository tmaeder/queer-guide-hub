-- "Bear" is an AUDIENCE signal, not a FORMAT signal, and `infer_event_type`
-- filed 580 live events as `fetish` on that word alone.
--
-- THE PRODUCER'S OWN COMMENT CONTAINS THE REFUTATION. `scraper/src/sources/
-- gaycities/lib.ts:611` introduces the arm with "Subculture words are audience
-- signals, not format signals, so they rank below every explicit format above:
-- a bear-community panel discussion is a conference and a leather-bar
-- fundraiser is a fundraiser. They still outrank the generic buckets below,
-- because a leather party is meaningfully a fetish event." That reasoning
-- justifies `leather` -- a leather party IS a fetish event -- and refutes
-- `bear`: a bear party is a party whose AUDIENCE is bears, and `fetish` is a
-- format claim. On this platform `bear` is a body-type community identity, so
-- the label asserts a sexual venue/event type about a community that does not
-- claim one. Same shape as the venue pass that read a hair salon's name and
-- filed it `sauna` (CLAUDE.md, Venue categories).
--
-- MEASURED ON PROD BEFORE WRITING THIS, not inferred from the regex:
--   * 2,413 live events carry event_type='fetish'; 641 of them (27%) have
--     "bear" in the title.
--   * Of those 641, **580 carry NO other fetish token** anywhere in title or
--     the first 400 chars of description (no leather / fetish / kink / rubber /
--     pup play / cruising). Those 580 are the cohort this migration repairs.
--   * The other 61 keep `fetish` and are asserted to survive below -- they are
--     genuine crossovers and the label is right for them ("Bearadise ... Bear
--     FETISH Festival", "Bear Dance FOLSOM Edition").
--
-- THE PRODUCER IS LIVE, WHICH IS WHY THE FUNCTION IS CHANGED AND NOT ONLY THE
-- ROWS. `content_revisions` names it rather than a producer I already suspected:
-- five rows went other->fetish on 2026-09-27 and four null->fetish on
-- 2026-09-28, three days before this was written. Repairing the 580 without
-- the seal regrows the cohort on the next ingest run.
--
-- PUBLIC EXPOSURE IS SMALL AND IS STATED RATHER THAN IMPLIED: only **6** of the
-- 580 are upcoming AND present in `search_documents`. The rest are past events
-- (this corpus deliberately holds ~36.5k past rows). So this is a correctness
-- repair, not an incident -- and the producer seal is the load-bearing half.
--
-- THE REMEDY IS REMOVAL, NOT REPOINTING, AND THAT IS DELIBERATE. There is no
-- `bear` value in `events_event_type_check` (22 values, none of them a
-- subculture), so any repoint would be a guess -- and guessing a sense is how
-- this class arose. Dropping the token lets each row fall through the REST of
-- the ladder onto whatever its own text supports, which is `20260810120300`'s
-- own stated rule: "demoting a known-wrong label to an honest 'unknown' is
-- strictly an improvement -- it removes a false claim rather than making a new
-- one." Measured over the 580, the corrected ladder gives:
--   party 299 ("BEAR PARTY HALLOWOOF", "...FAREWELL PARTY", "AFTER HOURS"),
--   other 225 (honest unknown: "Honey Hour", "A-Bear-ican Idol"),
--   festival 17, sports 15, social 12, cruise 5, concert 3, comedy 2,
--   film 1, art 1.
-- party+other is 524 of 580 (90%) and both are plainly better than `fetish`.
--
-- MEASURED AND DELIBERATELY NOT FIXED HERE -- the `\mgames\M` token in the
-- sports arm. It is wrong in both directions and needs its own hand-read pass:
-- 156 corpus rows are non-athletic game idioms (Drag Bingo, "#barcadeMTL",
-- board-game nights) and of the 33 "Gay Games" rows most are PARTIES AND
-- FUNDRAISERS tied to the meet ("Gay Games Beer Bust fundraiser", "Closing
-- Ceremonies After Party", "Send Off Party"), so even that phrase is not
-- reliably sports. 15 of this migration's own 580 land on `sports` through it
-- ("Bear Game Night", "Bears In the Barcade") -- not made worse by this change,
-- and not silently swept either. Under-reaching is the correct error.
--
-- ALSO NOT DONE: the 237 open CATEGORY_UNRESOLVED rows are NOT auto-applied.
-- 83 of them carry a non-`other` inference and hand-reading all 83 found the
-- bear defect above plus "Out of Hibernation Bear Weekend"->protest, "Mantamar
-- Bear Week"->workshop, "Queer RPG Nights"->sports and "Board Games at the
-- library"->sports. A self-reported confidence score cannot gate a write --
-- the rule this repo established twice when the tag prose judge retracted 16
-- of 18 rows with 13 of them wrong.

begin;

-- ---------------------------------------------------------------------------
-- 1. Producer seal. Body is `pg_get_functiondef` verbatim with ONE edit: the
--    `\mbears?\M` alternative is gone from the fetish arm. `leather`, `fetish`,
--    `kink`, `rubber`, `pup play` and `cruising` are untouched -- each names a
--    format, which is what the arm is for.
-- ---------------------------------------------------------------------------
create or replace function public.infer_event_type(p_title text, p_description text default null::text)
returns jsonb
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  WITH s AS (
    SELECT lower(coalesce(p_title, '')) AS t,
           lower(coalesce(p_title, '') || ' ' || left(coalesce(p_description, ''), 400)) AS txt
  ),
  hit AS (
    SELECT CASE
      WHEN txt ~ '\mpride\M|christopher street day|\mcsd\M'                  THEN 'pride'
      WHEN txt ~ '\mdrag\M'                                                   THEN 'drag'
      WHEN txt ~ '\mcruise\M|\msailing\M|\mcharter\M'                         THEN 'cruise'
      WHEN txt ~ 'comedy|stand-?up|improv'                                    THEN 'comedy'
      WHEN txt ~ 'film|movie|cinema|screening'                                THEN 'film'
      WHEN txt ~ 'theatre|theater|musical|opera'                              THEN 'theater'
      WHEN txt ~ 'exhibition|\mexhibit\M|vernissage'                          THEN 'exhibition'
      WHEN txt ~ 'conference|summit|convention|symposium'                     THEN 'conference'
      WHEN txt ~ 'workshop|\mclass\M|seminar|masterclass'                     THEN 'workshop'
      WHEN txt ~ 'sports|\mrun\M|\mrace\M|rodeo|tournament|\mski\M|marathon|\mgames\M' THEN 'sports'
      WHEN txt ~ 'protest|march for|rally|demonstration|vigil'                THEN 'protest'
      WHEN txt ~ 'fundrais|charity|benefit|\mgala\M'                          THEN 'fundraiser'
      WHEN txt ~ 'street.?fair|\mfair\M|\mexpo\M|\mmarket\M'                  THEN 'fair'
      WHEN txt ~ 'meetup|meet-up|mixer|networking'                            THEN 'meetup'
      -- `bear` REMOVED 99991790878434. A subculture word is an audience signal
      -- and this arm makes a FORMAT claim; the arm's own comment says so. The
      -- surviving tokens each name a format. Do not re-add it: 580 live events
      -- were mislabelled by it, and a bear event with no other signal is
      -- better served by the rest of this ladder, or by an honest 'other'.
      WHEN txt ~ '\mleather\M|fetish|\mkink\M|\mrubber\M|pup(py)? play|cruising' THEN 'fetish'
      WHEN txt ~ 'festival|fest\M'                                          THEN 'festival'
      -- A title saying "party" wins over a performance word: "Madonna Fan Party",
      -- "Kylie Minogue Concert After Party" and "...LIVE AT OUR GRAND OPENING PARTY"
      -- are parties, and they were the only misses in the sampled concert branch.
      WHEN t   ~ '\mparty\M'                                                  THEN 'party'
      -- `music of` ("The Music of the Beatles") is a tribute-concert idiom and is a
      -- clean signal, unlike bare `music`; all 14 corpus titles carrying it are concerts.
      WHEN t   ~ 'concert|live in concert|\mtour\M|symphony|philharmonic|chorus|choir|recital|unplugged|\mlive at\M|\mlive in\M|music of' THEN 'concert'
      WHEN txt ~ 'party|club night|tea.?dance|pool.?party|t-?dance|circuit|\mdjs?\M|afterparty|\mball\M|\mbash\M|no cover|drink specials' THEN 'party'
      WHEN txt ~ 'concert|live band|symphony|philharmonic|chorus|choir|recital' THEN 'concert'
      WHEN txt ~ '\mart\M|gallery'                                            THEN 'art'
      WHEN txt ~ 'community|\msocial\M'                                       THEN 'social'
      ELSE NULL
    END AS cat
    FROM s
  )
  SELECT jsonb_build_object(
    'event_type', coalesce(cat, 'other'),
    'confidence', CASE cat
      WHEN 'party'      THEN 0.95  -- 20/20 on a hand-checked sample
      WHEN 'pride'      THEN 0.90
      WHEN 'drag'       THEN 0.90
      WHEN 'protest'    THEN 0.90
      WHEN 'concert'    THEN 0.86  -- ~19/22 on a hand-checked sample
      WHEN 'comedy'     THEN 0.85
      WHEN 'film'       THEN 0.85
      WHEN 'theater'    THEN 0.85
      WHEN 'conference' THEN 0.85
      WHEN 'workshop'   THEN 0.85
      WHEN 'sports'     THEN 0.85
      WHEN 'fundraiser' THEN 0.85
      WHEN 'meetup'     THEN 0.85
      WHEN 'fetish'     THEN 0.85
      WHEN 'festival'   THEN 0.85
      WHEN 'cruise'     THEN 0.80
      WHEN 'exhibition' THEN 0.80
      WHEN 'fair'       THEN 0.80
      WHEN 'art'        THEN 0.70
      WHEN 'social'     THEN 0.60
      ELSE 0                        -- no signal -> 'other', deliberately unconfident
    END
  )
  FROM hit;
$function$;

comment on function public.infer_event_type(text, text) is
  'First-match ladder over title + the first 400 chars of description. Format '
  'words beat genre words and a subculture word is NEVER a format: `bear` was '
  'removed from the fetish arm in 99991790878434 after it filed 580 live events '
  'as fetish on that word alone. Mirrors the rule order in scraper '
  'gaycities/lib.ts, which must be edited in lockstep.';

-- ---------------------------------------------------------------------------
-- 2. Corpus repair. Predicate-driven, never a frozen id list, so re-running is
--    a no-op and a row that has since been corrected by hand is skipped.
--
--    The "no other fetish token" clause is what makes this safe: it is the same
--    expression the measurement used, so the 61 genuine crossovers are outside
--    the cohort by construction rather than by a list. With `bear` gone from the
--    arm the re-derivation CANNOT return 'fetish' for a row in this cohort --
--    the `new_type <> 'fetish'` guard is a belt that asserts that rather than a
--    filter doing work.
--
--    `field_provenance` is built with `||`, not jsonb_set(create_missing):
--    that flag creates only the LAST path element, so a row with no
--    `event_type` key would have been updated with the record silently absent.
--    The prior value is recorded; a repair that records nothing is a deletion.
-- ---------------------------------------------------------------------------
with cohort as (
  select e.id,
         e.event_type as old_type,
         public.infer_event_type(e.title, e.description)->>'event_type' as new_type
  from public.events e
  where e.duplicate_of_id is null
    and e.event_type = 'fetish'
    and e.title ~* '\mbears?\M'
    and not ((coalesce(e.title, '') || ' ' || left(coalesce(e.description, ''), 400))
             ~* '\mleather\M|fetish|\mkink\M|\mrubber\M|pup(py)? play|cruising')
)
update public.events e set
  event_type = c.new_type,
  field_provenance = coalesce(e.field_provenance, '{}'::jsonb) || jsonb_build_object(
    'event_type',
    coalesce(e.field_provenance -> 'event_type', '{}'::jsonb) || jsonb_build_object(
      'source', 'derived:infer_event_type',
      'by', 'migration:99991790878434',
      'at', now(),
      'corrected_from', jsonb_build_object(
        'value', c.old_type,
        'reason', 'bear is an audience signal, not a fetish format; no other fetish token present')))
from cohort c
where c.id = e.id and c.new_type <> 'fetish';

-- ---------------------------------------------------------------------------
-- 3. The seven open DESCRIPTION_HTML rows. All seven are `gayout` prose wrapped
--    in `<p>` and nothing else -- verified per row rather than assumed: the only
--    tag names present are `p` and `/p`, and NONE carries an HTML entity, so no
--    decoding is needed and nothing but markup is removed.
--
--    Scoped by PREDICATE and not by the seven ids, and the predicate REFUSES a
--    description carrying any other tag or any entity -- an `<a href>` would
--    lose its target, which is information, so such a row is left for a pass
--    that can preserve it.
--
--    Paragraph breaks become REAL newlines, which is this corpus's convention
--    (`20261007120000`) and what `paragraphsHtml` in functions/_lib/detail.ts
--    splits on. A literal backslash-n in a single-quoted Postgres string is a
--    backslash and an n, not a newline -- hence E'\n\n'.
--
--    A WELL-FORMED TAG IS REQUIRED, AND THE FIRST DRY RUN IS WHAT FOUND THAT.
--    P7's first draft tested for `</?p\M`, which is LOOSER than the replacement
--    it was guarding: the gaycities event "NSFW" ends `...dancing boots."</p…`
--    -- an UNTERMINATED tag, cut mid-markup by a character cap -- so the
--    predicate selected it, the replacement (which needs a closing `>`) could
--    not touch it, and the postcondition failed on the migration's own work.
--    Both the predicate and P7 now require `</?p[^>]*>`, the same shape the
--    replacement can act on. The detector never flagged that row either, for
--    the same reason: DESCRIPTION_HTML tests `<[a-z][^>]*>`.
--
--    THE TRUNCATION IS A SEPARATE AND LARGER DEFECT, NAMED RATHER THAN SWEPT:
--    91 live descriptions end in an unterminated tag and 1,599 end in an
--    ellipsis. Stripping the dangling `</p` would convert a visibly truncated
--    record into a plausibly complete one, destroying the only evidence that
--    text was lost -- the rule this repo recorded for the 500-char tag bodies.
--    Repairing those means recovering the lost prose, which this pass cannot.
--
--    Eight rows match, not the seven in the open queue: "Arosa Gay Ski Week
--    2023" carries DESCRIPTION_HTML at status `accepted`. It is repaired too,
--    deliberately -- that decision was "this gap is acceptable", and closing
--    the gap does not discard it.
-- ---------------------------------------------------------------------------
update public.events e set
  description = btrim(regexp_replace(
    regexp_replace(e.description, '</p>\s*<p[^>]*>', E'\n\n', 'gi'),
    '</?p[^>]*>', '', 'gi')),
  field_provenance = coalesce(e.field_provenance, '{}'::jsonb) || jsonb_build_object(
    'description',
    coalesce(e.field_provenance -> 'description', '{}'::jsonb) || jsonb_build_object(
      'html_unwrapped', jsonb_build_object(
        'by', 'migration:99991790878434',
        'at', now(),
        'previous', e.description)))
where e.duplicate_of_id is null
  and e.description ~ '</?p[^>]*>'
  and e.description !~ '&[a-zA-Z#][a-zA-Z0-9]*;'
  and not exists (
    select 1 from regexp_matches(e.description, '<\s*/?\s*([a-zA-Z][a-zA-Z0-9]*)', 'g') m
    where lower(m[1]) <> 'p');

-- ---------------------------------------------------------------------------
-- 4. Postconditions. Hard on the state this migration exists to reach; every
--    one counts the REACHED state positively rather than counting rows in a bad
--    state, because the latter also returns zero when the cohort has vanished
--    from the corpus entirely.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_src  text := pg_get_functiondef('public.infer_event_type(text,text)'::regprocedure);
  v_bad   bigint;
  v_ok    bigint;
  v_keep  bigint;
  v_stamp bigint;
begin
  -- P1 The token is gone from the live definition, and the arm still exists.
  if position('bears?' in v_src) > 0 then
    raise exception 'P1 failed: infer_event_type still carries the bear token';
  end if;
  if position('\mleather\M|fetish|\mkink\M|\mrubber\M|pup(py)? play|cruising' in v_src) = 0 then
    raise exception 'P2 failed: the fetish arm is gone, not narrowed';
  end if;

  -- P3 BEHAVIOURAL, not a source-text check: a source-text postcondition cannot
  -- tell a live rule from a dead one. A bear event with no other fetish signal
  -- must not read fetish; a leather event still must.
  if public.infer_event_type('Bear Week Provincetown', 'An annual gathering of bears.')->>'event_type' = 'fetish' then
    raise exception 'P3 failed: a bear-only title still infers fetish';
  end if;
  if public.infer_event_type('Berlin Leather Week', 'Leather and rubber.')->>'event_type' <> 'fetish' then
    raise exception 'P3 failed: a leather title no longer infers fetish (over-reach)';
  end if;

  -- P4 No live event is left filed fetish on bear alone.
  select count(*) into v_bad from public.events e
  where e.duplicate_of_id is null and e.event_type = 'fetish' and e.title ~* '\mbears?\M'
    and not ((coalesce(e.title,'')||' '||left(coalesce(e.description,''),400))
             ~* '\mleather\M|fetish|\mkink\M|\mrubber\M|pup(py)? play|cruising');
  if v_bad <> 0 then
    raise exception 'P4 failed: % events still filed fetish on bear alone', v_bad;
  end if;

  -- P5 MIRROR. The genuine crossovers must SURVIVE -- "zero bear-only fetish
  -- rows" is equally satisfied by a sweep that took every bear event's label.
  select count(*) into v_keep from public.events e
  where e.duplicate_of_id is null and e.event_type = 'fetish' and e.title ~* '\mbears?\M';
  if v_keep < 50 then
    raise exception 'P5 failed: only % bear-titled fetish events survive; the crossovers were swept', v_keep;
  end if;

  -- P6 The repair recorded what it overwrote. A repair that records nothing is
  -- a deletion, so the stamp is asserted rather than assumed.
  select count(*) into v_stamp from public.events e
  where e.field_provenance -> 'event_type' ->> 'by' = 'migration:99991790878434'
    and e.field_provenance -> 'event_type' -> 'corrected_from' ->> 'value' = 'fetish';
  if v_stamp = 0 then
    raise exception 'P6 failed: no repaired row carries the provenance stamp';
  end if;

  -- P7 No live event description is left as p-only HTML.
  select count(*) into v_bad from public.events e
  where e.duplicate_of_id is null and e.description ~ '</?p[^>]*>'
    and e.description !~ '&[a-zA-Z#][a-zA-Z0-9]*;'
    and not exists (select 1 from regexp_matches(e.description, '<\s*/?\s*([a-zA-Z][a-zA-Z0-9]*)', 'g') m
                    where lower(m[1]) <> 'p');
  if v_bad <> 0 then
    raise exception 'P7 failed: % descriptions are still p-wrapped HTML', v_bad;
  end if;

  -- P8 The unwrap kept the prose. Real newlines, no residual tag.
  select count(*) into v_bad from public.events e
  where e.field_provenance -> 'description' -> 'html_unwrapped' ->> 'by' = 'migration:99991790878434'
    and e.description !~ '<[a-zA-Z/]'
    and length(btrim(e.description)) >= 80;
  if v_bad = 0 then
    raise exception 'P8 failed: no unwrapped description survives as clean prose';
  end if;

  -- P9 MIRROR. The truncated row is NOT in scope and must still carry its
  -- dangling tag -- "zero p-wrapped descriptions" would otherwise be satisfied
  -- by a sweep that also hid the truncation this pass deliberately preserves.
  select count(*) into v_keep from public.events e
  where e.duplicate_of_id is null and e.description ~ '<\s*/?\s*[a-zA-Z][^>]*$';
  if v_keep = 0 then
    raise exception 'P9 failed: the truncated-description cohort was swept';
  end if;

  raise notice 'bear repair: % relabelled, % descriptions unwrapped, % truncated rows preserved', v_stamp, v_bad, v_keep;
end
$verify$;

commit;
