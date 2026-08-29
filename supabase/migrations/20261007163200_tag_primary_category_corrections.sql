-- Six tags whose PRIMARY category names something the tag is factually not.
--
-- HOW THIS LIST SHRANK FROM ~16 TO 6, AND WHY THAT MATTERS
--
-- The drgay.ch coverage audit (docs/audits/2026-08-29-drgay-tag-coverage.md)
-- originally listed ~16 miscategorised tags. That list was produced by an
-- AGGREGATED query that joined unified_tags to tag_category_assignments without
-- filtering on is_primary, so a tag's SECONDARY assignment could surface as
-- though it were the tag's category. Re-read un-aggregated, four of the
-- headline claims dissolved:
--
--   coming-out  primary IS questioning-labels (correct). events-scene is a
--               secondary. The audit reported the secondary.
--   cruising    primary IS safe-spaces (defensible for a venue-feature term).
--               relationship-structures and practices-play are secondaries.
--   sauna       primary IS venues-nightlife (correct).
--   bathhouse   primary IS venues-nightlife (correct).
--
-- Only the six below have a genuinely wrong PRIMARY. The audit doc has been
-- corrected in the same commit; the wrong list is left visible there with the
-- reason, rather than quietly deleted, because the query artifact is the
-- transferable lesson.
--
-- WHAT IS DELIBERATELY NOT DONE HERE
--
-- `sauna` (1,370 uses) and `bathhouse` derive is_adult=true from a SECONDARY
-- fetishes-interests assignment, which adult-gates a venue term. Removing that
-- assignment would flip is_adult=false — and 20261006090100, applied hours
-- before this file was written, exists specifically to prevent accidental
-- is_adult=false flips during the taxonomy swap, calling under-moderation "the
-- worst failure class here". Flipping two live tags to non-adult immediately
-- after that guard shipped is not a call to make from a category audit. Left
-- for a human, recorded in the audit doc under "Not done".
--
-- `sex-work` (primary sexual-health) is arguable in both directions and is
-- likewise left alone: sex work is not a health condition, but neither is
-- Laws & Legal Rights obviously better for the practice as opposed to its
-- legal status. No correctness gain, reader-visible facet churn.
--
-- `fisting` (primary sexual-health, secondary practices-play) keeps
-- is_adult=true and seo_indexable=false. That is a defensible state for the
-- term and is not a filing error.
--
-- MECHANISM — AND THE DIRECTION THAT DOES NOT WORK
--
-- Write `unified_tags.category_id`. That is the only write needed: the BEFORE
-- trigger derives the denormalised `category` TEXT from it and the AFTER trigger
-- syncs the junction, leaving exactly one is_primary row. Verified in a
-- rolled-back transaction on prod — all six land with the right text, the right
-- junction primary, n_primary = 1, and is_adult unchanged.
--
-- The OBVIOUS approach is wrong and was tried first. Writing the junction
-- (insert … on conflict do update set is_primary = true, then demote the others)
-- moves the junction correctly and the page follows, because
-- fetchTagWithCategories reads the junction — but `unified_tags.category` keeps
-- its OLD value, because both sync triggers run unified_tags -> junction and
-- fire only on a category_id change. Measured in the same rolled-back
-- transaction: junction_primary = 'legal-rights' while category still read
-- 'Slang & Language'. That column is in trg_search_documents_tag's scope, so the
-- junction-only write would have left the page saying one thing and the search
-- facet another — which is precisely the disagreement class 20261006110000 had
-- just finished repairing corpus-wide.
--
-- Per-tag loop: one statement must not touch one unified_tags tuple twice, or it
-- re-enters the 27000 "tuple already modified" pair that 20260919100000 split
-- these triggers to escape.
--
-- is_adult is NOT written here either. `unified_tags_recompute_is_adult()`
-- derives it from the junction. Two of the six move INTO the health line, whose
-- parent is not a kink parent, so is_adult cannot be raised by these moves; the
-- verify block asserts no tag gained is_adult, which is the direction that would
-- be an unreviewed moderation change.

set local statement_timeout = '120s';

select set_config('app.actor', 'migration:tag_primary_category_corrections', true);

do $mig$
declare
  r record;
  v_tag uuid;
  v_cat uuid;
  v_moved int := 0;
  v_skipped int := 0;
begin
  for r in
    select * from (values
      -- tag                dest category        why
      ('prep',           'sexual-health',
       'HIV pre-exposure prophylaxis is a sexual-health intervention. Was filed '
       'under Consent & Negotiation; sexual-health already existed as a secondary.'),
      ('bareback',       'sexual-health',
       'Condomless anal sex — the concept drgay.ch covers as a risk-reduction '
       'topic. Was filed under Events & Parties, which is not a property of the '
       'practice. Health line deliberately, not the kink line: filing it under '
       'Practices & Play would raise is_adult and deindex a health term.'),
      ('age-of-consent', 'legal-rights',
       'A statutory threshold. Was filed under Slang & Language.'),
      ('deadnaming',     'gender-identity',
       'Was filed under Orientation. Deadnaming is a gender-identity harm and '
       'has nothing to do with orientation.'),
      ('misgendering',   'gender-identity',
       'Was filed under Orientation. Same class as deadnaming.'),
      ('chosen-family',  'family-chosen-family',
       'Was filed under Events & Parties. There is a Family & Parenting stop and '
       'this is its central term.')
    ) as t(slug, dest_slug, reason)
  loop
    select id into v_tag from public.unified_tags where slug = r.slug;
    select id into v_cat from public.tag_categories where slug = r.dest_slug;

    -- A missing tag or a missing destination is a skip with a notice, never an
    -- abort: this migration must not fail a deploy because a concurrent session
    -- renamed a category stop out from under it. The verify block below still
    -- fails if a move that COULD have happened did not.
    if v_tag is null then
      raise notice 'skip: tag % not found', r.slug;
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if v_cat is null then
      raise notice 'skip: category % not found (tag %)', r.dest_slug, r.slug;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update public.unified_tags
       set category_id = v_cat,
           updated_at  = now()
     where id = v_tag
       and category_id is distinct from v_cat;

    v_moved := v_moved + 1;
    raise notice 're-filed % -> %', r.slug, r.dest_slug;
  end loop;

  raise notice 'primary category corrections: % moved, % skipped', v_moved, v_skipped;
end $mig$;

-- `u-equals-u` is repaired by 20260829120625_u_equals_u_single_primary_category,
-- which sorts earlier and is already applied to prod. It is NOT repeated here.
--
-- That row is why db push was down: it held TWO is_primary junction rows
-- (Orientation and Sexual Health) with category_id already on Sexual Health and
-- the text still reading "Orientation", so 20261007160000's corpus-wide
-- assertion failed on a row its fill-only loop could never reach — aborting the
-- push and every migration behind it, eight deploys running.
--
-- A draft of this migration repaired it too, and got it wrong in a way worth
-- recording: it guarded on "a primary already exists on sexual-health", which
-- is TRUE while the duplicate is present, so it skipped and left the wrong row
-- primary. That surfaced only as 21000 "more than one row returned by a
-- subquery" in the verification — a duplicate primary is invisible to any check
-- that reads the primary as a scalar. The migration that shipped deletes the
-- orientation assignment outright rather than demoting it, which is the better
-- call: as a secondary it would still list U=U on the Sexual Orientation
-- category page, the same wrong claim with less visibility.
--
-- The verify block below still asserts the resulting state, because this
-- migration's own six re-files share the mechanism that row exercised.

-- Asserts ONLY the six rows this migration writes.
do $verify$
declare
  v_bad text;
begin
  select string_agg(x.slug || '=' || coalesce(x.got, 'NULL'), ', ')
    into v_bad
  from (
    select t.slug,
           (select c.slug from public.tag_category_assignments a
              join public.tag_categories c on c.id = a.category_id
             where a.tag_id = t.id and a.is_primary) as got,
           v.want
      from public.unified_tags t
      join (values
        ('prep','sexual-health'),('bareback','sexual-health'),
        ('age-of-consent','legal-rights'),('deadnaming','gender-identity'),
        ('misgendering','gender-identity'),('chosen-family','family-chosen-family')
      ) as v(slug, want) on v.slug = t.slug
  ) x
  where x.got is distinct from x.want;

  if v_bad is not null then
    raise exception 'primary category corrections: wrong primary after move: %', v_bad;
  end if;

  -- Exactly one primary each. The demote step running before the insert, or a
  -- pre-existing second primary, would leave two — and fetchTagWithCategories
  -- picks one arbitrarily, so this is a real reader-visible defect, not tidiness.
  select string_agg(slug, ', ') into v_bad
  from (
    select t.slug
      from public.unified_tags t
      join public.tag_category_assignments a on a.tag_id = t.id
     where t.slug in ('prep','bareback','age-of-consent','deadnaming',
                      'misgendering','chosen-family')
       and a.is_primary
     group by t.slug having count(*) <> 1
  ) d;
  if v_bad is not null then
    raise exception 'primary category corrections: not exactly one primary for: %', v_bad;
  end if;

  -- The denormalised text followed. This is the assertion the junction-only
  -- version would have failed, and it is why the mechanism changed — the page
  -- and the search facet must not disagree.
  select string_agg(t.slug || ' text=' || coalesce(t.category, 'NULL') ||
                    ' cat=' || coalesce(c.name, 'NULL'), ', ')
    into v_bad
  from public.unified_tags t
  left join public.tag_categories c on c.id = t.category_id
  where t.slug in ('prep','bareback','age-of-consent','deadnaming',
                   'misgendering','chosen-family')
    and t.category is distinct from c.name;
  if v_bad is not null then
    raise exception 'primary category corrections: denorm text did not follow: %', v_bad;
  end if;

  -- u-equals-u ends with exactly ONE primary, on Sexual Health, and its text
  -- agrees. Counted rather than read through a scalar subquery, because the
  -- defect being fixed here — two is_primary rows — is precisely what a scalar
  -- read cannot see (it raises 21000 or silently picks one).
  select count(*) into v_n
  from public.tag_category_assignments a
  join public.unified_tags t on t.id = a.tag_id
  where t.slug = 'u-equals-u' and a.is_primary;
  if v_n <> 1 then
    raise exception 'u-equals-u has % primary junction row(s), expected 1', v_n;
  end if;

  select string_agg(x, ', ') into v_bad from (
    select t.slug || ' junction=' || c.name || ' text=' || coalesce(t.category, 'NULL') as x
      from public.unified_tags t
      join public.tag_category_assignments a on a.tag_id = t.id and a.is_primary
      join public.tag_categories c on c.id = a.category_id
     where t.slug = 'u-equals-u'
       and (c.slug <> 'sexual-health' or t.category is distinct from c.name)
  ) d;
  if v_bad is not null then
    raise exception 'u-equals-u not settled on Sexual Health: %', v_bad;
  end if;

  -- No tag gained is_adult. Raising it would deindex the page via
  -- enforce_tag_seo_sensitivity_gate() — a moderation change nobody reviewed.
  select string_agg(slug, ', ') into v_bad
  from public.unified_tags
  where slug in ('prep','bareback','age-of-consent','deadnaming',
                 'misgendering','chosen-family')
    and is_adult;
  if v_bad is not null then
    raise exception 'primary category corrections: is_adult was raised on: %', v_bad;
  end if;
end $verify$;
