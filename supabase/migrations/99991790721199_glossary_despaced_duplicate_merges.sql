-- Seven concepts each hold TWO rows, spelled with and without a hyphen.
--
-- The residue of the wrong-sense sweep that produced 99991790527174 (water-sports)
-- and 99991790620335 (teddybear): an indexable row whose despaced twin carries a
-- different `description`. Eight pairs, one of which was a wrong entity. These are
-- the other seven, and they are DUPLICATES — one concept, two rows — not wrong
-- senses. Reading them is what established that, and it is why they were not swept
-- with teddybear.
--
-- THE CORPUS HAS A SYSTEMATIC SHAPE HERE, AND IT DECIDES THE DIRECTION. In every
-- pair the indexed `article` row is the one that passed the editorial readiness gate,
-- and in three of the seven it is ALSO the thinner row, because the gate measures
-- review state rather than substance:
--
--   pair                          article side              utility side
--   ----                          ------------              ------------
--   water-sports / watersports    156+503 chars, indexed     106 chars, 15 assignments
--   cross-dresser / crossdresser  247+541, 3 aliases, 3 rel  247+428
--   bicurious / bi-curious        44+490, 1 assignment       155+479, 7 aliases
--   face-fucking / facefucking    102+419, careful body      233+390, category NULL
--   dark-room / darkroom          46, NO BODY                441+2577, 176 assignments
--   gunplay / gun-play            44 with a typo, NO BODY    396+482
--   boy-toy / boytoy              20, NO BODY                327+421
--
-- THE SURVIVOR IS WHICHEVER ROW BEST REPRESENTS THE CONCEPT, AND THE LANE FOLLOWS
-- FROM THE GATE. The tempting alternative — always keep the indexed row so no page is
-- lost — would merge `darkroom` (176 assignments, a 2,577-character body) into a
-- 46-character stub with no body, entombing the substance on a row that renders
-- nothing. `merge_tag_concept` does not move prose; the winner keeps its own. So for
-- the bottom three the stub is merged INTO the content row.
--
-- THE COST IS STATED RATHER THAN HIDDEN: `darkroom`, `gun-play` and `boytoy` are
-- `utility`, so those three concepts end with NO INDEXED PAGE where today a stub is
-- indexed. That is the honest outcome — `enforce_tag_publication_role` withholds
-- publication until a human sets `prose_reviewed_at`, and all three bodies are
-- unreviewed machine prose. The pages being lost render 20, 44 and 46 characters and
-- no body, which is the thin-content shape the deindexer exists for. Nothing is
-- destroyed: every character is preserved on the surviving row, all 176 + 15
-- assignments move, and a single human review publishes each one with its full body.
--
-- `prose_reviewed_at` IS DELIBERATELY NOT STAMPED to force those three into the
-- article lane. Measured, it carries 1,116 distinct timestamps across 2,515 rows, so
-- it is largely a per-row human act rather than a bulk flag; setting it here would
-- assert a review that did not happen, on exactly the machine prose the flag exists
-- to gate.
--
-- WHAT THE MERGE DOES AND DOES NOT MOVE — PROBED, NOT READ. It rewrites the `tags`
-- text array on 13 entity tables, moves `unified_tag_assignments` and
-- `tag_category_assignments` (de-duplicating first), retires the loser, mints an alias
-- from the loser's slug, and snapshots everything into `tag_merge_audit` so
-- `unmerge_tag_concept` can reverse it.
--
-- It does NOT move the loser's `tag_aliases`: probed on prod in a rolled-back
-- transaction, all seven of `bi-curious`'s translations stayed on the merged row, so
-- the manual move below is load-bearing rather than belt-and-braces.
--
-- IT DOES MOVE `tag_relations`, WHICH READING THE FUNCTION WOULD TELL YOU IT DOES NOT.
-- Nothing in `merge_tag_concept`'s body mentions them; the work is done by the trigger
-- `trg_unified_tags_repoint_relations` -> `unified_tags_repoint_relations_on_merge` ->
-- `merge_tag_repoint_relations`, which fires when the loser's row is retired and
-- repoints BOTH `source_tag_id` and `target_tag_id`. A first draft of this file
-- asserted the opposite and hand-moved one edge; the dry run failed and the probe
-- showed all three edges already on the keeper.
--
-- The trap worth carrying: a catalogue sweep for triggers whose function mentions
-- `tag_relations` MISSES this one, because the callee is named
-- `merge_tag_repoint_relations` and "tag_relations" is not a contiguous substring of
-- it. Probe the behaviour; do not grep for it.
--
-- FOUR OF THE SEVEN HIT THE 23505 TRAP (different categories on the two sides:
-- darkroom, face-fucking, gun-play, water-sports). Where they differ the merge
-- REPOINTS the loser's junction row instead of deleting it, and two `is_primary` rows
-- violate tag_category_assignments_one_primary_per_tag. The loser's primary is
-- demoted before, and the inherited membership deleted after — scoped to the LOSER'S
-- OWN category id, not to "anything that is not the keeper's", so a keeper with a
-- legitimate second membership keeps it.
--
-- PER-PAIR SPECIALS:
--   * `bi-curious` carries SEVEN multilingual aliases (bicurieux, bicuriosa,
--     bicuriose, bicuriosidad, bicuriosité, bicurioso, hétéro curieux). All are
--     translations of the concept and all are correct for the survivor; checked, none
--     shadows an existing tag NAME, so all seven move rather than being stranded.
--   * `facefucking` carries two `broader` edges and the trigger moves BOTH onto the
--     indexed keeper. `oral-sex` is correct and is kept. `coitus` is TOMBSTONED to
--     `rejected`, which is the established treatment for a wrong broader edge — the
--     UNIQUE key on (source, target, relation_type) then stops it being re-proposed,
--     and `get_tag_ontology` shows broader at auto+approved so a rejected row does not
--     render. The evidence is on the rows, not taste: `oral-sex` (Q2122) describes
--     itself as encompassing fellatio, which is exactly what face fucking is, while
--     `coitus` (Q5873) is a 0-use row with NO description and NO category whose only
--     prose reads "Intimate social activity involving physical intimacy". Leaving it
--     would publish a second, vaguer parent on an indexed page.
--
-- THREE LOSERS ARE `human_reviewed` (boy-toy, dark-room, gunplay), so the actor
-- declaration is load-bearing: log_unified_tag_change() RAISES for an undeclared
-- system actor, and `tag_merge_audit.snapshot` plus `tag_change_log.before_data` are
-- the only copies of what was there.
--
-- DELIBERATELY NOT DONE: no QID is nulled or repointed. `boytoy` carries Q21862836
-- whose `wikipedia_url` is the broader topic article `Age_disparity_in_sexual_
-- relationships`; a concept identifier may legitimately be broader, and the
-- 2026-08-29 repair explicitly declines to auto-clear that class.
--
-- Guarded by src/lib/__tests__/glossaryDespacedDuplicateMerges.test.ts.

do $$
declare
  r        record;
  v_keep   uuid;
  v_drop   uuid;
  v_keepcat uuid;
  v_dropcat uuid;
  v_done   int := 0;
  v_skipped int := 0;
begin
  perform set_config('app.actor',
    'migration:99991790721199_glossary_despaced_duplicate_merges', true);

  for r in
    select * from (values
      -- keeper                 loser            why the keeper wins
      ('water-sports', 'watersports'),   -- better prose; gains 15 assignments
      ('cross-dresser','crossdresser'),  -- longer body, 3 aliases, 3 relations
      ('bicurious',    'bi-curious'),    -- longer body, holds the assignment
      ('face-fucking', 'facefucking'),   -- careful negotiated-play body; loser has no category
      ('darkroom',     'dark-room'),     -- 176 assignments and a 2,577-char body vs a stub
      ('gun-play',     'gunplay'),       -- 878 chars vs a 44-char typo'd stub
      ('boytoy',       'boy-toy')        -- 748 chars vs 20
    ) as t(keep_slug, drop_slug)
  loop
    select id, category_id into v_keep, v_keepcat
      from public.unified_tags where slug = r.keep_slug and status = 'active';
    select id, category_id into v_drop, v_dropcat
      from public.unified_tags where slug = r.drop_slug and status = 'active';

    -- Soft on preconditions. A concurrent session may have merged or retired either
    -- side between authoring and CI, and an abort here blocks every migration queued
    -- behind it on main.
    if v_keep is null or v_drop is null then
      raise notice '% <- %: not both active, skipping', r.keep_slug, r.drop_slug;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- The 23505 trap, for the four pairs whose categories differ.
    update public.tag_category_assignments
       set is_primary = false
     where tag_id = v_drop and is_primary;

    perform public.merge_tag_concept(
      v_keep, v_drop,
      'migration:99991790721199', 'despaced_duplicate');

    -- Scoped to the loser's OWN category, so a keeper with a legitimate second
    -- membership is untouched.
    if v_dropcat is not null and v_dropcat is distinct from v_keepcat then
      delete from public.tag_category_assignments
       where tag_id = v_keep and category_id = v_dropcat;
    end if;

    v_done := v_done + 1;
  end loop;

  raise notice 'merged % pair(s), skipped %', v_done, v_skipped;

  ------------------------------------------------------- bi-curious's translations
  -- alias_slug is globally UNIQUE, so this is an UPDATE across rather than an
  -- insert+delete. All seven are translations of the concept and none shadows an
  -- active tag name.
  update public.tag_aliases a
     set canonical_tag_id = (select id from public.unified_tags where slug = 'bicurious')
   where a.canonical_tag_id = (select id from public.unified_tags where slug = 'bi-curious')
     and a.alias_slug in ('bicurieux','bicuriosa','bicuriose','bicuriosidad',
                          'bicuriosit','bicurioso','htro-curieux');

  ---------------------------------------------- face-fucking's inherited wrong parent
  -- The trigger has already moved BOTH of facefucking's broader edges onto the indexed
  -- keeper. `oral-sex` is correct and stays; `coitus` is tombstoned so it does not
  -- render and cannot be re-proposed.
  --
  -- The alias is `tr`, NOT `r`: the loop variable above is a plpgsql RECORD named `r`,
  -- and a table aliased `r` here makes `r.source_tag_id` resolve to that record
  -- instead of the table — "record r has no field source_tag_id", which the dry run
  -- raised and reading did not.
  update public.tag_relations tr
     set review_status = 'rejected'
   where tr.source_tag_id = (select id from public.unified_tags where slug = 'face-fucking')
     and tr.target_tag_id = (select id from public.unified_tags where slug = 'coitus')
     and tr.relation_type = 'broader'
     and tr.review_status <> 'rejected';
end $$;

do $verify$
declare v_bad int; v_txt text;
begin
  ------------------------------------------------------------------------------ P1
  -- Every loser is retired and redirects to its intended keeper. Asserted as PAIRS,
  -- so a merge that went the wrong way round fails here rather than passing a count.
  select count(*) into v_bad from (values
      ('water-sports','watersports'), ('cross-dresser','crossdresser'),
      ('bicurious','bi-curious'),     ('face-fucking','facefucking'),
      ('darkroom','dark-room'),       ('gun-play','gunplay'),
      ('boytoy','boy-toy')
    ) as t(keep_slug, drop_slug)
    join public.unified_tags d on d.slug = t.drop_slug
    join public.unified_tags k on k.id  = d.merged_into_id
   where d.status = 'merged' and k.slug = t.keep_slug;
  if v_bad <> 7 then
    raise exception 'P1: % of 7 pairs merged in the intended direction', v_bad;
  end if;

  ------------------------------------------------------------------------------ P2
  -- Every keeper is still active. A merge cannot have retired both sides.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and slug in ('water-sports','cross-dresser','bicurious','face-fucking',
                  'darkroom','gun-play','boytoy');
  if v_bad <> 7 then
    raise exception 'P2: % of 7 keepers are still active', v_bad;
  end if;

  ------------------------------------------------------------------------------ P3
  -- THE CONTENT SURVIVED. This is the half the tempting direction would have
  -- destroyed: the three keepers chosen for substance still carry their bodies.
  select count(*) into v_bad from public.unified_tags
   where (slug = 'darkroom' and length(coalesce(long_description,'')) > 2000)
      or (slug = 'gun-play' and length(coalesce(long_description,'')) > 400)
      or (slug = 'boytoy'   and length(coalesce(long_description,'')) > 400);
  if v_bad <> 3 then
    raise exception 'P3: % of 3 substance keepers kept their body', v_bad;
  end if;

  ------------------------------------------------------------------------------ P4
  -- THE ASSIGNMENTS MOVED. 176 + 15 links would silently vanish if the merge had
  -- gone the other way, and a row count alone would not show it.
  select count(*) into v_bad from public.unified_tag_assignments a
    join public.unified_tags t on t.id = a.tag_id where t.slug = 'darkroom';
  if v_bad < 176 then
    raise exception 'P4: darkroom holds only % assignments, expected >= 176', v_bad;
  end if;
  select count(*) into v_bad from public.unified_tag_assignments a
    join public.unified_tags t on t.id = a.tag_id where t.slug = 'water-sports';
  if v_bad < 15 then
    raise exception 'P4b: water-sports holds only % assignments, expected >= 15', v_bad;
  end if;

  ------------------------------------------------------------------------------ P5
  -- Exactly one primary category per keeper — the 23505 trap's postcondition. Named
  -- rather than counted, so a failure says WHICH keeper and how many it has.
  select string_agg(bad.slug || '=' || bad.n::text, ', ') into v_txt
    from (
      select t.slug, count(*) as n
        from public.unified_tags t
        join public.tag_category_assignments a on a.tag_id = t.id and a.is_primary
       where t.slug in ('water-sports','cross-dresser','bicurious','face-fucking',
                        'darkroom','gun-play','boytoy')
       group by t.slug
      having count(*) <> 1
    ) bad;
  if v_txt is not null then
    raise exception 'P5: keeper(s) with the wrong number of primary categories: %', v_txt;
  end if;

  -- ...and the mirror: every keeper HAS one. The check above is silent for a keeper
  -- with zero primary rows, because the group disappears entirely.
  select count(distinct t.slug) into v_bad
    from public.unified_tags t
    join public.tag_category_assignments a on a.tag_id = t.id and a.is_primary
   where t.slug in ('water-sports','cross-dresser','bicurious','face-fucking',
                    'darkroom','gun-play','boytoy');
  if v_bad <> 7 then
    raise exception 'P5b: only % of 7 keepers have a primary category', v_bad;
  end if;

  ------------------------------------------------------------------------------ P6
  -- The seven translations reached bicurious, and none is stranded on the merged row.
  select count(*) into v_bad from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where t.slug = 'bicurious'
     and a.alias_slug in ('bicurieux','bicuriosa','bicuriose','bicuriosidad',
                          'bicuriosit','bicurioso','htro-curieux');
  if v_bad <> 7 then
    raise exception 'P6: % of 7 translations reached bicurious', v_bad;
  end if;

  ------------------------------------------------------------------------------ P7
  -- face-fucking kept the CORRECT inherited parent, and it still DISPLAYS. The
  -- relation moved by trigger, so this also proves the trigger ran.
  select count(*) into v_bad from public.tag_relations r
    join public.unified_tags s on s.id = r.source_tag_id
    join public.unified_tags t on t.id = r.target_tag_id
   where s.slug = 'face-fucking' and t.slug = 'oral-sex'
     and r.relation_type = 'broader' and r.review_status <> 'rejected';
  if v_bad <> 1 then
    raise exception 'P7: face-fucking does not carry a displaying broader -> oral-sex';
  end if;

  -- ...and the wrong one is tombstoned rather than deleted. Asserted as EXISTS-and-
  -- rejected, not as absent: a delete would also satisfy "does not display" while
  -- leaving the pair free to be re-proposed.
  select count(*) into v_bad from public.tag_relations r
    join public.unified_tags s on s.id = r.source_tag_id
    join public.unified_tags t on t.id = r.target_tag_id
   where s.slug = 'face-fucking' and t.slug = 'coitus'
     and r.relation_type = 'broader' and r.review_status = 'rejected';
  if v_bad <> 1 then
    raise exception 'P7b: the coitus edge is not tombstoned on face-fucking';
  end if;

  select count(*) into v_bad from public.tag_relations r
    join public.unified_tags s on s.id = r.source_tag_id
    join public.unified_tags t on t.id = r.target_tag_id
   where s.slug = 'face-fucking' and t.slug = 'coitus' and r.review_status <> 'rejected';
  if v_bad <> 0 then
    raise exception 'P7c: coitus still displays as a parent of face-fucking';
  end if;

  ------------------------------------------------------------------------------ P8
  -- CONTROLS. Neighbouring rows this file must not have touched — without these, a
  -- sweep that merged every despaced twin in the corpus would satisfy everything
  -- above.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and slug in ('bear','teddy-bear','plushophilia','aquatic-sports',
                  'oral-sex','piss-play','golden-shower','urophilia','scat-play');
  if v_bad <> 9 then
    raise exception 'P8: % of 9 neighbouring rows are still active', v_bad;
  end if;

  raise notice 'despaced duplicates OK: 7 pairs merged, content and assignments preserved';
end
$verify$;
