-- `99991790878434` repaired `events.event_type` for 580 bear events that the
-- name-only classifier had called `fetish`, and LEFT `events.tags` STANDING.
-- This is the sibling-column residue class this codebase has recorded on three
-- other entities: nulling an identifier does not unpublish the prose it
-- produced, and repairing one prose field does not repair the other. Here the
-- claim is duplicated into an array column rather than into prose.
--
-- MEASURED ON PROD BEFORE WRITING THIS, not inferred from the earlier count:
--
--   577  rows carry `field_provenance.event_type.by = migration:99991790878434`
--   325  of those STILL carry the literal tag 'fetish'
--     0  of those 325 carry ANY fetish token in their own title+description
--     1  of those 325 is live in `search_documents` with a 'fetish' tag facet
--        (`ibc-balcony-bears-bash-cruise` -- International Bear Convergence,
--        now event_type 'cruise', still tag-filterable as fetish)
--
-- So the live exposure is ONE row and the rest are past or gated. The reason
-- this is worth a migration anyway is the SECOND number: a future pass that
-- re-measures "bear events labelled fetish" through `tags` finds 325 hits and
-- reasonably concludes the repair failed. Leaving a stale duplicate of a claim
-- you have just retracted is how a corrected record reads as a broken one.
--
-- REMOVING A STALE TYPE TOKEN FROM `tags` IS THE ESTABLISHED PRECEDENT, not a
-- new liberty. `run_event_type_reclassify` (20260810120300) already does
-- `tags = array_remove(tags, rec.event_type)` and its own comment states the
-- rule this migration follows: "duplicating event_type into tags is exactly
-- what made the old verdict circular, and event_type already carries it."
--
-- SCOPE IS THE PREDICATE THAT WAS ALREADY PROVEN, not a frozen id list. A row
-- qualifies only if the earlier migration repaired its `event_type` AND its own
-- text carries no fetish token -- the identical evidence that justified moving
-- `event_type` off `fetish`. No new judgement is made about any row.
--
-- WHAT IS DELIBERATELY NOT DONE:
--   * No tag is ADDED. The new `event_type` is not written back as a tag, for
--     the circularity reason quoted above.
--   * No row outside the stamped cohort is touched, so a `fetish` tag that
--     arrived from a source collection on an event this pass never repaired
--     stays exactly where it is -- including `bear-dance-folsom-edition-berlin-2027`,
--     which carries a real `leather` token, kept `event_type='fetish'`, and is
--     asserted below to KEEP its tag. Without that mirror, a sweep that removed
--     the tag from every bear event would satisfy "the 325 are clean" too.
--
-- Batch: one statement over ~325 rows. Since the pipeline overhaul an `events`
-- UPDATE enqueues into `search_reindex_queue` rather than indexing inline
-- (measured 2.6 ms/row), so this is ~1 s and well inside the statement timeout.
-- Do NOT widen this to a corpus-wide tag sweep at that cost model.

begin;

-- ---------------------------------------------------------------------------
-- 1. Snapshot the scope so the postcondition can assert the END STATE rather
--    than count its own UPDATE. A count of affected rows proves nothing on a
--    re-run; the reached state does.
-- ---------------------------------------------------------------------------
create temporary table _bear_tag_scope on commit drop as
select e.id, e.tags as tags_before
from public.events e
where e.duplicate_of_id is null
  and e.field_provenance -> 'event_type' ->> 'by' = 'migration:99991790878434'
  and 'fetish' = any(coalesce(e.tags, '{}'::text[]))
  and not ((coalesce(e.title, '') || ' ' || left(coalesce(e.description, ''), 400))
           ~* '\mleather\M|fetish|\mkink\M|\mrubber\M|pup(py)? play|cruising');

-- ---------------------------------------------------------------------------
-- 2. Drop the stale token. `array_remove` touches nothing else in the array --
--    the other nine distinct tags in this cohort (gay, queer, bears, ...) are
--    audience and community tags and are left alone.
-- ---------------------------------------------------------------------------
update public.events e set
  tags = array_remove(coalesce(e.tags, '{}'::text[]), 'fetish'),
  field_provenance = coalesce(e.field_provenance, '{}'::jsonb) || jsonb_build_object(
    'tags',
    coalesce(e.field_provenance -> 'tags', '{}'::jsonb) || jsonb_build_object(
      'by', 'migration:99991791015920',
      'at', now(),
      'removed', jsonb_build_array('fetish'),
      'reason', 'stale duplicate of the event_type claim retracted by '
                'migration:99991790878434; no fetish token in the row''s own text',
      'previous', to_jsonb(s.tags_before)))
from _bear_tag_scope s
where s.id = e.id;

-- ---------------------------------------------------------------------------
-- 3. COHORT B -- the gap the live public API exposed, and the reason this file
--    is not tag-only.
--
--    Verifying cohort A through the real search-proxy (`POST /search`,
--    `filters.categories=['fetish']`, query "bear") returned SIX events. Five
--    were correctly fetish -- each carries a real token ("furry fetish lovers",
--    "gay cruising bars", "fetish nights", "Leather Weekend") -- and the sixth,
--    `Bärenpaadiie XXL Hamburg`, revealed that `99991790878434` scoped its
--    repair to `title ~* '\mbears?\M'`, i.e. ENGLISH ONLY.
--
--    The PRODUCER is already language-agnostic: `bear` is gone from
--    `infer_event_type`'s fetish arm entirely, so nothing new can be minted in
--    any language. What the English scope left behind is HISTORICAL rows.
--
--    MEASURED: 8 rows carry a non-English or diacritic bear word, are still
--    `event_type='fetish'`, and have NO fetish token in their own text. All 8
--    were read by hand rather than swept -- Spanish `oso`/`osos`, Italian
--    `orsi`, and `DC Bëar Crüe` (metal umlauts on an English word, which is why
--    the `\mbears?\M` arm missed it). Every one is a bear community party or
--    gathering: "Valentines Day PARTIES", "Winter Bear Gathering", "fiesta
--    U4BEAR", "BEAR MONDAY ... DJs". ALL EIGHT are `status='completed'` and
--    none is live, so the exposure here is zero and the value is corpus
--    correctness, not an active fix.
--
--    `infer_event_type` returns `fetish` for NONE of the 8 (measured), so the
--    retype cannot reinstate the claim it removes. 4 of the 8 also carry the
--    stale tag and lose it by the same rule as cohort A.
-- ---------------------------------------------------------------------------
create temporary table _bear_type_scope_b on commit drop as
select e.id, e.event_type as type_before, e.tags as tags_before,
       public.infer_event_type(e.title, e.description) ->> 'event_type' as new_type
from public.events e
where e.duplicate_of_id is null
  and e.event_type = 'fetish'
  and not (e.title ~* '\mbears?\M')
  and e.title ~* 'b(ä|ae)ren|\mb(ë|e)ar\M|\mberen\M|\mosos?\M|\mours\M|\morsi\M'
  and not ((coalesce(e.title, '') || ' ' || left(coalesce(e.description, ''), 400))
           ~* '\mleather\M|fetish|\mkink\M|\mrubber\M|pup(py)? play|cruising');

update public.events e set
  event_type = b.new_type,
  tags = array_remove(coalesce(e.tags, '{}'::text[]), 'fetish'),
  field_provenance = coalesce(e.field_provenance, '{}'::jsonb) || jsonb_build_object(
    'event_type',
    coalesce(e.field_provenance -> 'event_type', '{}'::jsonb) || jsonb_build_object(
      'source', 'derived:infer_event_type',
      'by', 'migration:99991791015920',
      'at', now(),
      'corrected_from', jsonb_build_object(
        'value', b.type_before,
        'tags', to_jsonb(b.tags_before),
        'reason', 'bear is an audience signal, not a fetish format; no other '
                  'fetish token present. Extends migration:99991790878434, '
                  'whose scope was English-only.')))
from _bear_type_scope_b b
where b.id = e.id and b.new_type <> 'fetish';

-- ---------------------------------------------------------------------------
-- 4. Postconditions. Each asserts a state that must hold afterwards. P3 and P4
--    are the mirror: a sweep that took the tag or the type from every bear
--    event would pass P1, P2, P5 and P6 and fail P3 and P4.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad          int;
  v_scope        int;
  v_scope_b      int;
  v_control_tag  boolean;
  v_control_type text;
  v_stamped      int;
begin
  select count(*) into v_scope from _bear_tag_scope;
  select count(*) into v_scope_b from _bear_type_scope_b;

  -- P0: the scope was non-empty. A migration that repaired nothing and reports
  -- success is the vacuous case; if the cohort is already clean this file is a
  -- no-op and must say so loudly rather than pass silently.
  if v_scope = 0 then
    raise exception 'P0 failed: scope is empty — the 325-row residue this file '
      'exists to clear is absent. Re-measure before assuming it was fixed.';
  end if;

  -- P1: no row in the repaired cohort still carries the stale tag.
  select count(*) into v_bad
  from public.events e
  where e.duplicate_of_id is null
    and e.field_provenance -> 'event_type' ->> 'by' = 'migration:99991790878434'
    and 'fetish' = any(coalesce(e.tags, '{}'::text[]))
    and not ((coalesce(e.title, '') || ' ' || left(coalesce(e.description, ''), 400))
             ~* '\mleather\M|fetish|\mkink\M|\mrubber\M|pup(py)? play|cruising');
  if v_bad <> 0 then
    raise exception 'P1 failed: % repaired bear events still carry the fetish tag', v_bad;
  end if;

  -- P2: every row in scope is stamped, so the removal is attributable and the
  -- prior array is recoverable. A removal that records nothing is a deletion.
  select count(*) into v_stamped
  from public.events e join _bear_tag_scope s on s.id = e.id
  where e.field_provenance -> 'tags' ->> 'by' = 'migration:99991791015920'
    and e.field_provenance -> 'tags' -> 'previous' is not null;
  if v_stamped <> v_scope then
    raise exception 'P2 failed: % of % rows carry the provenance stamp', v_stamped, v_scope;
  end if;

  -- P3 (MIRROR): the control keeps BOTH its tag and its type. It carries a real
  -- `leather` token, was never repaired by 99991790878434, and is the row that
  -- distinguishes this pass from a blanket bear sweep.
  select 'fetish' = any(coalesce(tags, '{}'::text[])), event_type
    into v_control_tag, v_control_type
  from public.events
  where slug = 'bear-dance-folsom-edition-berlin-2027' and duplicate_of_id is null;
  if v_control_tag is null then
    raise notice 'P3 skipped: control row absent (merged or renamed upstream)';
  elsif not v_control_tag or v_control_type <> 'fetish' then
    raise exception 'P3 failed: control lost its fetish tag or type (tag=%, type=%)',
      v_control_tag, v_control_type;
  end if;

  -- P4 (MIRROR): the genuine bear+fetish cohort is untouched. Measured at 61
  -- before this file; asserted as a floor rather than an equality so a
  -- concurrent legitimate retype does not abort db push for the whole repo.
  select count(*) into v_bad
  from public.events e
  where e.duplicate_of_id is null
    and e.title ~* '\mbears?\M'
    and e.event_type = 'fetish'
    and (coalesce(e.title, '') || ' ' || left(coalesce(e.description, ''), 400))
        ~* '\mleather\M|fetish|\mkink\M|\mrubber\M|pup(py)? play|cruising';
  if v_bad < 40 then
    raise exception 'P4 failed: only % genuine bear+fetish events remain (expected >=40, '
      'measured 61) — this pass has over-reached into real fetish events', v_bad;
  end if;

  -- P5: cohort B is empty afterwards — no non-English bear event is left typed
  -- fetish without evidence. Re-queried, not counted off the UPDATE.
  select count(*) into v_bad
  from public.events e
  where e.duplicate_of_id is null
    and e.event_type = 'fetish'
    and not (e.title ~* '\mbears?\M')
    and e.title ~* 'b(ä|ae)ren|\mb(ë|e)ar\M|\mberen\M|\mosos?\M|\mours\M|\morsi\M'
    and not ((coalesce(e.title, '') || ' ' || left(coalesce(e.description, ''), 400))
             ~* '\mleather\M|fetish|\mkink\M|\mrubber\M|pup(py)? play|cruising');
  if v_bad <> 0 then
    raise exception 'P5 failed: % non-English bear events still typed fetish', v_bad;
  end if;

  -- P6: the retype never reinstates the claim it removes. `infer_event_type`
  -- returns fetish for none of cohort B (measured), and the UPDATE additionally
  -- guards `new_type <> 'fetish'`; this asserts the outcome rather than trusting
  -- either fact.
  select count(*) into v_bad
  from public.events e join _bear_type_scope_b b on b.id = e.id
  where e.event_type = 'fetish';
  if v_bad <> 0 then
    raise exception 'P6 failed: % cohort-B rows are still fetish after retype', v_bad;
  end if;

  raise notice 'bear fetish residue: cohort A % tags cleared (% stamped), '
    'cohort B % retyped, controls intact', v_scope, v_stamped, v_scope_b;
end
$verify$;

commit;
