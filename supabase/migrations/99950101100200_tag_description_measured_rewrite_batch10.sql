-- Tag description standard, measured rewrite batch 10.
--
-- A NEW AXIS, and the one that finally beats the lead-shape axis: the
-- description is a NEWS-TAXONOMY LABEL rather than a definition of the term,
-- while the row's OWN summary and OWN body both define it correctly.
-- /tags/:slug renders `description` as the lead paragraph and `long_description`
-- as the body directly beneath it, so a reader met "International human rights
-- coverage" followed by a real definition of human rights.
--
-- SIZE: 13 rows, 7,714 assignments. 7 taken, 6 deferred with reasons. This is
-- the largest batch in the series by usage -- 4,406 assignments, against 187 for
-- the whole duplicate-description axis measured alongside it.
--
-- WHY THIS AXIS AND NOT THE LEAD-SHAPE ONE. That axis ran 27% -> 25% -> 12% ->
-- 8% across batches 6 to 9 and is worked out at its head. Three other axes were
-- SIZED FIRST rather than chosen by hunch, and two were dead on arrival:
--   duplicate description across rows     12 groups / 26 rows, and MOST are the
--                                         same concept twice (abrosexual +
--                                         sexually-fluid, rope-top + rigger,
--                                         sapioromantic + noetiromantic) -- a
--                                         MERGE problem, and rewriting one side
--                                         to make them differ papers over it.
--   description is a POINTER ("See X")    2 rows, and one of them is pride-flag,
--                                         already repaired in batch 9.
--   tag-admin note ("This tag is for")    0 -- already closed by round sixteen.
--
-- THE MEASUREMENT REFUTED MY OWN HYPOTHESIS, which is why it is recorded here.
-- The expectation was that "% of assignments that are news" would separate an
-- honest feed facet from a glossary term: a row used only by news could keep a
-- feed label. It does not separate them. coming-out, same-sex-marriage,
-- pride-month and gender-affirming-care are 100% news AND each carries a full
-- definitional body. These rows are BOTH, so the body is the evidence, not the
-- assignment mix. A test that sounds decisive is not decisive until it is run.
--
--   human-rights           2,566 news, INDEXABLE -- "International human rights
--                          coverage". Body: "universally recognized moral
--                          principles ... inherent and inalienable, belonging to
--                          every individual regardless of characteristics like
--                          nationality, ethnicity, or sexual orientation."
--                          Highest-usage row this series has touched.
--   coming-out             705 news, INDEXABLE -- "Coming out stories and
--                          support" on core queer vocabulary whose own body
--                          defines the process.
--   same-sex-marriage      435 news, INDEXABLE -- "News about marriage equality".
--   pride-month            263 news, INDEXABLE -- "Pride-related news and
--                          events", which does not say WHEN Pride Month is or
--                          what it commemorates. Its own body says both.
--   drag-culture           216 news, INDEXABLE -- "Drag performance and culture
--                          news".
--   gender-affirming-care  163 news, INDEXABLE, human_reviewed -- "Transgender
--                          healthcare and treatment news" is a NEWS CATEGORY on
--                          a clinical-care term. Sharpest of the set after
--                          human-rights: a reader looking up what the care IS
--                          was told it is a news feed.
--   lgbtq-culture          58 (30 news, 28 venues), INDEXABLE -- "Cultural news
--                          and stories" names no culture at all.
--
-- EVERY REPLACEMENT RESTATES THE ROW'S OWN SUMMARY AND BODY AND CHOOSES NO NEW
-- SENSE. Three things are deliberately NOT carried over from the bodies: the
-- word "journey" (banned by the voice standard), "sex reassignment surgery"
-- (outdated; the replacement says "surgery"), and "conform to their desired
-- gender identity" (the body's phrasing, which this file does not reproduce).
-- NO BODY IS WRITTEN, NULLED OR TOUCHED -- the bodies are the evidence, and a
-- postcondition asserts all seven survive.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING (gender-affirming-care is
-- human_reviewed = true), verified live with a REAL value change rather than a
-- self-assignment, which changes no column and so never fires the trigger.
--
-- DEFERRED, each with its own reason rather than a shared shrug:
--   politics (2,899, the highest-usage row in the axis) -- its body defines
--     politics, so by the rule above it qualifies. It is deferred anyway, on the
--     `hiv-aids` precedent: the row is the news taxonomy's top-level political
--     tag, "politics" is not queer vocabulary a reader comes here to look up,
--     and "Political news affecting LGBTQ+ communities" is an honest statement
--     of what the tag collects. Borderline, and under-reaching is the correct
--     error. Named so the next pass does not treat the omission as an oversight.
--   international-news, youth-issues, economic-impact, lgbtq-sports -- the NAME
--     is itself a feed category, so a feed label is not a wrong subject there.
--   transgender-athletes (379) -- 100% news and its long_description is NULL, so
--     unlike the seven there is no second field establishing a definition. The
--     summary alone is barely more than the name: thin, not wrong.
--
-- Soft on preconditions, hard on postconditions.

begin;

select set_config('app.actor', 'admin:tag-description-measured-rewrite-b10', true);

update unified_tags set description =
  'Rights that belong to every person, inherent and inalienable, regardless of nationality, ethnicity or sexual orientation.'
where slug = 'human-rights' and status = 'active'
  and description = 'International human rights coverage';

update unified_tags set description =
  'Disclosing one''s LGBTQ+ identity to others — a personal process that differs from one person to the next.'
where slug = 'coming-out' and status = 'active'
  and description = 'Coming out stories and support';

update unified_tags set description =
  'Marriage between two people of the same legal sex or gender, also called gay marriage or same-gender marriage.'
where slug = 'same-sex-marriage' and status = 'active'
  and description = 'News about marriage equality';

update unified_tags set description =
  'The annual celebration of LGBTQ+ pride, observed in June in most countries to commemorate the Stonewall riots.'
where slug = 'pride-month' and status = 'active'
  and description = 'Pride-related news and events';

update unified_tags set description =
  'The performance art of drag and the community around it, in which performers take on a character, often of a different gender.'
where slug = 'drag-culture' and status = 'active'
  and description = 'Drag performance and culture news';

update unified_tags set description =
  'Medical, psychological and social care that supports a person''s gender identity, including hormone therapy and surgery.'
where slug = 'gender-affirming-care' and status = 'active'
  and description = 'Transgender healthcare and treatment news';

update unified_tags set description =
  'The shared culture, experiences and expressions of lesbian, gay, bisexual, trans and queer people.'
where slug = 'lgbtq-culture' and status = 'active'
  and description = 'Cultural news and stories';

do $verify$
declare
  v_bad int;
begin
  -- 1. THE REACHED STATE, COUNTED POSITIVELY. Counting rows in a BAD state
  --    returns zero for a slug that has gone missing from the corpus entirely.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='human-rights'          and description like 'Rights that belong to every person%')
    or (slug='coming-out'            and description like 'Disclosing one''s LGBTQ+ identity%')
    or (slug='same-sex-marriage'     and description like 'Marriage between two people of the same legal sex%')
    or (slug='pride-month'           and description like 'The annual celebration of LGBTQ+ pride%')
    or (slug='drag-culture'          and description like 'The performance art of drag%')
    or (slug='gender-affirming-care' and description like 'Medical, psychological and social care%')
    or (slug='lgbtq-culture'         and description like 'The shared culture, experiences and expressions%')
  );
  if v_bad <> 7 then
    raise exception 'tag_description_measured_rewrite_b10: expected 7 rows in the reached state, found %', v_bad;
  end if;

  -- 2. NO REPAIRED ROW STILL PUBLISHES A FEED LABEL. The axis signature is the
  --    news vocabulary itself, so it must be gone from all seven.
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('human-rights','coming-out','same-sex-marriage','pride-month',
                 'drag-culture','gender-affirming-care','lgbtq-culture')
    and description ~* '\m(news|coverage|stories|updates)\M';
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b10: % row(s) still publish a feed label', v_bad;
  end if;

  -- 3. EVERY BODY SURVIVES. The bodies ARE the evidence that justified the
  --    repair, so a file that removed one would be destroying its own warrant.
  --    This file writes no long_description at all.
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('human-rights','coming-out','same-sex-marriage','pride-month',
                 'drag-culture','gender-affirming-care','lgbtq-culture')
    and long_description is not null and btrim(long_description) <> '';
  if v_bad <> 7 then
    raise exception 'tag_description_measured_rewrite_b10: a body was destroyed (% of 7 survive)', v_bad;
  end if;

  -- 4. pride-month STATES WHAT THE FEED LABEL OMITTED. "Pride-related news and
  --    events" says neither when Pride Month is nor what it commemorates; the
  --    row's own body says both, so the replacement must carry them.
  select count(*) into v_bad from unified_tags
  where slug = 'pride-month' and status = 'active'
    and description ilike '%June%' and description ilike '%Stonewall%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b10: pride-month no longer names June and Stonewall';
  end if;

  -- 5. gender-affirming-care DESCRIBES CARE, NOT A NEWS CATEGORY.
  select count(*) into v_bad from unified_tags
  where slug = 'gender-affirming-care' and status = 'active'
    and description ilike '%care%' and description ilike '%gender identity%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b10: gender-affirming-care no longer describes the care';
  end if;

  -- 6. THE DEFERRED ROWS ARE STILL DEFERRED. A later pass that sweeps this axis
  --    has to break this check first. politics is included deliberately: it
  --    qualifies under the rule and is held back on the `hiv-aids` precedent.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='politics'             and description = 'Political news affecting LGBTQ+ communities')
    or (slug='international-news'   and description = 'Global LGBTQ+ news')
    or (slug='transgender-athletes' and description = 'Coverage of transgender athletes')
    or (slug='economic-impact'      and description = 'Economic studies and business news')
  );
  if v_bad <> 4 then
    raise exception 'tag_description_measured_rewrite_b10: a deferred row was rewritten (found % of 4)', v_bad;
  end if;

  -- 7. NO VOICE VIOLATION SHIPS. The `s?` is load-bearing: \m...\M anchors both
  --    ends, so \morganisation\M does not match "organisations". `journey` is
  --    listed because coming-out's own body uses it and the replacement must not
  --    carry it over.
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('human-rights','coming-out','same-sex-marriage','pride-month',
                 'drag-culture','gender-affirming-care','lgbtq-culture')
    and (description ~* '\m(organisation|characterised|recognised|behaviour|licence|counselling|colour|marginalised)s?\M'
      or description ~* '\m(journey|vibrant|curated|unlock)\M'
      or description ~* '\mnon-binary\M'
      or description ~* '\m(you|your)\M'
      or description ~ '!');
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b10: % row(s) carry a voice violation', v_bad;
  end if;

  -- 8. EVERY REPAIRED ROW STAYS PUBLISHABLE. Call the real predicate rather than
  --    restating its OR -- a hand-rolled "both fields present" form is a
  --    different, stricter gate than the one the database enforces.
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('human-rights','coming-out','same-sex-marriage','pride-month',
                 'drag-culture','gender-affirming-care','lgbtq-culture')
    and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b10: % row(s) would fail the thin-page gate', v_bad;
  end if;
end $verify$;

commit;
