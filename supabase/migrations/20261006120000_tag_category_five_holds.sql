-- The five rows 20261006110000 excused, decided.
--
-- That migration repaired 21 tag pages the pre-#3087 kinktionary revival
-- reclassified, and deliberately declined five more: three because following
-- the text there is editorially WRONG rather than merely different, and two
-- (`golden-shower`, `deli`) because their text came from junk values and
-- carries no curation worth preserving. Its remainder assertion names all five
-- so the omission is checked rather than assumed.
--
-- Declining to follow the text is not the same as leaving the row alone. Both
-- surfaces are reader-visible and they disagree: `fetchTagWithCategories`
-- (src/hooks/usePageFetchers.ts) renders the JUNCTION on /tags/:slug, while
-- `unified_tags.category` feeds search_documents and therefore the search
-- category facet. So each of these five publishes two different categories for
-- the same tag depending on where a reader meets it. Measured on prod after
-- 20261006110000 applied, this is the WHOLE remaining active disagreement — 5
-- rows, no others.
--
-- Both halves were read live rather than assumed. `fetchTagWithCategories`
-- selects tag_category_assignments, and `search_documents.facets ->> 'category'`
-- on prod returns the disagreeing TEXT for four of the five today. The fifth,
-- `deli`, has NO search_documents row at all — nothing in
-- search_documents_index_tags excludes it, it has simply never been touched
-- since the last reindex — so the write below fires trg_search_documents_tag
-- and it enters the index with the corrected value rather than the wrong one.
--
--   slug                          page (junction)      search facet (text)
--   crossdresser-transvestite     Gender Identity      Sexual Health
--   safe-sane-and-consensual-ssc  Safety & Practices   Slang & Terminology
--   piss-slut                     Sexual Roles         Practices & Play
--   golden-shower                 Practices & Play     Fetishes & Interests
--   deli                          Venues & Nightlife   Safe Spaces
--
--
-- WHAT WAS MEASURED, PER ROW
--
-- The question is not "which of the two columns wins" — it is which category is
-- correct, decided against how this corpus files the tag's own neighbours, and
-- then said on both surfaces. Four rows keep what their page already shows; one
-- goes somewhere neither column names.
--
--   crossdresser-transvestite -> GENDER IDENTITY (page kept)
--     `Sexual Health` is the pathologising filing and is simply out. The real
--     question was Gender Identity vs `Expression & Presentation`, because
--     crossdressing is expression rather than identity and this corpus carries
--     a separate `cross-dresser` row (Wikidata Q9304839, human_reviewed) filed
--     exactly there. Measured, and the measurement decided it the other way:
--     of the 77 live tags in the Kinktionary's own `genders` section — the
--     source the revival imported — 39 sit in Gender Identity and ZERO in
--     Expression & Presentation. Moving this one row would make it the only
--     member of its cohort there, trading one inconsistency for another. The
--     `cross-dresser` twin is a duplicate to be merged, not a filing precedent.
--
--   safe-sane-and-consensual-ssc -> CONSENT & NEGOTIATION (neither column)
--     `Slang & Terminology` is wrong: SSC is a consent framework, not slang.
--     But `Safety & Practices` is the coarse PARENT, and after 20261006110000
--     moved 13 scene-safety terms down into `Consent & Negotiation`, SSC is the
--     lone framework left behind in it — the four rows still there are
--     `cleanup`, `hate-crime`, `kriminell`, `gewaltverbrechen`. Every peer sits
--     in the child: its own twin `ssc`, plus PRICK, RACK, CABINS, FRIES, RAVE,
--     RBDSMA, `safe-word`, `safe-words`. The Kinktionary section is literally
--     `consent`. This is the same parent -> child un-coarsening 20261006110000
--     performed 21 times; it could not reach this row only because its
--     predicate required the target to be the category the TEXT names, and here
--     the text names a third thing.
--
--   piss-slut -> SEXUAL ROLES (page kept)
--     The tag describes a person, not an act ("Person who loves watersports"),
--     and `Sexual Roles` holds twenty sibling role terms of exactly this
--     construction — Cum Slut, Painslut, Cumdump, Cock Whore, Attention Slut,
--     Praise Slut, Cuddle Slut, Foodslut. Kinktionary section: `roles`.
--
--   golden-shower -> PRACTICES & PLAY (page kept)
--     Its own description reads "A form of sexual play that involves the act of
--     urinating on a partner" — the act, which is what `Practices & Play` is
--     for; `Fetishes & Interests` is the interest. (This row is separately a
--     namesake chimera: short_description, long_description and wikidata_id
--     Q161117 all describe Cassia fistula, the flowering tree. That is a prose
--     defect on the same row, not a category question, and is left to the
--     chimera pass rather than smuggled in here.)
--
--   deli -> VENUES & NIGHTLIFE (page kept)
--     "A deli, short for delicatessen, is a type of food establishment." Its
--     neighbours in `Venues & Nightlife` are Diner, Bistro, Restaurant, Cafe,
--     Steakhouse, Food-Establishment; `Safe Spaces` is where atmosphere claims
--     live (Queer-Friendly, LGBT-Friendly, Community-Space). Same disposition
--     the food cohort already received in 20261004110400.
--
--
-- TWO MECHANISMS, BECAUSE category_id IS ALREADY RIGHT ON FOUR OF FIVE
--
-- On all five rows `category_id` already equals the primary junction; only the
-- text is out of step. So for the four rows whose page value is kept there is
-- no category_id write to make — `trg_sync_tag_category` fires only when
-- category_id CHANGES, so setting it to what it already holds is a no-op and
-- would not move the text. Those four write `category` directly, and the value
-- is read from the primary junction rather than spelled out, so a row a
-- concurrent session already repaired is simply not selected.
--
-- SSC is the one row where the target differs from both columns, and there the
-- write is `category_id` only: the BEFORE trigger derives the text and the
-- AFTER trigger demotes the stale parent and promotes the new primary, so page
-- and facet move together through the path that owns them.
--
-- The `Slang & Terminology` junction row on SSC is left in place, demoted. It
-- renders as a secondary category, which is defensible for an acronym, and
-- deleting a curated assignment is a separate editorial act.
--
--
-- WHAT THIS MUST NOT DO
--
-- 20261006110000's safety property was "not one published category text moved",
-- because its argument rested on that text. The mirror property holds here: on
-- the four rows whose page value is kept, `category_id` and the junction must
-- not move — this migration decided those pages are right, so it must not be
-- able to quietly re-file them while claiming to fix a facet. Asserted below.
--
-- No hygiene counter is added. 20261006110000 left that to 20261005100100,
-- which is not yet on main; two competing counters for adjacent classes is the
-- outcome that note exists to prevent.

select set_config('app.actor', 'migration:tag-category-five-holds', true);

do $mig$
declare
  v_n int;
  v_text_rows int;
  v_ssc uuid;
  v_target uuid;
  v_target_name text;
begin
  ---------------------------------------------------------------------------
  -- Snapshot before anything moves, so the post-conditions compare against
  -- measured state rather than against literals that could rot.
  ---------------------------------------------------------------------------
  create temp table _five_holds on commit drop as
  select t.id, t.slug, t.category_id as category_id_before, t.is_adult as is_adult_before,
         a.category_id as primary_before
    from unified_tags t
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
   where t.slug in ('crossdresser-transvestite', 'safe-sane-and-consensual-ssc',
                    'piss-slut', 'golden-shower', 'deli');

  select count(*) into v_n from _five_holds;
  if v_n <> 5 then
    raise exception 'tag category five holds: expected 5 rows, found % — re-measure before applying', v_n;
  end if;

  -- Every one of them must still be in the state this migration reviewed:
  -- category_id equal to the primary junction, text disagreeing with both.
  select count(*) into v_n
    from _five_holds h
    join unified_tags t on t.id = h.id
    join tag_categories c on c.id = h.primary_before
   where t.category_id is distinct from h.primary_before
      or t.category is not distinct from c.name;
  if v_n > 0 then
    raise exception 'tag category five holds: % row(s) are no longer in the reviewed state', v_n;
  end if;

  ---------------------------------------------------------- part 1: four rows
  -- Keep the page, move the facet. The new text is read from the primary
  -- junction, never spelled out, so this cannot invent a filing.
  update unified_tags t
     set category = c.name
    from tag_category_assignments a
    join tag_categories c on c.id = a.category_id
   where a.tag_id = t.id
     and a.is_primary
     and t.slug in ('crossdresser-transvestite', 'piss-slut', 'golden-shower', 'deli')
     and t.category is distinct from c.name;
  get diagnostics v_text_rows = row_count;

  ------------------------------------------------------------- part 2: SSC
  -- The one row that goes where neither column points. Resolved by SLUG, not by
  -- name: PR B of the taxonomy swap renames category names, and a name literal
  -- would silently resolve to NULL after it lands.
  select id into v_ssc from unified_tags where slug = 'safe-sane-and-consensual-ssc';
  select id, name into v_target, v_target_name
    from tag_categories where slug = 'consent-negotiation';
  if v_ssc is null or v_target is null then
    raise exception 'tag category five holds: ssc tag or consent-negotiation category not found';
  end if;

  update unified_tags
     set category_id = v_target
   where id = v_ssc and category_id is distinct from v_target;

  ----------------------------------------------------------------- assertions
  -- 1. THE SAFETY PROPERTY. The four rows whose page this migration decided was
  --    already correct must not have been re-filed by it. If a text-only repair
  --    moved a junction, the repair became the thing it is fixing.
  select count(*) into v_n
    from _five_holds h join unified_tags t on t.id = h.id
   where h.slug <> 'safe-sane-and-consensual-ssc'
     and (t.category_id is distinct from h.category_id_before
          or not exists (select 1 from tag_category_assignments a
                          where a.tag_id = t.id and a.is_primary
                            and a.category_id = h.primary_before));
  if v_n > 0 then
    raise exception 'tag category five holds: % kept-page row(s) had their filing moved', v_n;
  end if;

  -- 2. All five now say the same thing on both surfaces AND in category_id.
  select count(*) into v_n
    from _five_holds h
    join unified_tags t on t.id = h.id
    join tag_categories idc on idc.id = t.category_id
   where t.category is distinct from idc.name
      or not exists (select 1 from tag_category_assignments a
                      where a.tag_id = t.id and a.is_primary and a.category_id = t.category_id);
  if v_n > 0 then
    raise exception 'tag category five holds: % row(s) still disagree across surfaces', v_n;
  end if;

  -- 3. SSC landed in the category this migration argued for, and nowhere else.
  select count(*) into v_n
    from unified_tags t join tag_categories c on c.id = t.category_id
   where t.id = v_ssc and c.slug = 'consent-negotiation';
  if v_n <> 1 then
    raise exception 'tag category five holds: ssc did not land in consent-negotiation';
  end if;

  -- 4. MODERATION DID NOT MOVE. unified_tags_recompute_is_adult() fires on the
  --    assignment insert and recomputes is_adult from the tag's full assignment
  --    set. None of these moves crosses the kink line, so a flip here would mean
  --    the recompute disagrees with that reading — under-moderation is the worst
  --    failure class on this table, so it is checked rather than assumed.
  select count(*) into v_n
    from _five_holds h join unified_tags t on t.id = h.id
   where t.is_adult is distinct from h.is_adult_before;
  if v_n > 0 then
    raise exception 'tag category five holds: is_adult moved on % row(s)', v_n;
  end if;

  -- 5. THE CENSUS IS NOW EMPTY. Corpus-wide, every status, no slug exclusions:
  --    the only rows allowed to keep a disagreeing text are the orphan-text ones
  --    whose text names a category that does not exist at all (owned by
  --    20261005100100). 20261006110000 asserted this same shape with these five
  --    slugs excluded; dropping the exclusion is the whole point of this
  --    migration, and it is what makes a new disagreement fail loudly.
  select count(*) into v_n
    from unified_tags t
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
    join tag_categories c on c.id = a.category_id
   where t.category is not null
     and t.category is distinct from c.name
     and exists (select 1 from tag_categories oc where oc.name = t.category);
  if v_n > 0 then
    raise exception 'tag category five holds: % row(s) still disagree with their primary junction', v_n;
  end if;

  -- 6. The AFTER trigger demotes as well as promotes.
  select count(*) into v_n from (
    select tag_id from tag_category_assignments where is_primary
     group by tag_id having count(*) > 1) x;
  if v_n > 0 then
    raise exception 'tag category five holds: % tag(s) carry more than one primary junction', v_n;
  end if;

  raise notice 'tag category five holds: % facet(s) realigned to their page, ssc re-filed to %, census now empty',
    v_text_rows, v_target_name;
end
$mig$;
