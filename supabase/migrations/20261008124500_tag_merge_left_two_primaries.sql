-- A tag merge left one tag with TWO primary categories, so its page renders a
-- category chosen by row order.
--
-- Found by the census `20261006200000` installed (zero active tags may disagree
-- between their published `category` text and their primary junction). That
-- census was 0 immediately after it applied and read 1 an hour later:
--
--   gender-neutral-bathroom   text/category_id = Venue Features & Policies
--                             primary junction = Gender
--
-- It was not a text/junction drift at all — the tag had two junction rows and
-- BOTH carried `is_primary`:
--
--   Gender                     (gender-identity) is_primary  created 2026-06-07
--   Venue Features & Policies  (safe-spaces)     is_primary  created 2026-08-29 10:15
--
-- THE OFFENDING ROW MOVED TWICE WHILE THIS WAS BEING WRITTEN, WHICH IS WHY
-- NOTHING BELOW NAMES A SLUG. A concurrent session repaired
-- `gender-neutral-bathroom`, and by the next measurement `u-equals-u` had taken
-- its place — `Orientation*` and `Sexual Health*`, both primary, on a tag whose
-- description is "Undetectable = Untransmittable." The count stayed at exactly
-- one the whole time while the identity of the row changed underneath it. A
-- migration pinned to a slug would have asserted someone else's fix and missed
-- the live defect; this one is structural end to end.
--
--
-- THE PRODUCER IS `merge_tag_concept`, AND IT IS GENERAL
--
-- `20261007140000_prevention_bathroom_plural_twin` merged the plural
-- `gender-neutral-bathrooms` into the singular. Its header records that the
-- plural "sat in `gender-identity`, a concept stop, under the retired v2
-- filing" while the singular sits in `safe-spaces` — so the two rows were
-- primary-filed under DIFFERENT categories. `merge_tag_concept` then does:
--
--   delete from tag_category_assignments d
--    where d.tag_id = p_duplicate_id
--      and exists (select 1 from tag_category_assignments c
--                   where c.tag_id = p_canonical_id and c.category_id = d.category_id);
--   update tag_category_assignments set tag_id = p_canonical_id
--    where tag_id = p_duplicate_id;
--
-- It de-duplicates by `category_id` — which only removes the loser's row when
-- the winner already holds that SAME category — and then re-parents whatever is
-- left **verbatim, `is_primary` included**. Any merge of two tags whose primary
-- categories differ therefore produces two primaries. That migration asserted
-- the redirect, the alias and the assignment move, but not that the winner
-- still has exactly one primary.
--
-- This is not a one-off: cron `tag_plural_merge` (`25 4 * * *`, active) calls
-- `merge_tag_concept` unattended on every (singular, plural) pair.
--
--
-- WHY IT MATTERS TO A READER
--
-- `fetchTagWithCategories` picks the primary with
-- `categories.find((c) => c.is_primary)` — a find over an UNORDERED PostgREST
-- result. With two primaries the category on /tags/gender-neutral-bathroom is
-- whichever row comes back first, and it can differ between requests. The
-- search facet is not ambiguous — it reads the `category` text column and says
-- `Venue Features & Policies` — so the page can silently contradict search,
-- which is the exact two-surface disagreement 20261006200000 exists to end.
--
--
-- DIRECTION: KEEP `Venue Features & Policies`, DEMOTE `Gender`
--
-- Not a judgement call. Three independent signals already say it, and the
-- merge's own author said it in prose:
--   * `unified_tags.category_id`  -> safe-spaces
--   * `unified_tags.category`     -> Venue Features & Policies
--   * `search_documents` facet    -> Venue Features & Policies
--   * 20261007140000's header     -> "a bathroom policy is a venue feature"
-- The `Gender` row is the loser's retired-v2 filing, dragged across by the
-- merge. It is DEMOTED, not deleted: it stays a secondary assignment, which is
-- how every other cross-listed tag is represented, and deleting a curated
-- assignment is a separate editorial act.
--
-- The rule is expressed structurally — demote any primary that is not the one
-- `unified_tags.category_id` names — so this repairs the class, not the row,
-- and is a no-op if a concurrent session fixed it first.
--
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
-- It does not patch `merge_tag_concept` and it does not add a partial unique
-- index on `(tag_id) where is_primary`. Both are tempting and both change the
-- behaviour of an unattended nightly cron: the index would turn silent
-- corruption into a hard error inside `tag_plural_merge`, and a corrected
-- function has to decide WHICH side's filing survives a merge — the winner's
-- `category_id`, which is what this migration assumes, is a merge-semantics
-- decision that belongs with the people who own that function rather than in a
-- repair that found the symptom. Restating a large SECURITY DEFINER function on
-- a branch while another session edits the same area is also how two rewrites
-- silently drop each other. The producer is recorded above and left open.
--
-- app.actor must not match 'system:%': log_unified_tag_change() raises on any
-- change to a human_reviewed row by a system actor. This migration writes only
-- `tag_category_assignments`, not `unified_tags`, but the AFTER trigger on that
-- table recomputes `is_adult` on the parent, so the actor is set anyway.

select set_config('app.actor', 'migration:tag-merge-left-two-primaries', true);

do $mig$
declare
  v_before int;
  v_demoted int;
  v_resynced int;
  v_n int;
begin
  select count(*) into v_before
    from (select tag_id from tag_category_assignments
           where is_primary group by tag_id having count(*) > 1) x;

  -- Reviewed at 1. A larger set means a merge ran between the measurement and
  -- this migration, or the producer is firing more often than believed — either
  -- way the direction rule below has not been checked against those rows.
  if v_before > 5 then
    raise exception
      'tag merge two primaries: % tag(s) carry more than one primary — larger than the reviewed set, re-measure', v_before;
  end if;

  ---------------------------------------------------------------- part 1 write
  -- The violating tags, captured BEFORE the demote — part 2 has to resync
  -- exactly these, and after the demote they are no longer identifiable.
  create temp table _two_primaries on commit drop as
  select tag_id from tag_category_assignments
   where is_primary group by tag_id having count(*) > 1;

  -- Demote every primary that is not the category `unified_tags.category_id`
  -- names, but ONLY on tags that currently carry more than one. Scoping it to
  -- the violating tags is what keeps this a repair rather than a corpus-wide
  -- re-assertion of an invariant nothing else has been checked against.
  update tag_category_assignments a
     set is_primary = false
    from unified_tags t
   where a.tag_id = t.id
     and a.is_primary
     and t.category_id is not null
     and a.category_id is distinct from t.category_id
     and a.tag_id in (select tag_id from _two_primaries);
  get diagnostics v_demoted = row_count;

  ---------------------------------------------------------------- part 2 write
  -- RESYNC THE TEXT MIRROR, or this migration ends by creating the very
  -- disagreement it exists to remove. Measured on prod: `u-equals-u` carried
  -- `Orientation*` and `Sexual Health*`, with category_id = Sexual Health, the
  -- search facet already = Sexual Health, and only `unified_tags.category`
  -- still reading `Orientation`. Demoting the intruder leaves that text stale,
  -- and assertion 4 below then fires — which is exactly what the first dry run
  -- of this migration did.
  --
  -- The value is read from category_id's own category, never spelled out, so
  -- this cannot invent a filing. Writing `category` also fires
  -- trg_search_documents_tag (column-scoped on `category`), so search follows;
  -- a category_id write would NOT have, which is the trap 20261006200000
  -- documents.
  update unified_tags t
     set category = c.name
    from tag_categories c
   where c.id = t.category_id
     and t.id in (select tag_id from _two_primaries)
     and t.category is distinct from c.name;
  get diagnostics v_resynced = row_count;

  ----------------------------------------------------------------- assertions
  -- 1. No tag anywhere carries more than one primary. Corpus-wide, not scoped
  --    to the row this started from.
  select count(*) into v_n
    from (select tag_id from tag_category_assignments
           where is_primary group by tag_id having count(*) > 1) x;
  if v_n > 0 then
    raise exception 'tag merge two primaries: % tag(s) still carry more than one primary', v_n;
  end if;

  -- 2. THE DEMOTE DID NOT STRAND ANYONE. Demoting is only safe if the row it
  --    kept still exists; a tag that had two primaries and now has none would
  --    be worse than the defect, and `fetchTagWithCategories` would fall back
  --    to categories[0] — unordered again.
  select count(*) into v_n
    from unified_tags t
   where t.category_id is not null
     and exists (select 1 from tag_category_assignments a where a.tag_id = t.id)
     and not exists (select 1 from tag_category_assignments a
                      where a.tag_id = t.id and a.is_primary);
  if v_n > 0 then
    raise exception 'tag merge two primaries: % tag(s) with assignments now have NO primary', v_n;
  end if;

  -- 3. EVERY REPAIRED TAG AGREES ON ALL THREE SURFACES. Structural, with no
  --    slug literal: the offending row moved twice while this was being written
  --    (gender-neutral-bathroom was repaired by a concurrent session, and
  --    u-equals-u took its place), so pinning a slug would assert someone
  --    else's fix and miss the live one.
  select count(*) into v_n
    from _two_primaries p
    join unified_tags t on t.id = p.tag_id
   where t.category_id is null
      or not exists (select 1 from tag_category_assignments a
                      where a.tag_id = t.id and a.is_primary
                        and a.category_id = t.category_id)
      or t.category is distinct from (select c.name from tag_categories c where c.id = t.category_id);
  if v_n > 0 then
    raise exception 'tag merge two primaries: % repaired tag(s) still disagree across their surfaces', v_n;
  end if;

  -- 4. THE CENSUS IS EMPTY AGAIN. This is 20261006200000's assertion 5,
  --    re-asserted here because this migration exists only because it fired.
  select count(*) into v_n
    from unified_tags t
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
    join tag_categories c on c.id = a.category_id
   where t.status = 'active'
     and t.category is not null
     and t.category is distinct from c.name
     and exists (select 1 from tag_categories oc where oc.name = t.category);
  if v_n > 0 then
    raise exception 'tag merge two primaries: % active row(s) disagree with their primary junction', v_n;
  end if;

  raise notice 'tag merge two primaries: % tag(s) had two primaries, % assignment(s) demoted, % text mirror(s) resynced',
    v_before, v_demoted, v_resynced;
end
$mig$;
