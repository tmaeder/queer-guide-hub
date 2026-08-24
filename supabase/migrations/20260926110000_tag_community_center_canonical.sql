-- Closes the last merged-but-active row, and retracts a wrong claim about the
-- 58 "broken" redirects. Both come out of re-measuring on prod rather than
-- trusting the notes I wrote a few hours earlier.
--
-- ## community-center was pointed at a dead end
--
-- 20260921130000 repaired 8 of the 9 tags whose merged_into_id was set while
-- status stayed 'active', and deliberately skipped this one because its
-- canonical is deprecated — flipping it to 'merged' would have turned a live
-- page into a 301 landing on a 404.
--
-- That was the right call for that migration and the wrong diagnosis of the
-- row. Looking at the whole cluster:
--
--   community-center          active      uses=0   -> community-center-venue
--   community-center-venue    deprecated  uses=0
--   community-centers         merged      uses=0   -> community-center
--   lgbt-community-centre     deprecated
--   lgbt-community-centre-etc deprecated
--   lgbtq-community-centers   deprecated
--   nudist-community-center   deprecated
--   queer-community-centers   deprecated
--
-- community-center is the ONLY live tag in its own cluster, and something is
-- already merged INTO it (community-centers 301s here today, verified on prod).
-- It is the canonical. Its merged_into_id pointing at a deprecated sibling is
-- simply wrong data, not a merge waiting to be honoured.
--
-- So the fix is to clear the pointer, not to follow it. That makes
-- merged_but_not_status_merged a true zero and leaves /tags/community-center
-- serving exactly as it does now.

do $$
declare v_fixed int; v_left int;
begin
  perform set_config('app.actor', 'migration:20260926110000_tag_community_center_canonical', true);

  update unified_tags u
     set merged_into_id = null
   where u.slug = 'community-center'
     and u.status = 'active'
     and u.merged_into_id is not null
     -- Only when the thing it points at is unusable as a canonical. If someone
     -- revives community-center-venue before this runs, the merge becomes real
     -- and must be honoured rather than silently discarded.
     and exists (
       select 1 from unified_tags c
        where c.id = u.merged_into_id
          and (c.status <> 'active' or c.merged_into_id is not null));
  get diagnostics v_fixed = row_count;

  select count(*) into v_left from unified_tags
   where merged_into_id is not null and status <> 'merged';

  raise notice 'community-center canonical repair: % fixed, % merged-but-active left', v_fixed, v_left;

  -- The whole point is that this reaches zero. If it did not, something else
  -- has drifted into the same state and should be looked at, not tolerated.
  if v_left <> 0 then
    raise warning 'still % merged-but-active tag(s) — check tag_hygiene_stats()', v_left;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Retraction: `redirect_to_non_canonical` is hygiene, not exposure.
--
-- I baselined that metric at 58 with the note "301s into a 404 ... recorded so
-- the 59th is caught". Measured on prod, that is wrong — those redirects never
-- fire. PR #2828 put `status=eq.active` on the redirect TARGET in the lookup,
-- so a row whose target is deprecated is skipped and the URL returns a clean
-- 404 in one hop:
--
--   /tags/alex-j-rgen    404   (target alex-jurgen  is deprecated)
--   /tags/bisexualit-t   404   (target bisexualitat is deprecated)
--   /tags/bruno-gm-nder  404   (target bruno-gmunder is deprecated)
--   /tags/cacha-a        404   (target cachaca      is deprecated)
--
-- 57 of the 58 are accent-folding pairs of that shape. They are inert table
-- rows, not live redirect chains, and a 59th would be inert too.
--
-- They are deliberately NOT deleted. A deprecated tag can be revived, and
-- 20260910181447 exists precisely to re-mint redirects when that happens —
-- deleting these would destroy information that a revival makes useful again.
-- The metric stays (a growing pile still means merges are being made against
-- dying targets) but its description now says what it actually measures.
comment on function public.tag_hygiene_stats() is
  'Read-only tag data-quality counters. Every key outside "totals" is a defect count that must not grow; scripts/check-tag-hygiene.mjs ratchets them against scripts/tag-hygiene-baseline.json, treating the keys listed in its _advisory array as warn-only drift. NOTE on redirect_to_non_canonical: these rows are INERT, not live 301-into-404s — the edge lookup filters redirect targets on status=active (PR #2828), so such a URL returns a clean 404 in one hop. Verified on prod 2026-08-23. It is a hygiene counter, not an exposure counter.';
