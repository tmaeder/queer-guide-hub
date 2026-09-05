-- Two ICD-coded medical conditions are flagged 18+ by a Fetishes junction that a
-- MERGE left behind. Take the junction off; the age flag follows.
--
-- HOW THE ROW GETS HERE. Re-filing a tag by writing `unified_tags.category_id`
-- fires `sync_tag_category_assignment` (BEFORE — rewrites the denormalised
-- `category` text) and `sync_tag_category_assignment_after` (AFTER — demotes the
-- old primary junction to `is_primary=false` and promotes the new one). The old
-- junction SURVIVES the demotion, and `unified_tags_recompute_is_adult()` matches
-- ANY assignment, not the primary one. So the visible half of the re-file lands
-- and the row stays adult:
--
--     orgasmic-dysfunction   category='Sexual Health'   is_adult=TRUE
--       junctions: Fetishes (is_primary=false) + Sexual Health (is_primary=true)
--
-- `merge_tag_concept` produces the same shape a second way: it repoints the
-- loser's `tag_category_assignments` onto the winner, so merging away a row
-- filed under a kink category hands its filing to the survivor.
--
-- MEASURED, NOT ASSUMED — and the measurement is what keeps this migration
-- narrow. Six active tags corpus-wide have a non-kink primary category and a
-- non-primary KINK junction:
--
--     cruising              770 uses   Venue Features & Policies + Practices & Play
--     chemsex                39        Substances & Recovery     + Kink Community & Scenes
--     fisting                31        Sexual Health             + Practices & Play
--     daddy                   2        Slang & Language          + Fetishes
--     vaginismus              1        Sexual Health             + Fetishes
--     orgasmic-dysfunction    0        Sexual Health             + Fetishes
--
-- FOUR OF THE SIX ARE CORRECT. Cruising, chemsex, fisting and daddy have a real
-- kink dimension; an 18+ flag on them is a filing decision, not damage, and this
-- migration must not touch them. A hand-written list of the other two would be
-- the obvious way to express that and would say nothing about WHY.
--
-- THE DISCRIMINATOR IS DIAGNOSTIC CODES, and it separates the six exactly.
-- `tag_medical_codes` is populated only from Wikidata by the weekly
-- `tag_medical_codes_sync`, from properties registered in `medical_code_systems`
-- (ICD-9/10/11, SNOMED CT, ICPC-2, DiseasesDB …). A tag carries one iff its
-- Wikidata item is a clinical entity:
--
--     orgasmic-dysfunction  7 codes   ICD-11 HA02.0, ICD-10 F52.3, SNOMED 62607004, ICPC-2 P08 …
--     vaginismus            5 codes   ICD-11 HA20,   ICD-10 N94.2, DiseasesDB 13701 …
--     cruising / chemsex / fisting / daddy        0 codes
--
-- So the predicate is "a clinical condition is not a fetish", which is a
-- statement about the corpus rather than about these two slugs, and it stays
-- true for a row that acquires this shape next month. It is deliberately NOT
-- widened to "clear every non-primary kink junction": that would take the four
-- above with it.
--
-- WHY IT IS ONLY THE JUNCTION. `is_adult` is derived — the recompute trigger owns
-- it — so writing the column directly would be corrected back the next time
-- anything touched the row's assignments. Deleting the junction removes the
-- CAUSE and lets the existing trigger produce the effect, which is also why the
-- assertion below reads `is_adult` rather than counting junctions.
--
-- PROVENANCE OF EACH ROW, for the record:
--   vaginismus            inherited Fetishes from `sexual-pain-penetration-disorder`
--                         in the 2026-08-29 alias-shadow cleanup (20261011090000).
--   orgasmic-dysfunction  demoted-not-deleted by 20261221114500 (#3389), which
--                         re-filed it out of Fetishes by writing category_id.
-- Neither junction was ever a curation decision about the tag itself.

do $mig$
declare
  v_kink   uuid[];
  v_target uuid[];
  v_before jsonb;
  v_n      int;
  v_bad    int;
begin
  -- log_unified_tag_change() RAISEs when a `system:%` actor modifies a
  -- human_reviewed row, and both targets are human_reviewed. The recompute
  -- trigger writes `unified_tags` on our behalf, so the actor has to be declared
  -- even though this migration only DELETEs from a junction table.
  perform set_config('app.actor', 'migration:kink-junction-residue', true);

  -- The age gate is category-NAME-keyed on both sides (ADULT_CATEGORY_NAMES in
  -- the frontend, and the hardcoded names inside unified_tags_recompute_is_adult).
  -- Resolved here from the same names rather than from a list of ids, so a
  -- renamed category shows up as "resolved 0 categories" instead of silently
  -- matching nothing.
  select array_agg(id) into v_kink from public.tag_categories
   where name in ('Sex & Kink','Practices & Play','Dynamics & Roles','Fetishes','Gear','Kink Community & Scenes')
      or parent_id = (select id from public.tag_categories where name = 'Sex & Kink');
  if coalesce(array_length(v_kink, 1), 0) < 6 then
    raise exception 'kink junction residue: resolved only % kink categories — the vocabulary was renamed', coalesce(array_length(v_kink,1),0);
  end if;

  -- The work list, by shape. No slug literals.
  select array_agg(t.id) into v_target
    from public.unified_tags t
   where t.status = 'active'
     and not (t.category_id = any(v_kink))
     and exists (select 1 from public.tag_category_assignments a
                  where a.tag_id = t.id and not a.is_primary and a.category_id = any(v_kink))
     and exists (select 1 from public.tag_medical_codes m where m.tag_id = t.id);

  if coalesce(array_length(v_target, 1), 0) = 0 then
    raise notice 'kink junction residue: nothing matches — already clean';
    return;
  end if;

  -- Assert the measurement rather than trusting it. If this ever selects a large
  -- set, the shape has stopped meaning what the header says and a human should
  -- look before junctions are deleted in bulk.
  if array_length(v_target, 1) > 5 then
    raise exception 'kink junction residue: % rows match, expected the measured 2 — re-read before applying', array_length(v_target,1);
  end if;

  select jsonb_object_agg(slug, is_adult) into v_before
    from public.unified_tags where id = any(v_target);

  delete from public.tag_category_assignments a
   where a.tag_id = any(v_target)
     and not a.is_primary
     and a.category_id = any(v_kink);
  get diagnostics v_n = row_count;

  ------------------------------------------------------------------ assertions
  -- The point: the effect, not the deletion. is_adult is written by the
  -- recompute trigger, so this also proves the trigger fired.
  select count(*) into v_bad from public.unified_tags
   where id = any(v_target) and is_adult;
  if v_bad > 0 then
    raise exception 'kink junction residue: % target(s) are still 18+ — the recompute trigger did not fire', v_bad;
  end if;

  -- Every target was adult before, or this migration was a no-op dressed up as
  -- a fix and the assertion above proves nothing.
  if exists (select 1 from jsonb_each(v_before) e where not (e.value)::boolean) then
    raise exception 'kink junction residue: a target was already not adult — the premise does not hold';
  end if;

  -- The CAUSE is gone, not just the symptom. Without this, rewriting the delete
  -- as `update unified_tags set is_adult = false` would satisfy every assertion
  -- above while leaving the junction in place to be recomputed back — which is
  -- the whole failure this migration exists to undo, one layer down.
  select count(*) into v_bad
    from public.tag_category_assignments a
   where a.tag_id = any(v_target) and not a.is_primary and a.category_id = any(v_kink);
  if v_bad > 0 then
    raise exception 'kink junction residue: % kink junction(s) survive on a target — the flag was cleared without the cause', v_bad;
  end if;

  -- The four deliberate ones are untouched. Named as a SHAPE (kink filing, no
  -- clinical codes) so this keeps meaning something if the set changes.
  select count(*) into v_bad
    from public.unified_tags t
   where t.status = 'active' and t.slug in ('cruising','chemsex','fisting','daddy')
     and not t.is_adult;
  if v_bad > 0 then
    raise exception 'kink junction residue: % deliberately-adult tag(s) lost their flag', v_bad;
  end if;

  -- Nothing gained or lost a PRIMARY filing; only non-primary rows were removed.
  select count(*) into v_bad
    from public.unified_tags t
   where t.id = any(v_target)
     and (select count(*) from public.tag_category_assignments a where a.tag_id = t.id and a.is_primary) <> 1;
  if v_bad > 0 then
    raise exception 'kink junction residue: % target(s) no longer have exactly one primary category', v_bad;
  end if;

  raise notice 'kink junction residue: % junction(s) deleted across % tag(s); before=%',
    v_n, array_length(v_target,1), v_before;
end
$mig$;
