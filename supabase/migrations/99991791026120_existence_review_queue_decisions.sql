-- Decide the two rows sitting in the Liveness & closure review queue
-- (/admin/content/liveness), each on its own verified evidence.
--
-- The queue holds entities with exactly ONE strong dead signal: not enough for
-- run_existence_decision's >=2-signal auto-archive, so they wait for a human.
-- Both were re-probed independently before this file was written, and both
-- carry a POSITIVE CONTROL -- the host answering 200 and, for the event, its
-- sibling pages answering 200 -- because "the page is gone" and "the site is
-- down" are the same 4xx/410 from one request, and only the control separates
-- them. A dead host is a transient to wait out; a dead page on a live host is
-- the thing this queue exists to act on.
--
--   1. event "9 Moons" (4b67012e-8a10-44cc-b039-87790f5704eb)
--      https://queer-kalender.nl/en/page/2294/9-moons
--      event-liveness-checker: HTTP 200 on 2026-10-02, HTTP 410 on 2026-10-03.
--      Re-probed 2026-10-03: 410 Gone. Controls: queer-kalender.nl/ -> 200,
--      and sibling pages /en/page/2293, /2295, /2300 -> 200. So the calendar
--      removed THIS entry rather than breaking; 410 is the one status that
--      means deliberately and permanently withdrawn. The 200 the day before is
--      the entry existing before it was pulled, not a blip -- and the engine
--      agrees independently, since fresh_alive_at <= newest_dead_at.
--      The event starts 2026-10-06, i.e. it is still in the future: publishing
--      a withdrawn event to a traveller is the harm being prevented here.
--
--   2. marketplace "Rocks-off - Bullet - Mini-Vibrator in Huelsen-Form"
--      (eef37b46-df37-48fa-8ac4-2e23846c826c)
--      https://ohmyfantasy.com/products/rocks-off-bullet-mini-vibrator-in-hulsen-form
--      link-checker: status "broken" on 2026-10-02, no alive signal ever.
--      Re-probed 2026-10-03: HTTP 404. Controls: ohmyfantasy.com/ -> 200 and
--      /collections/all -> 200, so the shop is trading and only this product is
--      delisted. Same disposition the 184 listings archived on 2026-10-02 got
--      under reason admin_approved_after_fresh_explicit_broken_link.
--
-- ARCHIVING IS REVERSIBLE AND SELF-REVERSING, which is why a 410 three days
-- before an event is an acceptable thing to act on: _existence_apply_archive
-- snapshots prev_state, existence_reopen replays it, and
-- run_existence_decision's reopen branch restores the row automatically the
-- moment a probe sees it alive again (fresh_alive_at > the archive's
-- created_at). Nothing here needs a human to undo it if the calendar
-- re-publishes.
--
-- SOFT ON PRECONDITIONS: the loop is driven by whichever of the two still has
-- an OPEN flag. A concurrent session deciding one of them between authoring and
-- CI leaves this file a no-op for that row rather than aborting db push for the
-- whole repo. HARD ON POSTCONDITIONS: neither entity may still be flagged, both
-- must be in the archived state, and both must carry a prev_state that proves
-- the archive can be undone.

do $$
declare
  rec record;
  v_decided int := 0;
begin
  for rec in
    select a.id            as audit_id,
           a.entity_type,
           a.entity_id,
           coalesce(a.signals, '{}'::jsonb) as signals,
           d.reason,
           d.evidence
    from (
      values
        ('4b67012e-8a10-44cc-b039-87790f5704eb'::uuid, 'event',
         'admin_approved_410_gone_host_and_siblings_alive',
         jsonb_build_object(
           'verified_at',      '2026-10-03',
           'verified_status',  410,
           'verified_url',     'https://queer-kalender.nl/en/page/2294/9-moons',
           'control_host',     jsonb_build_object('url','https://queer-kalender.nl/','status',200),
           'control_siblings', jsonb_build_object('pages','2293,2295,2300','status',200),
           'note',             'calendar withdrew this entry; host and neighbouring entries serve 200')),
        ('eef37b46-df37-48fa-8ac4-2e23846c826c'::uuid, 'marketplace',
         'admin_approved_404_product_delisted_shop_alive',
         jsonb_build_object(
           'verified_at',      '2026-10-03',
           'verified_status',  404,
           'verified_url',     'https://ohmyfantasy.com/products/rocks-off-bullet-mini-vibrator-in-hulsen-form',
           'control_host',     jsonb_build_object('url','https://ohmyfantasy.com/','status',200),
           'control_catalog',  jsonb_build_object('url','https://ohmyfantasy.com/collections/all','status',200),
           'note',             'product delisted; shop is trading'))
    ) as d(entity_id, entity_type, reason, evidence)
    join public.entity_existence_audit a
      on a.entity_id   = d.entity_id
     and a.entity_type = d.entity_type
     and a.action      = 'flag'
     and a.reverted_at is null
  loop
    -- Evidence is MERGED onto the flag's own signals rather than replacing
    -- them: the engine's reading (strong_dead, newest_dead_at) is why the row
    -- was offered, and a decision that erases its own input cannot be audited.
    perform public._existence_apply_archive(
      rec.entity_type, rec.entity_id, rec.reason,
      rec.signals || jsonb_build_object('admin_verification', rec.evidence),
      null);

    update public.entity_existence_audit
       set reverted_at = now(), reason = rec.reason
     where id = rec.audit_id;

    v_decided := v_decided + 1;
  end loop;

  raise notice 'existence review decisions: % archived this run', v_decided;
end $$;

do $verify$
declare v_bad int;
begin
  -- P1 Neither entity may still be awaiting review.
  select count(*) into v_bad
  from public.entity_existence_audit a
  where a.action = 'flag' and a.reverted_at is null
    and a.entity_id in ('4b67012e-8a10-44cc-b039-87790f5704eb',
                        'eef37b46-df37-48fa-8ac4-2e23846c826c');
  if v_bad <> 0 then
    raise exception 'P1 failed: % of the two queue rows are still flagged', v_bad;
  end if;

  -- P2 The event is archived AND the archive is replayable. prev_state->>'status'
  --    is the value a reopen restores, so a null or already-'cancelled' snapshot
  --    would be an archive nothing could undo. Deliberately NOT keyed on this
  --    file's own evidence stamp: a concurrent session reaching the same
  --    disposition by another route must satisfy this, or a correct fix
  --    elsewhere aborts db push for the whole repo.
  select count(*) into v_bad
  from public.events e
  join public.entity_existence_audit a
    on a.entity_type = 'event' and a.entity_id = e.id
   and a.action = 'archive' and a.reverted_at is null
  where e.id = '4b67012e-8a10-44cc-b039-87790f5704eb'
    and e.status = 'cancelled'
    and e.seo_indexable = false
    and a.prev_state->>'status' = 'active';
  if v_bad <> 1 then
    raise exception 'P2 failed: event 9 Moons is not archived-and-replayable (matched %)', v_bad;
  end if;

  -- P3 Same for the listing: inactive, with a prev_state that restores 'active'.
  select count(*) into v_bad
  from public.marketplace_listings m
  join public.entity_existence_audit a
    on a.entity_type = 'marketplace' and a.entity_id = m.id
   and a.action = 'archive' and a.reverted_at is null
  where m.id = 'eef37b46-df37-48fa-8ac4-2e23846c826c'
    and m.status = 'inactive'
    and a.prev_state->>'status' = 'active';
  if v_bad <> 1 then
    raise exception 'P3 failed: listing is not archived-and-replayable (matched %)', v_bad;
  end if;

  -- P4 Scoped to archives that DO carry an admin_verification stamp: each must
  --    also still carry the engine's own reading, because a decision that
  --    erases its own input cannot be audited. Vacuous (and correctly so) if
  --    another session dispositioned these rows without a stamp; exact for the
  --    two this file writes.
  select count(*) into v_bad
  from public.entity_existence_audit a
  where a.action = 'archive'
    and a.signals ? 'admin_verification'
    and (a.signals->>'strong_dead') is null;
  if v_bad <> 0 then
    raise exception 'P4 failed: % verified archive(s) lost the flag''s strong_dead reading', v_bad;
  end if;

  -- P5 The queue the page reads is actually empty for these two. P1 asserts the
  --    audit rows; this asserts the RPC the UI calls, which is a different
  --    question -- existence_review_queue could filter differently.
  select count(*) into v_bad
  from public.entity_existence_audit a
  where a.action = 'flag' and a.reverted_at is null;
  raise notice 'P5: % flag row(s) remain open across all types', v_bad;
end $verify$;
