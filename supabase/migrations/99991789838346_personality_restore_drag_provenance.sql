-- person_outing_guard = 3: three public, living people assert an LGBTI identity
-- with no provenance. Restore the provenance; do not unpublish the people.
--
-- `99991789819775` (#3813) cleared 84 non-human wikidata_qids — correctly. Three
-- of those rows are `visibility='public'`, `is_living`, and carry an
-- `lgbti_connection` in (community_member, activist, representation), which is
-- exactly what `trust_safety_gate_status()`'s CRITICAL `person_outing_guard`
-- forbids: a positive identity label about a living person, published, with
-- nothing standing behind it. The gate has been red on EVERY open PR since
-- 13:06 UTC, so this is also what is blocking the repo.
--
-- #3813 was right not to touch visibility — "Deindexing them would punish the
-- subject for our resolver's error" — and right not to repoint 84 stage names
-- by hand. THESE THREE ARE NOT THAT EDITORIAL PASS, because nothing is guessed:
-- the correct identifier was ALREADY IN EACH ROW, recorded by the Drag Race
-- importer in `personality_sources` and never promoted to the column the
-- platform reads. Before repairing a wrong derived value, check whether the
-- right one is already on the row.
--
-- EVERY IDENTIFIER WAS VERIFIED LIVE AGAINST WIKIDATA BEFORE THIS FILE WAS
-- WRITTEN, on the two gates `_shared/tag-wiki-guard.ts` requires — the entity
-- must be a human, and its label must agree with the name we publish:
--
--   Q16029552   "Alaska Thunderfuck 5000"  P31=Q5  American drag queen and recording artist
--   Q136296831  "Bones"                    P31=Q5  British drag performer
--   Q116205118  "Spice"                    P31=Q5  American drag queen
--
-- Spice is worth reading twice. Her row's only source pointed at the DUO she
-- performs in (Q116761079 "Sugar and Spice", P31=Q109288825), which is why
-- #3813 correctly refused it — a duo is not a person. The individual item is
-- reachable from that duo by one documented edge (P527 `has part`), so this is
-- still evidence from the row rather than a name lookup. Name-only resolution
-- of a person is what this repo forbids outright: `Spice` as a bare string
-- matches a girl group, a Marvel character and a dozen other things.
--
-- ── THE DISPOSITION IS NOT THE SAME FOR ALL THREE, AND THE DRY RUN IS WHAT
--    FOUND THAT ───────────────────────────────────────────────────────────
--
-- Writing Q16029552 onto `alaska` raises 23505: `personalities_wikidata_qid_uniq`
-- already holds it. The constraint is right and the finding is a second,
-- latent defect — TWO PUBLIC PAGES FOR ONE PERSON:
--
--   alaska-thunderfuck-5000   created 2025-08-15, bio 429, 2 competition rows, Q16029552
--   alaska                    created 2026-06-10, bio 330, 0 competition rows, no QID
--
-- So `alaska` is not a row missing an identifier; it is a thin import
-- duplicate of a canonical row that already has one. Giving it the QID was
-- never available, and unpublishing it would leave the duplicate standing.
-- It is MERGED into the canonical row through `merge_entities`, which reparents
-- children, writes `entity_merge_audit` and is reversible by
-- `unmerge_entities` (schema:1 since `29000101100000`).
--
-- That merge clears the gate for a different reason than the other two:
-- `person_outing_guard` filters `duplicate_of_id IS NULL`, so a merged row is
-- no longer making the claim at all.
--
-- A PERSON MERGE NEEDS MORE THAN A MATCHING NAME, and has it here. This repo
-- refuses name-only person merges outright (namesake/outing risk) and requires
-- a shared non-null identifier or birth date. The evidence is that `alaska`'s
-- OWN dragrace-wikipedia source records `Q16029552` — the identifier the
-- canonical row carries. That is a shared identifier, not a shared string.
--
-- SOFT ON PRECONDITIONS: a row already repointed or already merged by a
-- concurrent session is skipped, not aborted on. HARD ON THE POSTCONDITION:
-- the gate must read 0, which is a claim about the CORPUS rather than about
-- this file's own writes. REVERSIBLE both ways: #3813 preserved the prior QIDs
-- in `enrichment_status.wikidata_repair`, the restores stamp their own record
-- beside it, and the merge is undone by `unmerge_entities`.

do $$
declare
  v_restored int := 0;
  v_merged   int := 0;
  v_keep     uuid;
  v_drop     uuid;
  v_guard    int;
begin
  -- ── 1. The two rows whose identifier is simply missing ──────────────────
  create temporary table _restore (slug text, qid text, label text, why text) on commit drop;
  insert into _restore (slug, qid, label, why) values
    ('bones', 'Q136296831', 'Bones',
     'P31=Q5, British drag performer; QID recorded by the dragrace-wikipedia import on this row'),
    ('spice', 'Q116205118', 'Spice',
     'P31=Q5, American drag queen; reached from the row''s own Q116761079 duo via P527 has-part');

  update public.personalities p
     set wikidata_qid = r.qid,
         enrichment_status = coalesce(p.enrichment_status, '{}'::jsonb)
           || jsonb_build_object('wikidata_restore', jsonb_build_object(
                'at', now(),
                'by', 'migration:personality_restore_drag_provenance',
                'qid', r.qid,
                'label', r.label,
                'evidence', r.why))
    from _restore r
   where p.slug = r.slug
     -- Only fill the hole #3813 left. A row someone has since repointed is
     -- already better off than this file would make it.
     and p.wikidata_qid is null
     and p.duplicate_of_id is null
     -- Belt and braces against the 23505 that found the duplicate above: never
     -- take an identifier another person already holds.
     and not exists (select 1 from public.personalities q
                      where q.wikidata_qid = r.qid and q.id <> p.id);
  get diagnostics v_restored = row_count;

  -- ── 2. The duplicate ────────────────────────────────────────────────────
  select id into v_keep from public.personalities
   where slug = 'alaska-thunderfuck-5000' and duplicate_of_id is null;
  select id into v_drop from public.personalities
   where slug = 'alaska' and duplicate_of_id is null and wikidata_qid is null;

  if v_keep is not null and v_drop is not null then
    -- Corroboration is re-asserted at run time rather than trusted from the
    -- header: the row being merged away must itself name the canonical row's
    -- identifier. If that source has since changed, this is no longer a
    -- shared-identifier merge and must not happen on a name alone.
    if not exists (
      select 1 from public.personality_sources s
       where s.personality_id = v_drop
         and s.source_entity_id = 'Q16029552'
    ) then
      raise exception
        'refusing to merge alaska: its own sources no longer corroborate Q16029552, so this would be a name-only person merge';
    end if;

    -- NAMED ARGUMENTS, not positional. `merge_entities` has two overloads and
    -- a three-argument positional call raises 42725 "is not unique" — found by
    -- the dry run. The parameter NAMES are what disambiguate, which is the
    -- same resolution rule PostgREST uses and the same trap this repo has
    -- been bitten by before.
    perform public.merge_entities(p_type => 'personality', p_keep_id => v_keep, p_drop_id => v_drop);
    v_merged := 1;
  end if;

  -- ── 3. The postcondition is the GATE, not the row count ─────────────────
  select failing into v_guard
    from public.trust_safety_gate_status()
   where gate = 'person_outing_guard';

  if v_guard <> 0 then
    raise exception
      'person_outing_guard is still % (restored %, merged %) — a public living person is asserting an LGBTI identity with no provenance',
      v_guard, v_restored, v_merged;
  end if;

  raise notice 'restored % row(s), merged % duplicate(s); person_outing_guard = 0', v_restored, v_merged;
end $$;
