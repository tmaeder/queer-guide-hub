-- Delete the self-referential alias "Pride" -> "Pride" that 20340101100000 created.
--
-- MEASURED. 20340101100000 (#3369) merged the occ "Pride" tag into the news
-- "Pride" tag at 12:45:10 UTC. At 12:45:48 -- 38 seconds later -- tag_aliases
-- gained:
--
--   alias_name 'Pride', alias_slug 'pride', alias_type 'synonym',
--   review_status 'approved', canonical_tag_id -> the tag whose own name is
--   'Pride' (slug news-pride)
--
-- An alias identical to its canonical tag's name carries no information: nothing
-- can resolve through it that would not resolve without it. `alias_equals_name`
-- is a zero-invariant in tag_hygiene_stats() for that reason, and 20261012090000
-- deleted 47 such rows on the same grounds. This is the 48th.
--
-- It also fails `Critical data-quality gates` (0 -> 1), which is a required
-- check, so every PR opened after #3369 is blocked until it is gone.
--
-- THE PRODUCER IS NOT SEALED HERE, deliberately, and that is worth stating
-- plainly because a one-shot repair that leaves the producer open is how this
-- row comes back. merge_tag_concept writes:
--
--   if not exists (select 1 from public.tag_aliases where alias_slug = v_dup_slug) then
--     insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, ...)
--     values (p_canonical_id, v_dup_name, v_dup_slug, 'synonym', 'approved');
--
-- The guard is on alias_SLUG uniqueness only. It never compares the dropped
-- tag's NAME against the canonical's name, so merging any two tags that share a
-- name but differ in slug -- which is precisely the duplicate shape that merge
-- exists to resolve -- always produces a self-alias. Two tags named "Pride" with
-- slugs `news-pride` and the occ one is not an exotic case; it is the normal one.
--
-- The fix belongs in that guard (`and lower(v_dup_name) is distinct from
-- lower(<canonical name>)`), but merge_tag_concept is a large function owned by
-- the tag subsystem and restating it wholesale from an unrelated PR is exactly
-- the failure mode that dropped the admin gate from find_duplicate_clusters
-- (20260811100200) and lost `assert_admin_or_internal` for months. Left to that
-- owner with the analysis above rather than transcribed here.
--
-- NOT TOUCHED: `event_tag_pairs_unlinked`, which the same gate reports as
-- 0 -> 3407. That one needs no action at all and must NOT be re-baselined. The
-- metric only counts tag keys that resolve UNAMBIGUOUSLY, so while two tags were
-- named "Pride" every Pride pair was excluded and the counter read 0 -- the
-- metric was blind, not clean. #3369 made the key unambiguous and the pre-existing
-- backlog became visible, which is literally what its title says it fixed.
-- Measured: 100% of the unlinked pairs carry the `pride` key, and the auto-tagging
-- path is draining them on its own (3,407 -> 1,407 in ~35 minutes, 6,000 event
-- links written in 45). Re-baselining a number that is falling to zero would
-- freeze a backlog as the new normal.

DO $repair$
DECLARE v_deleted int; v_remaining int;
BEGIN
  DELETE FROM public.tag_aliases a
   USING public.unified_tags t
   WHERE t.id = a.canonical_tag_id
     AND lower(btrim(a.alias_name)) = lower(btrim(t.name));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) INTO v_remaining
    FROM public.tag_aliases a JOIN public.unified_tags t ON t.id = a.canonical_tag_id
   WHERE lower(btrim(a.alias_name)) = lower(btrim(t.name));

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'still % self-alias row(s) after the delete', v_remaining;
  END IF;

  -- Deliberately NOT asserting v_deleted = 1. The auto-tagging and merge paths
  -- run continuously, so another self-alias could legitimately appear between
  -- writing this and applying it; and if CI re-runs the migration against a
  -- database where it already applied, 0 is the correct answer. The invariant
  -- worth asserting is the end state, not the delta.
  RAISE NOTICE 'self-aliases deleted: %, remaining: %', v_deleted, v_remaining;
END $repair$;
