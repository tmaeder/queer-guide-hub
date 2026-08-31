-- A tag merged twice becomes unreachable: resolve_tag_slug follows one hop.
--
-- APPLIED VIA MCP AND COMMITTED AT THE STAMPED VERSION, per the CLAUDE.md
-- early-apply convention.
--
-- HOW IT PRESENTS. /tags/party-play returned 404 even though a redirect existed
-- and the surviving concept is active. The chain is in unified_tags itself:
--
--   party-play -> party-and-play -> chemsex        (chemsex is active)
--
-- resolve_tag_slug takes one hop, lands on party-and-play, finds it is itself
-- merged rather than active, and returns null. The reader gets a 404 for a tag
-- whose successor is live. Repointing tag_slug_redirects (20260830011607) fixed
-- the redirect table but not this: the defect is one layer down.
--
-- Three chains existed, and two are identity vocabulary people search for:
--
--   party-play                   -> party-and-play           -> chemsex
--   crossdresser/transvestite    -> crossdressertransvestite -> crossdresser-transvestite
--   consensual-non-consent-(cnc) -> consensual-non-consent   -> consensual-non-consent-cnc
--
-- Each arises the same way: a tag is merged, and later its target is merged
-- again by a different pass. No single merge is wrong and nothing collapses the
-- path afterwards — merge_tag_concept sets merged_into_id to its immediate
-- winner and has no reason to know it is extending someone else's chain.
--
-- THE FIX IS PATH COMPRESSION, not re-merging. Every merged tag is repointed at
-- the TERMINAL row of its chain so one hop is always enough. No merge decision
-- changes and no history is lost: tag_merge_audit is untouched and the
-- intermediate rows keep their own merged_into_id.
--
-- WHAT THIS DELIBERATELY DOES NOT FIX, AND WHY THE ASSERTION IS NARROW
--
-- A first draft asserted that EVERY merged tag resolves to an active row in one
-- hop. That failed, correctly, on five rows this migration cannot repair:
--
--   fluctuating-evolving                 -> fluctuating/evolving           (deprecated)
--   hpv-human-papillomavirus             -> hpv                            (deprecated)
--   projectors                           -> projector                      (deprecated)
--   sensation-and-stimulation-devices    -> sensation-stimulation-devices  (deprecated)
--   sexually-transmitted-infections-stis -> sexually-transmitted-infection (deprecated)
--
-- Those targets are `deprecated`, not `merged` — no successor to follow, so
-- compression has nothing to do. Their cause is different and worth naming: the
-- tag was merged, the merge moved all usage onto the winner, and
-- deprecate_unused_tags() then deprecated the winner for zero usage. The
-- canonical target died of the merge that made it canonical.
--
-- Reviving them is a content decision, not a repair — `sti` is already active
-- and covers one case, while `hpv` has NO active page at all, which is a real
-- gap for a sexual-health glossary and belongs to whoever owns that vocabulary.
-- Asserting it here would assert a corpus invariant this migration has no way
-- to establish, which is exactly what blocked db push three times on
-- 20261003110400. The assertion is scoped to what compression guarantees: no
-- surviving chain, and no self-reference.
--
-- BOUNDED AND CYCLE-SAFE. At most 10 iterations, stopping when nothing changes;
-- a cycle would otherwise spin forever. A row is never pointed at itself.
-- Chains were 2 deep so one pass sufficed — the loop exists because the next one
-- may not be.

do $mig$
declare
  v_iter int := 0;
  v_moved int;
  v_total int := 0;
  v_left int;
begin
  perform set_config('app.actor', 'admin:collapse-chained-tag-merges', true);

  loop
    v_iter := v_iter + 1;
    exit when v_iter > 10;

    update public.unified_tags t
       set merged_into_id = m.merged_into_id,
           updated_at = now()
      from public.unified_tags m
     where t.merged_into_id = m.id
       and m.merged_into_id is not null
       and m.merged_into_id <> t.id;      -- never point a row at itself
    get diagnostics v_moved = row_count;

    v_total := v_total + v_moved;
    exit when v_moved = 0;
  end loop;

  select count(*) into v_left
    from public.unified_tags t
    join public.unified_tags m on m.id = t.merged_into_id
   where m.merged_into_id is not null;
  if v_left > 0 then
    raise exception 'collapse merges: % chained merge(s) survive — possible cycle', v_left;
  end if;

  if exists (select 1 from public.unified_tags where merged_into_id = id) then
    raise exception 'collapse merges: a self-referential merge was created';
  end if;

  raise notice 'collapse merges: % pointer(s) compressed in % iteration(s)', v_total, v_iter;
end
$mig$;
