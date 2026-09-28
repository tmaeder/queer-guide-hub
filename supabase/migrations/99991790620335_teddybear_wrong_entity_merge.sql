-- `/tags/teddybear` publishes a stuffed toy on a queer glossary, and the correct
-- prose has been sitting on its deindexed twin the whole time.
--
-- Found by generalising 99991790527174 (water-sports): an INDEXABLE row whose
-- despaced twin holds a different `description`. The sweep returned 8 pairs; this is
-- the ONE that is a wrong-sense defect. The other seven are duplicate tags and are
-- deliberately not touched here — see the closing note.
--
--   teddybear   article, seo_indexable, Slang & Language, human_reviewed
--               wikidata_id  Q98022605
--               short_desc   "Stuffed toy in the form of a bear"
--               description  "Cuddly toy role"
--               body         "A teddy bear is a stuffed toy in the form of a bear,
--                             named after Theodore Roosevelt..."
--
--   teddy-bear  article, NOT indexed, Expression & Style
--               short_desc   (null)
--               description  "A soft, cuddly and notably gentle bear within gay bear
--                             culture."
--               body         "Teddy bear is one of gay bear culture's body-and-manner
--                             descriptors: hairy and heavy-set like other bears..."
--
-- Q98022605 was resolved live rather than inferred from the prose: label
-- "Teddybear", description **"2020 audio track by Emilie Nicolas"**. So the row does
-- not merely carry the generic sense — its identifier is a SONG, and the cached
-- `wikipedia_url` is `Teddy_bear`, the toy. On a platform where `bear` (105 uses)
-- carries "a larger, hairier man in gay and queer men's communities", the indexed
-- page for teddy bear was about Theodore Roosevelt.
--
-- MERGED RATHER THAN REPAIRED IN PLACE, and the reason is that the correct prose
-- already exists. Rewriting `teddybear` would mint a second copy of what
-- `teddy-bear` already says, which is the one-summary-many-rows defect this corpus
-- has been cleaning up; and the concept does not want two pages. The merge mints a
-- redirect, so `/tags/teddybear` keeps resolving, and `unmerge_tag_concept(audit_id)`
-- reverses the whole thing. The surviving slug is also the corpus convention —
-- `golden-shower`, `piss-play`, `gun-play`, `face-fucking` are all hyphenated.
--
-- THE 23505 TRAP IS LIVE HERE, because the two rows sit in DIFFERENT categories
-- (Slang & Language vs Expression & Style). `merge_tag_concept` deletes the loser's
-- category row only when the winner holds the SAME category_id; filed differently it
-- runs `update tag_category_assignments set tag_id = p_canonical_id`, and two
-- `is_primary` rows on one tag violate tag_category_assignments_one_primary_per_tag.
-- So the loser's primary is demoted BEFORE the merge and the inherited membership is
-- deleted after — the pattern 20361124161700 established, whose own header recorded
-- this and was still missed on a first draft until the dry run caught it.
--
-- THE SURVIVOR NEEDS TWO THINGS THE MERGE DOES NOT GIVE IT. It is `seo_indexable =
-- false` with NO `seo_deindex_reason`, i.e. never published rather than deliberately
-- withdrawn, and its `short_description` is NULL — and that column is what
-- `TagIndexCard`, `TagDefinitionCard` and `FromTheGlossary` render, the last of which
-- actively up-ranks a row for having one. Merging without these leaves the concept
-- with no indexed page at all, which is worse than the defect: today a reader at
-- least finds a page, wrong as it is. The summary is written from the row's OWN
-- description rather than authored, so no sense is chosen that the row did not
-- already state.
--
-- The loser's identifier is NULLED even though a merged row is inert to every
-- consumer (`tag_medical_codes_sync` and `enforce_tag_wikidata_identity` both scope
-- to `status = 'active'`). The reason is not hygiene: `unmerge_tag_concept` is
-- supported, and an unmerge would otherwise resurrect a row carrying a song's QID.
--
-- THE LOSER'S `seo_indexable` IS DELIBERATELY LEFT SET, and a first draft asserted
-- the opposite and failed its own P1 against correct behaviour. `merge_tag_concept`
-- sets `status='merged'` and `merged_into_id` and does NOT clear that flag —
-- measured, 202 merged rows corpus-wide still carry it. It is inert, and that was
-- verified rather than inherited from the convention: fetched as Googlebot,
-- `/tags/69ing`, `/tags/accessible` and `/tags/24-hours` — all merged with
-- `seo_indexable = true` — each return **HTTP 301** with no `<article>`, no robots
-- meta and no canonical. `merged_into_id` drives the redirect; the flag reaches
-- nothing. Clearing it here would make this one row diverge from 202 others for no
-- gain, so the postcondition asserts the redirect instead of the flag.
--
-- DELIBERATELY NOT DONE. The other seven pairs the sweep returned are DUPLICATES, not
-- wrong-sense rows, and reading them is what established that — `bicurious`/`bi-curious`
-- and `cross-dresser`/`crossdresser` carry the SAME identifier on both sides with
-- correct prose on both; `face-fucking` (indexed) holds BETTER prose than its twin, so
-- the sweep's own framing is inverted there; `dark-room`/`darkroom` is a 0-use row
-- beside a 176-use one; `water-sports`/`watersports` is the pair 99991790527174 just
-- created deliberately. Each needs a decision about which URL survives, which is
-- editorial, not a repair. Two of those pairs are also a standing invariant breach
-- worth noting: `enforce_tag_wikidata_identity()` forbids two ACTIVE tags sharing an
-- identifier, but only fires on write, so pre-existing pairs survive it.
--
-- Guarded by src/lib/__tests__/teddybearWrongEntityMerge.test.ts.

do $$
declare
  v_keep  uuid;   -- teddy-bear, the correct prose
  v_drop  uuid;   -- teddybear, the stuffed toy
  v_audit uuid;
  v_keepcat uuid;
begin
  -- Attribution. `teddybear` is human_reviewed, so log_unified_tag_change() RAISES
  -- for an undeclared system actor, and before_data is the only copy of the prior
  -- prose. Verified live on this row with a genuinely different value: a
  -- self-assignment changes no column and fires no trigger, which reads exactly like
  -- a permissive one.
  perform set_config('app.actor', 'migration:99991790620335_teddybear_wrong_entity_merge', true);

  select id, category_id into v_keep, v_keepcat
    from public.unified_tags where slug = 'teddy-bear' and status = 'active';
  select id into v_drop
    from public.unified_tags where slug = 'teddybear' and status = 'active';

  -- Soft on preconditions: a concurrent session may have merged or repaired either
  -- side between authoring and CI, and an abort here blocks every migration queued
  -- behind it on main.
  if v_keep is null or v_drop is null then
    raise notice 'teddybear/teddy-bear not both active — already resolved, leaving alone';
    return;
  end if;

  ---------------------------------------------------------------- 1. the 23505 trap
  -- The two rows are in different categories, so the merge REPOINTS the loser's
  -- junction row rather than deleting it. Demote it first or the winner ends up with
  -- two is_primary rows.
  update public.tag_category_assignments
     set is_primary = false
   where tag_id = v_drop and is_primary;

  ------------------------------------------------------------------- 2. clear the QID
  -- Before the merge, so the write happens while the row is still active and the
  -- change is attributed. A merged row is inert to every consumer, but unmerge would
  -- resurrect this identifier.
  update public.unified_tags
     set wikidata_id = null, wikipedia_url = null
   where id = v_drop and wikidata_id = 'Q98022605';

  ----------------------------------------------------------------------- 3. the merge
  select public.merge_tag_concept(
           v_keep, v_drop,
           'migration:99991790620335', 'wrong_entity_duplicate'
         ) into v_audit;

  -- The membership the winner inherited from the loser's category. Dropped because a
  -- filing inherited from a row about a stuffed toy carries no editorial intent —
  -- 20361001100100's rule: remove only the membership that is actually wrong.
  delete from public.tag_category_assignments a
   where a.tag_id = v_keep
     and a.category_id is distinct from v_keepcat;

  --------------------------------------------------- 4. make the survivor a real page
  -- Written from the row's OWN description, so no sense is chosen that the row did
  -- not already state. Guarded on emptiness so a human who fills it first keeps their
  -- work.
  update public.unified_tags
     set short_description = 'A softer, gentler bear in gay bear culture.'
   where id = v_keep
     and coalesce(btrim(short_description), '') = '';

  -- Explicit, and the reason it is safe: the row is `article`, carries a 321-char
  -- body and a description, and enforce_tag_thin_page_gate reads
  -- tag_has_prose(description, short_description), which it satisfies twice over.
  -- Without this the concept loses its indexed page entirely.
  update public.unified_tags
     set seo_indexable = true, seo_deindex_reason = null
   where id = v_keep and not seo_indexable;
end $$;

do $verify$
declare v_bad int; v_txt text;
begin
  ------------------------------------------------------------------------------ P1
  -- The stuffed toy is gone from the live corpus. `seo_indexable` is deliberately NOT
  -- asserted: merge_tag_concept leaves it set on every loser (202 corpus-wide) and it
  -- is inert behind the 301, so asserting it here would fail on correct behaviour.
  select count(*) into v_bad from public.unified_tags
   where slug = 'teddybear'
     and (status <> 'merged' or wikidata_id is not null or wikipedia_url is not null);
  if v_bad <> 0 then
    raise exception 'P1: teddybear is still active or still carries Q98022605';
  end if;

  ------------------------------------------------------------------------------ P2
  -- It is a REDIRECT, not a deletion. merged_into_id is what keeps /tags/teddybear
  -- resolving and what unmerge_tag_concept reverses.
  select count(*) into v_bad from public.unified_tags d
    join public.unified_tags k on k.id = d.merged_into_id
   where d.slug = 'teddybear' and k.slug = 'teddy-bear';
  if v_bad <> 1 then
    raise exception 'P2: teddybear does not redirect to teddy-bear';
  end if;

  ------------------------------------------------------------------------------ P3
  -- The survivor is a real, publishable page carrying the CORRECT sense. Asserted on
  -- the prose, not on a flag, so a row that is merely indexable does not pass.
  select count(*) into v_bad from public.unified_tags
   where slug = 'teddy-bear'
     and status = 'active'
     and seo_indexable
     and publication_role = 'article'
     and coalesce(btrim(short_description),'') <> ''
     and description ilike '%bear culture%'
     and public.tag_has_prose(description, short_description);
  if v_bad <> 1 then
    raise exception 'P3: teddy-bear is not a publishable page carrying the queer sense';
  end if;

  ------------------------------------------------------------------------------ P4
  -- The stuffed-toy prose reaches NO live row. The mirror of P3: a repair that copied
  -- the toy text onto the survivor would satisfy P3's flags alone.
  --
  -- The patterns are SPECIFIC to this defect, not to the topic. A first draft matched
  -- `short_description ilike '%stuffed toy%'` and failed on its own dry run against
  -- **`plushophilia`** — "Sexual attraction to stuffed animals and plush toys",
  -- Q7205631 — which is entirely correct and is a different concept from bear culture.
  -- Shipped, that would have aborted `db push` on main for every migration behind it.
  -- A corpus-wide assertion has to name the defect, not the vocabulary around it.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and (coalesce(long_description,'')  ilike '%Theodore Roosevelt%'
       or coalesce(short_description,'') ilike '%stuffed toy in the form of a bear%'
       or coalesce(description,'')       ilike '%cuddly toy role%');
  if v_bad <> 0 then
    raise exception 'P4: % live row(s) still publish the stuffed-toy sense', v_bad;
  end if;

  ----------------------------------------------------------------------------- P4b
  -- The positive control for P4: plushophilia, which legitimately talks about stuffed
  -- toys, must SURVIVE. Without this, narrowing P4 far enough to pass is
  -- indistinguishable from a sweep that deleted the neighbouring concept.
  select count(*) into v_bad from public.unified_tags
   where slug = 'plushophilia' and status = 'active'
     and description ilike '%stuffed animals%';
  if v_bad <> 1 then
    raise exception 'P4b: plushophilia was damaged by the teddy-bear repair';
  end if;

  ------------------------------------------------------------------------------ P5
  -- Exactly one primary category, and it is the survivor's own. This is the 23505
  -- trap's postcondition: the demote-then-delete either worked or the merge left two.
  select count(*) into v_bad from public.tag_category_assignments a
    join public.unified_tags t on t.id = a.tag_id
   where t.slug = 'teddy-bear' and a.is_primary;
  if v_bad <> 1 then
    raise exception 'P5: teddy-bear has % primary categories, expected 1', v_bad;
  end if;

  select c.name into v_txt from public.unified_tags t
    join public.tag_category_assignments a on a.tag_id = t.id and a.is_primary
    join public.tag_categories c on c.id = a.category_id
   where t.slug = 'teddy-bear';
  if v_txt is distinct from 'Expression & Style' then
    raise exception 'P5b: teddy-bear inherited the loser category (%), expected Expression & Style', v_txt;
  end if;

  ------------------------------------------------------------------------------ P6
  -- All three category representations agree. Asserting the junction alone passes on
  -- exactly the shape a stale TEXT column produces.
  select count(*) into v_bad from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
    join public.tag_category_assignments a
      on a.tag_id = t.id and a.category_id = c.id and a.is_primary
   where t.slug = 'teddy-bear' and t.category = c.name;
  if v_bad <> 1 then
    raise exception 'P6: teddy-bear category representations disagree';
  end if;

  ------------------------------------------------------------------------------ P7
  -- CONTROLS. The seven pairs this file deliberately does NOT touch must survive, or
  -- a sweep that merged every despaced twin would satisfy everything above.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and slug in ('bicurious','bi-curious','cross-dresser','crossdresser',
                  'face-fucking','facefucking','dark-room','darkroom',
                  'gunplay','gun-play','boy-toy','boytoy',
                  'water-sports','watersports');
  if v_bad <> 14 then
    raise exception 'P7: % of 14 deliberately-untouched rows are still active', v_bad;
  end if;

  -- And `bear` itself, which carries the community sense this repair depends on.
  select count(*) into v_bad from public.unified_tags
   where slug = 'bear' and status = 'active' and usage_count > 100;
  if v_bad <> 1 then
    raise exception 'P8: the bear row was damaged';
  end if;

  raise notice 'teddybear OK: stuffed toy merged away, gay bear culture published on teddy-bear';
end
$verify$;
