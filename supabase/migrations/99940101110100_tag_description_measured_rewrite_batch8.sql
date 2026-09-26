-- Tag description standard, measured rewrite batch 8.
--
-- Third tranche on the lead-shape axis (the description opens by restating the
-- tag's own name -- the Wikipedia-import signature). 25 rows read by usage,
-- 3 taken: 12%, against 27% and 25% for batches 6 and 7 on the same axis.
--
-- THE YIELD IS FALLING AND THAT IS REPORTED RATHER THAN PADDED. Three rows is
-- a small batch, and the temptation at 12% is to add generic-but-not-wrong rows
-- to make it look worth shipping -- which is the bulk sweep wearing a measured
-- pass's clothes. `top-surgery` alone justifies the file.
--
-- THE POSITIVE CONTROL WAS LOST TO THE ORDER BY FOR THE SECOND TIME, which is
-- worth recording because batch 7 had just coined the rule. It was UNION'd into
-- the tranche query and sorted out of the visible rows by
-- `order by usage_count desc nulls last` -- the control carries a NULL count, so
-- `nulls last` put it past the LIMIT. Re-run on its own it reports true for
-- 'Music is a form of art' and FALSE for 'The use of music', i.e. correct in
-- both directions. A rule you have written down is not a rule you have applied.
--
--   top-surgery  9 news, human_reviewed, INDEXABLE, Trans Health &
--                Gender-Affirming Care -- published a RAW WIKIPEDIA
--                DISAMBIGUATION DUMP: a dangling colon followed by
--                newline-separated article titles ("...on the
--                breasts:Mammaplasty / Breast augmentation surgery / Breast
--                reduction surgery / Mastectomy / Gender-affirming surgery
--                / ..."). It is not prose. Worse than shapeless: leading with
--                mammaplasty and breast augmentation frames top surgery as
--                cosmetic breast work, where the row is about gender-affirming
--                chest surgery -- which its OWN short_description already says
--                ("Surgical alterations of the chest for gender affirmation").
--                So this is the ORIGINAL rule: the row contradicts itself, and
--                the summary is the evidence. Highest-stakes row in the tranche.
--   resources    10 news + 1 venue, indexable, filed `Health` -- published the
--                ECONOMICS definition of natural resources ("renewable or
--                non-renewable", "national and international resources",
--                "increased wealth"). On a Health row, resources means the
--                services and information someone can turn to. The widened
--                rule: the category admits one reading, and unlike batch 6's
--                refused `solo` there is no competing live sense, because
--                natural resources would never be filed under Health.
--   color-blue   11 marketplace_listing -- RGB and RYB colour models, Rayleigh
--                scattering, the Tyndall effect and why eyes are blue, on a
--                marketplace colour facet. The `color-black`/`color-red` class,
--                third instance. Its current text also spells `colours`, which
--                the voice postcondition would reject on any row this file
--                touches.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING (top-surgery is human_reviewed = true),
-- the opposite of batch 7 and the same as batch 6. Each file states which case
-- it is in so the next pass does not copy the wrong precedent.
--
-- DEFERRED, and `tea` is the one worth stating because the EVIDENCE MOVED and
-- the answer did not:
--   tea (17 venues, human_reviewed, Venue Types) -- round four deferred it
--     because "its own description establishes the beverage and the body
--     agrees; description and category disagree, which the widened rule does
--     not adjudicate". Re-reading the row adds evidence on the other side: all
--     17 assignments are VENUES, and a venue is not a beverage. It is still
--     deferred, because its short_description ALSO says "Aromatic beverage made
--     from leaves" -- so two prose fields agree with each other, and repairing
--     would mean overruling the row's own summary on category evidence alone.
--     That is the guess this whole class came from. A deferral decays, but this
--     one survives re-reading.
--   shopping (9 venues) -- the first sentence is correct; only its scholarly
--     tail about "a typology of shopper types" is padding, and under-reaching
--     is the correct error.
--   self-harm, outing, pansexuality, latinx, lesbian-friendly,
--     queer-liberation, decriminalization, employment-non-discrimination,
--     community-organizing, fertility, fertility-preservation, camping --
--     accurate as written. `outing` in particular is a row the retired prose
--     judge wrongly retracted once.
--   the geography cohort (queensland, manhattan, montreal, denver, brisbane,
--     istanbul, brighton, torremolinos) -- encyclopedic but not wrong, exactly
--     as batches 6 and 7 left it.
--
-- Soft on preconditions, hard on postconditions.

begin;

select set_config('app.actor', 'admin:tag-description-measured-rewrite-b8', true);

-- ---- a disambiguation dump on an indexable trans-health page ---------------
update unified_tags set description =
  'Gender-affirming chest surgery. For trans masculine people that usually means bilateral mastectomy with chest reconstruction; for trans feminine people, breast augmentation.'
where slug = 'top-surgery' and status = 'active'
  and description like '%breasts:Mammaplasty%';

-- ---- wrong subject: natural resources on a Health row ----------------------
update unified_tags set description =
  'Support services, information and organizations someone can turn to for help.'
where slug = 'resources' and status = 'active'
  and description like '%renewable or non-renewable resources%';

-- ---- namespace row publishing the wrong subject ----------------------------
update unified_tags set description = 'Blue, as a garment or product color.'
where slug = 'color-blue' and status = 'active'
  and description like '%Rayleigh scattering%';

do $verify$
declare
  v_bad int;
begin
  -- 1. THE REACHED STATE, COUNTED POSITIVELY. Counting rows in a BAD state
  --    returns zero for a slug that has gone missing from the corpus entirely.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='top-surgery' and description like 'Gender-affirming chest surgery.%')
    or (slug='resources'   and description like 'Support services, information and organizations%')
    or (slug='color-blue'  and description = 'Blue, as a garment or product color.')
  );
  if v_bad <> 3 then
    raise exception 'tag_description_measured_rewrite_b8: expected 3 rows in the reached state, found %', v_bad;
  end if;

  -- 2. NO REPAIRED ROW STILL PUBLISHES ITS OLD SUBJECT.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='top-surgery' and description like '%Mammaplasty%')
    or (slug='resources'   and description like '%non-renewable%')
    or (slug='color-blue'  and description like '%Tyndall%')
  );
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b8: % row(s) still publish the old subject', v_bad;
  end if;

  -- 3. top-surgery NAMES BOTH DIRECTIONS. A replacement that describes only
  --    masculinizing chest surgery would erase trans feminine readers from
  --    their own entry -- the `femme`/`drag-show`/`masc` narrowing class -- and
  --    one that says only "chest surgery" restates the summary above it.
  select count(*) into v_bad from unified_tags
  where slug = 'top-surgery' and status = 'active'
    and description ilike '%trans masculine%'
    and description ilike '%trans feminine%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b8: top-surgery no longer names both directions';
  end if;

  -- 4. top-surgery IS PROSE, NOT A LIST. The defect was a dangling colon and
  --    newline-separated article titles, so the repair must carry neither.
  select count(*) into v_bad from unified_tags
  where slug = 'top-surgery' and status = 'active'
    and (position(E'\n' in description) > 0 or description like '%:%');
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b8: top-surgery is still a list';
  end if;

  -- 5. THE DEFERRED ROWS ARE STILL DEFERRED. A later pass that sweeps the
  --    lead-shape signature has to break this check first.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='tea'       and description like 'Tea is an aromatic beverage%')
    or (slug='shopping'  and description like 'Shopping is an activity%')
    or (slug='outing'    and description like 'Outing is the act of disclosing%')
    or (slug='self-harm' and description like 'Self harm is a form of emotional regulation%')
  );
  if v_bad <> 4 then
    raise exception 'tag_description_measured_rewrite_b8: a deferred row was rewritten (found % of 4)', v_bad;
  end if;

  -- 6. NO VOICE VIOLATION SHIPS. The `s?` is load-bearing: \m...\M anchors both
  --    ends, so \morganisation\M does not match "organisations".
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('top-surgery','resources','color-blue')
    and (description ~* '\m(organisation|characterised|recognised|behaviour|licence|counselling|colour)s?\M'
      or description ~* '\mnon-binary\M'
      or description ~* '\m(you|your)\M'
      or description ~ '!');
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b8: % row(s) carry a voice violation', v_bad;
  end if;

  -- 7. EVERY REPAIRED ROW STAYS PUBLISHABLE. Call the real predicate rather than
  --    restating its OR -- `resources` and `color-blue` both have a null
  --    short_description, so a hand-rolled "both fields present" form would
  --    fail on both.
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('top-surgery','resources','color-blue')
    and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b8: % row(s) would fail the thin-page gate', v_bad;
  end if;
end $verify$;

commit;
