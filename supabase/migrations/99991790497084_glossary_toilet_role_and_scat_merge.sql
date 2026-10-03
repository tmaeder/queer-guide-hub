-- The two items 99991790449537 and 99991790451897 deferred: `toilet`'s two
-- senses, and the duplicate pairs. Both deferrals turned out to be wrong in
-- opposite directions — one was reachable under a rule that already exists, and
-- four of the five "duplicate pairs" are not duplicates at all.
--
-- ── PART 1: `toilet` IS THE KINK ROLE, AND THE AUDIT TRAIL IS WHAT SETTLED IT ─
--
-- 99991790449537 deferred this row on the ground that it "names TWO senses at
-- once" — Q7857 plus thirteen plumbing aliases against an is_adult +
-- is_sensitive + Dynamics & Roles filing — and that choosing a sense is the
-- guess the wrong-sense class came from. That was over-cautious, and
-- `tag_change_log` shows why: ALL of the plumbing evidence descends from ONE
-- contaminated identifier, and the role evidence predates it.
--
-- Read off the trail rather than reasoned about:
--   * the EARLIEST record (2026-04-27 17:30:53) already carries
--     description = 'Bathroom fixture role' AND category = 'Roles & Dynamics'
--     AND wikidata_id = Q7857;
--   * short_description = 'Sanitary hardware for human waste disposal' was
--     written at 2026-04-27 19:00:48 — ninety minutes LATER, from that QID;
--   * is_adult = true arrived 2026-05-04.
--
-- That window is the 2026-04-27 16:55-18:56 enrichment sweep this repo already
-- documents: the trigger sets wikidata_id, then the same sweep writes prose from
-- the entity 40-90 minutes later. It is the run that gave `golden-retriever` a
-- Scottish dog breed and `suspension` an account ban. So the plumbing summary,
-- the plumbing body, the thirteen sitelink aliases and both Wikidata-derived
-- relations are all one sweep's output from one wrong entity — not a second
-- legitimate sense competing with the first.
--
-- What the row is: the bare role noun, exactly as `toy` is. `toy`'s own
-- treatment is the model — description 'Plaything', summary 'Someone used as an
-- object of play within a negotiated dynamic', body opening 'Being someone's toy
-- is an objectification role'. `human-toilet` holds the arrangement and
-- `toilet-slave` the D/s position; this is the word said directly, and the
-- corpus keeps `toy` / `fucktoy` / `boy-toy` as separate role rows for the same
-- reason. Nothing uses it as a facility tag: usage_count and assignments are
-- both 0, and the venues `toilet` category is a CHECK value on `venues`, a
-- different table.
--
-- The identifier AND the cached wikipedia_url are both nulled. Nulling the QID
-- alone is the Kowloon mistake (99600101100000): city-factual-backfill fetches
-- by cached sitelink title, so a stale URL regenerates the wrong prose on the
-- next pass. Nothing is repointed — a plausible-but-wrong QID regenerates wrong
-- data forever while a null one regenerates nothing. Measured first: 0 rows in
-- tag_medical_codes, so the round-seventeen orphan-code class does not apply.
--
-- The two tag_sources rows citing Q7857 and the Toilet article are LEFT, both
-- is_public = false and therefore rendering nowhere — the same disposition
-- 99991790384461's predecessor gave the 22 rows citing its seven disowned
-- entities. Recorded rather than silently skipped.
--
-- ── PART 2: `scat` IS THE ONE REAL GLOSSARY DUPLICATE ────────────────────────
--
-- `scat` and `scat-play` are both active, both article, both seo_indexable, both
-- in search_documents, and both carry ZERO assignments — so nothing but prose is
-- at stake and the merge moves no content link. `scat-play` wins: it holds an
-- accurate 531-char body naming hepatitis A, shigella, E. coli and the
-- faecal-oral route, while `scat` has no body at all and a cruder description.
-- The Lavender Scare rule (20361124161700) is the precedent — the row with the
-- prose wins — and merging rather than deprecating mints an alias from the
-- loser's name, so a reader searching the community word still lands somewhere.
-- `Scat Play` is also the unambiguous headword: `scat` additionally means jazz
-- vocal improvisation and animal droppings, and this row has already been
-- wrong-entity'd once (Q30015788, subcutaneous adipose tissue, whose two Spanish
-- aliases 99991790449537 deleted).
--
-- THE CATEGORIES DIFFER, which is the 23505 trap and the reason for the dance
-- below. merge_tag_concept deletes the loser's junction row only when the winner
-- holds the SAME category_id; filed differently it REPOINTS it, and two
-- is_primary rows on one tag violate tag_category_assignments_one_primary_per_tag.
-- `scat` is Fetishes, `scat-play` is Practices & Play. So the loser's primary is
-- demoted BEFORE the merge and the inherited membership dropped after, per
-- 20361001100100: drop only the membership that is actually wrong, and a filing
-- inherited from the weaker row carries no editorial intent.
--
-- ── PART 3: FOUR OF THE FIVE "DUPLICATE PAIRS" ARE NOT DUPLICATES ────────────
--
-- Measured by entity_type, which is what settles it. Each is REFUSED and the
-- numbers are recorded so a later pass does not re-propose the merge:
--
--   * `latex` (198) / `mat-latex` (283) have the BYTE-IDENTICAL name "Latex" and
--     were the most convincing pair on the list. `mat-` is a REAL 22-member
--     material-facet namespace — mat-silicone 791, mat-gold 433, mat-spandex
--     401, mat-leather 379, mat-rubber 370, mat-cotton 359, mat-latex 283, and
--     fifteen more — the marketplace material facet, 281 of mat-latex's 283
--     assignments being marketplace_listing. Merging it would break a faceting
--     namespace to tidy a name collision. The same reasoning the `genre-%`
--     book-genre namespace gets.
--   * `anal` is 872 of 872 marketplace_listing — a PRODUCT FACET, not a
--     definition, the same shape as `hiv-aids` at 288 of 289 news. Merging it
--     into `anal-play` (1 news) or `anal-sex` (8 news) would destroy 872 facet
--     links and point a facet at a definition, which is the move 20260809100000
--     refused for news duplicates.
--   * `lube` (157) / `lubricant` (63) / `anal-lube` (21) are ALL marketplace
--     facets — 241 marketplace_listing assignments between them and zero of
--     anything else. Consolidating them is a marketplace-taxonomy decision owned
--     by the classifier vocabulary, not a glossary repair.
--   * `sextoy` (25 event) / `sex-toy` (2 news) do not even share an entity type.
--     Noted rather than fixed: `sextoy` carries 25 event assignments with ALL
--     THREE prose fields empty, and `sex-toy` has no category_id at all. Both
--     are real defects and neither is a merge.
--
-- The general finding: the facet vocabulary and the glossary share one table, so
-- most apparent duplicate pairs are one facet and one definition. Check
-- entity_type before proposing a merge.
--
-- Guarded by src/lib/__tests__/glossaryToiletRoleAndScatMerge.test.ts.

select set_config('app.actor', 'migration:99991790497084_glossary_toilet_role_and_scat_merge', true);

-- Load-bearing, not attribution: `toilet` and `scat-play` are both
-- human_reviewed, and log_unified_tag_change() RAISEs "cannot be modified by
-- system:trigger" for an undeclared writer. Verified live with a REAL value
-- change, since a self-assignment fires no trigger and reads as permissive.

create temporary table _tsm_before on commit drop as
select slug, description, short_description, long_description, wikidata_id, wikipedia_url
from unified_tags
where slug in ('toilet','scat','scat-play','human-toilet','toilet-slave','urinal',
               'latex','mat-latex','anal','lube','lubricant','sextoy');

-- ── 1. `toilet`: the role-typed wrong-sense repair ───────────────────────────
-- Guarded on the sweep's own output, so a concurrent better fix satisfies the
-- postcondition instead of being overwritten. `description` is NOT touched: it
-- is the evidence the repair rests on, and this series never writes it.
update unified_tags set
  short_description = 'Someone used as a receptacle within a negotiated dynamic.',
  long_description  = 'Being someone''s toilet is the bare role noun for the receiving side of human-toilet play: for the length of a scene a person is the thing another uses rather than a partner being used with. Human toilet names the arrangement and toilet slave names the same position inside a D/s frame; this is the word said plainly, and it is used as a claimed one. The scope that gets negotiated is almost always whether it is urine only, because that is what the infection picture turns on — urine is low-risk, while faeces carries hepatitis A, shigella and E. coli by the faecal-oral route, and hepatitis A vaccination is the precaution for that half.'
where slug = 'toilet' and status = 'active'
  and short_description = 'Sanitary hardware for human waste disposal';

-- The identifier and the CACHED TITLE together. Nulling the QID alone leaves the
-- url that regenerates the plumbing prose on the next enrichment pass.
update unified_tags set wikidata_id = null, wikipedia_url = null
where slug = 'toilet' and status = 'active'
  and wikidata_id = 'Q7857';

-- The thirteen sitelink aliases Q7857 produced. All `auto`, so inert for
-- display, auto-tagging and the search bridge since 20261012090000 — residue
-- rather than live harm, deleted on the same basis as `scat`'s two adipose
-- aliases and `safer-injecting`'s seven SLAM ones. A reader searching WC or Klo
-- should not land on a kink role.
delete from tag_aliases a
using unified_tags t
where a.canonical_tag_id = t.id
  and t.slug = 'toilet'
  and a.alias_slug in ('toilette','klosett','retirade','closett','rtchen','lokus','wc',
                       'klo','abort','stilles-rtchen','toilettes','cabinets','inodoro');

-- Both relations encode the PLUMBING taxonomy and both DISPLAY —
-- get_tag_ontology shows `broader` at auto+approved. `urinal -> toilet` is
-- "a urinal is a kind of toilet" and `toilet -> amenities` is toilet-as-facility;
-- each makes sense only for the disowned entity, which is the rope pass's test
-- (50500101100000). Marked `rejected` rather than deleted, because the unique key
-- on (source, target, relation_type) makes a rejected row the TOMBSTONE that
-- stops the verifier re-proposing it.
update tag_relations r set review_status = 'rejected'
where r.review_status = 'auto'
  and r.relation_type = 'broader'
  and (r.target_tag_id = (select id from unified_tags where slug = 'toilet')
    or r.source_tag_id = (select id from unified_tags where slug = 'toilet'));

-- ── 2. merge `scat` into `scat-play` ─────────────────────────────────────────
-- Demote the loser's primary junction FIRST: the two rows sit in different
-- categories, so merge_tag_concept repoints rather than deletes, and two
-- is_primary rows on one tag violate the one-primary constraint.
update tag_category_assignments a set is_primary = false
where a.tag_id = (select id from unified_tags where slug = 'scat' and status = 'active')
  and a.is_primary;

do $merge$
declare
  v_keep uuid;
  v_drop uuid;
  v_keep_cat uuid;
begin
  select id, category_id into v_keep, v_keep_cat
    from unified_tags where slug = 'scat-play' and status = 'active';
  select id into v_drop
    from unified_tags where slug = 'scat' and status = 'active';
  -- Soft on preconditions: a row a concurrent session already merged or
  -- deprecated drops out of scope rather than aborting db push repo-wide.
  if v_keep is not null and v_drop is not null then
    perform merge_tag_concept(v_keep, v_drop,
      'migration:99991790497084_glossary_toilet_role_and_scat_merge',
      'glossary-scat-merge');
    -- Drop the membership inherited from the weaker row. Its filing carries no
    -- editorial intent (no body, a cruder description), and leaving it gives the
    -- survivor two categories for one concept.
    delete from tag_category_assignments a
     where a.tag_id = v_keep
       and v_keep_cat is not null
       and a.category_id is distinct from v_keep_cat;
  end if;
end
$merge$;

do $verify$
declare
  v_scope     int;
  v_plumbing  int;
  v_role      int;
  v_ident     int;
  v_aliases   int;
  v_relations int;
  v_merged    int;
  v_cats      int;
  v_thin      int;
  v_refusals  int;
  v_collat    int;
begin
  -- Soft on preconditions, hard on postconditions.
  select count(*) into v_scope from unified_tags
   where status = 'active' and slug in ('toilet','scat-play','human-toilet','toilet-slave');
  if v_scope < 3 then
    raise exception 'toilet/scat pass: only % of 4 rows still active - refusing to report success on a corpus that moved out from under the file', v_scope;
  end if;

  -- 1. The plumbing prose is gone from `toilet`.
  select count(*) into v_plumbing from unified_tags
   where slug = 'toilet' and status = 'active'
     and (short_description = 'Sanitary hardware for human waste disposal'
       or long_description like '%sanitary hardware%');
  if v_plumbing <> 0 then
    raise exception 'toilet/scat pass: toilet still publishes the plumbing prose';
  end if;

  -- 2. Stated POSITIVELY: it publishes the role instead. "The defect is gone"
  --    is satisfied by a row that vanished from the corpus entirely.
  select count(*) into v_role from unified_tags
   where slug = 'toilet' and status = 'active'
     and short_description like '%receptacle within a negotiated dynamic%'
     and long_description  like '%bare role noun%';
  if v_role <> 1 then
    raise exception 'toilet/scat pass: toilet does not publish the role prose';
  end if;

  -- 3. BOTH identifier fields are cleared — the QID alone leaves the cached
  --    title that regenerates the plumbing body.
  select count(*) into v_ident from unified_tags
   where slug = 'toilet' and status = 'active'
     and wikidata_id is null and wikipedia_url is null;
  if v_ident <> 1 then
    raise exception 'toilet/scat pass: toilet still carries a wikidata_id or a cached wikipedia_url';
  end if;

  -- 4. The plumbing aliases and the plumbing relations are both disposed of.
  select count(*) into v_aliases
    from tag_aliases a join unified_tags t on t.id = a.canonical_tag_id
   where t.slug = 'toilet';
  if v_aliases <> 0 then
    raise exception 'toilet/scat pass: % plumbing alias(es) still sit on toilet', v_aliases;
  end if;

  select count(*) into v_relations
    from tag_relations r
   where r.review_status = 'auto'
     and (r.target_tag_id = (select id from unified_tags where slug = 'toilet')
       or r.source_tag_id = (select id from unified_tags where slug = 'toilet'));
  if v_relations <> 0 then
    raise exception 'toilet/scat pass: % Wikidata-derived relation(s) still display on toilet', v_relations;
  end if;

  -- 5. The merge reached its end state and the target is ACTIVE — a merge whose
  --    target is deprecated or itself merged is a redirect to a page that does
  --    not render (50400101100100).
  select count(*) into v_merged
    from unified_tags d join unified_tags k on k.id = d.merged_into_id
   where d.slug = 'scat' and d.status = 'merged'
     and k.slug = 'scat-play' and k.status = 'active';
  if v_merged <> 1 then
    raise exception 'toilet/scat pass: scat is not merged into an active scat-play';
  end if;

  -- 6. Exactly ONE primary junction on the survivor, and exactly one membership.
  --    The 23505 this dance exists to avoid is two is_primary rows; the count of
  --    1 total is what proves the inherited Fetishes membership was dropped.
  select count(*) into v_cats
    from tag_category_assignments a
    join unified_tags t on t.id = a.tag_id
   where t.slug = 'scat-play';
  if v_cats <> 1 then
    raise exception 'toilet/scat pass: scat-play has % category membership(s), expected 1', v_cats;
  end if;

  -- 7. Nothing became unpublishable. CALL the real predicate rather than
  --    restating its OR, which is a different and stricter check.
  select count(*) into v_thin from unified_tags
   where status = 'active' and slug in ('toilet','scat-play')
     and not tag_has_prose(description, short_description);
  if v_thin <> 0 then
    raise exception 'toilet/scat pass: % row(s) fail tag_has_prose', v_thin;
  end if;

  -- 8. THE FOUR REFUSALS, MADE ENFORCEABLE. Counted per CLAIM, not per row: a
  --    count(*) over an OR counts rows, and 99991790451897's two dry runs both
  --    failed on exactly that. A later pass that merges any of these breaks this
  --    file's own check.
  select count(*) filter (where slug = 'mat-latex' and status = 'active' and merged_into_id is null)
       + count(*) filter (where slug = 'latex'     and status = 'active' and merged_into_id is null)
       + count(*) filter (where slug = 'anal'      and status = 'active' and merged_into_id is null)
       + count(*) filter (where slug = 'lube'      and status = 'active' and merged_into_id is null)
       + count(*) filter (where slug = 'lubricant' and status = 'active' and merged_into_id is null)
       + count(*) filter (where slug = 'sextoy'    and status = 'active' and merged_into_id is null)
    into v_refusals
    from unified_tags
   where slug in ('mat-latex','latex','anal','lube','lubricant','sextoy');
  if v_refusals <> 6 then
    raise exception 'toilet/scat pass: only % of 6 deliberately-unmerged facet rows survive unmerged', v_refusals;
  end if;

  -- 9. PROVE the scope. `description` may not move on ANY row — this pass writes
  --    summaries, bodies and identifiers only — and the identifier columns may
  --    move on `toilet` alone.
  select count(*) into v_collat
    from _tsm_before b join unified_tags t on t.slug = b.slug
   where t.description is distinct from b.description
      or (t.short_description is distinct from b.short_description and b.slug <> 'toilet')
      or (t.long_description  is distinct from b.long_description  and b.slug <> 'toilet')
      or (t.wikidata_id       is distinct from b.wikidata_id       and b.slug <> 'toilet')
      or (t.wikipedia_url     is distinct from b.wikipedia_url     and b.slug <> 'toilet');
  if v_collat <> 0 then
    raise exception 'toilet/scat pass: % row(s) had a column move that this file does not write', v_collat;
  end if;

  raise notice 'toilet/scat pass OK: scope %, plumbing 0, role 1, identifiers cleared, aliases 0, auto-relations 0, merged 1, memberships 1, refusals 6, collateral 0',
    v_scope;
end
$verify$;
