-- The one dedup-review pair the sweep queued after 99991791028368 worked the queue.
--
-- Queue row 118967db, enqueued 2026-10-04 05:50 by dedup_truth_sweep at confidence 0.85,
-- reason `title_containment_same_instant`:
--
--   KEEP 0f1a14f1  "Lust*voll Party"  2026-10-10 20:00Z -> 2026-10-11 02:30Z
--                  venue_name "Gannet", city Basel, qs 95, 2 event_sources
--   DROP 6e74090c  "Lust*voll"        2026-10-10 20:00Z -> 2026-10-11 02:30Z
--                  venue_name "Gannet - Holzpark Klybeck", city Basel, qs 75, 1 source
--
-- As 20270822093311 records, containment is a CANDIDATE GENERATOR ONLY -- its failure
-- mode is sub-events, not duplicates ("Muscle Classic V Pre-Party" vs "Muscle Classic
-- V") -- so the reason decides nothing and the pair was read on both sides.
--
-- TWO INDEPENDENT SIGNALS, and the sub-event reading is excluded by the first of them:
--
--   1. The instant matches on BOTH ENDS -- same start AND same end, to the minute.
--      A pre-party or an after-hours set has its own start time; that is exactly what
--      makes the containment veto necessary and exactly what is absent here.
--   2. Same city ROW, not merely the same city text: city_id a0c1349b on both sides.
--
-- Plus the venue, which agrees once resolved: the two venue_name strings differ, but
-- both rows' venues carry the IDENTICAL street address "Uferstrasse 40", Basel -- i.e.
-- "Gannet" and "Gannet - Holzpark Klybeck" are two spellings of one address. See the
-- note on that venue pair below.
--
-- MEASURED AND REJECTED AS A THIRD SIGNAL: the descriptions are NOT identical. They
-- share a long opening ("Wie immer gibt es am Lust*streifen nicht nur spicy Filme zu
-- sehen, sondern auch hotte Musi...") and diverge after it. A 90-character prefix match
-- read as "byte-identical description" would have been a fabricated signal; `k.description
-- = d.description` returns false. The pair stands on the two signals above.
--
-- DIRECTION AS QUEUED. The keep carries the fuller title, quality_score 95 against 75,
-- and 2 event_sources against 1. No flip, unlike the Matteo Lane pair in
-- 99991791028368, where the sweep's keep was a Ticketmaster seating tier -- here both
-- titles name the event and the keep's is simply the complete one.
--
-- Reversible: `approve_dedup_review` routes an event pair through
-- `merge_entities(p_type => 'event', ...)`, and 29000101100000 gave that core the
-- `schema:1` `details.moved` stamp, so this is undoable by `unmerge_entities(audit_id)`.
-- P2 requires the audit id rather than assuming it.
--
-- ADJACENT DEFECT FOUND AND DELIBERATELY NOT FIXED -- the venue duplicate underneath:
--   `4da5bd9a` "Gannet - Holzpark Klybeck" and `90ecf805` "Gannet" are both
--   "Uferstrasse 40", Basel, CH, both category `other`, both created 2026-08-22, both
--   live. By this repo's own rule (20330101100000) the identical street address is the
--   signal and the 2.2 km coordinate gap vetoes nothing -- so they are one venue, and
--   the two events above exist partly because the venue exists twice.
--   It is NOT merged here because the direction is a genuine trade-off rather than a
--   cleanup, and that was established by reading the merge core rather than guessing:
--   `_venue_merge_core` does not mention `website` at all, so it carries nothing over
--   from the dropped row. `4da5bd9a` has 3 events and the fuller name; `90ecf805` has 1
--   event and the ONLY website. Whichever way it merges, something is lost unless the
--   website is moved by hand first. That is a decision, not a sweep.

do $basel$
begin
  -- Soft precondition: if a concurrent session or the autoapprove pass has already
  -- decided this pair, say so and do nothing rather than aborting db push for the whole
  -- repo. 99991791028368's own P1 had to be narrowed for exactly this reason.
  if not exists (select 1 from public.dedup_review_queue
                  where id = '118967db-278e-4898-a90c-37bebb961db3' and status = 'open') then
    raise notice 'Basel Lust*voll pair is no longer open -- nothing to do';
    return;
  end if;

  perform public.approve_dedup_review('118967db-278e-4898-a90c-37bebb961db3'::uuid, null);
end $basel$;

do $verify$
declare v_keep uuid; v_audit uuid; v_title text; v_n int;
begin
  -- P1: the pair is decided, and decided as APPROVED in the queued direction. Asserting
  --     "not open" alone would pass on a rejection.
  select keep_id, merge_audit_id into v_keep, v_audit
    from public.dedup_review_queue
   where id = '118967db-278e-4898-a90c-37bebb961db3' and status = 'approved';
  if v_keep is null then
    raise exception 'P1: the Basel pair is not approved';
  end if;
  if v_keep <> '0f1a14f1-70a3-4b7a-bab8-d6793a0ba198'::uuid then
    raise exception 'P1b: the canonical is %, expected the "Lust*voll Party" row -- the direction flipped', v_keep;
  end if;

  -- P2: reversible. Without the audit id `unmerge_entities` has nothing to replay, which
  --     is the only reason to route through approve_dedup_review at all.
  if v_audit is null then
    raise exception 'P2: the merge recorded no audit id, so it cannot be undone';
  end if;

  -- P3: the drop is a duplicate OF THE KEEP specifically, not merely of something.
  if not exists (select 1 from public.events
                  where id = '6e74090c-ca84-439f-8b01-47c98ce86869'
                    and duplicate_of_id = '0f1a14f1-70a3-4b7a-bab8-d6793a0ba198') then
    raise exception 'P3: the dropped Lust*voll row is not a duplicate of the surviving one';
  end if;

  -- P4: the survivor is still canonical and still the complete title. A merge that left
  --     the keep pointing at something else would satisfy every check above.
  select title into v_title from public.events
   where id = '0f1a14f1-70a3-4b7a-bab8-d6793a0ba198' and duplicate_of_id is null;
  if v_title is distinct from 'Lust*voll Party' then
    raise exception 'P4: the surviving Basel event reads % (expected "Lust*voll Party")',
      coalesce(v_title, '<null or no longer canonical>');
  end if;

  -- P5: the venue duplicate named in the header is UNTOUCHED -- both rows still live.
  --     This migration decides an event pair; it must not have merged venues as a side
  --     effect of reparenting.
  select count(*) into v_n from public.venues
   where id in ('4da5bd9a-c933-4aea-85de-ee0ecf14bb4f','90ecf805-4e3b-45ff-8a49-fd7eae033097')
     and duplicate_of_id is null;
  if v_n <> 2 then
    raise exception 'P5: expected both Gannet venue rows to stay live; % of 2 are', v_n;
  end if;

  -- P6: the Seoul pair 99991791028368 deliberately left open is STILL open. A sweep that
  --     decided everything would otherwise look like success here.
  if not exists (select 1 from public.dedup_review_queue
                  where id = '36db651b-99b6-44fa-b308-7c0c768842b0' and status = 'open') then
    raise exception 'P6: the Seoul pair left open by 99991791028368 was decided';
  end if;

  raise notice 'Basel Lust*voll pair merged; Gannet venue duplicate left for a human';
end $verify$;
